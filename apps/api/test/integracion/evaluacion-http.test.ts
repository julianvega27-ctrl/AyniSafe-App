import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { CLAVE, crearArnes, crearCuentaDePrueba, limpiarBd, ORIGEN_WEB_PRUEBA, RUTA_LOGIN, RUTA_REGISTRO } from './arnes';
import { activarTerritorio, cookieInstitucional, crearSedeDePrueba, PUNTO_DIS01, registrarIncidente } from './fixtures-enrutamiento';

/** P5.1, tareas 4.3 y 5.4: rutas de aclaracion del autor y del operador. */
const { app, prisma, logger, procesador } = crearArnes({ enrutar: true });

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
  await activarTerritorio(prisma);
  logger.eventos.length = 0;
});

async function enrutarTodo(): Promise<void> {
  await procesador.esperarReposo();
  await procesador.procesarPendientes();
}

async function ciudadano(): Promise<{ id: string; token: string }> {
  const correo = `c-${randomUUID().slice(0, 8)}@ejemplo.com`;
  const alta = await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
  const login = await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE });
  return { id: alta.body.usuario.id as string, token: login.body.token as string };
}

async function reporteDe(token: string, extra: Record<string, unknown>): Promise<{ id: string; referencia: string }> {
  const r = await request(app)
    .post('/api/v1/incidentes')
    .set('Idempotency-Key', randomUUID())
    .set('Authorization', `Bearer ${token}`)
    .send({
      categoriaId: 'accidente-transito',
      descripcion: 'Choque en la avenida principal',
      ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
      punto: PUNTO_DIS01,
      ...extra,
    });
  expect(r.status).toBe(201);
  const inc = await prisma.incidente.findUniqueOrThrow({ where: { referencia: r.body.referencia } });
  return { id: inc.id, referencia: inc.referencia };
}

const rutaCiudadano = (ref: string) => `/api/v1/ciudadano/incidentes/${ref}/evaluacion`;
const aclararCiudadano = (ref: string, token: string | null, cuerpo: unknown) => {
  let r = request(app).post(rutaCiudadano(ref));
  if (token) r = r.set('Authorization', `Bearer ${token}`);
  return r.send(cuerpo as object);
};

