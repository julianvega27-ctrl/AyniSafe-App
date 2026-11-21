import type {
  ContextoTransaccional,
  EnvioReclamado,
  EnviosCorreoPort,
  NuevoEnvio,
} from '../aplicacion/puertos/envios-correo.port';
import { ServicioNoDisponibleError } from '../dominio/errores';
import type { PropositoToken } from '../dominio/token-cuenta';
import type { PrismaClient } from './prisma-cliente';

/** Lo minimo que se usa del cliente: sirve igual para el cliente y para una transaccion. */
type ClienteSql = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;

export class PrismaEnviosCorreoAdapter implements EnviosCorreoPort {
  constructor(private readonly prisma: PrismaClient) {}

  async encolar(nuevo: NuevoEnvio, tx?: ContextoTransaccional): Promise<boolean> {
    const cliente = (tx as ClienteSql | undefined) ?? this.prisma;
    try {
      const filas = await cliente.$queryRaw<{ id: string }[]>`
        INSERT INTO envios_correo (tipo, usuario_id, estado, proximo_intento_at, vence_at, created_at)
        VALUES (${nuevo.tipo}::"PropositoToken", ${nuevo.usuarioId}::uuid, 'pendiente',
                ${nuevo.creadoAt}::timestamptz, ${nuevo.venceAt}::timestamptz, ${nuevo.creadoAt}::timestamptz)
        ON CONFLICT (usuario_id, tipo) WHERE estado IN ('pendiente', 'enviando') DO NOTHING
        RETURNING id`;
      return filas.length > 0;
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }

  async reclamarSiguiente(ahora: Date, arrendamientoMs: number): Promise<EnvioReclamado | null> {
    const hasta = new Date(ahora.getTime() + arrendamientoMs);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const filas = await tx.$queryRaw<
          { id: string; tipo: string; usuarioId: string; intentos: number; venceAt: Date }[]
        >`
          WITH candidato AS (
            SELECT id FROM envios_correo
             WHERE vence_at > ${ahora}::timestamptz
               AND ((estado = 'pendiente' AND proximo_intento_at <= ${ahora}::timestamptz)
                 OR (estado = 'enviando' AND reclamado_hasta <= ${ahora}::timestamptz))
             ORDER BY proximo_intento_at
             FOR UPDATE SKIP LOCKED
             LIMIT 1)
          UPDATE envios_correo e
             SET estado = 'enviando', reclamado_hasta = ${hasta}::timestamptz
            FROM candidato
           WHERE e.id = candidato.id
          RETURNING e.id, e.tipo::text AS tipo, e.usuario_id AS "usuarioId", e.intentos,
                    e.vence_at AS "venceAt"`;
        const fila = filas[0];
        if (!fila) return null;
        const cuentas = await tx.$queryRaw<
          { correo: string; nombre: string; rol: string; estado: string }[]
        >`
          SELECT correo_normalizado AS correo, nombre, rol::text AS rol, estado::text AS estado
            FROM usuarios WHERE id = ${fila.usuarioId}::uuid`;
        return {
          id: fila.id,
          tipo: fila.tipo as PropositoToken,
          usuarioId: fila.usuarioId,
          intentos: fila.intentos,
          venceAt: fila.venceAt,
          destinatario: cuentas[0] ?? null,
        };
      });
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }

  async marcarEnviado(id: string, ahora: Date): Promise<void> {
    await this.ejecutar(
      (c) => c.$executeRaw`
        UPDATE envios_correo
           SET estado = 'enviado', enviado_at = ${ahora}::timestamptz, reclamado_hasta = NULL,
               ultimo_codigo_error = NULL
         WHERE id = ${id}::uuid`,
    );
  }

  async reprogramar(id: string, d: { intentos: number; proximoIntentoAt: Date; codigo: string }): Promise<void> {
    await this.ejecutar(
      (c) => c.$executeRaw`
        UPDATE envios_correo
           SET estado = 'pendiente', intentos = ${d.intentos}, reclamado_hasta = NULL,
               proximo_intento_at = ${d.proximoIntentoAt}::timestamptz, ultimo_codigo_error = ${d.codigo}
         WHERE id = ${id}::uuid`,
    );
  }

  async marcarFallido(id: string, d: { intentos: number; codigo: string }): Promise<void> {
    await this.ejecutar(
      (c) => c.$executeRaw`
        UPDATE envios_correo
           SET estado = 'fallido', intentos = ${d.intentos}, reclamado_hasta = NULL,
               ultimo_codigo_error = ${d.codigo}
         WHERE id = ${id}::uuid`,
    );
  }

  async descartarVencidos(ahora: Date): Promise<number> {
    try {
      return await this.prisma.$executeRaw`
        UPDATE envios_correo
           SET estado = 'fallido', reclamado_hasta = NULL, ultimo_codigo_error = 'VENCIDO'
         WHERE vence_at <= ${ahora}::timestamptz
           AND (estado = 'pendiente' OR (estado = 'enviando' AND reclamado_hasta <= ${ahora}::timestamptz))`;
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }

  async proximoMomento(): Promise<Date | null> {
    try {
      const filas = await this.prisma.$queryRaw<{ cuando: Date | null }[]>`
        SELECT min(CASE WHEN estado = 'pendiente' THEN proximo_intento_at ELSE reclamado_hasta END) AS cuando
          FROM envios_correo WHERE estado IN ('pendiente', 'enviando')`;
      return filas[0]?.cuando ?? null;
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }

  private async ejecutar(accion: (c: ClienteSql) => PromiseLike<unknown>): Promise<void> {
    try {
      await accion(this.prisma);
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }
}
