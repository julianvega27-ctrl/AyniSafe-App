import 'dotenv/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { CorreoEnUsoError, ServicioNoDisponibleError } from '../../src/modules/identidad/dominio/errores';
import { validarRegistro } from '../../src/modules/identidad/dominio/validacion';
import { PrismaCuentasAdapter } from '../../src/modules/identidad/infraestructura/prisma-cuentas.adapter';
import {
  crearPrismaClient,
  type PrismaClient,
} from '../../src/modules/identidad/infraestructura/prisma-cliente';

const url = process.env.TEST_DATABASE_URL;
let prisma: PrismaClient;
let cuentas: PrismaCuentasAdapter;

const datos = (correoNormalizado: string, nombre = 'Rosa') => ({
  nombre,
  correoNormalizado,
  passwordHash: '$argon2id$hash-de-prueba',
});

async function contarUsuarios(): Promise<number> {
  return prisma.usuario.count();
}

beforeAll(() => {
  if (!url) throw new Error('Falta TEST_DATABASE_URL (ver README de la API).');
  prisma = crearPrismaClient(url);
  cuentas = new PrismaCuentasAdapter(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE sesiones, usuarios, ventanas_intentos CASCADE');
});

describe('alta de ciudadano', () => {
  it('fija rol ciudadano y estado activo sin que el llamador los elija', async () => {
    const usuario = await cuentas.crearCiudadano(datos('rosa@ejemplo.com'));
    expect(usuario.rol).toBe('ciudadano');
    expect(usuario.estado).toBe('activo');
    expect(usuario.id).toMatch(/^[0-9a-f-]{36}$/);
    const fila = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });
    expect(fila.rol).toBe('ciudadano');
    expect(fila.estado).toBe('activo');
  });

  it('traduce el conflicto de unicidad a CorreoEnUsoError', async () => {
    await cuentas.crearCiudadano(datos('rosa@ejemplo.com'));
    await expect(cuentas.crearCiudadano(datos('rosa@ejemplo.com', 'Otra'))).rejects.toBeInstanceOf(
      CorreoEnUsoError,
    );
    expect(await contarUsuarios()).toBe(1);
  });

  it('carrera de dos registros con variaciones del mismo correo: una cuenta y un conflicto', async () => {
    const claves = [' Vecina@Ejemplo.com ', 'vecina@ejemplo.com'].map((correo) => {
      const r = validarRegistro({ nombre: 'Rosa', correo, contrasena: 'una clave bien larga' });
      if (!r.ok) throw new Error('entrada de prueba invalida');
      return r.valor.correoNormalizado;
    });
    const resultados = await Promise.allSettled(claves.map((c) => cuentas.crearCiudadano(datos(c))));
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazos = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rechazos).toHaveLength(1);
    expect(rechazos[0]!.reason).toBeInstanceOf(CorreoEnUsoError);
    expect(await contarUsuarios()).toBe(1);
  });

  it('carrera con muchas solicitudes simultaneas: exactamente una cuenta', async () => {
    const resultados = await Promise.allSettled(
      Array.from({ length: 12 }, () => cuentas.crearCiudadano(datos('carrera@ejemplo.com'))),
    );
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of resultados) {
      if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(CorreoEnUsoError);
    }
    expect(await contarUsuarios()).toBe(1);
  });

  it('un fallo antes del commit no deja cuenta parcial (rollback)', async () => {
    // Simula el fallo tras insertar y antes de confirmar: la transaccion real ejecuta el alta
    // y lanza dentro del mismo bloque, de modo que PostgreSQL debe deshacerla.
    const conFallo = {
      $transaction: (trabajo: (tx: unknown) => Promise<unknown>) =>
        prisma.$transaction(async (tx) => {
          await trabajo(tx);
          throw new Error('fallo simulado antes del commit');
        }),
    } as unknown as PrismaClient;
    const adapter = new PrismaCuentasAdapter(conFallo);

    const error = await adapter.crearCiudadano(datos('parcial@ejemplo.com')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServicioNoDisponibleError);
    expect(await contarUsuarios()).toBe(0);
    // El correo queda libre: un alta posterior correcta es posible.
    await expect(cuentas.crearCiudadano(datos('parcial@ejemplo.com'))).resolves.toBeDefined();
  });

  it('un fallo de almacenamiento se reporta como ServicioNoDisponibleError sin detalles', async () => {
    const sinBd = crearPrismaClient('postgresql://nadie:nada@127.0.0.1:1/inexistente');
    try {
      const error = await new PrismaCuentasAdapter(sinBd)
        .crearCiudadano(datos('x@ejemplo.com'))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ServicioNoDisponibleError);
      expect((error as Error).message).toBe('Servicio no disponible');
      expect((error as Error).message).not.toContain('127.0.0.1');
    } finally {
      await sinBd.$disconnect();
    }
  });
});

describe('consultas', () => {
  it('busca por correo normalizado y por id', async () => {
    const creado = await cuentas.crearCiudadano(datos('buscar@ejemplo.com'));
    expect((await cuentas.buscarPorCorreo('buscar@ejemplo.com'))?.id).toBe(creado.id);
    expect((await cuentas.buscarPorId(creado.id))?.correoNormalizado).toBe('buscar@ejemplo.com');
    expect(await cuentas.buscarPorCorreo('nadie@ejemplo.com')).toBeNull();
  });
});