describe('POST /ciudadano/incidentes/{referencia}/evaluacion (4.3)', () => {
  it('el autor completa la evaluacion y recibe sus respuestas vigentes', async () => {
    const c = await ciudadano();
    const inc = await reporteDe(c.token, { heridos: 'no_se' });
    const r = await aclararCiudadano(inc.referencia.toLowerCase(), c.token, { heridos: 'si', cantidadHeridos: 2 });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.evaluacion).toMatchObject({
      version: 2,
      respuestas: { heridos: 'si', cantidadHeridos: 2, atencionMedica: null, personaPrincipal: { signosVida: null, consciente: null, sangrado: null } },
      puedeAclarar: true,
      solicitudCompletar: true,
    });
    expect(Object.keys(r.body.evaluacion).sort()).toEqual(['informadaEn', 'puedeAclarar', 'respuestas', 'solicitudCompletar', 'version']);
  });

  it('404 uniforme para incidente ajeno, de invitado, inexistente, malformado o sin evaluacion', async () => {
    const c = await ciudadano();
    const otro = await ciudadano();
    const ajeno = await reporteDe(otro.token, { heridos: 'no_se' });
    const robo = await reporteDe(c.token, { categoriaId: 'robo' });
    const invitado = await registrarIncidente(app, prisma, { categoriaId: 'pelea', heridos: 'si' });
    const cuerpos: string[] = [];
    for (const ref of [ajeno.referencia, robo.referencia, invitado.referencia, 'INC-00000-00000', 'no-es-referencia']) {
      const r = await aclararCiudadano(ref, c.token, { heridos: 'si' });
      expect(r.status).toBe(404);
      cuerpos.push(JSON.stringify({ ...r.body.error, requestId: undefined }));
    }
    expect(new Set(cuerpos).size).toBe(1);
    expect(await prisma.versionEvaluacion.count({ where: { version: { gt: 1 } } })).toBe(0);
  });

  it('incidente cerrado responde 409 sin crear version', async () => {
    const c = await ciudadano();
    const inc = await reporteDe(c.token, { heridos: 'no_se' });
    await prisma.incidente.update({ where: { id: inc.id }, data: { estado: 'CERRADO', resultado: 'DESCARTADO', resumenCiudadano: 'Cierre de prueba del caso.', cerradoEn: new Date() } });
    const r = await aclararCiudadano(inc.referencia, c.token, { heridos: 'si' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('EVALUACION_CERRADA');
    expect(await prisma.versionEvaluacion.count()).toBe(1);
  });

  it('sin sesion 401; cookie institucional 403', async () => {
    const c = await ciudadano();
    const inc = await reporteDe(c.token, { heridos: 'no_se' });
    expect((await aclararCiudadano(inc.referencia, null, { heridos: 'si' })).status).toBe(401);
    const op = await crearCuentaDePrueba(prisma, { rol: 'operador' });
    const cookie = await cookieInstitucional(app, op.correo);
    const r = await request(app).post(rutaCiudadano(inc.referencia)).set('Cookie', cookie).send({ heridos: 'si' });
    expect(r.status).toBe(403);
  });

  it('cuerpo invalido 400 por campo; el motivo y las respuestas no aparecen en logs', async () => {
    const c = await ciudadano();
    const inc = await reporteDe(c.token, { heridos: 'no_se' });
    const r = await aclararCiudadano(inc.referencia, c.token, { heridos: 'tal-vez', atencionMedica: 'quizas' });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.fields).sort()).toEqual(['atencionMedica', 'heridos']);
    await aclararCiudadano(inc.referencia, c.token, { heridos: 'si', personaPrincipal: { sangrado: 'si' } });
    expect(logger.texto()).not.toMatch(/sangrado|tal-vez|quizas/);
    expect(logger.eventos.some((e) => e.resultado === 'evaluacion_aclarada')).toBe(true);
  });
});

const rutaOperador = (id: string) => `/api/v1/operador/incidentes/${id}/evaluacion`;
const aclararOperador = (id: string, cookie: string, cuerpo: unknown, origen: string | null = ORIGEN_WEB_PRUEBA) => {
  let r = request(app).post(rutaOperador(id)).set('Cookie', cookie);
  if (origen) r = r.set('Origin', origen);
  return r.send(cuerpo as object);
};
const MOTIVO = 'Confirmado por llamada al lugar';

