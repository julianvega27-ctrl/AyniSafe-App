import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { PrismaTerritorioAdapter } from '../../src/modules/consultas/infraestructura/prisma-territorio.adapter';
import { paqueteSintetico } from '../fixtures/territorio';
import {
  CLAVE,
  cookieDe,
  crearArnes,
  crearCuentaDePrueba,
  limpiarBd,
  ORIGEN_WEB_PRUEBA,
  RUTA_INST_SESIONES,
  RUTA_LOGIN,
  RUTA_REGISTRO,
  SECRETO_SEGUIMIENTO_PRUEBA,
} from './arnes';
import { HmacSecretosAdapter } from '../../src/modules/reportes/infraestructura/hmac-secretos.adapter';
import { normalizarCodigo } from '../../src/modules/reportes/dominio/envio';

const base = crearArnes();
const { app, prisma, logger } = base;
const RUTA = '/api/v1/incidentes';
const territorio = new PrismaTerritorioAdapter(prisma);
const secretos = new HmacSecretosAdapter(SECRETO_SEGUIMIENTO_PRUEBA);

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

/** Paquete sintetico: DIS-01 es el cuadrado lon 0..2, lat 0..2; DIS-02, lon 4..6. */
const INTERIOR = { latitud: 1, longitud: 1, origen: 'gps', precisionM: 8 };
const FRONTERA = { latitud: 1, longitud: 0, origen: 'manual' };
const FUERA = { latitud: 1, longitud: 3, origen: 'manual' };

function cuerpo(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    categoriaId: 'robo',
    descripcion: 'Me arrebataron el celular en la esquina',
    ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
    punto: INTERIOR,
    ...extra,
  };
}
const deInvitado = (extra: Record<string, unknown> = {}) => cuerpo({ telefonoContacto: '987654321', ...extra });

async function ciudadano(correo = `c-${randomUUID().slice(0, 8)}@ejemplo.com`): Promise<{ id: string; token: string }> {
  const alta = await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
  const login = await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE });
  return { id: alta.body.usuario.id as string, token: login.body.token as string };
}

const enviar = (datos: unknown, opciones: { token?: string; clave?: string | null; cookie?: string } = {}) => {
  let r = request(app).post(RUTA).set('Content-Type', 'application/json');
  if (opciones.clave !== null) r = r.set('Idempotency-Key', opciones.clave ?? randomUUID());
  if (opciones.token) r = r.set('Authorization', `Bearer ${opciones.token}`);
  if (opciones.cookie) r = r.set('Cookie', opciones.cookie);
  return r.send(JSON.stringify(datos));
};

async function activarTerritorio(): Promise<string> {
  const p = paqueteSintetico();
  await territorio.importar(p.preparado, true);
  return p.preparado.snapshot.version;
}

async function conteos() {
  const [i, e, s, ev] = await Promise.all([
    prisma.incidente.count(),
    prisma.envioIncidente.count(),
    prisma.solicitudEnvio.count(),
    prisma.evento.count(),
  ]);
  return { incidentes: i, envios: e, solicitudes: s, eventos: ev };
}

describe('registro con cuenta e invitado', () => {
  it('con cuenta crea incidente, originales, clave y evento; el autor sale de la sesion', async () => {
    const version = await activarTerritorio();
    const c = await ciudadano();
    const r = await enviar(cuerpo(), { token: c.token });
    expect(r.status).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toEqual({
      referencia: expect.stringMatching(/^INC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/),
      estado: 'REGISTRADO',
      recibidoEn: expect.any(String),
      modalidad: 'cuenta',
      territorio: { estado: 'resuelto', distrito: { id: 'DIS-01', nombre: 'Ayacucho' } },
    });
    expect(await conteos()).toEqual({ incidentes: 1, envios: 1, solicitudes: 1, eventos: 1 });
    const envio = await prisma.envioIncidente.findFirstOrThrow();
    expect(envio).toMatchObject({
      modalidad: 'cuenta',
      autorUsuarioId: c.id,
      telefonoContacto: null,
      codigoHuella: null,
      distritoId: 'DIS-01',
      estadoTerritorial: 'resuelto',
      versionTerritorial: version,
      origenPunto: 'gps',
      precisionM: 8,
    });
    const evento = await prisma.evento.findFirstOrThrow();
    expect(evento.tipo).toBe('IncidenteRegistrado');
    expect(evento.carga).toEqual({ incidenteId: envio.incidenteId, modalidad: 'cuenta' });
  });

  it('como invitado guarda telefono y solo la huella del codigo, que no aparece en evento ni logs', async () => {
    await activarTerritorio();
    const r = await enviar(deInvitado({ telefonoContacto: '987 654 321' }));
    expect(r.status).toBe(201);
    expect(r.body.modalidad).toBe('invitado');
    const codigo = r.body.codigoSeguimiento as string;
    expect(codigo).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    const envio = await prisma.envioIncidente.findFirstOrThrow();
    expect(envio.autorUsuarioId).toBeNull();
    expect(envio.telefonoContacto).toBe('987654321');
    expect(envio.codigoHuella).toBe(secretos.huellaCodigo(envio.incidenteId, normalizarCodigo(codigo)!));
    const filas = JSON.stringify(await prisma.$queryRawUnsafe('SELECT * FROM envios_incidente'));
    expect(filas).not.toContain(codigo);
    expect(filas).not.toContain(normalizarCodigo(codigo)!);
    const evento = JSON.stringify(await prisma.evento.findFirstOrThrow());
    expect(evento).not.toContain('987654321');
    expect(evento).not.toContain(normalizarCodigo(codigo)!);
    expect(JSON.stringify(r.body)).not.toContain('987654321');
    expect(logger.texto()).not.toContain('987654321');
    expect(logger.texto()).not.toContain(codigo);
  });

  it('el cuerpo no puede imponer autor, estado, prioridad ni distrito', async () => {
    const c = await ciudadano();
    for (const extra of [{ autorId: randomUUID() }, { estado: 'CERRADO' }, { prioridad: 'Urgente' }, { distritoId: 'DIS-02' }]) {
      const r = await enviar(cuerpo(extra), { token: c.token });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await conteos()).incidentes).toBe(0);
  });
});

