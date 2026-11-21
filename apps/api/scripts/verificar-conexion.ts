import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL (ver .env.example).');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const filas = await prisma.$queryRaw<{ bd: string }[]>`select current_database() as bd`;
    console.log(`Conexion correcta a la base: ${filas[0]?.bd}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  // No imprimir la URL ni el objeto de error completo: puede contener credenciales.
  console.error('Fallo de conexion:', e instanceof Error ? e.name : 'desconocido');
  process.exit(1);
});
