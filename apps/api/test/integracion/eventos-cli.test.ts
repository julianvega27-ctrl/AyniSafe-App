import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { ejecutar } from '../../scripts/eventos';
import { crearPrismaClient, type PrismaClient } from '../../src/modules/identidad/infraestructura/prisma-cliente';
import { urlPruebas } from './arnes';

let prisma: PrismaClient;

async function entregaFallida(consumidor: string): Promise<string> {
  const id = randomUUID();
  await prisma.$executeRaw`INSERT INTO eventos (id, tipo, version, agregado_id, carga)
    VALUES (${id}::uuid, 'IncidenteRegistrado', 1, gen_random_uuid(), '{}'::jsonb)`;
  await prisma.$executeRaw`INSERT INTO entregas_evento (evento_id, consumidor, estado, intentos, ultimo_error)
    VALUES (${id}::uuid, ${consumidor}, 'fallida', 8, 'FalloPrueba')`;
  return id;
}

beforeAll(() => {
  prisma = crearPrismaClient(urlPruebas());
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE entregas_evento, eventos CASCADE');
});

describe('CLI de eventos', () => {
  it('estado cuenta entregas por consumidor y estado', async () => {
    await entregaFallida('prueba.a');
    await entregaFallida('prueba.a');
    const salida = JSON.parse(await ejecutar(['estado'], prisma));
    expect(salida).toEqual({ accion: 'estado', entregas: [{ consumidor: 'prueba.a', estado: 'fallida', total: 2 }] });
  });

  it('reintentar devuelve a pendiente las fallidas de un consumidor o de un evento concreto', async () => {
    const e1 = await entregaFallida('prueba.a');
    await entregaFallida('prueba.a');
    await entregaFallida('prueba.b');
    expect(JSON.parse(await ejecutar(['reintentar', '--consumidor', 'prueba.a', '--evento', e1], prisma)))
      .toEqual({ accion: 'reintentar', consumidor: 'prueba.a', evento: e1, reintentadas: 1 });
    expect(JSON.parse(await ejecutar(['reintentar', '--consumidor', 'prueba.a'], prisma)).reintentadas).toBe(1);
    const pendientes = await prisma.entregaEvento.findMany({ where: { estado: 'pendiente' } });
    expect(pendientes.map((p) => p.consumidor).sort()).toEqual(['prueba.a', 'prueba.a']);
    expect(pendientes.every((p) => p.intentos === 0 && p.ultimoError === null)).toBe(true);
  });

  it.each([
    [[]],
    [['borrar']],
    [['estado', 'extra']],
    [['reintentar']],
    [['reintentar', '--consumidor']],
    [['reintentar', '--consumidor', 'Con Mayus']],
    [['reintentar', '--consumidor', 'a', '--evento', 'no-uuid']],
    [['reintentar', '--consumidor', 'a', '--otro', 'x']],
    [['reintentar', '--consumidor', 'a', '--consumidor', 'b']],
  ])('rechaza argumentos no validos %j sin tocar la base', async (args) => {
    await entregaFallida('a');
    await expect(ejecutar(args, prisma)).rejects.toThrow(/^Uso:/);
    expect(await prisma.entregaEvento.count({ where: { estado: 'fallida' } })).toBe(1);
  });
});
