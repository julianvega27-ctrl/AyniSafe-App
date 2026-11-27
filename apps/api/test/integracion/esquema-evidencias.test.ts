import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

/** Restricciones de evidencias_incidente, permisos_evidencia y accesos_evidencia (P5.2, Reportes). */
const url = process.env.TEST_DATABASE_URL;
let bd: Client;
let ciudadano: string;

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
  return bd.query(`INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(fila));
}

let secuencia = 0;
async function envio(): Promise<string> {
  secuencia += 1;
  const ref = `INC-7K3M9-QE${String(secuencia).padStart(3, '0').replace(/0/g, 'A').replace(/1/g, 'B')}`;
  const id = (await bd.query<{ id: string }>(`INSERT INTO incidentes (referencia) VALUES ($1) RETURNING id`, [ref])).rows[0]!.id;
  await insertar('envios_incidente', {
    incidente_id: id,
    modalidad: 'cuenta',
    autor_usuario_id: ciudadano,
    categoria_id: 'robo',
    descripcion: 'Descripcion de prueba',
    ocurrencia_modo: 'ahora',
    ocurrido_en: new Date(),
    latitud: -13.16,
    longitud: -74.22,
    origen_punto: 'manual',
    estado_territorial: 'pendiente',
    motivo_territorial: 'sin_cartografia',
    recibido_en: new Date('2026-11-27T15:00:00Z'),
  });
  return id;
}

const HEX = 'a'.repeat(64);
const evidencia = (incidente: string, extra: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  incidente_id: incidente,
  ranura: 1,
  public_id: `aynisafe/${randomUUID()}`,
  proveedor: 'cloudinary',
  estado: 'pendiente',
  tipo_medio: 'image/jpeg',
  bytes: 1000,
  huella_carga: HEX,
  clave_idempotencia: randomUUID(),
  modalidad: 'cuenta',
  autor_usuario_id: ciudadano,
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
  await bd.query(`TRUNCATE accesos_evidencia, permisos_evidencia, evidencias_incidente, envios_incidente, incidentes, usuarios CASCADE`);
  ciudadano = (
    await bd.query<{ id: string }>(
      `INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
       VALUES ('Ana', 'ana@ejemplo.com', 'hash', 'ciudadano', 'activo', now()) RETURNING id`,
    )
  ).rows[0]!.id;
});

describe('evidencias_incidente', () => {
  it('acepta una evidencia pendiente coherente', async () => {
    const id = await envio();
    await insertar('evidencias_incidente', evidencia(id));
  });

  it.each([
    ['public_id sin aynisafe/', { public_id: `incidencias/${randomUUID()}` }],
    ['public_id con subcarpeta', { public_id: `aynisafe/x/${randomUUID()}` }],
    ['public_id en mayusculas', { public_id: `aynisafe/${randomUUID().toUpperCase()}` }],
    ['tipo no admitido', { tipo_medio: 'image/gif' }],
    ['mas de 5 MB', { bytes: 5 * 1024 * 1024 + 1 }],
    ['cero bytes', { bytes: 0 }],
    ['ranura 0', { ranura: 0 }],
    ['ranura 4', { ranura: 4 }],
    ['estado desconocido', { estado: 'borrada' }],
    ['proveedor desconocido', { proveedor: 'local' }],
    ['invitado con autor', { modalidad: 'invitado' }],
    ['cuenta sin autor', { autor_usuario_id: null }],
    ['disponible sin confirmar', { estado: 'disponible' }],
    ['eliminacion sin motivo', { estado: 'eliminacion_pendiente' }],
    ['eliminada con sha256', { estado: 'eliminada', motivo_eliminacion: 'huerfana', eliminada_en: new Date(), sha256: HEX }],
    ['eliminada sin instante', { estado: 'eliminada', motivo_eliminacion: 'huerfana' }],
    ['motivo desconocido', { estado: 'eliminacion_pendiente', motivo_eliminacion: 'otro' }],
  ])('rechaza %s con 23514', async (_n, extra) => {
    const id = await envio();
    expect(await codigoDeError(insertar('evidencias_incidente', evidencia(id, extra)))).toBe('23514');
  });

  it('una cuarta ranura activa no existe y la misma ranura repetida da 23505', async () => {
    const id = await envio();
    for (const ranura of [1, 2, 3]) await insertar('evidencias_incidente', evidencia(id, { ranura }));
    expect(await codigoDeError(insertar('evidencias_incidente', evidencia(id, { ranura: 2 })))).toBe('23505');
  });

  it('public_id repetido y clave repetida en el mismo incidente dan 23505', async () => {
    const id = await envio();
    const e = evidencia(id);
    await insertar('evidencias_incidente', e);
    expect(await codigoDeError(insertar('evidencias_incidente', evidencia(id, { ranura: 2, public_id: e.public_id })))).toBe('23505');
    expect(await codigoDeError(insertar('evidencias_incidente', evidencia(id, { ranura: 2, clave_idempotencia: e.clave_idempotencia })))).toBe('23505');
  });

  it('la misma clave en otro incidente se admite', async () => {
    const a = await envio();
    const b = await envio();
    const e = evidencia(a);
    await insertar('evidencias_incidente', e);
    await insertar('evidencias_incidente', evidencia(b, { clave_idempotencia: e.clave_idempotencia }));
  });

  it('la clave de una evidencia fallida puede reutilizarse en otra ranura', async () => {
    const id = await envio();
    const fallida = evidencia(id, { estado: 'eliminacion_pendiente', motivo_eliminacion: 'fallo_carga' });
    await insertar('evidencias_incidente', fallida);
    await insertar('evidencias_incidente', evidencia(id, { ranura: 2, clave_idempotencia: fallida.clave_idempotencia }));
  });

  it('una ranura liberada por una fila eliminada se reutiliza', async () => {
    const id = await envio();
    await insertar('evidencias_incidente', evidencia(id, { estado: 'eliminada', motivo_eliminacion: 'fallo_carga', eliminada_en: new Date() }));
    await insertar('evidencias_incidente', evidencia(id));
  });

  it('una evidencia sin envio da 23503', async () => {
    expect(await codigoDeError(insertar('evidencias_incidente', evidencia(randomUUID())))).toBe('23503');
  });
});

describe('permisos_evidencia y accesos_evidencia', () => {
  it('rechaza huella mal formada y vencimiento no posterior', async () => {
    const id = await envio();
    const ahora = new Date();
    expect(await codigoDeError(insertar('permisos_evidencia', { incidente_id: id, permiso_huella: 'abc', emitido_en: ahora, vence_en: new Date(ahora.getTime() + 1000) }))).toBe('23514');
    expect(await codigoDeError(insertar('permisos_evidencia', { incidente_id: id, permiso_huella: HEX, emitido_en: ahora, vence_en: ahora }))).toBe('23514');
    await insertar('permisos_evidencia', { incidente_id: id, permiso_huella: HEX, emitido_en: ahora, vence_en: new Date(ahora.getTime() + 1000) });
  });

  it('acceso con rol no admitido da 23514', async () => {
    const id = await envio();
    const e = evidencia(id);
    await insertar('evidencias_incidente', e);
    expect(await codigoDeError(insertar('accesos_evidencia', { evidencia_id: e.id, usuario_id: ciudadano, rol: 'administrador' }))).toBe('23514');
    await insertar('accesos_evidencia', { evidencia_id: e.id, usuario_id: ciudadano, rol: 'ciudadano' });
  });
});
