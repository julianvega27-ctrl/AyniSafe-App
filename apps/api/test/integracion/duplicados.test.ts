import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { CLAVE, crearArnes, crearCuentaDePrueba, limpiarBd, ORIGEN_WEB_PRUEBA, RUTA_LOGIN } from './arnes';
import { activarTerritorio, cookieInstitucional, crearSedeDePrueba, registrarIncidente } from './fixtures-enrutamiento';

/**
 * P6 grupo B (RF15): duplicados vinculados a un principal. Sin cadenas ni ciclos, transiciones
 * bloqueadas en el duplicado, estado coordinado en el seguimiento y privacidad entre informantes.
 */
const { app, prisma, procesador } = crearArnes({ enrutar: true });
const BASE = '/api/v1/operador/incidentes';
const MOTIVO = 'Mismo hecho reportado dos veces';

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
  await activarTerritorio(prisma);
});

const post = (cookie: string, ruta: string, cuerpo?: unknown) => {
  const r = request(app).post(ruta).set('Cookie', cookie).set('Origin', ORIGEN_WEB_PRUEBA);
  return cuerpo === undefined ? r : r.set('Content-Type', 'application/json').send(JSON.stringify(cuerpo));
};
const vincular = (cookie: string, id: string, referenciaPrincipal: string) => post(cookie, `${BASE}/${id}/vinculo`, { referenciaPrincipal, motivo: MOTIVO });

async function escenario(n = 2) {
  const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
  const ciudadano = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
  const token = (await request(app).post(RUTA_LOGIN).send({ correo: ciudadano.correo, contrasena: CLAVE })).body.token as string;
  const incs = [];
  for (let i = 0; i < n; i++) incs.push(await registrarIncidente(app, prisma, i === 0 ? { descripcion: 'Descripcion privada del principal' } : {}));
  await procesador.esperarReposo();
  await procesador.procesarPendientes();
  const op = await cookieInstitucional(app, pnp.operadores[0]!.correo);
  for (const inc of incs) await post(op, `${BASE}/${inc.id}/asumir`);
  return { op, incs, token };
}

