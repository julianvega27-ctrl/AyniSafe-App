import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { CLAVE, crearArnes, crearCuentaDePrueba, limpiarBd, ORIGEN_WEB_PRUEBA, RUTA_LOGIN, RUTA_REGISTRO } from './arnes';
import { activarTerritorio, cookieInstitucional, crearSedeDePrueba, PUNTO_DIS01 } from './fixtures-enrutamiento';

/** P5.1, tareas 6.1 a 6.3: resumen del operador, detalle sanitario SAMU y evaluacion del autor. */
const { app, prisma, procesador } = crearArnes({ enrutar: true });

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
  await activarTerritorio(prisma);
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

/** Accidente de un autor con cuenta, sedes SAMU y PNP con cobertura y sus cookies. */
async function escenario(extra: Record<string, unknown> = { heridos: 'no_se' }) {
  const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
  const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
  const autor = await ciudadano();
  const r = await request(app)
    .post('/api/v1/incidentes')
    .set('Idempotency-Key', randomUUID())
    .set('Authorization', `Bearer ${autor.token}`)
    .send({
      categoriaId: 'accidente-transito',
      descripcion: 'Choque en la avenida principal',
      ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
      punto: PUNTO_DIS01,
      ...extra,
    });
  expect(r.status).toBe(201);
  await enrutarTodo();
  const inc = await prisma.incidente.findUniqueOrThrow({ where: { referencia: r.body.referencia } });
  return {
    inc,
    autor,
    samu,
    pnp,
    cookieSamu: await cookieInstitucional(app, samu.operadores[0]!.correo),
    cookiePnp: await cookieInstitucional(app, pnp.operadores[0]!.correo),
  };
}

const precisar = (id: string, cookie: string, cuerpo: unknown) =>
  request(app).post(`/api/v1/operador/incidentes/${id}/evaluacion`).set('Cookie', cookie).set('Origin', ORIGEN_WEB_PRUEBA).send(cuerpo as object);
const resumen = (id: string, cookie: string) => request(app).get(`/api/v1/operador/incidentes/${id}`).set('Cookie', cookie);
const detalle = (id: string, cookie: string) => request(app).get(`/api/v1/operador/incidentes/${id}/evaluacion`).set('Cookie', cookie);
// P6: el historial operativo trae la clave "motivo" (nula o de atencion); se detecta un motivo con valor.
const DATOS_SANITARIOS = /signosVida|consciente|sangrado|"motivo":"|Confirmado|Informe de la unidad/;

describe('resumen del operador (6.1)', () => {
  it('PNP recibe la condicion vigente sin observaciones ni motivos, con la respuesta original conservada', async () => {
    const { inc, cookiePnp, cookieSamu } = await escenario();
    expect((await precisar(inc.id, cookiePnp, { heridos: 'si', cantidadHeridos: 2, motivo: 'Confirmado por llamada' })).status).toBe(200);
    expect((await precisar(inc.id, cookieSamu, { personaPrincipal: { consciente: 'no' }, motivo: 'Informe de la unidad' })).status).toBe(200);

    const r = await resumen(inc.id, cookiePnp);
    expect(r.status).toBe(200);
    expect(r.body.respuestasCiudadano).toEqual({ heridos: 'no_se', atencionMedica: null });
    expect(r.body.condicionMedica).toEqual({
      heridos: 'si',
      atencionMedica: null,
      cantidadHeridos: 2,
      revisionPendiente: false,
      version: 3,
      origen: 'operador',
      institucion: 'samu',
      informadaEn: expect.any(String),
      observacionesInformadas: true,
    });
    expect(r.body.accesoSanitario).toBe(false);
    expect(r.body.papel).toBe('simultanea');
    expect(JSON.stringify(r.body)).not.toMatch(DATOS_SANITARIOS);

    const s = await resumen(inc.id, cookieSamu);
    expect(s.body.accesoSanitario).toBe(true);
    expect(s.body.papel).toBe('principal');
    expect(JSON.stringify(s.body)).not.toMatch(DATOS_SANITARIOS);
  });

  it('la fila de bandeja refleja la revision resuelta y el papel actualizado', async () => {
    const { inc, cookiePnp } = await escenario();
    const antes = (await request(app).get('/api/v1/operador/incidentes').set('Cookie', cookiePnp)).body.elementos[0];
    expect(antes).toMatchObject({ id: inc.id, papel: 'principal', condicionMedicaPorConfirmar: true });
    await precisar(inc.id, cookiePnp, { heridos: 'si', motivo: 'Confirmado por llamada' });
    const despues = (await request(app).get('/api/v1/operador/incidentes').set('Cookie', cookiePnp)).body.elementos[0];
    expect(despues).toMatchObject({ id: inc.id, papel: 'simultanea', condicionMedicaPorConfirmar: false });
    expect(Object.keys(despues).sort()).toEqual(Object.keys(antes).sort());
  });

  it('un robo no tiene condicion medica ni acceso sanitario', async () => {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
    const autor = await ciudadano();
    const r = await request(app)
      .post('/api/v1/incidentes')
      .set('Idempotency-Key', randomUUID())
      .set('Authorization', `Bearer ${autor.token}`)
      .send({ categoriaId: 'robo', descripcion: 'Robo de celular', ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() }, punto: PUNTO_DIS01 });
    await enrutarTodo();
    const inc = await prisma.incidente.findUniqueOrThrow({ where: { referencia: r.body.referencia } });
    const s = await resumen(inc.id, await cookieInstitucional(app, pnp.operadores[0]!.correo));
    expect(s.body).toMatchObject({ condicionMedica: null, accesoSanitario: false });
  });
});

