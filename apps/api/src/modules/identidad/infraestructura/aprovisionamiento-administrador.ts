import type { EmitirTokenCuentaUseCase } from '../aplicacion/emitir-token-cuenta.use-case';
import type { InvitarCuentaUseCase } from '../aplicacion/invitar-cuenta.use-case';
import type { RelojPort } from '../aplicacion/puertos/reloj.port';
import { longitudEnPuntosDeCodigo, NOMBRE_MAX, validarSolicitudRecuperacion } from '../dominio/validacion';
import type { PrismaClient } from './prisma-cliente';

/**
 * Aprovisionamiento controlado de administradores (capacidad `aprovisionamiento-administrador`).
 * Lo ejecuta, desde una terminal, quien dispone del acceso a la base de datos: no hay ruta HTTP.
 * Nunca recibe, genera ni guarda una contrasena: la cuenta queda `pendiente_activacion` y su
 * titular la define al activarla. Ni los resultados ni los errores incluyen correo, token ni enlace
 * (salvo el enlace de `emitirEnlace`, que el llamador imprime una sola vez en la terminal).
 */
export type ResultadoAprovisionamiento =
  | 'creada'
  | 'reencolada'
  | 'enlace_emitido'
  | 'ya_activa'
  | 'suspendida'
  | 'reiniciada';

export type CodigoRechazo =
  | 'DATOS_INVALIDOS'
  | 'CORREO_DE_OTRO_ROL'
  | 'NO_ES_ADMINISTRADOR'
  | 'NO_EXISTE'
  | 'CI_NO_PERMITIDO'
  | 'SIN_TERMINAL';

/** Rechazo controlado: el codigo es generico y nunca contiene datos de la cuenta. */
export class AprovisionamientoRechazadoError extends Error {
  constructor(readonly codigo: CodigoRechazo) {
    super(`Aprovisionamiento rechazado: ${codigo}`);
    this.name = 'AprovisionamientoRechazadoError';
  }
}

export interface EntornoEjecucion {
  /** `CI=true`: el enlace local jamas se emite en integracion continua. */
  readonly integracionContinua: boolean;
  /** La salida estandar es una terminal interactiva (no un archivo ni un registro). */
  readonly terminal: boolean;
}

export interface OpcionesAprovisionamiento {
  /** Emite el enlace en vez de encolar el correo. Solo desde una terminal local. */
  readonly emitirEnlace?: boolean;
}

export interface SalidaAprovisionamiento {
  readonly resultado: ResultadoAprovisionamiento;
  /** Presente solo con `emitirEnlace`: se muestra una vez y no se guarda. */
  readonly enlace?: string;
  readonly usuarioId?: string;
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

interface FilaCuenta {
  id: string;
  rol: string;
  estado: string;
}

function esChoqueDeUnicidad(error: unknown): boolean {
  const e = error as {
    code?: unknown;
    meta?: {
      code?: unknown;
      driverAdapterError?: { cause?: { originalCode?: unknown } };
    };
  } | null;
  // En Prisma 7 con adapter-pg, las consultas raw envuelven SQLSTATE en la causa
  // del adaptador (P2010); no aparece directamente en meta.code.
  return e?.code === 'P2002' || e?.meta?.code === '23505'
    || (e?.code === 'P2010' && e.meta?.driverAdapterError?.cause?.originalCode === '23505');
}

export class AprovisionamientoAdministrador {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly invitar: InvitarCuentaUseCase,
    private readonly emitirToken: EmitirTokenCuentaUseCase,
    private readonly reloj: RelojPort,
    /** Origen publico de la web, sin barra final: base del enlace `/activar`. */
    private readonly urlWeb: string,
    private readonly entorno: EntornoEjecucion,
  ) {}

  /** Alta idempotente por correo: crea, reencola, o informa sin tocar una cuenta existente. */
  async altaAdministrador(
    entrada: { readonly correo: string; readonly nombre: string },
    opciones: OpcionesAprovisionamiento = {},
  ): Promise<SalidaAprovisionamiento> {
    this.exigirEnlaceLocal(opciones);
    const { correoNormalizado, nombre } = this.validar(entrada);
    let intento = 0;
    for (;;) {
      try {
        const salida = await this.prisma.$transaction((tx) =>
          this.altaEnTransaccion(tx, correoNormalizado, nombre, opciones),
        );
        // El token del enlace local se emite despues de confirmar la cuenta, y solo si hay algo que activar.
        if (opciones.emitirEnlace && (salida.resultado === 'creada' || salida.resultado === 'reencolada')) {
          return await this.conEnlace(salida.usuarioId as string);
        }
        return salida;
      } catch (error) {
        // Dos altas simultaneas del mismo correo: la segunda reintenta y ve la cuenta ya creada.
        if (esChoqueDeUnicidad(error) && intento++ < 1) continue;
        throw error;
      }
    }
  }

