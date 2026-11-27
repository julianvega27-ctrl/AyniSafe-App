import 'dotenv/config';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

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
  await bd.query('TRUNCATE envios_correo, tokens_cuenta, sesiones, usuarios, ventanas_intentos CASCADE');
});

describe('migracion desde base vacia', () => {
  it('crea las tablas, enumeraciones e indices del diseno', async () => {
    const tablas = await bd.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    expect(tablas.rows.map((t) => t.tablename).sort()).toEqual([
      'categorias',
      'coberturas_sede',
      'competencias_sede',
      'distritos',
      'enrutamientos_incidente',
      'entregas_evento',
      'envios_correo',
      'envios_incidente',
      'estado_territorial',
      'eventos',
      'geometrias_distritales',
      'incidentes',
      'instituciones',
      'participaciones_incidente',
      'pertenencias_operador',
      'sedes',
      'sesiones',
      'solicitudes_envio',
      'tokens_cuenta',
      'usuarios',
      'ventanas_intentos',
      'versiones_territoriales',
    ]);

    const indices = await bd.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const nombres = indices.rows.map((i) => i.indexname);
    for (const esperado of [
      'usuarios_correo_normalizado_key',
      'sesiones_token_hash_key',
      'sesiones_expires_at_idx',
      'ventanas_intentos_ventana_inicio_idx',
      'geometrias_distritales_pkey',
      'geometrias_distritales_version_id_ubigeo_key',
      'estado_territorial_pkey',
      'sedes_nombre_por_institucion',
      'pertenencias_operador_pkey',
      'pertenencias_operador_sede_id_idx',
      'coberturas_sede_pkey',
      'coberturas_sede_distrito_id_idx',
      'competencias_sede_pkey',
      'competencias_sede_categoria_id_idx',
      'eventos_tipo_ocurrido_en_idx',
      'entregas_evento_pkey',
      'entregas_evento_pendientes_idx',
      'incidentes_referencia_key',
      'envios_incidente_pkey',
      'envios_incidente_autor_idx',
      'solicitudes_envio_pkey',
      'solicitudes_envio_incidente_id_key',
    ]) {
      expect(nombres).toContain(esperado);
    }

    const roles = await bd.query<{ e: string }>(
      `SELECT unnest(enum_range(NULL::"RolUsuario"))::text AS e`,
    );
    expect(roles.rows.map((r) => r.e)).toEqual(['ciudadano', 'operador', 'administrador']);
  });

  it('no incluye DNI y el telefono es solo opcional (perfil)', async () => {
    const cols = await bd.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'usuarios'`,
    );
    const nombres = cols.rows.map((c) => c.column_name);
    expect(nombres.some((c) => /dni|documento/i.test(c))).toBe(false);
    const tel = await bd.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'telefono'`,
    );
    expect(tel.rows[0]?.is_nullable).toBe('YES');
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

describe('cuentas pendientes de activacion', () => {
  const insertar = (estado: string, hash: string | null, correo: string) =>
    bd.query(
      `INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
       VALUES ('Op', $1, $2, 'operador', $3::"EstadoUsuario", now())`,
      [correo, hash, estado],
    );

  it('incluye el estado pendiente_activacion', async () => {
    const r = await bd.query<{ e: string }>(`SELECT unnest(enum_range(NULL::"EstadoUsuario"))::text AS e`);
    expect(r.rows.map((x) => x.e)).toEqual(['activo', 'suspendido', 'pendiente_activacion']);
  });

  it('rechaza hash nulo en cuentas activas (check 23514)', async () => {
    expect(await codigoDeError(insertar('activo', null, 'a@ejemplo.com'))).toBe('23514');
  });

  it('admite una suspendida sin hash (invitacion revocada, P3.2) y una suspendida con hash', async () => {
    expect(await codigoDeError(insertar('suspendido', null, 'b@ejemplo.com'))).toBeUndefined();
    expect(await codigoDeError(insertar('suspendido', 'hash', 'b2@ejemplo.com'))).toBeUndefined();
  });

  it('rechaza un hash presente en una cuenta pendiente (check 23514)', async () => {
    expect(await codigoDeError(insertar('pendiente_activacion', 'hash', 'c@ejemplo.com'))).toBe('23514');
  });

  it('admite una cuenta pendiente sin hash', async () => {
    expect(await codigoDeError(insertar('pendiente_activacion', null, 'd@ejemplo.com'))).toBeUndefined();
  });
});

describe('tokens_cuenta', () => {
  const insertarToken = (usuarioId: string, hash: string, minutos = 30) =>
    bd.query(
      `INSERT INTO tokens_cuenta (usuario_id, proposito, token_hash, created_at, expires_at)
       VALUES ($1, 'recuperacion', $2, now(), now() + ($3 || ' minutes')::interval)`,
      [usuarioId, hash, String(minutos)],
    );

  it('rechaza tokens huerfanos (FK 23503)', async () => {
    expect(await codigoDeError(insertarToken('00000000-0000-4000-8000-000000000000', 'h1'))).toBe('23503');
  });

  it('rechaza huella repetida (unique 23505) y vencimiento anterior a la emision (check 23514)', async () => {
    const id = await crearUsuario('t@ejemplo.com');
    await insertarToken(id, 'h-igual');
    expect(await codigoDeError(insertarToken(id, 'h-igual'))).toBe('23505');
    expect(await codigoDeError(insertarToken(id, 'h-otro', -5))).toBe('23514');
  });

  it('elimina sus tokens si se elimina el usuario (solo entornos efimeros)', async () => {
    const id = await crearUsuario('u@ejemplo.com');
    await insertarToken(id, 'h-c');
    await bd.query('DELETE FROM usuarios WHERE id = $1', [id]);
    const r = await bd.query('SELECT count(*)::int AS n FROM tokens_cuenta');
    expect(r.rows[0].n).toBe(0);
  });
});

describe('envios_correo', () => {
  const insertarEnvio = (usuarioId: string, estado = 'pendiente', tipo = 'recuperacion') =>
    bd.query(
      `INSERT INTO envios_correo (tipo, usuario_id, estado, proximo_intento_at, vence_at)
       VALUES ($1::"PropositoToken", $2, $3::"EstadoEnvio", now(), now() + interval '15 minutes')`,
      [tipo, usuarioId, estado],
    );

  it('impide apilar envios activos del mismo usuario y tipo (indice parcial 23505)', async () => {
    const id = await crearUsuario('e@ejemplo.com');
    await insertarEnvio(id, 'pendiente');
    expect(await codigoDeError(insertarEnvio(id, 'pendiente'))).toBe('23505');
    expect(await codigoDeError(insertarEnvio(id, 'enviando'))).toBe('23505');
  });

  it('permite un envio nuevo cuando el anterior termino, o de otro tipo', async () => {
    const id = await crearUsuario('f@ejemplo.com');
    await insertarEnvio(id, 'enviado');
    await insertarEnvio(id, 'fallido');
    expect(await codigoDeError(insertarEnvio(id, 'pendiente'))).toBeUndefined();
    expect(await codigoDeError(insertarEnvio(id, 'pendiente', 'activacion'))).toBeUndefined();
  });

  it('rechaza envios huerfanos (FK 23503) e intentos negativos (check 23514)', async () => {
    expect(await codigoDeError(insertarEnvio('00000000-0000-4000-8000-000000000000'))).toBe('23503');
    const id = await crearUsuario('g@ejemplo.com');
    const q = bd.query(
      `INSERT INTO envios_correo (tipo, usuario_id, intentos, proximo_intento_at, vence_at)
       VALUES ('recuperacion', $1, -1, now(), now())`,
      [id],
    );
    expect(await codigoDeError(q)).toBe('23514');
  });
});

describe('perfil: telefono y autorizacion de compartirlo', () => {
  it('las cuentas existentes quedan sin telefono ni autorizacion', async () => {
    const id = await crearUsuario('a@ejemplo.com');
    const r = await bd.query('SELECT telefono, telefono_compartir_consentido_at AS c FROM usuarios WHERE id = $1', [id]);
    expect(r.rows[0]).toEqual({ telefono: null, c: null });
  });

  it('rechaza autorizacion sin telefono (23514)', async () => {
    const id = await crearUsuario('b@ejemplo.com');
    expect(
      await codigoDeError(bd.query('UPDATE usuarios SET telefono_compartir_consentido_at = now() WHERE id = $1', [id])),
    ).toBe('23514');
  });

  it('rechaza telefonos de 6 y 16 digitos o con letras y admite 7, 15 y +', async () => {
    const id = await crearUsuario('c@ejemplo.com');
    const poner = (t: string) => bd.query('UPDATE usuarios SET telefono = $2 WHERE id = $1', [id, t]);
    for (const malo of ['123456', '1234567890123456', '98765432a', '+', '']) {
      expect(await codigoDeError(poner(malo))).toBe('23514');
    }
    for (const bueno of ['1234567', '123456789012345', '+51987654321']) {
      expect(await codigoDeError(poner(bueno))).toBeUndefined();
    }
  });
});

describe('organizacion institucional (P3.2)', () => {
  async function crearCuenta(correo: string, rol: 'ciudadano' | 'operador' | 'administrador'): Promise<string> {
    const r = await bd.query<{ id: string }>(
      `INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
       VALUES ('Cuenta', $1, 'hash', $2::"RolUsuario", 'activo', now()) RETURNING id`,
      [correo, rol],
    );
    return r.rows[0]!.id;
  }
  async function crearSede(creador: string, nombre = 'Sede', institucion = 'pnp'): Promise<string> {
    const r = await bd.query<{ id: string }>(
      `INSERT INTO sedes (institucion_id, nombre, nombre_normalizado, creado_por)
       VALUES ($1, $2, lower($2), $3) RETURNING id`,
      [institucion, nombre, creador],
    );
    return r.rows[0]!.id;
  }

  it('siembra exactamente las cuatro instituciones y las 16 categorias activas', async () => {
    const inst = await bd.query<{ id: string; tipo: string; activa: boolean }>('SELECT id, tipo, activa FROM instituciones ORDER BY id');
    expect(inst.rows).toEqual([
      { id: 'bomberos', tipo: 'bomberos', activa: true },
      { id: 'pnp', tipo: 'pnp', activa: true },
      { id: 'samu', tipo: 'samu', activa: true },
      { id: 'serenazgo', tipo: 'serenazgo', activa: true },
    ]);
    const cat = await bd.query<{ n: number; activas: number }>(
      'SELECT count(*)::int AS n, count(*) FILTER (WHERE activa)::int AS activas FROM categorias',
    );
    expect(cat.rows[0]).toEqual({ n: 16, activas: 16 });
  });

  it('rechaza instituciones de otro tipo o con id distinto del tipo (23514) y tipos repetidos (23505)', async () => {
    const q = (id: string, tipo: string) => bd.query(`INSERT INTO instituciones (id, tipo, nombre) VALUES ($1, $2, 'X')`, [id, tipo]);
    expect(await codigoDeError(q('municipalidad', 'municipalidad'))).toBe('23514');
    expect(await codigoDeError(q('otra', 'pnp'))).toBe('23514');
    expect(await codigoDeError(q('pnp', 'pnp'))).toBe('23505');
  });

  it('solo una cuenta operador puede pertenecer a una sede, y a una sola (trigger 23514, pk 23505)', async () => {
    const admin = await crearCuenta('admin@ejemplo.com', 'administrador');
    const sede = await crearSede(admin);
    const otra = await crearSede(admin, 'Otra');
    const ciudadano = await crearCuenta('ciu@ejemplo.com', 'ciudadano');
    const operador = await crearCuenta('op@ejemplo.com', 'operador');
    const pertenecer = (u: string, s: string) => bd.query('INSERT INTO pertenencias_operador (usuario_id, sede_id) VALUES ($1, $2)', [u, s]);
    expect(await codigoDeError(pertenecer(ciudadano, sede))).toBe('23514');
    expect(await codigoDeError(pertenecer(admin, sede))).toBe('23514');
    expect(await codigoDeError(pertenecer(operador, sede))).toBeUndefined();
    expect(await codigoDeError(pertenecer(operador, otra))).toBe('23505');
  });

  it('unicidad del nombre por institucion, verificacion con fuente y habilitacion solo de sedes verificadas', async () => {
    const admin = await crearCuenta('a2@ejemplo.com', 'administrador');
    const sede = await crearSede(admin, 'Comisaría');
    expect(await codigoDeError(crearSede(admin, 'Comisaría'))).toBe('23505');
    expect(await codigoDeError(crearSede(admin, 'Comisaría', 'samu'))).toBeUndefined();
    expect(await codigoDeError(bd.query(`UPDATE sedes SET verificacion = 'verificada' WHERE id = $1`, [sede]))).toBe('23514');
    expect(await codigoDeError(bd.query('UPDATE sedes SET habilitada_atencion = TRUE WHERE id = $1', [sede]))).toBe('23514');
    await bd.query(`UPDATE sedes SET verificacion = 'verificada', fuente_verificacion = 'Oficio', verificada_en = '2026-11-25' WHERE id = $1`, [sede]);
    expect(await codigoDeError(bd.query('UPDATE sedes SET habilitada_atencion = TRUE WHERE id = $1', [sede]))).toBeUndefined();
    expect(await codigoDeError(bd.query('UPDATE sedes SET activa = FALSE WHERE id = $1', [sede]))).toBe('23514');
  });

  it('coberturas y competencias solo con distritos y categorias del catalogo; no se borra una categoria ni una sede referenciadas (RESTRICT: 23001 en PG18, 23503 en PG17)', async () => {
    const admin = await crearCuenta('a3@ejemplo.com', 'administrador');
    const sede = await crearSede(admin);
    expect(await codigoDeError(bd.query(`INSERT INTO coberturas_sede VALUES ($1, 'DIS-09')`, [sede]))).toBe('23503');
    expect(await codigoDeError(bd.query(`INSERT INTO coberturas_sede VALUES ($1, 'DIS-01')`, [sede]))).toBeUndefined();
    expect(await codigoDeError(bd.query(`INSERT INTO competencias_sede VALUES ($1, 'inventada')`, [sede]))).toBe('23503');
    expect(await codigoDeError(bd.query(`INSERT INTO competencias_sede VALUES ($1, 'robo')`, [sede]))).toBeUndefined();
    // PostgreSQL 18 informa RESTRICT como 23001 (restrict_violation); 17 (CI) como 23503. Ambos rechazan el borrado.
    const RECHAZO_FK = ['23001', '23503'];
    expect(RECHAZO_FK).toContain(await codigoDeError(bd.query(`DELETE FROM categorias WHERE id = 'robo'`)));
    expect(RECHAZO_FK).toContain(await codigoDeError(bd.query('DELETE FROM sedes WHERE id = $1', [sede])));
    expect((await bd.query(`SELECT count(*)::int AS n FROM categorias WHERE id = 'robo'`)).rows[0].n).toBe(1);
    expect((await bd.query('SELECT count(*)::int AS n FROM sedes WHERE id = $1', [sede])).rows[0].n).toBe(1);
  });
});

describe('eventos y entregas (P4.1)', () => {
  beforeEach(async () => {
    await bd.query('TRUNCATE entregas_evento, eventos CASCADE');
  });
  async function crearEvento(): Promise<string> {
    const r = await bd.query<{ id: string }>(
      `INSERT INTO eventos (id, tipo, version, agregado_id, carga)
       VALUES (gen_random_uuid(), 'IncidenteRegistrado', 1, gen_random_uuid(), '{}'::jsonb) RETURNING id`,
    );
    return r.rows[0]!.id;
  }

  it('rechaza tipos, versiones y cargas no validos (23514)', async () => {
    const insertar = (tipo: string, version: number, carga: string) =>
      bd.query(
        `INSERT INTO eventos (id, tipo, version, agregado_id, carga) VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), $3::jsonb)`,
        [tipo, version, carga],
      );
    expect(await codigoDeError(insertar('incidente registrado', 1, '{}'))).toBe('23514');
    expect(await codigoDeError(insertar('IncidenteRegistrado', 0, '{}'))).toBe('23514');
    expect(await codigoDeError(insertar('IncidenteRegistrado', 1, '[]'))).toBe('23514');
    expect(await codigoDeError(insertar('IncidenteRegistrado', 1, JSON.stringify({ x: 'a'.repeat(3000) })))).toBe('23514');
  });

  it('rechaza un estado de entrega fuera de la lista y bloqueos o fechas incoherentes (23514)', async () => {
    const evento = await crearEvento();
    expect(
      await codigoDeError(bd.query(`INSERT INTO entregas_evento (evento_id, consumidor, estado) VALUES ($1, 'prueba', 'perdida')`, [evento])),
    ).toBe('23514');
    expect(
      await codigoDeError(bd.query(`INSERT INTO entregas_evento (evento_id, consumidor, estado) VALUES ($1, 'prueba', 'en_proceso')`, [evento])),
    ).toBe('23514');
    expect(
      await codigoDeError(bd.query(`INSERT INTO entregas_evento (evento_id, consumidor, estado) VALUES ($1, 'prueba', 'procesada')`, [evento])),
    ).toBe('23514');
    expect(
      await codigoDeError(bd.query(`INSERT INTO entregas_evento (evento_id, consumidor) VALUES ($1, 'Con Espacios')`, [evento])),
    ).toBe('23514');
  });

  it('impide duplicar la entrega de un mismo evento y consumidor (23505) y entregas huerfanas (23503)', async () => {
    const evento = await crearEvento();
    await bd.query(`INSERT INTO entregas_evento (evento_id, consumidor) VALUES ($1, 'prueba')`, [evento]);
    expect(
      await codigoDeError(bd.query(`INSERT INTO entregas_evento (evento_id, consumidor) VALUES ($1, 'prueba')`, [evento])),
    ).toBe('23505');
    await bd.query(`INSERT INTO entregas_evento (evento_id, consumidor) VALUES ($1, 'otro')`, [evento]);
    expect(
      await codigoDeError(bd.query(`INSERT INTO entregas_evento (evento_id, consumidor) VALUES (gen_random_uuid(), 'prueba')`)),
    ).toBe('23503');
  });
});

describe('incidentes (P4.1)', () => {
  beforeEach(async () => {
    await bd.query('TRUNCATE incidentes CASCADE');
  });

  it('nace en REGISTRADO con instante del servidor y admite solo los cuatro estados (23514)', async () => {
    const r = await bd.query<{ estado: string; registrado_en: Date }>(
      `INSERT INTO incidentes (referencia) VALUES ('INC-7K3M9-Q2TXA') RETURNING estado, registrado_en`,
    );
    expect(r.rows[0]!.estado).toBe('REGISTRADO');
    expect(Math.abs(r.rows[0]!.registrado_en.getTime() - Date.now())).toBeLessThan(60_000);
    for (const estado of ['ASIGNADO', 'PENDIENTE_ATENCION', 'registrado', 'RESUELTO']) {
      expect(
        await codigoDeError(bd.query(`INSERT INTO incidentes (referencia, estado) VALUES ('INC-7K3M9-Q2TXB', $1)`, [estado])),
      ).toBe('23514');
    }
    for (const estado of ['EN_REVISION', 'EN_ATENCION', 'CERRADO']) {
      await bd.query(`UPDATE incidentes SET estado = $1`, [estado]);
    }
  });

  it('rechaza referencias fuera de formato (23514) y repetidas (23505)', async () => {
    for (const ref of ['INC-00001', 'INC-7K3M9-Q2TXU', 'inc-7k3m9-q2txa', '7K3M9-Q2TXA']) {
      expect(await codigoDeError(bd.query(`INSERT INTO incidentes (referencia) VALUES ($1)`, [ref]))).toBe('23514');
    }
    await bd.query(`INSERT INTO incidentes (referencia) VALUES ('INC-7K3M9-Q2TXA')`);
    expect(await codigoDeError(bd.query(`INSERT INTO incidentes (referencia) VALUES ('INC-7K3M9-Q2TXA')`))).toBe('23505');
  });
});
