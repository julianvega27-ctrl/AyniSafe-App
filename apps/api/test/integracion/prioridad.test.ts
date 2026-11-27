import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { crearArnes, limpiarBd, ORIGEN_WEB_PRUEBA } from './arnes';
import { activarTerritorio, cookieInstitucional, crearSedeDePrueba, registrarIncidente } from './fixtures-enrutamiento';

/** P6 grupo C, tarea C3 (RF12, EQ-16): propuesta versionada, revision auditada y FIFO intacto. */
const { app, prisma, procesador } = crearArnes({ enrutar: true });
const BASE = '/api/v1/operador/incidentes';
const MOTIVO = 'Hay una persona atrapada en el lugar';

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

const post = (cookie: string, ruta: string, cuerpo: unknown) =>
  request(app).post(ruta).set('Cookie', cookie).set('Origin', ORIGEN_WEB_PRUEBA).set('Content-Type', 'application/json').send(JSON.stringify(cuerpo));

describe('prioridad versionada', () => {
  it('propone por categoria al enrutar, conserva el origen y la version', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'bomberos', categorias: ['incendio'] });
    const incendio = await registrarIncidente(app, prisma, { categoriaId: 'incendio', descripcion: 'Humo saliendo de una casa' });
    await enrutarTodo();
    expect(await prisma.incidente.findUniqueOrThrow({ where: { id: incendio.id } })).toMatchObject({
      prioridad: 'URGENTE', prioridadOrigen: 'propuesta', prioridadVersion: 'prioridad-categoria-v1',
    });
  });

  it('el responsable eleva con motivo, queda auditado y la bandeja conserva el orden FIFO (EQ-16)', async () => {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo', 'actividad-sospechosa'] });
    const viejo = await registrarIncidente(app, prisma);
    const nuevo = await registrarIncidente(app, prisma, { categoriaId: 'actividad-sospechosa', descripcion: 'Personas merodeando autos' });
    await enrutarTodo();
    const op = await cookieInstitucional(app, pnp.operadores[0]!.correo);
    const orden = async () => (await request(app).get(BASE).set('Cookie', op)).body.elementos.map((e: { id: string; prioridad: string }) => [e.id, e.prioridad]);
    expect(await orden()).toEqual([[viejo.id, 'ALTA'], [nuevo.id, 'NORMAL']]);

    // Sin asumir: no puede revisar.
    expect((await post(op, `${BASE}/${nuevo.id}/prioridad`, { valor: 'URGENTE', motivo: MOTIVO })).body.error.code).toBe('ASIGNACION_REQUERIDA');
    await request(app).post(`${BASE}/${nuevo.id}/asumir`).set('Cookie', op).set('Origin', ORIGEN_WEB_PRUEBA);
    const r = await post(op, `${BASE}/${nuevo.id}/prioridad`, { valor: 'URGENTE', motivo: MOTIVO });
    expect(r.body).toEqual({ prioridad: 'URGENTE', origen: 'revisada' });
    expect(await orden()).toEqual([[viejo.id, 'ALTA'], [nuevo.id, 'URGENTE']]);
    const fila = (await request(app).get(BASE).set('Cookie', op)).body.elementos[1];
    expect(fila.prioridadOrigen).toBe('revisada');
    const h = await prisma.historialIncidente.findFirstOrThrow({ where: { incidenteId: nuevo.id, accion: 'prioridad' } });
    expect(h).toMatchObject({ valorAnterior: 'NORMAL', valorNuevo: 'URGENTE', motivo: MOTIVO, actorUsuarioId: pnp.operadores[0]!.id });
    // La version de la propuesta se conserva y la tabla no cambia: otro incidente de la categoria sigue en NORMAL.
    expect((await prisma.incidente.findUniqueOrThrow({ where: { id: nuevo.id } })).prioridadVersion).toBe('prioridad-categoria-v1');
    const otro = await registrarIncidente(app, prisma, { categoriaId: 'actividad-sospechosa', descripcion: 'Otra persona merodeando autos' });
    await enrutarTodo();
    expect((await prisma.incidente.findUniqueOrThrow({ where: { id: otro.id } })).prioridad).toBe('NORMAL');
  });

  it('rechaza valores fuera de Normal, Alta y Urgente y la BD exige coherencia de origen', async () => {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
    const inc = await registrarIncidente(app, prisma);
    await enrutarTodo();
    const op = await cookieInstitucional(app, pnp.operadores[0]!.correo);
    await request(app).post(`${BASE}/${inc.id}/asumir`).set('Cookie', op).set('Origin', ORIGEN_WEB_PRUEBA);
    for (const valor of ['BAJA', 'SIN_EVALUAR']) {
      expect((await post(op, `${BASE}/${inc.id}/prioridad`, { valor, motivo: MOTIVO })).status).toBe(400);
    }
    await expect(prisma.$executeRaw`UPDATE incidentes SET prioridad_origen = NULL WHERE id = ${inc.id}::uuid`).rejects.toThrow();
  });
});
