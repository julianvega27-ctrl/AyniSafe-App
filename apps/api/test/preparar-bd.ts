import { execFileSync } from 'node:child_process';
import 'dotenv/config';
import { Client } from 'pg';

const { validarUrlPruebas } = require('../scripts/modo-pruebas.cjs') as {
  validarUrlPruebas(value?: string): string;
};

/**
 * Prepara la base aislada de pruebas: recrea el esquema vacio y aplica las migraciones.
 * Solo actua sobre TEST_DATABASE_URL y solo si el nombre de la base termina en `_test`.
 * Unidad no carga este setup. Integracion sin configuracion falla antes de conectar.
 */
export default async function preparar(): Promise<void> {
  const url = validarUrlPruebas(process.env.TEST_DATABASE_URL);
  const cliente = new Client({ connectionString: url });
  try {
    await cliente.connect();
    await cliente.query('DROP SCHEMA IF EXISTS public CASCADE');
    await cliente.query('CREATE SCHEMA public');
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  } catch {
    throw new Error('No se pudo preparar la base aislada de pruebas; revisa conectividad y migraciones.');
  } finally {
    await cliente.end();
  }
}
