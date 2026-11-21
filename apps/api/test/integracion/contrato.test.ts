import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { resolve } from 'node:path';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CuentasPort } from '../../src/modules/identidad/aplicacion/puertos/cuentas.port';
import type { SesionesPort } from '../../src/modules/identidad/aplicacion/puertos/sesiones.port';
import { ServicioNoDisponibleError } from '../../src/modules/identidad/dominio/errores';
import { crearPrismaClient } from '../../src/modules/identidad/infraestructura/prisma-cliente';
import { CLAVE, crearArnes, limpiarBd, RUTA_LOGIN, RUTA_REGISTRO, RUTA_SESION, urlPruebas } from './arnes';

/**
 * Valida las respuestas reales de la API contra openapi.yaml y comprueba que cada estado
 * documentado por operacion se ejercita al menos una vez (contrato <-> implementacion).
 */
const { prisma } = crearArnes();

interface Esquema { [clave: string]: unknown }
interface Operacion { responses: Record<string, { headers?: Record<string, unknown>; content?: Record<string, { schema: Esquema }> }> }
let api: { paths: Record<string, Record<string, Operacion>> };
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const vistos = new Set<string>();

function verificar(ruta: string, metodo: string, r: Response): void {
  const operacion = api.paths[ruta]?.[metodo];
  expect(operacion, `operacion documentada ${metodo.toUpperCase()} ${ruta}`).toBeDefined();
  const doc = operacion!.responses[String(r.status)];
  expect(doc, `${metodo.toUpperCase()} ${ruta} -> ${r.status} debe estar documentado`).toBeDefined();
  const esquema = doc!.content?.['application/json']?.schema;
  if (esquema) {
    const valido = ajv.validate(esquema, r.body);
    expect(valido, JSON.stringify(ajv.errors)).toBe(true);
  } else {
    expect(r.text).toBe('');
  }
  for (const cabecera of Object.keys(doc!.headers ?? {})) {
    expect(r.headers[cabecera.toLowerCase()], `cabecera ${cabecera} documentada`).toBeDefined();
  }
  if (r.headers['retry-after'] !== undefined) expect(Number(r.headers['retry-after'])).toBeGreaterThanOrEqual(1);
  vistos.add(`${metodo.toUpperCase()} ${ruta} ${r.status}`);
}

const REG = '/auth/ciudadanos/registro';
const LOG = '/auth/ciudadanos/sesiones';
const SES = '/auth/sesion';
const alta = (n = 1) => ({ nombre: 'Rosa', correo: `u${n}@ejemplo.com`, contrasena: CLAVE });
const reventada = () => Promise.reject(new Error('interno'));
const noDisponible = () => Promise.reject(new ServicioNoDisponibleError(new Error('bd')));

