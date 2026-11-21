import type { PurgaPort } from './puertos/purga.port';
import type { RelojPort } from './puertos/reloj.port';

/** Sesiones revocadas o vencidas se conservan siete dias; ventanas de intentos, 24 horas. */
export const RETENCION_SESIONES_MS = 7 * 24 * 60 * 60 * 1000;
export const RETENCION_VENTANAS_MS = 24 * 60 * 60 * 1000;
export const LOTE_PURGA = 500;

export interface ResultadoPurga {
  readonly sesiones: number;
  readonly ventanas: number;
}

export class PurgarCaducadosUseCase {
  constructor(
    private readonly purga: PurgaPort,
    private readonly reloj: RelojPort,
    private readonly lote: number = LOTE_PURGA,
  ) {}

  /**
   * Limpieza por lotes. Si un lote falla, la excepcion corta la pasada: lo ya borrado es
   * definitivo y la siguiente pasada continua donde corresponde, sin estado intermedio.
   */
  async ejecutar(): Promise<ResultadoPurga> {
    const ahora = this.reloj.ahora().getTime();
    const sesiones = await this.hastaVaciar((lote) =>
      this.purga.purgarSesionesAnterioresA(new Date(ahora - RETENCION_SESIONES_MS), lote),
    );
    const ventanas = await this.hastaVaciar((lote) =>
      this.purga.purgarVentanasAnterioresA(new Date(ahora - RETENCION_VENTANAS_MS), lote),
    );
    return { sesiones, ventanas };
  }

  private async hastaVaciar(paso: (lote: number) => Promise<number>): Promise<number> {
    let total = 0;
    for (;;) {
      const borrados = await paso(this.lote);
      total += borrados;
      if (borrados < this.lote) return total;
    }
  }
}
