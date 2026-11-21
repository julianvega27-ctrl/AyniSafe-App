import { execSync } from 'node:child_process';
import 'dotenv/config';
import { Client } from 'pg';

/**
 * Prepara la base aislada de pruebas: recrea el esquema vacio y aplica las migraciones.
 * Solo actua sobre TEST_DATABASE_URL y solo si el nombre de la base termina en `_test`.
 * Sin TEST_DATABASE_URL no hace nada (las pruebas de unidad no la necesitan).
 */
export default async function preparar(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const nombre = new URL(url).pathname.replace(/^\//, '');
  if (!nombre.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en _test.');
  }
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    await cliente.query('DROP SCHEMA IF EXISTS public CASCADE');
    await cliente.query('CREATE SCHEMA public');
  } finally {
    await cliente.end();
  }
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