describe('vinculacion de duplicados', () => {
  it('vincula sin cerrar, bloquea transiciones del duplicado y refleja el estado del principal', async () => {
    const { op, incs } = await escenario();
    const [principal, dup] = incs as [typeof incs[0], typeof incs[0]];
    expect((await vincular(op, dup.id, principal.referencia.toLowerCase())).body).toEqual({ vinculado: true });
    const fila = await prisma.incidente.findUniqueOrThrow({ where: { id: dup.id } });
    expect(fila).toMatchObject({ principalId: principal.id, estado: 'EN_REVISION', resultado: null });
    expect((await post(op, `${BASE}/${dup.id}/transiciones`, { accion: 'iniciar_atencion', estadoEsperado: 'EN_REVISION' })).body.error.code)
      .toBe('INCIDENTE_VINCULADO');

    await post(op, `${BASE}/${principal.id}/transiciones`, { accion: 'iniciar_atencion', estadoEsperado: 'EN_REVISION' });
    const resumen = (await request(app).get(`${BASE}/${dup.id}`).set('Cookie', op)).body;
    expect(resumen).toMatchObject({ estado: 'EN_ATENCION', vinculado: true });
    expect(resumen.atencion.accionesPermitidas).toEqual([]);

    // Seguimiento del invitado del duplicado: estado del principal, coordinacion y sin datos del principal.
    const vista = await request(app).post('/api/v1/publico/seguimiento').set('Content-Type', 'application/json')
      .send(JSON.stringify({ referencia: dup.referencia, codigo: dup.codigo }));
    expect(vista.body).toMatchObject({ referencia: dup.referencia, estado: 'EN_ATENCION', coordinacion: 'Coordinado con otro reporte del mismo hecho' });
    expect(vista.body.actuaciones.map((a: { texto: string }) => a.texto)).toEqual(['En revisión', expect.stringMatching(/^En atención por /)]);
    const texto = JSON.stringify(vista.body);
    expect(texto).not.toContain(principal.referencia);
    expect(texto).not.toContain('Descripcion privada del principal');
    expect(texto).not.toContain(MOTIVO);

    // El principal no recibe datos de sus duplicados.
    const delPrincipal = await request(app).post('/api/v1/publico/seguimiento').set('Content-Type', 'application/json')
      .send(JSON.stringify({ referencia: principal.referencia, codigo: principal.codigo }));
    expect(delPrincipal.body.coordinacion).toBeNull();
    expect(JSON.stringify(delPrincipal.body)).not.toContain(dup.referencia);

    // El cierre del principal se refleja en el duplicado sin cerrarlo.
    await post(op, `${BASE}/${principal.id}/transiciones`, { accion: 'cerrar', estadoEsperado: 'EN_ATENCION', resultado: 'ATENDIDO', motivo: MOTIVO, resumenCiudadano: 'La PNP atendió el caso.' });
    const cerrado = await request(app).post('/api/v1/publico/seguimiento').set('Content-Type', 'application/json')
      .send(JSON.stringify({ referencia: dup.referencia, codigo: dup.codigo }));
    expect(cerrado.body).toMatchObject({ estado: 'CERRADO', cierre: { resultado: 'ATENDIDO', resumenCiudadano: 'La PNP atendió el caso.' } });
    expect((await prisma.incidente.findUniqueOrThrow({ where: { id: dup.id } })).estado).toBe('EN_REVISION');
    expect((await prisma.historialIncidente.findMany({ where: { incidenteId: dup.id, accion: 'vincular' } }))).toHaveLength(1);
  });

  it('rechaza autovinculo, cadenas, principales con duplicados y cerrados', async () => {
    const { op, incs } = await escenario(4);
    const [a, b, c, d] = incs as [typeof incs[0], typeof incs[0], typeof incs[0], typeof incs[0]];
    expect((await vincular(op, a.id, a.referencia)).body.error.code).toBe('VINCULO_NO_PERMITIDO');
    expect((await vincular(op, b.id, c.referencia)).status).toBe(200);
    expect((await vincular(op, a.id, b.referencia)).body.error.code).toBe('VINCULO_NO_PERMITIDO'); // b ya es duplicado
    expect((await vincular(op, c.id, a.referencia)).body.error.code).toBe('VINCULO_NO_PERMITIDO'); // c tiene duplicados
    await post(op, `${BASE}/${d.id}/transiciones`, { accion: 'cerrar', estadoEsperado: 'EN_REVISION', resultado: 'DESCARTADO', motivo: MOTIVO, resumenCiudadano: 'El hecho no pudo confirmarse.' });
    expect((await vincular(op, a.id, d.referencia)).body.error.code).toBe('VINCULO_NO_PERMITIDO');
    expect((await vincular(op, a.id, 'INC-00000-00000')).status).toBe(404);
  });

  it('dos vinculaciones cruzadas simultaneas: solo una se confirma', async () => {
    const { op, incs } = await escenario();
    const [a, b] = incs as [typeof incs[0], typeof incs[0]];
    const [r1, r2] = await Promise.all([vincular(op, a.id, b.referencia), vincular(op, b.id, a.referencia)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const vinculados = await prisma.incidente.count({ where: { principalId: { not: null } } });
    expect(vinculados).toBe(1);
  });

  it('un principal que la sede no ve responde el mismo 404', async () => {
    const { op, incs } = await escenario(1);
    const ajena = await crearSedeDePrueba(prisma, { institucion: 'pnp', distritos: ['DIS-02'], categorias: ['robo'] });
    const lejos = await registrarIncidente(app, prisma, { punto: { latitud: 1, longitud: 5, origen: 'manual' } });
    await procesador.esperarReposo();
    await procesador.procesarPendientes();
    expect(ajena.id).toBeTruthy();
    expect((await vincular(op, incs[0]!.id, lejos.referencia)).status).toBe(404);
  });
});
