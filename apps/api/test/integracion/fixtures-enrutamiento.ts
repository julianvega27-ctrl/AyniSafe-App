import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaTerritorioAdapter } from '../../src/modules/consultas/infraestructura/prisma-territorio.adapter';
import { paqueteSintetico } from '../fixtures/territorio';
import { CLAVE, cookieDe, crearCuentaDePrueba, ORIGEN_WEB_PRUEBA, RUTA_INST_SESIONES, type CuentaDePrueba } from './arnes';

/**
 * Fixtures de organizacion para el enrutamiento (P4.2). Insertan directamente sedes, coberturas,
 * competencias y operadores: la administracion por HTTP ya se prueba en organizacion.test.ts.
 */
export interface SedeDePrueba {
  readonly id: string;
  readonly operadores: readonly CuentaDePrueba[];
}

export async function administradorDePrueba(prisma: PrismaClient): Promise<CuentaDePrueba> {
  return crearCuentaDePrueba(prisma, { rol: 'administrador' });
}

export async function crearSedeDePrueba(
  prisma: PrismaClient,
  datos: {
    readonly institucion: 'pnp' | 'bomberos' | 'samu' | 'serenazgo';
    readonly distritos?: readonly string[];
    readonly categorias?: readonly string[];
    readonly habilitada?: boolean;
    readonly activa?: boolean;
    readonly operadores?: readonly ('activo' | 'suspendido' | 'pendiente_activacion')[];
    readonly creadoPor?: string;
  },
): Promise<SedeDePrueba> {
  const creadoPor = datos.creadoPor ?? (await administradorDePrueba(prisma)).id;
  const nombre = `Sede ${datos.institucion} ${randomUUID().slice(0, 8)}`;
  const sede = await prisma.sede.create({
    data: {
      institucionId: datos.institucion,
      nombre,
      nombreNormalizado: nombre.toLowerCase(),
      verificacion: 'verificada',
      fuenteVerificacion: 'Fixture de pruebas',
      verificadaEn: new Date('2026-11-20'),
      habilitadaAtencion: datos.habilitada ?? true,
      activa: datos.activa ?? true,
      creadoPor,
    },
  });
  for (const distritoId of datos.distritos ?? ['DIS-01']) {
    await prisma.coberturaSede.create({ data: { sedeId: sede.id, distritoId } });
  }
  for (const categoriaId of datos.categorias ?? []) {
    await prisma.competenciaSede.create({ data: { sedeId: sede.id, categoriaId } });
  }
  const operadores: CuentaDePrueba[] = [];
  for (const estado of datos.operadores ?? ['activo']) {
    const cuenta = await crearCuentaDePrueba(prisma, { rol: 'operador', estado });
    await prisma.pertenenciaOperador.create({ data: { usuarioId: cuenta.id, sedeId: sede.id } });
    operadores.push(cuenta);
  }
  return { id: sede.id, operadores };
}

/** Paquete sintetico: DIS-01 es el cuadrado lon 0..2, lat 0..2; DIS-02, lon 4..6. */
export const PUNTO_DIS01 = { latitud: 1, longitud: 1, origen: 'manual' };
export const PUNTO_DIS02 = { latitud: 1, longitud: 5, origen: 'manual' };
export const PUNTO_FUERA = { latitud: 1, longitud: 3, origen: 'manual' };

export async function activarTerritorio(prisma: PrismaClient): Promise<void> {
  await new PrismaTerritorioAdapter(prisma).importar(paqueteSintetico().preparado, true);
}

/** Registra un incidente de invitado por HTTP y devuelve su id y referencia. */
export async function registrarIncidente(
  app: Express,
  prisma: PrismaClient,
  datos: Record<string, unknown> = {},
): Promise<{ id: string; referencia: string; codigo: string }> {
  const res = await request(app)
    .post('/api/v1/incidentes')
    .set('Content-Type', 'application/json')
    .set('Idempotency-Key', randomUUID())
    .send(JSON.stringify({
      categoriaId: 'robo',
      descripcion: 'Me arrebataron el celular en la esquina',
      ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
      punto: PUNTO_DIS01,
      telefonoContacto: '987654321',
      ...datos,
    }));
  if (res.status !== 201) throw new Error(`Registro fallido: ${res.status} ${JSON.stringify(res.body)}`);
  const inc = await prisma.incidente.findUniqueOrThrow({ where: { referencia: res.body.referencia } });
  return { id: inc.id, referencia: inc.referencia, codigo: res.body.codigoSeguimiento as string };
}

/** Inicia sesion institucional por HTTP con una cuenta ya creada (contrasena CLAVE del arnes). */
export async function cookieInstitucional(app: Express, correo: string): Promise<string> {
  const r = await request(app).post(RUTA_INST_SESIONES).set('Origin', ORIGEN_WEB_PRUEBA).send({ correo, contrasena: CLAVE });
  const valor = cookieDe(r);
  if (r.status !== 200 || !valor) throw new Error(`Ingreso institucional fallido: ${r.status}`);
  return `__Host-ayni_inst=${valor}`;
}
