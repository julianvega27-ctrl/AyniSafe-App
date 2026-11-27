import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { CLAVE, crearArnes, limpiarBd, RUTA_LOGIN, RUTA_REGISTRO } from './arnes';

/** P5.1, tarea 4.1: version 1 de la evaluacion en la transaccion del registro. */
const { app, prisma } = crearArnes();
const RUTA = '/api/v1/incidentes';

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

function cuerpo(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    categoriaId: 'robo',
    descripcion: 'Descripcion del hecho para la prueba',
    ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
    punto: { latitud: 1, longitud: 1, origen: 'manual' },
    ...extra,
  };
}

async function ciudadano(): Promise<{ id: string; token: string }> {
  const correo = `c-${randomUUID().slice(0, 8)}@ejemplo.com`;
  const alta = await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
  const login = await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE });
  return { id: alta.body.usuario.id as string, token: login.body.token as string };
}

const enviar = (datos: unknown, token: string, clave: string = randomUUID()) =>
  request(app).post(RUTA).set('Idempotency-Key', clave).set('Authorization', `Bearer ${token}`).send(datos as object);

async function evaluacionDe(referencia: string) {
  const inc = await prisma.incidente.findUniqueOrThrow({ where: { referencia } });
  const [cabecera, versiones] = await Promise.all([
    prisma.evaluacionIncidente.findUnique({ where: { incidenteId: inc.id } }),
    prisma.versionEvaluacion.findMany({ where: { incidenteId: inc.id }, orderBy: { version: 'asc' } }),
  ]);
  return { cabecera, versiones };
}

describe('version 1 al registrar', () => {
  it('agresion con heridos si sin evaluacion: version 1 con cantidad desconocida y observaciones sin respuesta', async () => {
    const c = await ciudadano();
    const r = await enviar(cuerpo({ categoriaId: 'agresion', heridos: 'si' }), c.token);
    expect(r.status).toBe(201);
    const { cabecera, versiones } = await evaluacionDe(r.body.referencia);
    expect(cabecera).toMatchObject({
      versionVigente: 1,
      heridos: 'si',
      cantidadHeridos: null,
      signosVida: null,
      consciente: null,
      sangrado: null,
      samuRequerido: true,
    });
    expect(versiones).toHaveLength(1);
    expect(versiones[0]).toMatchObject({ version: 1, origen: 'ciudadano', actorUsuarioId: c.id, institucion: null, motivo: null, camposModificados: [] });
  });

  it('emergencia medica con heridos no y observaciones del paciente', async () => {
    const c = await ciudadano();
    const r = await enviar(
      cuerpo({ categoriaId: 'emergencia-medica', heridos: 'no', evaluacion: { personaPrincipal: { signosVida: 'observados', consciente: 'no' } } }),
      c.token,
    );
    expect(r.status).toBe(201);
    const { cabecera } = await evaluacionDe(r.body.referencia);
    expect(cabecera).toMatchObject({ heridos: 'no', cantidadHeridos: null, signosVida: 'observados', consciente: 'no', sangrado: null, samuRequerido: true });
  });

  it('pelea con cantidad conocida', async () => {
    const c = await ciudadano();
    const r = await enviar(cuerpo({ categoriaId: 'pelea', heridos: 'si', evaluacion: { cantidadHeridos: 4 } }), c.token);
    expect((await evaluacionDe(r.body.referencia)).cabecera?.cantidadHeridos).toBe(4);
  });

  it('un robo no tiene evaluacion', async () => {
    const c = await ciudadano();
    const r = await enviar(cuerpo(), c.token);
    expect(r.status).toBe(201);
    expect(await evaluacionDe(r.body.referencia)).toEqual({ cabecera: null, versiones: [] });
  });

  it('el comprobante no contiene datos de la evaluacion', async () => {
    const c = await ciudadano();
    const r = await enviar(
      cuerpo({ categoriaId: 'emergencia-medica', heridos: 'si', evaluacion: { cantidadHeridos: 2, personaPrincipal: { sangrado: 'si' } } }),
      c.token,
    );
    expect(Object.keys(r.body).sort()).toEqual(['estado', 'modalidad', 'recibidoEn', 'referencia', 'territorio']);
    expect(JSON.stringify(r.body)).not.toMatch(/heridos|sangrado|cantidad/i);
  });

  it('evaluacion no aplicable o incoherente responde 400 sin crear nada', async () => {
    const c = await ciudadano();
    const a = await enviar(cuerpo({ categoriaId: 'accidente-transito', heridos: 'no', atencionMedica: 'no', evaluacion: { personaPrincipal: { consciente: 'si' } } }), c.token);
    const b = await enviar(cuerpo({ categoriaId: 'pelea', heridos: 'no', evaluacion: { cantidadHeridos: 2 } }), c.token);
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(await prisma.incidente.count()).toBe(0);
  });
});

describe('idempotencia con evaluacion', () => {
  it('misma clave con otra evaluacion responde 409 sin otra version ni otro incidente', async () => {
    const c = await ciudadano();
    const clave = randomUUID();
    const base = { categoriaId: 'pelea', heridos: 'si' };
    expect((await enviar(cuerpo({ ...base, evaluacion: { personaPrincipal: { consciente: 'si' } } }), c.token, clave)).status).toBe(201);
    const r = await enviar(cuerpo({ ...base, evaluacion: { personaPrincipal: { consciente: 'no' } } }), c.token, clave);
    expect(r.status).toBe(409);
    expect(await prisma.incidente.count()).toBe(1);
    expect(await prisma.versionEvaluacion.count()).toBe(1);
  });

  it('repetir un envio sin evaluacion devuelve el mismo comprobante (200)', async () => {
    const c = await ciudadano();
    const clave = randomUUID();
    const datos = cuerpo({ categoriaId: 'accidente-transito', heridos: 'no_se' });
    const a = await enviar(datos, c.token, clave);
    const b = await enviar(datos, c.token, clave);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.referencia).toBe(a.body.referencia);
    expect(await prisma.versionEvaluacion.count()).toBe(1);
  });
});

describe('fallo al escribir la version 1', () => {
  afterAll(async () => {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS falla_version_prueba ON versiones_evaluacion');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS falla_version_prueba()');
  });

  it('no registra el incidente ni consume la clave y responde 503; el reintento posterior funciona', async () => {
    const c = await ciudadano();
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION falla_version_prueba() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo inyectado'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER falla_version_prueba BEFORE INSERT ON versiones_evaluacion FOR EACH ROW EXECUTE FUNCTION falla_version_prueba()',
    );
    const clave = randomUUID();
    const datos = cuerpo({ categoriaId: 'pelea', heridos: 'si' });
    const r = await enviar(datos, c.token, clave);
    expect(r.status).toBe(503);
    expect(await prisma.incidente.count()).toBe(0);
    expect(await prisma.solicitudEnvio.count()).toBe(0);
    expect(await prisma.evaluacionIncidente.count()).toBe(0);
    expect(await prisma.evento.count()).toBe(0);

    await prisma.$executeRawUnsafe('DROP TRIGGER falla_version_prueba ON versiones_evaluacion');
    const reintento = await enviar(datos, c.token, clave);
    expect(reintento.status).toBe(201);
    expect(await prisma.versionEvaluacion.count()).toBe(1);
  });
});