  /** Reinicio de emergencia: la cuenta vuelve a pendiente, sin contrasena y sin sesiones ni tokens vigentes. */
  async reiniciarAdministrador(
    entrada: { readonly correo: string },
    opciones: OpcionesAprovisionamiento = {},
  ): Promise<SalidaAprovisionamiento> {
    this.exigirEnlaceLocal(opciones);
    const { correoNormalizado } = this.validar({ correo: entrada.correo, nombre: 'x' });
    const ahora = this.reloj.ahora();
    const usuarioId = await this.prisma.$transaction(async (tx) => {
      const cuenta = await this.bloquear(tx, correoNormalizado);
      if (!cuenta) throw new AprovisionamientoRechazadoError('NO_EXISTE');
      if (cuenta.rol !== 'administrador') throw new AprovisionamientoRechazadoError('NO_ES_ADMINISTRADOR');
      // La contrasena nula y el estado pendiente van juntos: lo exige un CHECK de la tabla.
      await tx.$executeRaw`
        UPDATE usuarios SET estado = 'pendiente_activacion', password_hash = NULL, updated_at = now()
         WHERE id = ${cuenta.id}::uuid`;
      await tx.$executeRaw`
        UPDATE sesiones SET revoked_at = ${ahora}::timestamptz
         WHERE usuario_id = ${cuenta.id}::uuid AND revoked_at IS NULL`;
      await tx.$executeRaw`
        UPDATE tokens_cuenta SET invalidado_at = ${ahora}::timestamptz
         WHERE usuario_id = ${cuenta.id}::uuid AND used_at IS NULL AND invalidado_at IS NULL`;
      if (!opciones.emitirEnlace) await this.invitar.ejecutar(cuenta.id, tx);
      return cuenta.id;
    });
    return this.cerrarSalida('reiniciada', usuarioId, opciones);
  }

  /** Estado del ultimo envio de activacion de la cuenta (para informar sin leer el correo). */
  async estadoEnvioActivacion(usuarioId: string): Promise<'pendiente' | 'enviando' | 'enviado' | 'fallido' | 'ninguno'> {
    const filas = await this.prisma.$queryRaw<{ estado: string }[]>`
      SELECT estado::text AS estado FROM envios_correo
       WHERE usuario_id = ${usuarioId}::uuid AND tipo = 'activacion'
       ORDER BY created_at DESC LIMIT 1`;
    const estado = filas[0]?.estado;
    return estado === 'pendiente' || estado === 'enviando' || estado === 'enviado' || estado === 'fallido'
      ? estado
      : 'ninguno';
  }

  private async altaEnTransaccion(
    tx: Tx,
    correoNormalizado: string,
    nombre: string,
    opciones: OpcionesAprovisionamiento,
  ): Promise<SalidaAprovisionamiento> {
    const existente = await this.bloquear(tx, correoNormalizado);
    if (existente) {
      if (existente.rol !== 'administrador') throw new AprovisionamientoRechazadoError('CORREO_DE_OTRO_ROL');
      // Un administrador activo o suspendido no se toca: reiniciarlo es una decision explicita.
      if (existente.estado === 'activo') return { resultado: 'ya_activa', usuarioId: existente.id };
      if (existente.estado === 'suspendido') return { resultado: 'suspendida', usuarioId: existente.id };
      if (!opciones.emitirEnlace) await this.invitar.ejecutar(existente.id, tx);
      return { resultado: 'reencolada', usuarioId: existente.id };
    }
    const filas = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
      VALUES (${nombre}, ${correoNormalizado}, NULL, 'administrador', 'pendiente_activacion', now())
      RETURNING id`;
    const id = filas[0]?.id as string;
    if (!opciones.emitirEnlace) await this.invitar.ejecutar(id, tx);
    return { resultado: 'creada', usuarioId: id };
  }

  private async cerrarSalida(
    resultado: ResultadoAprovisionamiento,
    usuarioId: string,
    opciones: OpcionesAprovisionamiento,
  ): Promise<SalidaAprovisionamiento> {
    if (!opciones.emitirEnlace) return { resultado, usuarioId };
    return this.conEnlace(usuarioId);
  }

  private async conEnlace(usuarioId: string): Promise<SalidaAprovisionamiento> {
    const { token } = await this.emitirToken.ejecutar(usuarioId, 'activacion');
    return { resultado: 'enlace_emitido', usuarioId, enlace: `${this.urlWeb}/activar#t=${token}` };
  }

  private bloquear(tx: Tx, correoNormalizado: string): Promise<FilaCuenta | undefined> {
    return tx
      .$queryRaw<FilaCuenta[]>`
        SELECT id, rol::text AS rol, estado::text AS estado
          FROM usuarios WHERE correo_normalizado = ${correoNormalizado} FOR UPDATE`
      .then((filas) => filas[0]);
  }

  /** El enlace local solo existe en una terminal y nunca en integracion continua. Se comprueba antes de tocar la base. */
  private exigirEnlaceLocal(opciones: OpcionesAprovisionamiento): void {
    if (!opciones.emitirEnlace) return;
    if (this.entorno.integracionContinua) throw new AprovisionamientoRechazadoError('CI_NO_PERMITIDO');
    if (!this.entorno.terminal) throw new AprovisionamientoRechazadoError('SIN_TERMINAL');
  }

  private validar(entrada: { correo: string; nombre: string }): { correoNormalizado: string; nombre: string } {
    const correo = validarSolicitudRecuperacion({ correo: entrada.correo });
    const nombre = typeof entrada.nombre === 'string' ? entrada.nombre.trim() : '';
    if (!correo.ok || nombre === '' || longitudEnPuntosDeCodigo(nombre) > NOMBRE_MAX) {
      throw new AprovisionamientoRechazadoError('DATOS_INVALIDOS');
    }
    return { correoNormalizado: correo.valor.correoNormalizado, nombre };
  }
}
