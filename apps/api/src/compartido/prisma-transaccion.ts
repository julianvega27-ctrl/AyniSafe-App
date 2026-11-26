import type { PrismaClient } from '../generated/prisma/client';
import type { ContextoTransaccional, UnidadDeTrabajo } from './transaccion';

/** Cliente transaccional de Prisma (el argumento de `$transaction(fn)`). */
export type ClienteTransaccional = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Unidad de trabajo sobre `prisma.$transaction` (READ COMMITTED por defecto en PostgreSQL). */
export class PrismaUnidadDeTrabajo implements UnidadDeTrabajo {
  constructor(private readonly prisma: PrismaClient) {}

  enTransaccion<T>(fn: (tx: ContextoTransaccional) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx as unknown as ContextoTransaccional));
  }
}

/** Recupera el cliente Prisma de un contexto creado por `PrismaUnidadDeTrabajo`. Solo para adaptadores. */
export function clienteDe(tx: ContextoTransaccional): ClienteTransaccional {
  return tx as unknown as ClienteTransaccional;
}
