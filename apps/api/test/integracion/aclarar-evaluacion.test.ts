import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { PrismaPublicadorEventos } from '../../src/compartido/eventos/prisma-eventos';
import { PrismaUnidadDeTrabajo } from '../../src/compartido/prisma-transaccion';
import {
  AclaracionNoDisponibleError,
  AclararEvaluacion,
  EvaluacionCerradaError,
  EvaluacionNoEncontradaError,
} from '../../src/modules/reportes/aplicacion/aclarar-evaluacion.use-case';
import type { CondicionMedicaPort } from '../../src/modules/reportes/aplicacion/puertos/evaluacion.port';
import { ValidacionEvaluacionError } from '../../src/modules/reportes/dominio/evaluacion';
import { PrismaEvaluacionesAdapter } from '../../src/modules/reportes/infraestructura/prisma-evaluaciones.adapter';
import { CLAVE, crearArnes, limpiarBd, RUTA_LOGIN, RUTA_REGISTRO } from './arnes';

/**
 * P5.1, tarea 4.2: AclararEvaluacion con PostgreSQL real y un doble del puerto de condicion medica.
 * La integracion real con Operaciones se prueba en el grupo 5.
 */
const { app, prisma } = crearArnes();
const evaluaciones = new PrismaEvaluacionesAdapter(prisma);
const llamadas: Parameters<CondicionMedicaPort['aplicar']>[1][] = [];
let fallarCondicion = false;
let despertado = 0;
const condicion: CondicionMedicaPort = {
  async aplicar(_tx, cambio) {
    llamadas.push(cambio);
    if (fallarCondicion) throw new Error('fallo del recalculo');
    return { samuIncorporado: false };
  },
};
const caso = new AclararEvaluacion({
  evaluaciones,
  incidentes: {
    async estados(ids) {
      const filas = await prisma.incidente.findMany({ where: { id: { in: [...ids] } } });
      return new Map(filas.map((f) => [f.id, { referencia: f.referencia, estado: f.estado, registradoEn: f.registradoEn }]));
    },
  },
  condicion,
  eventos: new PrismaPublicadorEventos(),
  unidadDeTrabajo: new PrismaUnidadDeTrabajo(prisma),
  despertarEntregas: () => {
    despertado += 1;
  },
});

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
  llamadas.length = 0;
  fallarCondicion = false;
  despertado = 0;
});

let autor: { id: string; token: string };
async function incidente(extra: Record<string, unknown>): Promise<string> {
  const correo = `c-${randomUUID().slice(0, 8)}@ejemplo.com`;
  const alta = await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
  const login = await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE });
  autor = { id: alta.body.usuario.id as string, token: login.body.token as string };
  const r = await request(app)
    .post('/api/v1/incidentes')
    .set('Idempotency-Key', randomUUID())
    .set('Authorization', `Bearer ${autor.token}`)
    .send({
      categoriaId: 'accidente-transito',
      descripcion: 'Choque en la avenida principal',
      ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
      punto: { latitud: 1, longitud: 1, origen: 'manual' },
      ...extra,
    });
  expect(r.status).toBe(201);
  return (await prisma.incidente.findUniqueOrThrow({ where: { referencia: r.body.referencia } })).id;
}

const ciudadano = () => ({ origen: 'ciudadano' as const, institucion: null, usuarioId: autor.id });
async function operador(institucion: string): Promise<{ origen: 'operador'; institucion: string; usuarioId: string }> {
  const u = await prisma.usuario.create({
    data: { nombre: 'Operador', correoNormalizado: `op-${randomUUID().slice(0, 8)}@ejemplo.com`, rol: 'operador', estado: 'activo', passwordHash: 'hash' },
  });
  return { origen: 'operador', institucion, usuarioId: u.id };
}

