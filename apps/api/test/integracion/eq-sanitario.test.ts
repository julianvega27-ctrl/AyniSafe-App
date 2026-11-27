import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { CLAVE, crearArnes, crearCuentaDePrueba, limpiarBd, ORIGEN_WEB_PRUEBA, RUTA_LOGIN, RUTA_REGISTRO } from './arnes';
import { activarTerritorio, cookieInstitucional, crearSedeDePrueba, PUNTO_DIS01 } from './fixtures-enrutamiento';

/**
 * P5.1, tarea 6.4: EQ-04 (parte sanitaria) y EQ-13. Un incidente con varios heridos y observaciones
 * parciales de una persona principal; se intenta leer o modificar la evaluacion sin autorizacion y se
 * revisan las vistas que no deben contener datos sanitarios. Los valores marcados son centinelas.
 */
const { app, prisma, procesador, logger } = crearArnes({ enrutar: true });
const MOTIVO = 'CENTINELA-MOTIVO confirmado en el lugar';
// P6: el historial operativo trae la clave "motivo" (nula o de atencion); se detecta un motivo con valor.
const SANITARIO = /CENTINELA|signosVida|consciente|sangrado|no_observados|"motivo":"/;

let caso: {
  id: string;
  referencia: string;
  codigo: string;
  cookiePnp: string;
  cookieSamuFuera: string;
  cookieAdmin: string;
  tokenOtro: string;
};

beforeAll(async () => {
  await limpiarBd(prisma);
  await activarTerritorio(prisma);
  const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['pelea'] });
  const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['pelea'] });
  const samuFuera = await crearSedeDePrueba(prisma, { institucion: 'samu', distritos: ['DIS-02'], categorias: ['pelea'] });
  const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
  const tokenDe = async () => {
    const correo = `c-${randomUUID().slice(0, 8)}@ejemplo.com`;
    await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
    return (await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE })).body.token as string;
  };
  // Invitado: varios heridos con cantidad desconocida y observaciones parciales (EQ-13).
  const r = await request(app)
    .post('/api/v1/incidentes')
    .set('Idempotency-Key', randomUUID())
    .send({
      categoriaId: 'pelea',
      descripcion: 'Pelea con varios heridos frente al mercado',
      ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
      punto: PUNTO_DIS01,
      telefonoContacto: '987654321',
      heridos: 'si',
      evaluacion: { personaPrincipal: { signosVida: 'no_observados', consciente: 'no_se' } },
    });
  expect(r.status).toBe(201);
  await procesador.esperarReposo();
  await procesador.procesarPendientes();
  const inc = await prisma.incidente.findUniqueOrThrow({ where: { referencia: r.body.referencia } });
  const cookieSamu = await cookieInstitucional(app, samu.operadores[0]!.correo);
  const aclaracion = await request(app)
    .post(`/api/v1/operador/incidentes/${inc.id}/evaluacion`)
    .set('Cookie', cookieSamu)
    .set('Origin', ORIGEN_WEB_PRUEBA)
    .send({ personaPrincipal: { sangrado: 'si' }, motivo: MOTIVO });
  expect(aclaracion.status).toBe(200);
  caso = {
    id: inc.id,
    referencia: inc.referencia,
    codigo: r.body.codigoSeguimiento as string,
    cookiePnp: await cookieInstitucional(app, pnp.operadores[0]!.correo),
    cookieSamuFuera: await cookieInstitucional(app, samuFuera.operadores[0]!.correo),
    cookieAdmin: await cookieInstitucional(app, admin.correo),
    tokenOtro: await tokenDe(),
  };
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('EQ-13: registro con desconocidos y cantidad independiente', () => {
  it('la evaluacion conserva la cantidad desconocida y las observaciones parciales de una sola persona', async () => {
    const v = await prisma.evaluacionIncidente.findUniqueOrThrow({ where: { incidenteId: caso.id } });
    expect(v).toMatchObject({ heridos: 'si', cantidadHeridos: null, signosVida: 'no_observados', consciente: 'no_se', sangrado: 'si', versionVigente: 2 });
  });
});

