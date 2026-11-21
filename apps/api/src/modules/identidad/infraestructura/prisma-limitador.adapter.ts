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
    // Cada limite puede tener su propia ventana fija (15 min, 1 hora, 1 dia), alineada al reloj.
    const ventanas = consumos.map((c) => {
      const duracion = c.ventanaMs ?? this.ventanaMs;
      const inicioMs = Math.floor(ahora.getTime() / duracion) * duracion;
      return {
        inicio: new Date(inicioMs),
        restanteSeg: Math.max(1, Math.ceil((inicioMs + duracion - ahora.getTime()) / 1000)),
      };
    });

    try {
      const contadores = await this.prisma.$transaction(async (tx) => {
        const resultado: number[] = [];
        for (const [i, consumo] of consumos.entries()) {
          const filas = await tx.$queryRaw<{ contador: number }[]>`
            INSERT INTO ventanas_intentos (tipo, clave_hash, ventana_inicio, contador)
            VALUES (${consumo.tipo}, ${this.clave(consumo)}, ${ventanas[i]!.inicio}::timestamptz, 1)
            ON CONFLICT (tipo, clave_hash, ventana_inicio)
            DO UPDATE SET contador = ventanas_intentos.contador + 1
            RETURNING contador`;
          resultado.push(Number(filas[0]?.contador ?? 0));
        }
        return resultado;
      });

      // Si se supera mas de un limite, se informa el mayor plazo restante entre los superados.
      const superados = consumos
        .map((c, i) => ((contadores[i] ?? 0) > c.maximo ? ventanas[i]!.restanteSeg : 0))
        .filter((s) => s > 0);
      return { permitido: superados.length === 0, reintentarEnSegundos: Math.max(0, ...superados) };
    } catch (error) {
      throw new ServicioNoDisponibleError(error);
    }
  }
}
