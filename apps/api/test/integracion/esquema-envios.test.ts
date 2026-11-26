import 'dotenv/config';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

/** Restricciones de `envios_incidente` y `solicitudes_envio` (P4.1, modulo Reportes). */
const url = process.env.TEST_DATABASE_URL;
let bd: Client;
const HUELLA = 'a'.repeat(64);
let incidente: string;
let autor: string;

async function codigoDeError(consulta: Promise<unknown>): Promise<string | undefined> {
  try {
    await consulta;
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

async function crearIncidente(referencia: string): Promise<string> {
  return (await bd.query<{ id: string }>(`INSERT INTO incidentes (referencia) VALUES ($1) RETURNING id`, [referencia])).rows[0]!.id;
}

beforeAll(async () => {
  if (!url) throw new Error('Falta TEST_DATABASE_URL (ver README de la API).');
  bd = new Client({ connectionString: url });
  await bd.connect();
});
afterAll(async () => {
  await bd?.end();
});
beforeEach(async () => {
  await bd.query('TRUNCATE solicitudes_envio, envios_incidente, incidentes, usuarios CASCADE');
  autor = (
    await bd.query<{ id: string }>(
      `INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
       VALUES ('Autor', 'autor@ejemplo.com', 'hash', 'ciudadano', 'activo', now()) RETURNING id`,
    )
  ).rows[0]!.id;
  incidente = await crearIncidente('INC-7K3M9-Q2TXA');
});

type Fila = Record<string, unknown>;
const cuenta = (): Fila => ({
  incidente_id: incidente,
  modalidad: 'cuenta',
  autor_usuario_id: autor,
  telefono_contacto: null,
  codigo_huella: null,
  codigo_emitido_en: null,
  categoria_id: 'robo',
  descripcion: 'Me robaron el celular',
  ocurrencia_modo: 'ahora',
  ocurrido_en: new Date(),
  latitud: -13.16,
  longitud: -74.22,
  origen_punto: 'gps',
  precision_m: 10,
  distrito_id: 'DIS-01',
  estado_territorial: 'resuelto',
  motivo_territorial: null,
  version_territorial: 'b'.repeat(64),
  heridos: null,
  atencion_medica: null,
  recibido_en: new Date(),
});
const invitado = (): Fila => ({
  ...cuenta(),
  modalidad: 'invitado',
  autor_usuario_id: null,
  telefono_contacto: '987654321',
  codigo_huella: HUELLA,
  codigo_emitido_en: new Date(),
});
function insertar(fila: Fila) {
  const cols = Object.keys(fila);
  return bd.query(
    `INSERT INTO envios_incidente (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(fila),
  );
}

describe('envios_incidente', () => {
  it('acepta un envio de cuenta y uno de invitado coherentes', async () => {
    await insertar(cuenta());
    await insertar({ ...invitado(), incidente_id: await crearIncidente('INC-7K3M9-Q2TXB') });
  });

  it('no guarda estado operativo, prioridad, institucion ni sede', async () => {
    const cols = await bd.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'envios_incidente'`,
    );
    const nombres = cols.rows.map((c) => c.column_name).filter((c) => c !== 'estado_territorial');
    expect(nombres.some((c) => /estado|prioridad|institucion|sede/.test(c))).toBe(false);
  });

  it.each([
    ['invitado con autor', () => ({ ...invitado(), autor_usuario_id: autor })],
    ['invitado sin telefono', () => ({ ...invitado(), telefono_contacto: null })],
    ['invitado sin huella de codigo', () => ({ ...invitado(), codigo_huella: null })],
    ['cuenta sin autor', () => ({ ...cuenta(), autor_usuario_id: null })],
    ['cuenta con telefono', () => ({ ...cuenta(), telefono_contacto: '987654321' })],
    ['cuenta con codigo', () => ({ ...cuenta(), codigo_huella: HUELLA, codigo_emitido_en: new Date() })],
  ])('rechaza la modalidad incoherente: %s (23514)', async (_n, fila) => {
    expect(await codigoDeError(insertar(fila()))).toBe('23514');
  });

  it.each([
    ['resuelto sin distrito', { distrito_id: null }],
    ['resuelto con motivo', { motivo_territorial: 'frontera' }],
    ['resuelto sin version', { version_territorial: null }],
    ['pendiente con distrito', { estado_territorial: 'pendiente', motivo_territorial: 'frontera' }],
    ['pendiente sin motivo', { estado_territorial: 'pendiente', distrito_id: null }],
    ['frontera sin version', { estado_territorial: 'pendiente', distrito_id: null, motivo_territorial: 'frontera', version_territorial: null }],
    ['sin cartografia con version', { estado_territorial: 'pendiente', distrito_id: null, motivo_territorial: 'sin_cartografia' }],
  ])('rechaza el territorio incoherente: %s (23514)', async (_n, cambios) => {
    expect(await codigoDeError(insertar({ ...cuenta(), ...cambios }))).toBe('23514');
  });

  it('acepta pendientes coherentes: frontera con version y sin cartografia sin version', async () => {
    await insertar({ ...cuenta(), estado_territorial: 'pendiente', distrito_id: null, motivo_territorial: 'frontera' });
    await insertar({
      ...cuenta(),
      incidente_id: await crearIncidente('INC-7K3M9-Q2TXB'),
      estado_territorial: 'pendiente',
      distrito_id: null,
      motivo_territorial: 'sin_cartografia',
      version_territorial: null,
    });
  });

  it.each([
    ['heridos en robo', { heridos: 'no' }],
    ['atencion medica en agresion', { categoria_id: 'agresion', atencion_medica: 'si' }],
    ['respuesta desconocida', { categoria_id: 'pelea', heridos: 'desconocido' }],
    ['descripcion corta', { descripcion: 'Robo' }],
    ['descripcion con espacios exteriores', { descripcion: ' Me robaron algo ' }],
    ['latitud fuera de rango', { latitud: 95 }],
    ['origen desconocido', { origen_punto: 'red' }],
  ])('rechaza %s (23514)', async (_n, cambios) => {
    expect(await codigoDeError(insertar({ ...cuenta(), ...cambios }))).toBe('23514');
  });

  it('acepta las respuestas aplicables, incluido no_se', async () => {
    await insertar({ ...cuenta(), categoria_id: 'accidente-transito', heridos: 'no_se', atencion_medica: 'si' });
  });

  it('exige categoria, distrito e incidente existentes (23503) y un envio por incidente (23505)', async () => {
    expect(await codigoDeError(insertar({ ...cuenta(), categoria_id: 'secuestro' }))).toBe('23503');
    expect(await codigoDeError(insertar({ ...cuenta(), distrito_id: 'DIS-99' }))).toBe('23503');
    expect(await codigoDeError(insertar({ ...cuenta(), incidente_id: '00000000-0000-4000-8000-000000000000' }))).toBe('23503');
    await insertar(cuenta());
    expect(await codigoDeError(insertar(cuenta()))).toBe('23505');
  });
});

