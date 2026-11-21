import 'dotenv/config';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const url = process.env.TEST_DATABASE_URL;
let bd: Client;

async function codigoDeError(consulta: Promise<unknown>): Promise<string | undefined> {
  try {
    await consulta;
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

async function crearUsuario(correo: string, nombre = 'Rosa'): Promise<string> {
  const r = await bd.query<{ id: string }>(
    `INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
     VALUES ($1, $2, 'hash-de-prueba', 'ciudadano', 'activo', now()) RETURNING id`,
    [nombre, correo],
  );
  return r.rows[0]!.id;
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
  await bd.query('TRUNCATE sesiones, usuarios, ventanas_intentos CASCADE');
});

describe('migracion desde base vacia', () => {
  it('crea las tablas, enumeraciones e indices del diseno', async () => {
    const tablas = await bd.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    expect(tablas.rows.map((t) => t.tablename).sort()).toEqual(['sesiones', 'usuarios', 'ventanas_intentos']);

    const indices = await bd.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const nombres = indices.rows.map((i) => i.indexname);
    for (const esperado of [
      'usuarios_correo_normalizado_key',
      'sesiones_token_hash_key',
      'sesiones_expires_at_idx',
      'ventanas_intentos_ventana_inicio_idx',
    ]) {
      expect(nombres).toContain(esperado);
    }

    const roles = await bd.query<{ e: string }>(
      `SELECT unnest(enum_range(NULL::"RolUsuario"))::text AS e`,
    );
    expect(roles.rows.map((r) => r.e)).toEqual(['ciudadano', 'operador', 'administrador']);
  });

  it('no incluye DNI ni telefono en usuarios', async () => {
    const cols = await bd.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'usuarios'`,
    );
    const nombres = cols.rows.map((c) => c.column_name);
    expect(nombres.some((c) => /dni|telefono|phone/i.test(c))).toBe(false);
  });
});

describe('usuarios', () => {
  it('rechaza correos normalizados duplicados (unique 23505)', async () => {
    await crearUsuario('vecina@ejemplo.com');
    expect(await codigoDeError(crearUsuario('vecina@ejemplo.com', 'Otra'))).toBe('23505');
  });

  it('rechaza un correo que no este en minusculas o con espacios externos (check 23514)', async () => {
    expect(await codigoDeError(crearUsuario('Vecina@Ejemplo.com'))).toBe('23514');
    expect(await codigoDeError(crearUsuario(' vecina@ejemplo.com'))).toBe('23514');
  });

  it('rechaza nombre vacio o de mas de 100 caracteres (check 23514)', async () => {
    expect(await codigoDeError(crearUsuario('a@ejemplo.com', '   '))).toBe('23514');
    expect(await codigoDeError(crearUsuario('b@ejemplo.com', 'x'.repeat(101)))).toBe('23514');
    expect(await codigoDeError(crearUsuario('c@ejemplo.com', '\u{1F600}'.repeat(100)))).toBeUndefined();
  });

  it('rechaza roles y estados fuera de la enumeracion', async () => {
    const q = bd.query(
      `INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
       VALUES ('X', 'x@ejemplo.com', 'h', 'superusuario', 'activo', now())`,
    );
    expect(await codigoDeError(q)).toBe('22P02');
  });
});

describe('sesiones', () => {
  const insertarSesion = (usuarioId: string, tokenHash: string, dias = 1) =>
    bd.query(
      `INSERT INTO sesiones (usuario_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, now(), now() + ($3 || ' days')::interval)`,
      [usuarioId, tokenHash, String(dias)],
    );

  it('rechaza sesiones huerfanas (FK 23503)', async () => {
    const huerfano = '00000000-0000-4000-8000-000000000000';
    expect(await codigoDeError(insertarSesion(huerfano, 'hash-1'))).toBe('23503');
  });

  it('rechaza tokenHash repetido (unique 23505)', async () => {
    const id = await crearUsuario('s@ejemplo.com');
    await insertarSesion(id, 'hash-igual');
    expect(await codigoDeError(insertarSesion(id, 'hash-igual'))).toBe('23505');
  });

  it('rechaza un vencimiento anterior a la creacion (check 23514)', async () => {
    const id = await crearUsuario('v@ejemplo.com');
    expect(await codigoDeError(insertarSesion(id, 'hash-2', -1))).toBe('23514');
  });

  it('permite varias sesiones independientes por usuario', async () => {
    const id = await crearUsuario('m@ejemplo.com');
    await insertarSesion(id, 'hash-a');
    await insertarSesion(id, 'hash-b');
    const r = await bd.query('SELECT count(*)::int AS n FROM sesiones WHERE usuario_id = $1', [id]);
    expect(r.rows[0].n).toBe(2);
  });

  it('elimina sus sesiones si se elimina el usuario (solo entornos efimeros)', async () => {
    const id = await crearUsuario('d@ejemplo.com');
    await insertarSesion(id, 'hash-c');
    await bd.query('DELETE FROM usuarios WHERE id = $1', [id]);
    const r = await bd.query('SELECT count(*)::int AS n FROM sesiones');
    expect(r.rows[0].n).toBe(0);
  });
});

describe('ventanas_intentos', () => {
  it('impide duplicar la ventana de una misma clave (primary key 23505)', async () => {
    const insertar = () =>
      bd.query(
        `INSERT INTO ventanas_intentos (tipo, clave_hash, ventana_inicio, contador)
         VALUES ('login_ip', 'clave', '2026-11-21T10:00:00Z', 1)`,
      );
    await insertar();
    expect(await codigoDeError(insertar())).toBe('23505');
  });

  it('rechaza contadores negativos (check 23514)', async () => {
    const q = bd.query(
      `INSERT INTO ventanas_intentos (tipo, clave_hash, ventana_inicio, contador)
       VALUES ('login_ip', 'otra', now(), -1)`,
    );
    expect(await codigoDeError(q)).toBe('23514');
  });
});
