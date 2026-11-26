import 'dotenv/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { PrismaUnidadDeTrabajo } from '../../src/compartido/prisma-transaccion';
import { crearModuloOperacionesConPrisma, FORMATO_REFERENCIA, ReferenciaNoDisponibleError } from '../../src/modules/operaciones';
import { crearPrismaClient, type PrismaClient } from '../../src/modules/identidad/infraestructura/prisma-cliente';
import { urlPruebas } from './arnes';

let prisma: PrismaClient;

/** Fuente determinista: devuelve en orden los bloques indicados (cada uno, 7 bytes). */
function fuente(...bloques: number[]): (n: number) => Uint8Array {
  let i = 0;
  return (n) => new Uint8Array(n).fill(bloques[Math.min(i++, bloques.length - 1)]!);
}

beforeAll(() => {
  prisma = crearPrismaClient(urlPruebas());
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE incidentes CASCADE');
});

describe('incidente unico (Operaciones)', () => {
  it('crea un incidente REGISTRADO con referencia publica dentro de la transaccion del llamador', async () => {
    const { incidentes } = crearModuloOperacionesConPrisma(prisma);
    const creado = await new PrismaUnidadDeTrabajo(prisma).enTransaccion((tx) => incidentes.crear(tx));
    expect(creado.estado).toBe('REGISTRADO');
    expect(creado.referencia).toMatch(FORMATO_REFERENCIA);
    expect(await incidentes.porReferencia(creado.referencia)).toEqual(creado);
    expect((await incidentes.estados([creado.id])).get(creado.id)).toEqual({
      referencia: creado.referencia,
      estado: 'REGISTRADO',
      registradoEn: creado.registradoEn,
    });
  });

  it('una colision de referencia se reintenta sin abortar la transaccion', async () => {
    // Bytes 0x11 en los dos primeros intentos (misma referencia), luego 0x22.
    const { incidentes } = crearModuloOperacionesConPrisma(prisma, fuente(0x11, 0x11, 0x22));
    const [a, b] = await new PrismaUnidadDeTrabajo(prisma).enTransaccion(async (tx) => {
      const primero = await incidentes.crear(tx);
      const segundo = await incidentes.crear(tx);
      return [primero, segundo];
    });
    expect(a!.referencia).not.toBe(b!.referencia);
    expect(await prisma.incidente.count()).toBe(2);
  });

  it('tras cinco colisiones falla sin dejar filas', async () => {
    const { incidentes } = crearModuloOperacionesConPrisma(prisma, fuente(0x33));
    await new PrismaUnidadDeTrabajo(prisma).enTransaccion((tx) => incidentes.crear(tx));
    await expect(new PrismaUnidadDeTrabajo(prisma).enTransaccion((tx) => incidentes.crear(tx))).rejects.toThrow(
      ReferenciaNoDisponibleError,
    );
    expect(await prisma.incidente.count()).toBe(1);
  });

  it('si la transaccion del llamador se revierte no queda incidente', async () => {
    const { incidentes } = crearModuloOperacionesConPrisma(prisma);
    await expect(
      new PrismaUnidadDeTrabajo(prisma).enTransaccion(async (tx) => {
        await incidentes.crear(tx);
        throw new Error('fallo posterior');
      }),
    ).rejects.toThrow('fallo posterior');
    expect(await prisma.incidente.count()).toBe(0);
  });

  it('lecturas de referencias o ids inexistentes no devuelven datos', async () => {
    const { incidentes } = crearModuloOperacionesConPrisma(prisma);
    expect(await incidentes.porReferencia('INC-00000-00000')).toBeNull();
    expect((await incidentes.estados(['00000000-0000-4000-8000-000000000000'])).size).toBe(0);
    expect((await incidentes.estados([])).size).toBe(0);
  });
});
