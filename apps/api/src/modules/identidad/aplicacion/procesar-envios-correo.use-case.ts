import type { Logger } from '../../../compartido/logger';
import { ARRENDAMIENTO_MS, esperaTrasFallo } from '../dominio/envio-correo';
import { FalloEnvioCorreoError } from '../dominio/errores';
import type { PropositoToken } from '../dominio/token-cuenta';
import type { EmitirTokenCuentaUseCase } from './emitir-token-cuenta.use-case';
import type { CorreoPort } from './puertos/correo.port';
import type { EnvioReclamado, EnviosCorreoPort } from './puertos/envios-correo.port';
import type { RelojPort } from './puertos/reloj.port';

/** Compone el texto del correo. Recibe el token en claro: no debe registrarlo ni guardarlo. */
export interface RedactorCorreo {
  redactar(datos: {
    readonly tipo: PropositoToken;
    readonly nombre: string;
    /** Rol del destinatario: decide si el enlace abre la web (institucional) o la app/API (ciudadano). */
    readonly rol: string;
    readonly token: string;
    readonly expiresAt: Date;
  }): { readonly asunto: string; readonly texto: string };
}

export interface ResumenProcesamiento {
  readonly enviados: number;
  readonly reprogramados: number;
  readonly fallidos: number;
  readonly descartados: number;
}

/** Envios que se procesan por pasada: acota el trabajo y la carga sobre la API. */
const MAX_POR_PASADA = 20;

/**
 * Trabajador de la cola de correos. Para cada envio reclamado: genera el token (asi nunca se
 * guarda en claro ni en la cola), compone el correo, lo entrega y registra el resultado. Entrega
 * al menos una vez: si el proceso cae tras aceptar el proveedor y antes de marcar `enviado`, se
 * reenviara con un token nuevo que invalida el anterior.
 */
export class ProcesarEnviosCorreoUseCase {
  constructor(
    private readonly envios: EnviosCorreoPort,
    private readonly correo: CorreoPort,
    private readonly emitirToken: EmitirTokenCuentaUseCase,
    private readonly redactor: RedactorCorreo,
    private readonly reloj: RelojPort,
    private readonly logger: Logger,
  ) {}

  async ejecutar(): Promise<ResumenProcesamiento> {
    let enviados = 0;
    let reprogramados = 0;
    let fallidos = 0;
    const descartados = await this.envios.descartarVencidos(this.reloj.ahora());

    for (let i = 0; i < MAX_POR_PASADA; i++) {
      const envio = await this.envios.reclamarSiguiente(this.reloj.ahora(), ARRENDAMIENTO_MS);
      if (!envio) break;
      const resultado = await this.procesar(envio);
      if (resultado === 'enviado') enviados++;
      else if (resultado === 'reprogramado') reprogramados++;
      else fallidos++;
    }
    return { enviados, reprogramados, fallidos, descartados };
  }

  private async procesar(envio: EnvioReclamado): Promise<'enviado' | 'reprogramado' | 'fallido'> {
    const cuenta = envio.destinatario;
    const apta =
      cuenta !== null &&
      (envio.tipo === 'recuperacion'
        ? cuenta.rol === 'ciudadano' && cuenta.estado === 'activo'
        : cuenta.estado === 'pendiente_activacion');
    if (!apta || cuenta === null) {
      // La cuenta cambio desde que se encolo (suspension, ya activada): no se envia nada.
      await this.envios.marcarFallido(envio.id, { intentos: envio.intentos, codigo: 'CUENTA_NO_APTA' });
      this.registrar(envio.tipo, 'fallido', 'CUENTA_NO_APTA');
      return 'fallido';
    }

    // Un fallo que no sea del proveedor (por ejemplo, la base de datos) se propaga: el envio queda
    // "enviando" y se retoma cuando vence su arrendamiento.
    const { token, expiresAt } = await this.emitirToken.ejecutar(envio.usuarioId, envio.tipo);
    const { asunto, texto } = this.redactor.redactar({ tipo: envio.tipo, nombre: cuenta.nombre, rol: cuenta.rol, token, expiresAt });
    try {
      await this.correo.enviar({ para: cuenta.correo, asunto, texto });
    } catch (error) {
      const codigo = error instanceof FalloEnvioCorreoError ? error.codigo : 'DESCONOCIDO';
      const intentos = envio.intentos + 1;
      const ahora = this.reloj.ahora();
      const proximo = new Date(ahora.getTime() + esperaTrasFallo(intentos));
      if (proximo.getTime() >= envio.venceAt.getTime()) {
        await this.envios.marcarFallido(envio.id, { intentos, codigo });
        this.registrar(envio.tipo, 'fallido', codigo);
        return 'fallido';
      }
      await this.envios.reprogramar(envio.id, { intentos, proximoIntentoAt: proximo, codigo });
      this.registrar(envio.tipo, 'reintento', codigo);
      return 'reprogramado';
    }
    await this.envios.marcarEnviado(envio.id, this.reloj.ahora());
    this.registrar(envio.tipo, 'enviado');
    return 'enviado';
  }

  /** Solo tipo, resultado y codigo generico: nunca destinatario, enlace, token ni cuerpo. */
  private registrar(tipo: PropositoToken, resultado: string, codigo?: string): void {
    this.logger.registrar({
      evento: 'envio_correo',
      resultado,
      ...(codigo ? { error: codigo } : {}),
      detalle: { tipo },
    });
  }
}