describe('detalle sanitario (6.2)', () => {
  it('el operador SAMU recibe la vigente y el historial, y el acceso se registra sin contenido', async () => {
    const { inc, cookiePnp, cookieSamu, samu } = await escenario({ heridos: 'si' });
    const pendiente = await detalle(inc.id, cookieSamu);
    expect(pendiente.status).toBe(200);
    expect(pendiente.headers['cache-control']).toBe('no-store');
    expect(pendiente.body).toMatchObject({ version: 1, pendiente: true, vigente: { personaPrincipal: { signosVida: null, consciente: null, sangrado: null } } });

    await precisar(inc.id, cookiePnp, { cantidadHeridos: 3, motivo: 'Confirmado por llamada' });
    await precisar(inc.id, cookieSamu, { personaPrincipal: { sangrado: 'si' }, motivo: 'Informe de la unidad' });
    const r = await detalle(inc.id, cookieSamu);
    expect(r.body).toMatchObject({ version: 3, pendiente: false, vigente: { heridos: 'si', cantidadHeridos: 3, personaPrincipal: { sangrado: 'si' } } });
    expect(r.body.historial.map((v: { version: number; origen: string; institucion: string | null; camposModificados: string[]; motivo: string | null }) => [
      v.version, v.origen, v.institucion, v.camposModificados, v.motivo,
    ])).toEqual([
      [1, 'ciudadano', null, [], null],
      [2, 'operador', 'pnp', ['cantidadHeridos'], 'Confirmado por llamada'],
      [3, 'operador', 'samu', ['sangrado'], 'Informe de la unidad'],
    ]);
    expect(JSON.stringify(r.body)).not.toMatch(/correo|nombre|telefono|latitud/);

    const accesos = await prisma.accesoEvaluacion.findMany({ where: { incidenteId: inc.id }, orderBy: { accedidoEn: 'asc' } });
    expect(accesos.map((a) => [a.usuarioId, a.version])).toEqual([
      [samu.operadores[0]!.id, 1],
      [samu.operadores[0]!.id, 3],
    ]);
  });

  it('404 uniforme sin registrar acceso; 403 para administrador y ciudadano', async () => {
    const { inc, cookiePnp, autor } = await escenario({ heridos: 'si' });
    const samuFuera = await crearSedeDePrueba(prisma, { institucion: 'samu', distritos: ['DIS-02'], categorias: ['accidente-transito'] });
    const cookieSamuFuera = await cookieInstitucional(app, samuFuera.operadores[0]!.correo);
    const cuerpos: string[] = [];
    for (const [id, cookie] of [
      [inc.id, cookiePnp],
      [inc.id, cookieSamuFuera],
      [randomUUID(), cookiePnp],
      ['malformado', cookiePnp],
    ] as const) {
      const r = await detalle(id, cookie);
      expect(r.status).toBe(404);
      cuerpos.push(JSON.stringify({ ...r.body.error, requestId: undefined }));
    }
    expect(new Set(cuerpos).size).toBe(1);
    expect(await prisma.accesoEvaluacion.count()).toBe(0);

    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    expect((await detalle(inc.id, await cookieInstitucional(app, admin.correo))).status).toBe(403);
    expect((await request(app).get(`/api/v1/operador/incidentes/${inc.id}/evaluacion`).set('Authorization', `Bearer ${autor.token}`)).status).toBe(403);
  });

  it('SAMU participante sin evaluacion (robo designado): 404', async () => {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['robo'] });
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
    const autor = await ciudadano();
    const r = await request(app)
      .post('/api/v1/incidentes')
      .set('Idempotency-Key', randomUUID())
      .set('Authorization', `Bearer ${autor.token}`)
      .send({ categoriaId: 'robo', descripcion: 'Robo de celular', ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() }, punto: PUNTO_DIS01 });
    await enrutarTodo();
    const inc = await prisma.incidente.findUniqueOrThrow({ where: { referencia: r.body.referencia } });
    // Participacion SAMU directa (en P5.1 SAMU no se incorpora a un robo; simula una designacion).
    await prisma.participacionIncidente.create({ data: { incidenteId: inc.id, sedeId: samu.id, institucion: 'samu', papel: 'simultanea', origen: 'designacion', designadoPor: autor.id, motivo: 'Designacion de prueba' } });
    expect((await detalle(inc.id, await cookieInstitucional(app, samu.operadores[0]!.correo))).status).toBe(404);
  });
});

