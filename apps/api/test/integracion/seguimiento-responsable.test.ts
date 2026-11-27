import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { CLAVE, crearArnes, limpiarBd, RUTA_LOGIN, RUTA_REGISTRO } from './arnes';
import { activarTerritorio, crearSedeDePrueba, registrarIncidente } from './fixtures-enrutamiento';

/** Institucion responsable en el seguimiento ciudadano (P4.2, tarea 6.3). */
const { app, prisma, procesador } = crearArnes({ enrutar: true });
const ACCIDENTE = { categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida', heridos: 'si' };

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
const invitado = (referencia: string, codigo: string) =>
  request(app).post('/api/v1/publico/seguimiento').set('Content-Type', 'application/json').send(JSON.stringify({ referencia, codigo }));

async function ciudadano(): Promise<string> {
  const correo = `c-${randomUUID().slice(0, 8)}@ejemplo.com`;
  await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
  return (await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE })).body.token as string;
}

describe('institucion responsable', () => {
  it('sin enrutamiento, pendiente', async () => {
    const inc = await registrarIncidente(app, prisma, ACCIDENTE);
    const r = await invitado(inc.referencia, inc.codigo);
    expect(r.status).toBe(200);
    expect(r.body.institucionResponsable).toEqual({ estado: 'pendiente' });
  });

  it('con la principal participando: tipo y nombre, sin sede ni operadores (invitado y autor)', async () => {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(app, prisma, ACCIDENTE);
    const token = await ciudadano();
    const propio = await request(app).post('/api/v1/incidentes').set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json').set('Idempotency-Key', randomUUID())
      .send(JSON.stringify({ ...ACCIDENTE, ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() }, punto: { latitud: 1, longitud: 1, origen: 'manual' } }));
    expect(propio.status).toBe(201);
    await enrutarTodo();
    const nombre = (await prisma.institucion.findUniqueOrThrow({ where: { id: 'samu' } })).nombre;

    const vista = await invitado(inc.referencia, inc.codigo);
    expect(vista.body.institucionResponsable).toEqual({ estado: 'asignada', institucion: { id: 'samu', nombre } });
    expect(Object.keys(vista.body).sort()).toEqual(['actuaciones', 'categoria', 'cierre', 'coordinacion', 'estado', 'institucionResponsable', 'recibidoEn', 'referencia']);
    const texto = JSON.stringify(vista.body);
    expect(texto).not.toContain(samu.id);
    expect(texto).not.toContain(samu.operadores[0]!.id);
    expect(texto).not.toMatch(/Choque|sede|operador/i);

    const detalle = await request(app).get(`/api/v1/ciudadano/incidentes/${propio.body.referencia}`).set('Authorization', `Bearer ${token}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body.institucionResponsable).toEqual({ estado: 'asignada', institucion: { id: 'samu', nombre } });
    expect(detalle.body.actuaciones).toEqual([]);
    expect(JSON.stringify(detalle.body)).not.toContain(samu.id);
  });

  it('con la principal faltante y el apoyo presente, sigue pendiente', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(app, prisma, ACCIDENTE);
    await enrutarTodo();
    expect((await prisma.participacionIncidente.count())).toBe(1);
    expect((await invitado(inc.referencia, inc.codigo)).body.institucionResponsable).toEqual({ estado: 'pendiente' });
  });
});
