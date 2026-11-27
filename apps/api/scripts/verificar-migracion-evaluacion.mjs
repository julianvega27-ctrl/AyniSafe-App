// Compara snapshots introspectados antes/después de P5.1 en un esquema temporal de la BD *_test.
// Aplica la migración sobre una base de P4 con datos (deploy desde P4) y no aplica el diff generado.
// CHECK y triggers se prueban aparte con PostgreSQL (test/integracion/esquema-evaluacion.test.ts).
import 'dotenv/config';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Se requiere una BD local *_test.');
const esquema = `p5_migracion_${randomBytes(6).toString('hex')}`;
const carpeta = mkdtempSync(join(tmpdir(), 'ayni-p5-diff-'));
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
  for (const nombre of migraciones.filter(n => n < '20261128100000_evaluacion_rapida')) {
    await conexion.query(readFileSync(join('prisma/migrations', nombre, 'migration.sql'), 'utf8'));
  }
  const antes = join(carpeta, 'antes.prisma');
  const despues = join(carpeta, 'despues.prisma');
  writeFileSync(antes, prisma(['db', 'pull', '--print']));
  // Datos de P4: un accidente con heridos de cuenta y un robo, antes de aplicar la migración.
  const usuario = (await conexion.query(`INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
    VALUES ('Ana', 'ana@ejemplo.com', 'hash', 'ciudadano', 'activo', now()) RETURNING id`)).rows[0].id;
  for (const [ref, categoria, heridos] of [['INC-7K3M9-Q2TXA', 'accidente-transito', 'si'], ['INC-7K3M9-Q2TXB', 'robo', null]]) {
    const id = (await conexion.query('INSERT INTO incidentes (referencia) VALUES ($1) RETURNING id', [ref])).rows[0].id;
    await conexion.query(`INSERT INTO envios_incidente (incidente_id, modalidad, autor_usuario_id, categoria_id, descripcion,
      ocurrencia_modo, ocurrido_en, latitud, longitud, origen_punto, estado_territorial, motivo_territorial, heridos, recibido_en)
      VALUES ($1, 'cuenta', $2, $3, 'Descripcion de prueba', 'ahora', now(), -13.16, -74.22, 'manual', 'pendiente', 'sin_cartografia', $4, now())`,
      [id, usuario, categoria, heridos]);
  }
  await conexion.query(readFileSync('prisma/migrations/20261128100000_evaluacion_rapida/migration.sql', 'utf8'));
  const cargadas = (await conexion.query('SELECT count(*)::int AS n FROM versiones_evaluacion')).rows[0].n;
  if (cargadas !== 1) throw new Error('La carga inicial no creó exactamente una versión 1.');
  writeFileSync(despues, prisma(['db', 'pull', '--print']));
  const diff = prisma(['migrate', 'diff', '--from-schema', antes, '--to-schema', despues, '--script']);
  const tablas = [...diff.matchAll(/CREATE TABLE "([^"]+)"/g)].map(m => m[1]).sort();
  const alteradas = [...diff.matchAll(/ALTER TABLE "([^"]+)"/g)].map(m => m[1]);
  const nuevas = ['accesos_evaluacion', 'cambios_enrutamiento', 'evaluaciones_incidente', 'versiones_evaluacion'];
  // Única tabla previa alterada: la columna actualizado_en de participaciones_incidente.
  const permitidas = [...nuevas, 'participaciones_incidente'];
  if (JSON.stringify(tablas) !== JSON.stringify(nuevas) || alteradas.some(t => !permitidas.includes(t)) || /\bDROP\b/.test(diff)) {
    throw new Error('El diff no es exclusivamente aditivo.');
  }
  if (!/ALTER TABLE "participaciones_incidente" ADD COLUMN\s+"actualizado_en"/.test(diff)) throw new Error('Falta la columna actualizado_en.');
  mkdirSync(resolve('../../docs/validacion/p5'), { recursive: true });
  const salida = resolve('../../docs/validacion/p5/migracion-evaluacion-diff.sql');
  writeFileSync(salida, '-- Prisma migrate diff: snapshots introspectados de la misma BD antes y después de P5.1.\n-- Solo evidencia; no aplicar. No incluye CHECK ni triggers.\n' + diff);
  console.log(`Diff aditivo verificado: ${tablas.join(', ')}; única tabla previa alterada: participaciones_incidente (actualizado_en). Carga inicial sobre datos de P4: 1 versión.`);
} finally {
  if (/^p5_migracion_[a-f0-9]{12}$/.test(esquema)) {
    await conexion.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
  }
  await conexion.end();
  rmSync(carpeta, { recursive: true, force: true });
}
