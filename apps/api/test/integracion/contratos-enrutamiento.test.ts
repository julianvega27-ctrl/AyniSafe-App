import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { crearArnes, limpiarBd } from './arnes';
import { crearSedeDePrueba } from './fixtures-enrutamiento';

/** Contratos internos de Identidad y Reportes que usa el enrutamiento (P4.2, tareas 3.1 y 3.2). */
const { app, prisma, modulo, reportes } = crearArnes();
const sedes = modulo.sedesEnrutamiento;

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

describe('Identidad: sedes elegibles', () => {
  it('incluye solo sedes activas y habilitadas con cobertura, competencia y operador activo', async () => {
    const buena = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'], habilitada: false });
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'], activa: false, habilitada: false });
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['asalto'] });
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'], distritos: ['DIS-02'] });
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'], operadores: ['pendiente_activacion'] });
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'], operadores: ['suspendido'] });
    await crearSedeDePrueba(prisma, { institucion: 'serenazgo', categorias: ['robo'] });

    expect(await sedes.elegibles('pnp', 'DIS-01', 'robo')).toEqual([buena.id]);
    expect(await sedes.elegibles('ejercito', 'DIS-01', 'robo')).toEqual([]);
  });

  it('una institucion inactiva no tiene sedes elegibles', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'bomberos', categorias: ['incendio'] });
    await prisma.institucion.update({ where: { id: 'bomberos' }, data: { activa: false } });
    try {
      expect(await sedes.elegibles('bomberos', 'DIS-01', 'incendio')).toEqual([]);
    } finally {
      await prisma.institucion.update({ where: { id: 'bomberos' }, data: { activa: true } });
    }
  });

  it('refleja un cambio de cobertura sin reiniciar', async () => {
    const s = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['emergencia-medica'] });
    expect(await sedes.elegibles('samu', 'DIS-03', 'emergencia-medica')).toEqual([]);
    await prisma.coberturaSede.create({ data: { sedeId: s.id, distritoId: 'DIS-03' } });
    expect(await sedes.elegibles('samu', 'DIS-03', 'emergencia-medica')).toEqual([s.id]);
  });
});

describe('Identidad: sede designable', () => {
  it('acepta una sede habilitada de la institucion aunque no cubra el distrito ni la categoria', async () => {
    const s = await crearSedeDePrueba(prisma, { institucion: 'samu', distritos: ['DIS-05'] });
    expect(await sedes.designable(s.id, 'samu')).toEqual([]);
  });

  it('lista los requisitos incumplidos', async () => {
    const s = await crearSedeDePrueba(prisma, { institucion: 'pnp', habilitada: false, operadores: ['suspendido'] });
    expect(await sedes.designable(s.id, 'samu')).toEqual(['misma_institucion', 'sede_habilitada', 'operador_activo']);
    expect(await sedes.designable(randomUUID(), 'samu')).toEqual(['sede_existente']);
    expect(await sedes.designable('no-es-uuid', 'samu')).toEqual(['sede_existente']);
    expect(await sedes.designable(s.id, 'ejercito')).toEqual(['misma_institucion']);
  });
});

describe('Reportes: lecturas para el enrutamiento', () => {
  async function registrar(extra: Record<string, unknown>) {
    const res = await request(app)
      .post('/api/v1/incidentes')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', randomUUID())
      .send(JSON.stringify({
        categoriaId: 'accidente-transito',
        descripcion: 'Choque entre dos autos en la avenida',
        ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
        punto: { latitud: -13.16, longitud: -74.22, origen: 'manual' },
        telefonoContacto: '987654321',
        ...extra,
      }));
    expect(res.status).toBe(201);
    return (await prisma.incidente.findUniqueOrThrow({ where: { referencia: res.body.referencia } })).id;
  }

  it('datosEnrutamiento devuelve categoria, territorio y respuestas; null si no existe', async () => {
    const id = await registrar({ heridos: 'si', atencionMedica: 'no_se' });
    const datos = await reportes.lectura!.datosEnrutamiento(id);
    expect(datos).toMatchObject({ categoriaId: 'accidente-transito', heridos: 'si', atencionMedica: 'no_se' });
    expect(Object.keys(datos!).sort()).toEqual(['atencionMedica', 'categoriaId', 'heridos', 'recibidoEn', 'territorio']);
    expect(await reportes.lectura!.datosEnrutamiento(randomUUID())).toBeNull();
  });

  it('resumenOperativo no incluye telefono, coordenadas, autor ni huellas', async () => {
    const id = await registrar({ heridos: 'no' });
    const mapa = await reportes.lectura!.resumenOperativo([id, randomUUID()]);
    expect(mapa.size).toBe(1);
    const r = mapa.get(id)!;
    expect(Object.keys(r).sort()).toEqual([
      'atencionMedica', 'categoriaId', 'descripcion', 'heridos', 'incidenteId', 'ocurrencia', 'recibidoEn', 'territorio',
    ]);
    expect(JSON.stringify(r)).not.toMatch(/987654321|-13\.16|-74\.22/);
    expect((await reportes.lectura!.resumenOperativo([])).size).toBe(0);
  });
});
