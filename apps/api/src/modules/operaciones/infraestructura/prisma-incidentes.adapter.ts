import type { PrismaClient } from '../../../generated/prisma/client';
import { clienteDe } from '../../../compartido/prisma-transaccion';
import type { ContextoTransaccional } from '../../../compartido/transaccion';
import type { IncidentesRepositorio } from '../aplicacion/incidentes';
import type { EstadoIncidente, Incidente } from '../dominio/incidente';

interface Fila {
  readonly id: string;
  readonly referencia: string;
  readonly estado: string;
  readonly registrado_en: Date;
}

const aIncidente = (f: Fila): Incidente => ({
  id: f.id,
  referencia: f.referencia,
  estado: f.estado as EstadoIncidente,
  registradoEn: f.registrado_en,
});

export class PrismaIncidentesAdapter implements IncidentesRepositorio {
  constructor(private readonly prisma: PrismaClient) {}

  async insertar(tx: ContextoTransaccional, referencia: string): Promise<Incidente | null> {
    // ON CONFLICT no aborta la transaccion ante una colision de referencia (a diferencia de un 23505).
    const filas = await clienteDe(tx).$queryRaw<Fila[]>`
      INSERT INTO incidentes (referencia) VALUES (${referencia})
      ON CONFLICT (referencia) DO NOTHING
      RETURNING id, referencia, estado, registrado_en`;
    return filas[0] ? aIncidente(filas[0]) : null;
  }

  async porReferencia(referencia: string): Promise<Incidente | null> {
    const filas = await this.prisma.$queryRaw<Fila[]>`
      SELECT id, referencia, estado, registrado_en FROM incidentes WHERE referencia = ${referencia}`;
    return filas[0] ? aIncidente(filas[0]) : null;
  }

  async porIds(ids: readonly string[]): Promise<readonly Incidente[]> {
    const filas = await this.prisma.$queryRaw<Fila[]>`
      SELECT id, referencia, estado, registrado_en FROM incidentes WHERE id = ANY(${[...ids]}::uuid[])`;
    return filas.map(aIncidente);
  }
}
