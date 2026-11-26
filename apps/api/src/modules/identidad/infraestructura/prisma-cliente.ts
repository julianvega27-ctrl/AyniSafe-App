import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';

/**
 * Crea el cliente Prisma sobre el adaptador `pg`. La URL llega por configuracion.
 *
 * La sesion se fija en UTC: el adaptador interpreta los `timestamptz` leidos como UTC sin aplicar el
 * desfase que PostgreSQL incluye segun la zona de la sesion. Con un servidor en otra zona (por ejemplo,
 * America/Bogota en un cluster local) las marcas generadas por la BD (`now()`) se leian desplazadas.
 */
export function crearPrismaClient(urlBaseDeDatos: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: urlBaseDeDatos, options: '-c TimeZone=UTC' }) });
}

export type { PrismaClient };