describe('POST /operador/incidentes/{id}/evaluacion (5.4)', () => {
  async function escenario() {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(app, prisma, { categoriaId: 'accidente-transito', descripcion: 'Choque en la avenida', heridos: 'no_se' });
    await enrutarTodo();
    return {
      inc,
      samu,
      pnp,
      cookiePnp: await cookieInstitucional(app, pnp.operadores[0]!.correo),
    };
  }

  it('un operador PNP precisa heridos si: SAMU incorporado y respuesta sin observaciones', async () => {
    const { inc, cookiePnp, samu } = await escenario();
    const r = await aclararOperador(inc.id, cookiePnp, { heridos: 'si', motivo: MOTIVO });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toEqual({ version: 2, condicionMedica: { heridos: 'si', atencionMedica: null, cantidadHeridos: 'no_se' }, samuIncorporado: true });
    // Ahora SAMU participa: su operador puede registrar observaciones.
    const cookieSamu = await cookieInstitucional(app, samu.operadores[0]!.correo);
    const s = await aclararOperador(inc.id, cookieSamu, { personaPrincipal: { consciente: 'no' }, motivo: 'Informe de la unidad' });
    expect(s.status).toBe(200);
    expect(JSON.stringify(s.body)).not.toContain('consciente');
    const v = await prisma.versionEvaluacion.findFirstOrThrow({ where: { incidenteId: inc.id, version: 3 } });
    expect(v).toMatchObject({ origen: 'operador', institucion: 'samu', consciente: 'no' });
  });

  it('validaciones: observaciones de PNP, motivo corto o campo extra dan 400', async () => {
    const { inc, cookiePnp } = await escenario();
    const casos = [
      { personaPrincipal: { consciente: 'si' }, motivo: MOTIVO },
      { heridos: 'si', motivo: 'corto' },
      { heridos: 'si', motivo: MOTIVO, nombre: 'Ana' },
    ];
    for (const cuerpo of casos) expect((await aclararOperador(inc.id, cookiePnp, cuerpo)).status).toBe(400);
    expect(await prisma.versionEvaluacion.count()).toBe(1);
  });

  it('404 uniforme sin participacion, fuera de ambito, inexistente o malformado; 403 a administrador, ciudadano y sin origen', async () => {
    const { inc, pnp } = await escenario();
    const bomberos = await crearSedeDePrueba(prisma, { institucion: 'bomberos', categorias: ['accidente-transito'] });
    const cookieBomberos = await cookieInstitucional(app, bomberos.operadores[0]!.correo);
    const cuerpos: string[] = [];
    for (const id of [inc.id, randomUUID(), 'malformado']) {
      const r = await aclararOperador(id, cookieBomberos, { heridos: 'si', motivo: MOTIVO });
      expect(r.status).toBe(404);
      cuerpos.push(JSON.stringify({ ...r.body.error, requestId: undefined }));
    }
    // Cobertura retirada: la sede PNP ya no ve el incidente.
    await prisma.coberturaSede.deleteMany({ where: { sedeId: pnp.id } });
    const cookiePnp = await cookieInstitucional(app, pnp.operadores[0]!.correo);
    const fuera = await aclararOperador(inc.id, cookiePnp, { heridos: 'si', motivo: MOTIVO });
    expect(fuera.status).toBe(404);
    cuerpos.push(JSON.stringify({ ...fuera.body.error, requestId: undefined }));
    expect(new Set(cuerpos).size).toBe(1);

    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const cookieAdmin = await cookieInstitucional(app, admin.correo);
    expect((await aclararOperador(inc.id, cookieAdmin, { heridos: 'si', motivo: MOTIVO })).status).toBe(403);
    const c = await ciudadano();
    const r = await request(app).post(rutaOperador(inc.id)).set('Authorization', `Bearer ${c.token}`).send({ heridos: 'si', motivo: MOTIVO });
    expect(r.status).toBe(403);
    expect((await request(app).post(rutaOperador(inc.id)).send({})).status).toBe(401);
    expect(await prisma.versionEvaluacion.count()).toBe(1);
  });

  it('sin origen web 403; incidente cerrado 409; reintento identico sin otra version', async () => {
    const { inc, cookiePnp } = await escenario();
    expect((await aclararOperador(inc.id, cookiePnp, { heridos: 'si', motivo: MOTIVO }, null)).status).toBe(403);
    expect((await aclararOperador(inc.id, cookiePnp, { heridos: 'si', motivo: MOTIVO })).status).toBe(200);
    const repetida = await aclararOperador(inc.id, cookiePnp, { heridos: 'si', motivo: MOTIVO });
    expect(repetida.status).toBe(200);
    expect(repetida.body.version).toBe(2);
    expect(await prisma.versionEvaluacion.count()).toBe(2);
    await prisma.incidente.update({ where: { id: inc.id }, data: { estado: 'CERRADO', resultado: 'DESCARTADO', resumenCiudadano: 'Cierre de prueba del caso.', cerradoEn: new Date() } });
    const cerrado = await aclararOperador(inc.id, cookiePnp, { heridos: 'no', motivo: MOTIVO });
    expect(cerrado.status).toBe(409);
    expect(logger.texto()).not.toContain('Confirmado');
  });
});
