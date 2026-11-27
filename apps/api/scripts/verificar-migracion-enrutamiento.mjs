// Compara snapshots introspectados antes/después de P4.2 en un esquema temporal de la BD *_test.
// No aplica el diff generado. CHECK y triggers se prueban aparte con PostgreSQL.
import 'dotenv/config';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Se requiere una BD local *_test.');
const esquema = `p4_migracion_${randomBytes(6).toString('hex')}`;
const carpeta = mkdtempSync(join(tmpdir(), 'ayni-p4-diff-'));
const conexion = new Client({ connectionString: url });
const temporal = new URL(url);
temporal.searchParams.set('schema', esquema);
const env = { ...process.env, DATABASE_URL: temporal.toString() };
function prisma(args) {
  const r = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], { cwd: process.cwd(), env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('Falló la introspección o comparación Prisma.');
  return r.stdout;
}
try {
  await conexion.connect();
  await conexion.query(`CREATE SCHEMA "${esquema}"`);
  await conexion.query(`SET search_path TO "${esquema}"`);
  const migraciones = readdirSync('prisma/migrations').filter(n => /^\d/.test(n)).sort();
  for (const nombre of migraciones.filter(n => n < '20261127100000_enrutamiento')) {
    await conexion.query(readFileSync(join('prisma/migrations', nombre, 'migration.sql'), 'utf8'));
  }
  const antes = join(carpeta, 'antes.prisma');
  const despues = join(carpeta, 'despues.prisma');
  writeFileSync(antes, prisma(['db', 'pull', '--print']));
  await conexion.query(readFileSync('prisma/migrations/20261127100000_enrutamiento/migration.sql', 'utf8'));
  writeFileSync(despues, prisma(['db', 'pull', '--print']));
  const diff = prisma(['migrate', 'diff', '--from-schema', antes, '--to-schema', despues, '--script']);
  const tablas = [...diff.matchAll(/CREATE TABLE "([^"]+)"/g)].map(m => m[1]).sort();
  const alteradas = [...diff.matchAll(/ALTER TABLE "([^"]+)"/g)].map(m => m[1]);
  const nuevas = ['enrutamientos_incidente', 'participaciones_incidente'];
  if (JSON.stringify(tablas) !== JSON.stringify(nuevas) || alteradas.some(t => !nuevas.includes(t)) || /\bDROP\b/.test(diff)) throw new Error('El diff no es exclusivamente aditivo.');
  const salida = resolve('../../docs/validacion/p4/migracion-enrutamiento-diff.sql');
  writeFileSync(salida, '-- Prisma migrate diff: snapshots introspectados de la misma BD antes y después de P4.2.\n-- Solo evidencia; no aplicar. No incluye CHECK ni triggers.\n' + diff);
  console.log(`Diff aditivo verificado: ${tablas.join(', ')}; sin alteraciones de tablas previas.`);
} finally {
  if (/^p4_migracion_[a-f0-9]{12}$/.test(esquema)) {
    await conexion.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
  }
  await conexion.end();
  rmSync(carpeta, { recursive: true, force: true });
}