describe('clasificacion territorial al registrar', () => {
  it.each([
    ['frontera', FRONTERA, 'frontera'],
    ['fuera del area', FUERA, 'fuera_area'],
  ])('punto en %s queda pendiente con motivo y version', async (_n, punto, motivo) => {
    const version = await activarTerritorio();
    const r = await enviar(deInvitado({ punto }));
    expect(r.status).toBe(201);
    expect(r.body.territorio).toEqual({ estado: 'pendiente', motivo });
    expect(await prisma.envioIncidente.findFirstOrThrow()).toMatchObject({
      distritoId: null,
      estadoTerritorial: 'pendiente',
      motivoTerritorial: motivo,
      versionTerritorial: version,
      latitud: punto.latitud,
      longitud: punto.longitud,
    });
  });

  it('sin cartografia activa se registra igual con sin_cartografia y conserva el punto', async () => {
    const r = await enviar(deInvitado());
    expect(r.status).toBe(201);
    expect(r.body.territorio).toEqual({ estado: 'pendiente', motivo: 'sin_cartografia' });
    expect(await prisma.envioIncidente.findFirstOrThrow()).toMatchObject({
      estadoTerritorial: 'pendiente',
      motivoTerritorial: 'sin_cartografia',
      versionTerritorial: null,
      latitud: 1,
      longitud: 1,
    });
  });

  it('sin punto no se crea incidente', async () => {
    const r = await enviar(deInvitado({ punto: undefined }));
    expect(r.status).toBe(400);
    expect(r.body.error.fields).toHaveProperty('punto');
    expect(await conteos()).toEqual({ incidentes: 0, envios: 0, solicitudes: 0, eventos: 0 });
  });
});

describe('atomicidad del registro (fallo inyectado)', () => {
  it.each([
    ['envios_incidente', 'fallo_envio_p4'],
    ['eventos', 'fallo_evento_p4'],
  ])('un fallo al escribir en %s no deja filas en ninguna tabla', async (tabla, nombre) => {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${nombre}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo de prueba'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${nombre} BEFORE INSERT ON ${tabla} FOR EACH ROW EXECUTE FUNCTION ${nombre}()`);
    try {
      const r = await enviar(deInvitado());
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(await conteos()).toEqual({ incidentes: 0, envios: 0, solicitudes: 0, eventos: 0 });
      expect(await prisma.entregaEvento.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER ${nombre} ON ${tabla}`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION ${nombre}()`);
    }
    // Tras retirar el fallo, el mismo envio se registra.
    expect((await enviar(deInvitado())).status).toBe(201);
  });
});