beforeAll(async () => {
  api = (await SwaggerParser.dereference(resolve(__dirname, '../../openapi.yaml'))) as unknown as typeof api;
  await limpiarBd(prisma);
});
beforeEach(async () => {
  await limpiarBd(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('respuestas reales conforme a openapi.yaml', () => {
  it('flujo principal y errores de cliente', async () => {
    const { app } = crearArnes({ prisma });
    verificar(REG, 'post', await request(app).post(RUTA_REGISTRO).send(alta()));
    verificar(REG, 'post', await request(app).post(RUTA_REGISTRO).send(alta())); // 409
    verificar(REG, 'post', await request(app).post(RUTA_REGISTRO).send({})); // 400
    verificar(REG, 'post', await request(app).post(RUTA_REGISTRO).send({ ...alta(2), rol: 'administrador' })); // 400 extra
    verificar(REG, 'post', await request(app).post(RUTA_REGISTRO).set('Content-Type', 'text/plain').send('x')); // 415
    verificar(REG, 'post', await request(app).post(RUTA_REGISTRO).send({ ...alta(3), nombre: 'a'.repeat(9000) })); // 413

    const login = await request(app).post(RUTA_LOGIN).send({ correo: 'u1@ejemplo.com', contrasena: CLAVE });
    verificar(LOG, 'post', login); // 200
    verificar(LOG, 'post', await request(app).post(RUTA_LOGIN).send({ correo: 'u1@ejemplo.com', contrasena: 'incorrecta-pero-larga' })); // 401
    verificar(LOG, 'post', await request(app).post(RUTA_LOGIN).send({ correo: 'x' })); // 400
    verificar(LOG, 'post', await request(app).post(RUTA_LOGIN).set('Content-Type', 'text/plain').send('x')); // 415
    verificar(LOG, 'post', await request(app).post(RUTA_LOGIN).send({ correo: 'a@ejemplo.com', contrasena: 'a'.repeat(9000) })); // 413

    const auth = { Authorization: `Bearer ${login.body.token}` };
    verificar(SES, 'get', await request(app).get(RUTA_SESION).set(auth)); // 200
    verificar(SES, 'get', await request(app).get(RUTA_SESION)); // 401
    verificar(SES, 'delete', await request(app).delete(RUTA_SESION).set(auth)); // 204
    verificar(SES, 'delete', await request(app).delete(RUTA_SESION).set(auth)); // 204 repetido
  });

  it('429 con Retry-After', async () => {
    const { app } = crearArnes({ prisma, politica: { registroPorIp: 1, loginPorIp: 1, loginPorCorreoIp: 1 } });
    await request(app).post(RUTA_REGISTRO).send(alta(10));
    verificar(REG, 'post', await request(app).post(RUTA_REGISTRO).send(alta(11)));
    await request(app).post(RUTA_LOGIN).send({ correo: 'u10@ejemplo.com', contrasena: CLAVE });
    verificar(LOG, 'post', await request(app).post(RUTA_LOGIN).send({ correo: 'u10@ejemplo.com', contrasena: CLAVE }));
  });

  it('503 y 500 en todas las operaciones', async () => {
    const cuentas: CuentasPort = { crearCiudadano: noDisponible, buscarPorCorreo: noDisponible, buscarPorId: noDisponible };
    const sesiones: SesionesPort = { crearSiUsuarioHabilitado: noDisponible, buscarVigente: noDisponible, revocar: noDisponible };
    const a503 = crearArnes({ prisma, sobrescribir: { cuentas, sesiones } }).app;
    verificar(REG, 'post', await request(a503).post(RUTA_REGISTRO).send(alta(20)));
    verificar(LOG, 'post', await request(a503).post(RUTA_LOGIN).send({ correo: 'u20@ejemplo.com', contrasena: CLAVE }));
    verificar(SES, 'get', await request(a503).get(RUTA_SESION).set('Authorization', 'Bearer abc'));
    verificar(SES, 'delete', await request(a503).delete(RUTA_SESION).set('Authorization', 'Bearer abc'));

    const cuentas500: CuentasPort = { crearCiudadano: reventada, buscarPorCorreo: reventada, buscarPorId: reventada };
    const sesiones500: SesionesPort = { crearSiUsuarioHabilitado: reventada, buscarVigente: reventada, revocar: reventada };
    const a500 = crearArnes({ prisma, sobrescribir: { cuentas: cuentas500, sesiones: sesiones500 } }).app;
    verificar(REG, 'post', await request(a500).post(RUTA_REGISTRO).send(alta(21)));
    verificar(LOG, 'post', await request(a500).post(RUTA_LOGIN).send({ correo: 'u21@ejemplo.com', contrasena: CLAVE }));
    verificar(SES, 'get', await request(a500).get(RUTA_SESION).set('Authorization', 'Bearer abc'));
    verificar(SES, 'delete', await request(a500).delete(RUTA_SESION).set('Authorization', 'Bearer abc'));
    expect(urlPruebas()).toBeTruthy();
    expect(crearPrismaClient).toBeDefined();
  });

  it('todos los estados documentados fueron ejercitados y ninguna respuesta real quedo sin documentar', () => {
    const documentados = new Set<string>();
    for (const [ruta, metodos] of Object.entries(api.paths)) {
      for (const [metodo, op] of Object.entries(metodos)) {
        for (const estado of Object.keys(op.responses)) documentados.add(`${metodo.toUpperCase()} ${ruta} ${estado}`);
      }
    }
    const sinEjercitar = [...documentados].filter((d) => !vistos.has(d));
    expect(sinEjercitar).toEqual([]);
    const sinDocumentar = [...vistos].filter((v) => !documentados.has(v));
    expect(sinDocumentar).toEqual([]);
  });
});