describe('evaluacion del autor (6.3)', () => {
  const detalleAutor = (ref: string, token: string) => request(app).get(`/api/v1/ciudadano/incidentes/${ref}`).set('Authorization', `Bearer ${token}`);

  it('SAMU incorporado por un operador pide completar sin mostrar la precision ni el motivo; SAMU es responsable', async () => {
    const { inc, autor, cookiePnp } = await escenario();
    await precisar(inc.id, cookiePnp, { heridos: 'si', motivo: 'Confirmado por llamada' });
    const r = await detalleAutor(inc.referencia, autor.token);
    expect(r.status).toBe(200);
    expect(r.body.evaluacion).toMatchObject({
      version: 1,
      respuestas: { heridos: 'no_se', cantidadHeridos: null },
      puedeAclarar: true,
      solicitudCompletar: true,
    });
    expect(JSON.stringify(r.body)).not.toMatch(/Confirmado|operador|pnp/i);
    expect(r.body.institucionResponsable).toMatchObject({ estado: 'asignada', institucion: { id: 'samu' } });
  });

  it('un incidente cerrado no permite aclarar ni pide completar', async () => {
    const { inc, autor } = await escenario({ heridos: 'si' });
    await prisma.incidente.update({ where: { id: inc.id }, data: { estado: 'CERRADO', resultado: 'DESCARTADO', resumenCiudadano: 'Cierre de prueba del caso.', cerradoEn: new Date() } });
    expect((await detalleAutor(inc.referencia, autor.token)).body.evaluacion).toMatchObject({ puedeAclarar: false, solicitudCompletar: false });
  });

  it('la vista del invitado de una pelea con evaluacion no contiene claves de evaluacion', async () => {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['pelea'] });
    const r = await request(app)
      .post('/api/v1/incidentes')
      .set('Idempotency-Key', randomUUID())
      .send({
        categoriaId: 'pelea',
        descripcion: 'Pelea en la plaza',
        ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
        punto: PUNTO_DIS01,
        telefonoContacto: '987654321',
        heridos: 'si',
        evaluacion: { cantidadHeridos: 2, personaPrincipal: { consciente: 'no' } },
      });
    expect(r.status).toBe(201);
    expect(pnp.id).toBeDefined();
    const v = await request(app).post('/api/v1/publico/seguimiento').send({ referencia: r.body.referencia, codigo: r.body.codigoSeguimiento });
    expect(v.status).toBe(200);
    expect(JSON.stringify(v.body)).not.toMatch(/evaluacion|heridos|cantidad|consciente|respuestas/);
  });
});
