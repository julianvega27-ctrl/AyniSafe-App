/** Datos sintéticos del recorrido local; nunca ejecutarlo contra desarrollo o producción. */
import 'dotenv/config';
import { crearPrismaClient } from '../../src/modules/identidad/infraestructura/prisma-cliente';
import { PrismaTerritorioAdapter } from '../../src/modules/consultas/infraestructura/prisma-territorio.adapter';
import { paqueteSintetico } from './territorio';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Se requiere una base _test.');
  const prisma = crearPrismaClient(url);
  try {
    await prisma.$executeRawUnsafe('TRUNCATE enrutamientos_incidente, participaciones_incidente, eventos, entregas_evento, envios_incidente, solicitudes_envio, incidentes, usuarios, ventanas_intentos, versiones_territoriales CASCADE');
    await prisma.$executeRaw`INSERT INTO estado_territorial(ambito) VALUES ('ayacucho-metropolitano') ON CONFLICT DO NOTHING`;
    await new PrismaTerritorioAdapter(prisma).importar(paqueteSintetico().preparado, true);
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error('No se pudieron preparar los datos sintéticos P4.'); process.exitCode = 1; });
