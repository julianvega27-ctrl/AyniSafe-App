import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { crearArnes, crearCuentaDePrueba, limpiarBd, ORIGEN_WEB_PRUEBA } from './arnes';
import {
  activarTerritorio,
  cookieInstitucional,
  crearSedeDePrueba,
  PUNTO_FUERA,
  registrarIncidente,
} from './fixtures-enrutamiento';

/** Pendientes del administrador: lista FIFO, designacion y reevaluacion (P4.2, tarea 5.1). */
const { app, prisma, procesador, logger } = crearArnes({ enrutar: true });
const RUTA = '/api/v1/admin/enrutamientos-pendientes';
const MOTIVO = 'No hay cobertura SAMU configurada en el distrito';

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
async function admin(): Promise<{ id: string; cookie: string }> {
  const cuenta = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
  return { id: cuenta.id, cookie: await cookieInstitucional(app, cuenta.correo) };
}
const listar = (cookie: string, q = '') => request(app).get(`${RUTA}${q}`).set('Cookie', cookie);
const designar = (cookie: string, id: string, cuerpo: unknown) =>
  request(app).post(`${RUTA}/${id}/designaciones`).set('Cookie', cookie).set('Origin', ORIGEN_WEB_PRUEBA)
    .set('Content-Type', 'application/json').send(JSON.stringify(cuerpo));
const reevaluar = (cookie: string, id: string) =>
  request(app).post(`${RUTA}/${id}/reevaluar`).set('Cookie', cookie).set('Origin', ORIGEN_WEB_PRUEBA);

/** Accidente con heridos sin sede SAMU: PNP participa y falta la principal. */
async function accidenteSinSamu() {
  await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
  const inc = await registrarIncidente(app, prisma, {
    categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida', heridos: 'si',
  });
  await enrutarTodo();
  return inc;
}

describe('lista de pendientes', () => {
  it('FIFO con cursor, sin repetir ni omitir, y solo con los campos permitidos', async () => {
    const a = await admin();
    const ids: string[] = [];
    for (let i = 0; i < 53; i++) ids.push((await registrarIncidente(app, prisma, { punto: PUNTO_FUERA })).id);
    await enrutarTodo();
    const vistos: string[] = [];
    let cursor: string | null = null;
    do {
      const r = await listar(a.cookie, cursor ? `?cursor=${cursor}` : '');
      expect(r.status).toBe(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body.elementos.length).toBeLessThanOrEqual(50);
      vistos.push(...r.body.elementos.map((e: { incidenteId: string }) => e.incidenteId));
      cursor = r.body.siguiente;
    } while (cursor);
    const esperado = (await prisma.enrutamientoIncidente.findMany({ orderBy: [{ registradoEn: 'asc' }, { incidenteId: 'asc' }] }))
      .map((e) => e.incidenteId);
    expect(vistos).toEqual(esperado);
    expect([...vistos].sort()).toEqual([...ids].sort());
    const fila = (await listar(a.cookie)).body.elementos[0];
    expect(Object.keys(fila).sort()).toEqual(['categoria', 'faltantes', 'incidenteId', 'referencia', 'registradoEn', 'territorio']);
    expect(fila).toMatchObject({
      categoria: { id: 'robo', nombre: 'Robo' },
      territorio: { estado: 'pendiente', motivo: 'fuera_area' },
      faltantes: [{ institucion: 'pnp', papel: 'principal', motivo: 'sin_distrito' }],
    });
    expect(JSON.stringify(fila)).not.toMatch(/987654321|arrebataron|latitud|heridos/);
  });

  it('rechaza un cursor invalido y parametros extra', async () => {
    const a = await admin();
    expect((await listar(a.cookie, '?cursor=xyz')).status).toBe(400);
    expect((await listar(a.cookie, '?distrito=DIS-01')).status).toBe(400);
  });

  it('operador, ciudadano y sin sesion no acceden', async () => {
    const sede = await crearSedeDePrueba(prisma, { institucion: 'pnp' });
    const op = await cookieInstitucional(app, sede.operadores[0]!.correo);
    expect((await listar(op)).status).toBe(403);
    expect((await request(app).get(RUTA).set('Authorization', 'Bearer x')).status).toBe(401);
    expect((await request(app).get(RUTA)).status).toBe(401);
    const inc = await registrarIncidente(app, prisma, { punto: PUNTO_FUERA });
    expect((await designar(op, inc.id, { institucion: 'pnp', sedeId: sede.id, motivo: MOTIVO })).status).toBe(403);
  });
});

