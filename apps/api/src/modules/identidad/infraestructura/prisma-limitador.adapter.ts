import { createHmac } from 'node:crypto';
import type {
  ConsumoLimite,
  LimitadorPort,
  ResultadoLimite,
} from '../aplicacion/puertos/limitador.port';
import { ServicioNoDisponibleError } from '../dominio/errores';
import type { PrismaClient } from './prisma-cliente';

export const VENTANA_POR_DEFECTO_MS = 15 * 60 * 1000;

/**
 * Limitador de ventana fija persistido en PostgreSQL. El incremento es atomico
 * (INSERT ... ON CONFLICT DO UPDATE) y sobrevive a reinicios. Las claves se derivan con HMAC:
 * ni el correo ni la IP se guardan en claro.
 */
export class PrismaLimitadorAdapter implements LimitadorPort {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly secretoHmac: string,
    private readonly ventanaMs: number = VENTANA_POR_DEFECTO_MS,
  ) {}

  private clave(consumo: ConsumoLimite): string {
    return createHmac('sha256', this.secretoHmac)
      .update(`${consumo.tipo}\u0000${consumo.identificador}`)
      .digest('hex');
  }

  async consumir(consumos: readonly ConsumoLimite[], ahora: Date): Promise<ResultadoLimite> {
    const inicioMs = Math.floor(ahora.getTime() / this.ventanaMs) * this.ventanaMs;
    const ventanaInicio = new Date(inicioMs);
    const restanteSeg = Math.max(1, Math.ceil((inicioMs + this.ventanaMs - ahora.getTime()) / 1000));

    try {
      const contadores = await this.prisma.$transaction(async (tx) => {
        const resultado: number[] = [];
        for (const consumo of consumos) {
          const filas = await tx.$queryRaw<{ contador: number }[]>`
            INSERT INTO ventanas_intentos (tipo, clave_hash, ventana_inicio, contador)
            VALUES (${consumo.tipo}, ${this.clave(consumo)}, ${ventanaInicio}::timestamptz, 1)
            ON CONFLICT (tipo, clave_hash, ventana_inicio)
            DO UPDATE SET contador = ventanas_intentos.contador + 1
            RETURNING contador`;
          resultado.push(Number(filas[0]?.contador ?? 0));
        }
        return resultado;
      });

      const superado = consumos.some((c, i) => (contadores[i] ?? 0) > c.maximo);
      // Todas las ventanas terminan en el mismo limite alineado: ese es el mayor plazo restante.
      return { permitido: !superado, reintentarEnSegundos: superado ? restanteSeg : 0 };
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }
}