describe('AclararEvaluacion', () => {
  it('crea versiones consecutivas con origen, institucion y campos modificados', async () => {
    const id = await incidente({ heridos: 'no_se' });
    const r2 = await caso.ejecutar(id, ciudadano(), { heridos: 'si', cantidadHeridos: 2 });
    const samu = await operador('samu');
    const r3 = await caso.ejecutar(id, samu, { personaPrincipal: { consciente: 'no' }, motivo: 'Informe de la unidad en sitio' });
    expect([r2.version, r3.version]).toEqual([2, 3]);
    expect(r3.instantanea).toMatchObject({ heridos: 'si', cantidadHeridos: 2, consciente: 'no' });

    const historial = await evaluaciones.historial(id);
    expect(historial.map((v) => [v.version, v.origen, v.institucion, v.modificados])).toEqual([
      [1, 'ciudadano', null, []],
      [2, 'ciudadano', null, ['heridos', 'cantidadHeridos']],
      [3, 'operador', 'samu', ['consciente']],
    ]);
    expect(historial[2]?.motivo).toBe('Informe de la unidad en sitio');
    expect((await prisma.evaluacionIncidente.findUniqueOrThrow({ where: { incidenteId: id } })).versionVigente).toBe(3);
    expect(llamadas.map((l) => [l.versionEvaluacion, l.heridos, l.actor.tipo])).toEqual([
      [2, 'si', 'ciudadano'],
      [3, 'si', 'operador'],
    ]);
    expect(despertado).toBe(2);
  });

  it('una aclaracion identica no crea version, ni evento, ni recalculo', async () => {
    const id = await incidente({ heridos: 'si', evaluacion: { cantidadHeridos: 3 } });
    const eventosAntes = await prisma.evento.count();
    const r = await caso.ejecutar(id, ciudadano(), { heridos: 'si', cantidadHeridos: 3 });
    expect(r).toMatchObject({ nueva: false, version: 1 });
    expect(await prisma.versionEvaluacion.count()).toBe(1);
    expect(await prisma.evento.count()).toBe(eventosAntes);
    expect(llamadas).toHaveLength(0);
    expect(despertado).toBe(0);
  });

  it('dos aclaraciones concurrentes sobre campos distintos crean versiones consecutivas y conservan ambos cambios', async () => {
    const id = await incidente({ heridos: 'si' });
    const samu = await operador('samu');
    const resultados = await Promise.all([
      caso.ejecutar(id, ciudadano(), { cantidadHeridos: 5 }),
      caso.ejecutar(id, samu, { personaPrincipal: { sangrado: 'si' }, motivo: 'Observado por la unidad' }),
    ]);
    expect(resultados.map((r) => r.version).sort()).toEqual([2, 3]);
    const vigente = await prisma.evaluacionIncidente.findUniqueOrThrow({ where: { incidenteId: id } });
    expect(vigente).toMatchObject({ versionVigente: 3, cantidadHeridos: 5, sangrado: 'si' });
    expect((await evaluaciones.historial(id)).map((v) => v.version)).toEqual([1, 2, 3]);
  });

  it('el evento EvaluacionActualizada solo lleva incidente, version y origen', async () => {
    const id = await incidente({ heridos: 'no_se' });
    const samu = await operador('samu');
    await caso.ejecutar(id, samu, { heridos: 'si', motivo: 'Confirmado por llamada al lugar' });
    const evento = await prisma.evento.findFirstOrThrow({ where: { tipo: 'EvaluacionActualizada' } });
    expect(evento.carga).toEqual({ incidenteId: id, version: 2, origen: 'operador' });
    expect(Object.keys(evento.carga as object).sort()).toEqual(['incidenteId', 'origen', 'version']);
    expect(JSON.stringify(evento.carga)).not.toContain('Confirmado');
  });

  it('un fallo del recalculo revierte la version y el evento', async () => {
    const id = await incidente({ heridos: 'no_se' });
    fallarCondicion = true;
    await expect(caso.ejecutar(id, ciudadano(), { heridos: 'si' })).rejects.toThrow(AclaracionNoDisponibleError);
    expect(await prisma.versionEvaluacion.count()).toBe(1);
    expect(await prisma.evento.count({ where: { tipo: 'EvaluacionActualizada' } })).toBe(0);
    expect((await prisma.evaluacionIncidente.findUniqueOrThrow({ where: { incidenteId: id } })).heridos).toBe('no_se');
  });

  it('errores: sin evaluacion, inexistente, cerrado y cuerpo invalido', async () => {
    const robo = await incidente({ categoriaId: 'robo' });
    await expect(caso.ejecutar(robo, ciudadano(), { heridos: 'si' })).rejects.toThrow(EvaluacionNoEncontradaError);
    await expect(caso.ejecutar(randomUUID(), ciudadano(), { heridos: 'si' })).rejects.toThrow(EvaluacionNoEncontradaError);

    const id = await incidente({ heridos: 'no_se' });
    await expect(caso.ejecutar(id, ciudadano(), { heridos: 'quizas' })).rejects.toThrow(ValidacionEvaluacionError);
    await prisma.incidente.update({ where: { id }, data: { estado: 'CERRADO', resultado: 'DESCARTADO', resumenCiudadano: 'Cierre de prueba del caso.', cerradoEn: new Date() } });
    await expect(caso.ejecutar(id, ciudadano(), { heridos: 'si' })).rejects.toThrow(EvaluacionCerradaError);
  });
});