describe('EQ-04 (parte sanitaria): intentos no autorizados', () => {
  const intentos: { nombre: string; esperado: number; ejecutar: () => Promise<request.Response> }[] = [];
  const leer = (cookie?: string, token?: string) => {
    let r = request(app).get(`/api/v1/operador/incidentes/${caso.id}/evaluacion`);
    if (cookie) r = r.set('Cookie', cookie);
    if (token) r = r.set('Authorization', `Bearer ${token}`);
    return r;
  };
  intentos.push(
    { nombre: 'PNP participante lee el detalle', esperado: 404, ejecutar: () => leer(caso.cookiePnp) },
    { nombre: 'SAMU sin participacion lee el detalle', esperado: 404, ejecutar: () => leer(caso.cookieSamuFuera) },
    { nombre: 'administrador lee el detalle', esperado: 403, ejecutar: () => leer(caso.cookieAdmin) },
    { nombre: 'ciudadano lee el detalle', esperado: 403, ejecutar: () => leer(undefined, caso.tokenOtro) },
    { nombre: 'sin sesion lee el detalle', esperado: 401, ejecutar: () => leer() },
    {
      nombre: 'PNP envia observaciones',
      esperado: 400,
      ejecutar: () =>
        request(app).post(`/api/v1/operador/incidentes/${caso.id}/evaluacion`).set('Cookie', caso.cookiePnp).set('Origin', ORIGEN_WEB_PRUEBA)
          .send({ personaPrincipal: { consciente: 'si' }, motivo: 'Intento de cambio no autorizado' }),
    },
    {
      nombre: 'SAMU sin participacion aclara',
      esperado: 404,
      ejecutar: () =>
        request(app).post(`/api/v1/operador/incidentes/${caso.id}/evaluacion`).set('Cookie', caso.cookieSamuFuera).set('Origin', ORIGEN_WEB_PRUEBA)
          .send({ personaPrincipal: { consciente: 'si' }, motivo: 'Intento de cambio no autorizado' }),
    },
    {
      nombre: 'administrador aclara',
      esperado: 403,
      ejecutar: () =>
        request(app).post(`/api/v1/operador/incidentes/${caso.id}/evaluacion`).set('Cookie', caso.cookieAdmin).set('Origin', ORIGEN_WEB_PRUEBA)
          .send({ heridos: 'no', motivo: 'Intento de cambio no autorizado' }),
    },
    {
      nombre: 'otro ciudadano aclara (incidente de invitado)',
      esperado: 404,
      ejecutar: () => request(app).post(`/api/v1/ciudadano/incidentes/${caso.referencia}/evaluacion`).set('Authorization', `Bearer ${caso.tokenOtro}`).send({ heridos: 'no' }),
    },
    {
      nombre: 'invitado con codigo intenta aclarar sin cuenta',
      esperado: 401,
      ejecutar: () => request(app).post(`/api/v1/ciudadano/incidentes/${caso.referencia}/evaluacion`).send({ heridos: 'no', codigo: caso.codigo }),
    },
  );

  it('rechaza el 100 % de los intentos sin modificar la evaluacion ni registrar accesos', async () => {
    const resultados: { nombre: string; estado: number; rechazado: boolean }[] = [];
    for (const i of intentos) {
      const r = await i.ejecutar();
      resultados.push({ nombre: i.nombre, estado: r.status, rechazado: r.status === i.esperado });
      expect(JSON.stringify(r.body)).not.toMatch(SANITARIO);
    }
    expect(resultados.filter((r) => !r.rechazado)).toEqual([]);
    expect(await prisma.versionEvaluacion.count({ where: { incidenteId: caso.id } })).toBe(2);
    expect(await prisma.accesoEvaluacion.count()).toBe(0);
    // Resumen para la evidencia: nombre, estado y rechazo, sin datos sensibles.
    console.info(`EQ-04 sanitario: ${resultados.length}/${intentos.length} rechazados`, JSON.stringify(resultados));
  });
});

describe('EQ-04/EQ-13: exclusiones de datos sanitarios', () => {
  it('bandeja, resumen PNP, invitado, pendientes del administrador, eventos y logs no contienen observaciones ni motivos', async () => {
    const vistas = [
      await request(app).get('/api/v1/operador/incidentes').set('Cookie', caso.cookiePnp),
      await request(app).get(`/api/v1/operador/incidentes/${caso.id}`).set('Cookie', caso.cookiePnp),
      await request(app).post('/api/v1/publico/seguimiento').send({ referencia: caso.referencia, codigo: caso.codigo }),
      await request(app).get('/api/v1/admin/enrutamientos-pendientes').set('Cookie', caso.cookieAdmin),
    ];
    for (const v of vistas) {
      expect(v.status).toBe(200);
      expect(JSON.stringify(v.body)).not.toMatch(SANITARIO);
    }
    const eventos = await prisma.evento.findMany({ where: { agregadoId: caso.id } });
    expect(eventos.length).toBeGreaterThan(0);
    expect(JSON.stringify(eventos.map((e) => e.carga))).not.toMatch(SANITARIO);
    const cambios = await prisma.cambioEnrutamiento.findMany({ where: { incidenteId: caso.id } });
    expect(JSON.stringify(cambios)).not.toMatch(SANITARIO);
    expect(logger.texto()).not.toMatch(SANITARIO);
  });
});
