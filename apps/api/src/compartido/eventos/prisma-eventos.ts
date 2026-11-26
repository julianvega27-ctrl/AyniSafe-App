import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client';
import { clienteDe } from '../prisma-transaccion';
import type { ContextoTransaccional } from '../transaccion';
import { validarNuevoEvento, type NuevoEvento, type PublicadorEventos } from './eventos';

/** Publicador sobre PostgreSQL: el INSERT ocurre en la transaccion recibida (si se revierte, no hay evento). */
export class PrismaPublicadorEventos implements PublicadorEventos {
  async publicar(tx: ContextoTransaccional, evento: NuevoEvento): Promise<string> {
    validarNuevoEvento(evento);
    const id = randomUUID();
    await clienteDe(tx).$executeRaw`
      INSERT INTO eventos (id, tipo, version, agregado_id, carga)
      VALUES (${id}::uuid, ${evento.tipo}, ${evento.version}, ${evento.agregadoId}::uuid, ${JSON.stringify(evento.carga)}::jsonb)`;
    return id;
  }
}

export type EstadoEntrega = 'pendiente' | 'en_proceso' | 'procesada' | 'fallida';

export interface ConteoEntregas {
  readonly consumidor: string;
  readonly estado: EstadoEntrega;
  readonly total: number;
}

/** Conteo de entregas por consumidor y estado (observabilidad y `npm run eventos:estado`). */
export async function contarEntregas(prisma: PrismaClient): Promise<ConteoEntregas[]> {
  const filas = await prisma.$queryRaw<{ consumidor: string; estado: EstadoEntrega; total: bigint }[]>`
    SELECT consumidor, estado, count(*) AS total FROM entregas_evento
     GROUP BY consumidor, estado ORDER BY consumidor, estado`;
  return filas.map((f) => ({ consumidor: f.consumidor, estado: f.estado, total: Number(f.total) }));
}

/**
 * Recuperacion manual: devuelve a pendiente las entregas fallidas de un consumidor (o de un evento),
 * con intentos a cero y reintento inmediato. Devuelve cuantas cambio.
 */
export async function reintentarFallidas(prisma: PrismaClient, consumidor: string, eventoId?: string): Promise<number> {
  if (eventoId !== undefined) {
    return prisma.$executeRaw`
      UPDATE entregas_evento SET estado = 'pendiente', intentos = 0, proximo_intento_en = now(), ultimo_error = NULL
       WHERE consumidor = ${consumidor} AND evento_id = ${eventoId}::uuid AND estado = 'fallida'`;
  }
  return prisma.$executeRaw`
    UPDATE entregas_evento SET estado = 'pendiente', intentos = 0, proximo_intento_en = now(), ultimo_error = NULL
     WHERE consumidor = ${consumidor} AND estado = 'fallida'`;
}