describe('idempotencia', () => {
  it('la repeticion devuelve 200 con el mismo incidente y un codigo nuevo; el anterior deja de verificar', async () => {
    const clave = randomUUID();
    const datos = deInvitado();
    const a = await enviar(datos, { clave });
    const b = await enviar(datos, { clave });
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.body.referencia).toBe(a.body.referencia);
    expect(b.body.codigoSeguimiento).not.toBe(a.body.codigoSeguimiento);
    expect(await conteos()).toEqual({ incidentes: 1, envios: 1, solicitudes: 1, eventos: 1 });
    const envio = await prisma.envioIncidente.findFirstOrThrow();
    expect(envio.codigoHuella).toBe(secretos.huellaCodigo(envio.incidenteId, normalizarCodigo(b.body.codigoSeguimiento)!));
    expect(envio.codigoHuella).not.toBe(secretos.huellaCodigo(envio.incidenteId, normalizarCodigo(a.body.codigoSeguimiento)!));
  });

  it('la misma clave con otro contenido responde 409 sin modificar nada', async () => {
    const c = await ciudadano();
    const clave = randomUUID();
    expect((await enviar(cuerpo(), { token: c.token, clave })).status).toBe(201);
    const r = await enviar(cuerpo({ descripcion: 'Otro contenido distinto' }), { token: c.token, clave });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect((await prisma.envioIncidente.findFirstOrThrow()).descripcion).toBe('Me arrebataron el celular en la esquina');
    expect((await conteos()).incidentes).toBe(1);
  });

  it('10 envios simultaneos con la misma clave crean un unico incidente', async () => {
    const c = await ciudadano();
    const clave = randomUUID();
    const datos = cuerpo();
    const respuestas = await Promise.all(Array.from({ length: 10 }, () => enviar(datos, { token: c.token, clave })));
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 201]);
    expect(new Set(respuestas.map((r) => r.body.referencia)).size).toBe(1);
    expect(await conteos()).toEqual({ incidentes: 1, envios: 1, solicitudes: 1, eventos: 1 });
  });

  it('la misma clave en dos cuentas crea dos incidentes independientes', async () => {
    const [a, b] = [await ciudadano(), await ciudadano()];
    const clave = randomUUID();
    const ra = await enviar(cuerpo(), { token: a.token, clave });
    const rb = await enviar(cuerpo(), { token: b.token, clave });
    expect([ra.status, rb.status]).toEqual([201, 201]);
    expect(ra.body.referencia).not.toBe(rb.body.referencia);
  });

  it('sin clave o con clave invalida responde 400 sin crear nada', async () => {
    for (const clave of [null, 'no-es-uuid']) {
      const r = await enviar(deInvitado(), { clave });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    }
    expect((await conteos()).incidentes).toBe(0);
  });
});

describe('modalidad y autenticacion', () => {
  it('un token invalido o revocado responde 401 sin degradar a invitado', async () => {
    for (const token of ['token-desconocido', 'a b']) {
      const r = await enviar(deInvitado(), { token });
      expect(r.status).toBe(401);
    }
    const r = await request(app).post(RUTA).set('Content-Type', 'application/json').set('Idempotency-Key', randomUUID())
      .set('Authorization', 'Basic abc').send(JSON.stringify(deInvitado()));
    expect(r.status).toBe(401);
    expect((await conteos()).incidentes).toBe(0);
  });

  it('una cuenta con telefono en el cuerpo recibe 400 y un invitado sin telefono tambien', async () => {
    const c = await ciudadano();
    expect((await enviar(deInvitado(), { token: c.token })).body.error.fields).toHaveProperty('telefonoContacto');
    expect((await enviar(cuerpo())).body.error.fields).toHaveProperty('telefonoContacto');
  });

  it('una sesion institucional (operador o administrador) no registra incidentes', async () => {
    for (const rol of ['operador', 'administrador'] as const) {
      const cuenta = await crearCuentaDePrueba(prisma, { rol });
      const login = await request(app).post(RUTA_INST_SESIONES).set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: cuenta.correo, contrasena: CLAVE });
      const cookie = `__Host-ayni_inst=${cookieDe(login) as string}`;
      const r = await enviar(deInvitado(), { cookie });
      expect(r.status).toBe(403);
    }
    expect((await conteos()).incidentes).toBe(0);
  });
});

describe('limite de envios de invitado', () => {
  it('el envio 11 en la ventana responde 429 con Retry-After; una repeticion sigue respondiendo 200', async () => {
    const limitado = crearArnes({ prisma, limiteInvitado: { maximo: 10, ventanaMs: 60 * 60 * 1000 } });
    const datos = deInvitado();
    const enviarA = (clave: string) =>
      request(limitado.app).post(RUTA).set('Content-Type', 'application/json').set('Idempotency-Key', clave).send(JSON.stringify(datos));
    const primera = randomUUID();
    expect((await enviarA(primera)).status).toBe(201);
    for (let i = 0; i < 9; i++) expect((await enviarA(randomUUID())).status).toBe(201);
    const r = await enviarA(randomUUID());
    expect(r.status).toBe(429);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect((await conteos()).incidentes).toBe(10);
    expect((await enviarA(primera)).status).toBe(200);
  });
});

describe('contrato HTTP', () => {
  it('solo admite POST con JSON', async () => {
    const g = await request(app).get(RUTA);
    expect(g.status).toBe(405);
    expect(g.headers.allow).toBe('POST');
    const t = await request(app).post(RUTA).set('Idempotency-Key', randomUUID()).set('Content-Type', 'text/plain').send('x');
    expect(t.status).toBe(415);
    const roto = await request(app).post(RUTA).set('Idempotency-Key', randomUUID()).set('Content-Type', 'application/json').send('{');
    expect(roto.status).toBe(400);
  });
});
