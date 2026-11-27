import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

/** Restricciones de la evaluacion rapida (P5.1, Reportes) y de su auditoria (Operaciones). */
const url = process.env.TEST_DATABASE_URL;
let bd: Client;
let ciudadano: string;

const MIGRACION = readFileSync(resolve(__dirname, '../../prisma/migrations/20261128100000_evaluacion_rapida/migration.sql'), 'utf8');
/** Solo los INSERT de la carga inicial, para ejecutarlos de nuevo sobre datos existentes. */
const CARGA_INICIAL = MIGRACION.slice(MIGRACION.indexOf('-- Carga inicial'));

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

let secuencia = 0;
/** Inserta un incidente con su envio de cuenta y devuelve su id. */
async function envio(categoria: string, heridos: string | null = null, atencion: string | null = null): Promise<string> {
  secuencia += 1;
  const ref = `INC-7K3M9-Q2T${String(secuencia).padStart(2, '0').replace(/0/g, 'A').replace(/1/g, 'B')}`;
  const id = (await bd.query<{ id: string }>(`INSERT INTO incidentes (referencia) VALUES ($1) RETURNING id`, [ref])).rows[0]!.id;
  await insertar('envios_incidente', {
    incidente_id: id,
    modalidad: 'cuenta',
    autor_usuario_id: ciudadano,
    categoria_id: categoria,
    descripcion: 'Descripcion de prueba',
    ocurrencia_modo: 'ahora',
    ocurrido_en: new Date(),
    latitud: -13.16,
    longitud: -74.22,
    origen_punto: 'manual',
    estado_territorial: 'pendiente',
    motivo_territorial: 'sin_cartografia',
    heridos,
    atencion_medica: atencion,
    recibido_en: new Date('2026-11-26T15:00:00Z'),
  });
  return id;
}

const evaluacion = (incidente: string, extra: Record<string, unknown> = {}) => ({
  incidente_id: incidente,
  version_vigente: 1,
  heridos: 'si',
  samu_requerido: true,
  ...extra,
});
const version = (incidente: string, extra: Record<string, unknown> = {}) => ({
  incidente_id: incidente,
  version: 1,
  heridos: 'si',
  origen: 'ciudadano',
  actor_usuario_id: ciudadano,
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
  await bd.query(
    `TRUNCATE accesos_evaluacion, versiones_evaluacion, evaluaciones_incidente, cambios_enrutamiento,
       participaciones_incidente, enrutamientos_incidente, envios_incidente, incidentes, usuarios CASCADE`,
  );
  ciudadano = (
    await bd.query<{ id: string }>(
      `INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
       VALUES ('Ana', 'ana@ejemplo.com', 'hash', 'ciudadano', 'activo', now()) RETURNING id`,
    )
  ).rows[0]!.id;
});

describe('envios_incidente', () => {
  it('admite heridos en emergencia medica y sigue rechazandolos en robo', async () => {
    await expect(envio('emergencia-medica', 'no')).resolves.toBeDefined();
    expect(await codigoDeError(envio('robo', 'si'))).toBe('23514');
  });
});

describe('evaluaciones_incidente y versiones_evaluacion', () => {
  it('acepta una evaluacion y una version coherentes', async () => {
    const id = await envio('pelea', 'si');
    await insertar('evaluaciones_incidente', evaluacion(id, { cantidad_heridos: 3, consciente: 'no_se' }));
    await insertar('versiones_evaluacion', version(id, { cantidad_heridos: 3, consciente: 'no_se' }));
  });

  it.each([
    ['heridos fuera de catalogo', { heridos: 'quizas' }],
    ['signos de vida si/no', { signos_vida: 'si' }],
    ['consciente desconocido', { consciente: 'desconocido' }],
    ['cantidad cero', { cantidad_heridos: 0 }],
    ['cantidad 1000', { cantidad_heridos: 1000 }],
    ['cantidad sin heridos si', { heridos: 'no_se', cantidad_heridos: 2 }],
  ])('evaluacion rechaza %s', async (_n, extra) => {
    const id = await envio('pelea', 'si');
    expect(await codigoDeError(insertar('evaluaciones_incidente', evaluacion(id, extra)))).toBe('23514');
  });

  it.each([
    ['cantidad sin heridos si', { heridos: 'no', cantidad_heridos: 1 }],
    ['operador sin institucion', { origen: 'operador', motivo: 'Motivo suficiente' }],
    ['operador sin motivo', { origen: 'operador', institucion: 'pnp' }],
    ['ciudadano con motivo', { motivo: 'Motivo suficiente' }],
    ['institucion no admitida', { origen: 'operador', institucion: 'municipio', motivo: 'Motivo suficiente' }],
    ['campo modificado desconocido', { campos_modificados: ['nombre'] }],
    ['motivo corto', { origen: 'operador', institucion: 'samu', motivo: 'corto' }],
  ])('version rechaza %s', async (_n, extra) => {
    const id = await envio('pelea', 'si');
    await insertar('evaluaciones_incidente', evaluacion(id));
    expect(await codigoDeError(insertar('versiones_evaluacion', version(id, extra)))).toBe('23514');
  });

  it('rechaza una version duplicada y una evaluacion sin envio', async () => {
    const id = await envio('pelea', 'si');
    await insertar('evaluaciones_incidente', evaluacion(id));
    await insertar('versiones_evaluacion', version(id));
    expect(await codigoDeError(insertar('versiones_evaluacion', version(id)))).toBe('23505');
    expect(await codigoDeError(insertar('evaluaciones_incidente', evaluacion(randomUUID())))).toBe('23503');
  });

  it('acepta una version de operador auditada', async () => {
    const id = await envio('pelea', 'si');
    await insertar('evaluaciones_incidente', evaluacion(id));
    await insertar(
      'versiones_evaluacion',
      version(id, { version: 2, origen: 'operador', institucion: 'samu', motivo: 'Informe de la unidad', campos_modificados: ['consciente'] }),
    );
  });
});

