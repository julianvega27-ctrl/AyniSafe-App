import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';

/** Crea el cliente Prisma sobre el adaptador `pg`. La URL llega por configuracion. */
export function crearPrismaClient(urlBaseDeDatos: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: urlBaseDeDatos }) });
}

export type { PrismaClient };