describe('solicitudes_envio', () => {
  const clave = '0b9c1e4e-2f0a-4c55-9d8e-6f1a2b3c4d5e';
  const solicitud = (ambito: string, inc: string, huella = HUELLA) =>
    bd.query(`INSERT INTO solicitudes_envio (ambito, clave, huella_contenido, incidente_id) VALUES ($1, $2, $3, $4)`, [
      ambito,
      clave,
      huella,
      inc,
    ]);

  it('una clave por ambito; la misma clave en otro ambito es independiente', async () => {
    await solicitud(`cuenta:${autor}`, incidente);
    expect(await codigoDeError(solicitud(`cuenta:${autor}`, await crearIncidente('INC-7K3M9-Q2TXB')))).toBe('23505');
    await solicitud('invitado', await crearIncidente('INC-7K3M9-Q2TXC'));
  });

  it('rechaza ambitos y huellas no validos (23514) y dos solicitudes para un incidente (23505)', async () => {
    expect(await codigoDeError(solicitud('publico', incidente))).toBe('23514');
    expect(await codigoDeError(solicitud('invitado', incidente, 'xyz'))).toBe('23514');
    await solicitud('invitado', incidente);
    expect(
      await codigoDeError(
        bd.query(`INSERT INTO solicitudes_envio (ambito, clave, huella_contenido, incidente_id) VALUES ('invitado', gen_random_uuid(), $1, $2)`, [
          HUELLA,
          incidente,
        ]),
      ),
    ).toBe('23505');
  });
});