describe('designacion auditada', () => {
  it('designar la principal faltante pasa el caso a ENRUTADO con auditoria y evento', async () => {
    const a = await admin();
    const inc = await accidenteSinSamu();
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', distritos: ['DIS-05'] });
    const r = await designar(a.cookie, inc.id, { institucion: 'samu', sedeId: samu.id, motivo: MOTIVO });
    expect(r.status).toBe(201);
    expect(r.body.enrutamiento).toEqual({ incidenteId: inc.id, resultado: 'ENRUTADO', faltantes: [] });
    const p = await prisma.participacionIncidente.findFirstOrThrow({ where: { incidenteId: inc.id, sedeId: samu.id } });
    expect(p).toMatchObject({ institucion: 'samu', papel: 'principal', origen: 'designacion', designadoPor: a.id, motivo: MOTIVO });
    const eventos = await prisma.evento.findMany({ where: { agregadoId: inc.id, tipo: 'EnrutamientoResuelto' }, orderBy: { ocurridoEn: 'asc' } });
    expect(eventos.map((e) => e.carga)).toEqual([
      { incidenteId: inc.id, resultado: 'ENRUTAMIENTO_PENDIENTE', origen: 'regla' },
      { incidenteId: inc.id, resultado: 'ENRUTADO', origen: 'designacion' },
    ]);
    expect((await listar(a.cookie)).body.elementos).toEqual([]);
    expect(JSON.stringify(logger.eventos)).not.toContain(MOTIVO);
  });

  it('rechaza sedes de otra institucion, deshabilitadas o sin operadores activos (409)', async () => {
    const a = await admin();
    const inc = await accidenteSinSamu();
    const pnp2 = await crearSedeDePrueba(prisma, { institucion: 'pnp' });
    const deshabilitada = await crearSedeDePrueba(prisma, { institucion: 'samu', habilitada: false });
    const sinOperador = await crearSedeDePrueba(prisma, { institucion: 'samu', operadores: ['suspendido'] });
    for (const [sede, requisito] of [[pnp2.id, 'misma_institucion'], [deshabilitada.id, 'sede_habilitada'], [sinOperador.id, 'operador_activo'], [randomUUID(), 'sede_existente']] as const) {
      const r = await designar(a.cookie, inc.id, { institucion: 'samu', sedeId: sede, motivo: MOTIVO });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('SEDE_NO_DESIGNABLE');
      expect(r.body.error.requisitos).toContain(requisito);
    }
    expect((await prisma.enrutamientoIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } })).resultado).toBe('ENRUTAMIENTO_PENDIENTE');
  });

  it('valida el cuerpo, el origen y el tipo de contenido', async () => {
    const a = await admin();
    const inc = await accidenteSinSamu();
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu' });
    const corto = await designar(a.cookie, inc.id, { institucion: 'samu', sedeId: samu.id, motivo: 'corto' });
    expect(corto.status).toBe(400);
    expect(corto.body.error.fields).toHaveProperty('motivo');
    expect((await designar(a.cookie, inc.id, { institucion: 'ejercito', sedeId: samu.id, motivo: MOTIVO, extra: 1 })).status).toBe(400);
    const sinOrigen = await request(app).post(`${RUTA}/${inc.id}/designaciones`).set('Cookie', a.cookie)
      .set('Content-Type', 'application/json').send(JSON.stringify({ institucion: 'samu', sedeId: samu.id, motivo: MOTIVO }));
    expect(sinOrigen.status).toBe(403);
    const texto = await request(app).post(`${RUTA}/${inc.id}/designaciones`).set('Cookie', a.cookie)
      .set('Origin', ORIGEN_WEB_PRUEBA).set('Content-Type', 'text/plain').send('hola');
    expect(texto.status).toBe(415);
    expect((await designar(a.cookie, randomUUID(), { institucion: 'samu', sedeId: samu.id, motivo: MOTIVO })).status).toBe(404);
    expect((await designar(a.cookie, 'no-uuid', { institucion: 'samu', sedeId: samu.id, motivo: MOTIVO })).status).toBe(404);
  });

  it('dos designaciones concurrentes dejan una participacion y un 409', async () => {
    const [a1, a2] = [await admin(), await admin()];
    const inc = await accidenteSinSamu();
    const s1 = await crearSedeDePrueba(prisma, { institucion: 'samu' });
    const s2 = await crearSedeDePrueba(prisma, { institucion: 'samu' });
    const [r1, r2] = await Promise.all([
      designar(a1.cookie, inc.id, { institucion: 'samu', sedeId: s1.id, motivo: MOTIVO }),
      designar(a2.cookie, inc.id, { institucion: 'samu', sedeId: s2.id, motivo: MOTIVO }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect([r1, r2].find((r) => r.status === 409)!.body.error.code).toBe('FALTANTE_INEXISTENTE');
    expect(await prisma.participacionIncidente.count({ where: { incidenteId: inc.id, institucion: 'samu' } })).toBe(1);
  });

  it('designar una institucion que no falta responde 409 sin cambios', async () => {
    const a = await admin();
    const inc = await accidenteSinSamu();
    const pnp2 = await crearSedeDePrueba(prisma, { institucion: 'pnp' });
    const r = await designar(a.cookie, inc.id, { institucion: 'pnp', sedeId: pnp2.id, motivo: MOTIVO });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('FALTANTE_INEXISTENTE');
    expect(await prisma.participacionIncidente.count({ where: { incidenteId: inc.id } })).toBe(1);
  });
});

describe('reevaluacion', () => {
  it('tras anadir la cobertura faltante resuelve el caso; sin cambios sigue pendiente sin duplicar', async () => {
    const a = await admin();
    const inc = await accidenteSinSamu();
    const sinCambios = await reevaluar(a.cookie, inc.id);
    expect(sinCambios.status).toBe(200);
    expect(sinCambios.body.enrutamiento).toMatchObject({ resultado: 'ENRUTAMIENTO_PENDIENTE', faltantes: [{ institucion: 'samu', papel: 'principal', motivo: 'sin_sede_elegible' }] });
    expect(await prisma.participacionIncidente.count({ where: { incidenteId: inc.id } })).toBe(1);

    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const r = await reevaluar(a.cookie, inc.id);
    expect(r.status).toBe(200);
    expect(r.body.enrutamiento).toEqual({ incidenteId: inc.id, resultado: 'ENRUTADO', faltantes: [] });
    expect(await prisma.participacionIncidente.findFirstOrThrow({ where: { incidenteId: inc.id, sedeId: samu.id } }))
      .toMatchObject({ papel: 'principal', origen: 'reevaluacion' });
    expect((await reevaluar(a.cookie, inc.id)).body.error.code).toBe('ENRUTAMIENTO_NO_PENDIENTE');
  });

  it('sin distrito, la reevaluacion no resuelve: solo la designacion', async () => {
    const a = await admin();
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
    const inc = await registrarIncidente(app, prisma, { punto: PUNTO_FUERA });
    await enrutarTodo();
    expect((await reevaluar(a.cookie, inc.id)).body.enrutamiento.resultado).toBe('ENRUTAMIENTO_PENDIENTE');
  });
});
