import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

/** Restricciones de `enrutamientos_incidente` y `participaciones_incidente` (P4.2, Operaciones). */
const url = process.env.TEST_DATABASE_URL;
let bd: Client;
let incidente: string;
let sede: string;
let admin: string;

async function codigoDeError(consulta: Promise<unknown>): Promise<string | undefined> {
  try {
    await consulta;
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

function insertar(tabla: string, fila: Record<string, unknown>) {
  const cols = Object.keys(fila);
  return bd.query(
    `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(fila),
  );
}

const enrutamiento = (extra: Record<string, unknown> = {}) => ({
  incidente_id: incidente,
  evento_id: randomUUID(),
  version_regla: 'matriz-09-v1',
  categoria_id: 'robo',
  distrito_id: 'DIS-01',
  resultado: 'ENRUTADO',
  revision_medica_pendiente: false,
  faltantes: '[]',
  registrado_en: new Date(),
  ...extra,
});
const participacion = (extra: Record<string, unknown> = {}) => ({
  incidente_id: incidente,
  sede_id: sede,
  institucion: 'pnp',
  papel: 'principal',
  origen: 'regla',
  ...extra,
});

beforeAll(async () => {
  if (!url) throw new Error('Falta TEST_DATABASE_URL (ver README de la API).');
  bd = new Client({ connectionString: url });
  await bd.connect();
});
afterAll(async () => {
  await bd?.end();
});
beforeEach(async () => {
  await bd.query('TRUNCATE participaciones_incidente, enrutamientos_incidente, envios_incidente, incidentes, usuarios CASCADE');
  admin = (
    await bd.query<{ id: string }>(
      `INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
       VALUES ('Admin', 'admin@ejemplo.com', 'hash', 'administrador', 'activo', now()) RETURNING id`,
    )
  ).rows[0]!.id;
  sede = (
    await bd.query<{ id: string }>(
      `INSERT INTO sedes (institucion_id, nombre, nombre_normalizado, creado_por) VALUES ('pnp', 'Comisaria', 'comisaria', $1) RETURNING id`,
      [admin],
    )
  ).rows[0]!.id;
  incidente = (await bd.query<{ id: string }>(`INSERT INTO incidentes (referencia) VALUES ('INC-7K3M9-Q2TXA') RETURNING id`)).rows[0]!.id;
});

describe('enrutamientos_incidente', () => {
  it('acepta un enrutado y un pendiente coherentes', async () => {
    await insertar('enrutamientos_incidente', enrutamiento());
    await bd.query('DELETE FROM enrutamientos_incidente');
    await insertar('enrutamientos_incidente', enrutamiento({
      resultado: 'ENRUTAMIENTO_PENDIENTE',
      distrito_id: null,
      faltantes: JSON.stringify([{ institucion: 'pnp', papel: 'principal', motivo: 'sin_distrito' }]),
    }));
  });

  it('rechaza resultados no admitidos e incoherentes con los faltantes (23514)', async () => {
    expect(await codigoDeError(insertar('enrutamientos_incidente', enrutamiento({ resultado: 'ASIGNADO' })))).toBe('23514');
    expect(await codigoDeError(insertar('enrutamientos_incidente', enrutamiento({ resultado: 'ENRUTAMIENTO_PENDIENTE' })))).toBe('23514');
    expect(await codigoDeError(insertar('enrutamientos_incidente', enrutamiento({
      faltantes: JSON.stringify([{ institucion: 'pnp', papel: 'principal', motivo: 'sin_distrito' }]),
    })))).toBe('23514');
    expect(await codigoDeError(insertar('enrutamientos_incidente', enrutamiento({ faltantes: '{}' })))).toBe('23514');
  });

  it('un enrutamiento por incidente y por evento (23505); incidente y categoria existentes (23503)', async () => {
    const evento = randomUUID();
    await insertar('enrutamientos_incidente', enrutamiento({ evento_id: evento }));
    expect(await codigoDeError(insertar('enrutamientos_incidente', enrutamiento()))).toBe('23505');
    const otro = (await bd.query<{ id: string }>(`INSERT INTO incidentes (referencia) VALUES ('INC-7K3M9-Q2TXB') RETURNING id`)).rows[0]!.id;
    expect(await codigoDeError(insertar('enrutamientos_incidente', enrutamiento({ incidente_id: otro, evento_id: evento })))).toBe('23505');
    expect(await codigoDeError(insertar('enrutamientos_incidente', enrutamiento({ incidente_id: randomUUID() })))).toBe('23503');
    await bd.query('DELETE FROM enrutamientos_incidente');
    expect(await codigoDeError(insertar('enrutamientos_incidente', enrutamiento({ categoria_id: 'ovni' })))).toBe('23503');
  });
});

describe('participaciones_incidente', () => {
  beforeEach(async () => {
    await insertar('enrutamientos_incidente', enrutamiento());
  });

  it('acepta una participacion por regla y una designacion auditada', async () => {
    await insertar('participaciones_incidente', participacion());
    const otra = (
      await bd.query<{ id: string }>(
        `INSERT INTO sedes (institucion_id, nombre, nombre_normalizado, creado_por) VALUES ('samu', 'Base', 'base', $1) RETURNING id`,
        [admin],
      )
    ).rows[0]!.id;
    await insertar('participaciones_incidente', participacion({
      sede_id: otra, institucion: 'samu', origen: 'designacion', designado_por: admin, motivo: 'Sin cobertura configurada en el distrito',
    }));
  });

  it('rechaza institucion, papel u origen invalidos y designaciones sin auditoria (23514)', async () => {
    expect(await codigoDeError(insertar('participaciones_incidente', participacion({ institucion: 'ejercito' })))).toBe('23514');
    expect(await codigoDeError(insertar('participaciones_incidente', participacion({ papel: 'apoyo' })))).toBe('23514');
    expect(await codigoDeError(insertar('participaciones_incidente', participacion({ origen: 'manual' })))).toBe('23514');
    expect(await codigoDeError(insertar('participaciones_incidente', participacion({ origen: 'designacion' })))).toBe('23514');
    expect(await codigoDeError(insertar('participaciones_incidente', participacion({ origen: 'designacion', designado_por: admin, motivo: 'corto' })))).toBe('23514');
    expect(await codigoDeError(insertar('participaciones_incidente', participacion({ designado_por: admin, motivo: 'Motivo de una regla' })))).toBe('23514');
  });

  it('una participacion por sede e incidente (23505); sede existente (23503)', async () => {
    await insertar('participaciones_incidente', participacion());
    expect(await codigoDeError(insertar('participaciones_incidente', participacion({ papel: 'simultanea' })))).toBe('23505');
    expect(await codigoDeError(insertar('participaciones_incidente', participacion({ sede_id: randomUUID() })))).toBe('23503');
  });
});

describe('migracion aditiva', () => {
  it('solo crea tablas e indices nuevos, sin alterar ni borrar los existentes', () => {
    const sql = readFileSync(resolve(__dirname, '../../prisma/migrations/20261127100000_enrutamiento/migration.sql'), 'utf8')
      .replace(/--.*$/gm, '')
      .replace(/ON DELETE RESTRICT/g, '');
    expect(sql).not.toMatch(/\b(ALTER|DROP|TRUNCATE|UPDATE|DELETE|INSERT)\b/i);
    const sentencias = sql.match(/\bCREATE\s+(TABLE|INDEX)\s+\w+/gi)!.map((s) => s.replace(/\s+/g, ' '));
    expect(sentencias).toEqual([
      'CREATE TABLE enrutamientos_incidente',
      'CREATE INDEX enrutamientos_pendientes_fifo',
      'CREATE TABLE participaciones_incidente',
      'CREATE INDEX participaciones_sede_incidente',
    ]);
  });
});