describe('carga inicial', () => {
  it('crea la version 1 solo para las cinco categorias, con samu_requerido segun la regla, y es idempotente', async () => {
    const accidenteSi = await envio('accidente-transito', 'no', 'si');
    const accidenteNoSe = await envio('accidente-transito', 'no_se');
    const peleaSi = await envio('pelea', 'si');
    const emergencia = await envio('emergencia-medica');
    const violenciaNo = await envio('violencia', 'no');
    const robo = await envio('robo');

    await bd.query(CARGA_INICIAL);
    await bd.query(CARGA_INICIAL);

    const evals = await bd.query<{ incidente_id: string; samu_requerido: boolean; heridos: string | null; atencion_medica: string | null }>(
      'SELECT incidente_id, samu_requerido, heridos, atencion_medica FROM evaluaciones_incidente',
    );
    const porId = new Map(evals.rows.map((r) => [r.incidente_id, r]));
    expect(porId.size).toBe(5);
    expect(porId.has(robo)).toBe(false);
    expect(porId.get(accidenteSi)).toMatchObject({ samu_requerido: true, heridos: 'no', atencion_medica: 'si' });
    expect(porId.get(accidenteNoSe)?.samu_requerido).toBe(false);
    expect(porId.get(peleaSi)?.samu_requerido).toBe(true);
    expect(porId.get(emergencia)).toMatchObject({ samu_requerido: true, heridos: null });
    expect(porId.get(violenciaNo)?.samu_requerido).toBe(false);

    const versiones = await bd.query<{ n: string; origenes: string[] }>(
      `SELECT count(*) AS n, array_agg(DISTINCT origen) AS origenes FROM versiones_evaluacion WHERE version = 1`,
    );
    expect(versiones.rows[0]).toEqual({ n: '5', origenes: ['ciudadano'] });
  });
});

describe('cambios_enrutamiento y participaciones', () => {
  it('rechaza un origen o actor desconocido y admite el origen condicion_medica en participaciones', async () => {
    const id = await envio('accidente-transito', 'no_se');
    await insertar('enrutamientos_incidente', {
      incidente_id: id,
      evento_id: randomUUID(),
      version_regla: 'matriz-09-v1',
      categoria_id: 'accidente-transito',
      resultado: 'ENRUTAMIENTO_PENDIENTE',
      revision_medica_pendiente: true,
      faltantes: '[{"institucion":"pnp","papel":"principal","motivo":"sin_distrito"}]',
      registrado_en: new Date(),
    });
    const cambio = (extra: Record<string, unknown>) => ({
      incidente_id: id,
      version_evaluacion: 2,
      origen: 'condicion_medica',
      actor_tipo: 'ciudadano',
      antes: '{}',
      despues: '{}',
      ...extra,
    });
    await insertar('cambios_enrutamiento', cambio({}));
    expect(await codigoDeError(insertar('cambios_enrutamiento', cambio({ origen: 'regla' })))).toBe('23514');
    expect(await codigoDeError(insertar('cambios_enrutamiento', cambio({ actor_tipo: 'administrador' })))).toBe('23514');
    expect(await codigoDeError(insertar('cambios_enrutamiento', cambio({ antes: '[]' })))).toBe('23514');

    const restriccion = await bd.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'participaciones_incidente_origen_check'`,
    );
    expect(restriccion.rows[0]?.def).toContain('condicion_medica');
  });
});
