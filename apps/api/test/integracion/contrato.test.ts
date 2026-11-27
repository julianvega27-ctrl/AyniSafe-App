import { expectConContexto } from '../expect-contexto';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { resolve } from 'node:path';
import request, { type Response } from 'supertest';
import { PrismaTerritorioAdapter } from '../../src/modules/consultas/infraestructura/prisma-territorio.adapter';
import { paqueteSintetico } from '../fixtures/territorio';
import { jpegRuido } from '../fixtures/imagenes';
import { crearApp } from '../../src/app';
import { crearModuloConsultas } from '../../src/modules/consultas';
import { crearModuloReportes } from '../../src/modules/reportes';
import express from 'express';
import { crearRouterAtencion, crearRouterEnrutamiento, type ServicioAtencion, type ServicioEnrutamiento } from '../../src/modules/operaciones';
import { cookieInstitucional, crearSedeDePrueba, registrarIncidente } from './fixtures-enrutamiento';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import type { CuentasPort } from '../../src/modules/identidad/aplicacion/puertos/cuentas.port';
import type { SesionesPort } from '../../src/modules/identidad/aplicacion/puertos/sesiones.port';
import { ServicioNoDisponibleError } from '../../src/modules/identidad/dominio/errores';
import { crearPrismaClient } from '../../src/modules/identidad/infraestructura/prisma-cliente';
import {
  CLAVE,
  cookieDe,
  crearArnes,
  crearCuentaDePrueba,
  limpiarBd,
  ORIGEN_WEB_PRUEBA,
  RelojControlable,
  RUTA_LOGIN,
  RUTA_REGISTRO,
  RUTA_SESION,
  urlPruebas,
} from './arnes';

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
  expectConContexto(operacion, `operacion documentada ${metodo.toUpperCase()} ${ruta}`).toBeDefined();
  const doc = operacion!.responses[String(r.status)];
  expectConContexto(doc, `${metodo.toUpperCase()} ${ruta} -> ${r.status} debe estar documentado`).toBeDefined();
  const esquema = doc!.content?.['application/json']?.schema;
  const binarios = Object.keys(doc!.content ?? {}).filter((t) => t !== 'application/json');
  if (esquema) {
    const valido = ajv.validate(esquema, r.body);
    expectConContexto(valido, JSON.stringify(ajv.errors)).toBe(true);
  } else if (binarios.length) {
    // Contenido binario (fotos, P5.2): el tipo real debe estar documentado.
    expectConContexto(binarios.includes(String(r.headers['content-type']).split(';')[0]!), `tipo ${r.headers['content-type']} documentado`).toBe(true);
  } else {
    expect(r.text).toBe('');
  }
  for (const [cabecera, def] of Object.entries(doc!.headers ?? {})) {
    // Una cabecera marcada `required: false` puede faltar (por ejemplo, Retry-After solo en el 503 por cuota).
    if ((def as { required?: boolean }).required === false) continue;
    expectConContexto(r.headers[cabecera.toLowerCase()], `cabecera ${cabecera} documentada`).toBeDefined();
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
  // Node carga el grafo CJS/ESM del parser fuera del runtime VM de Jest (también en Node 22).
  api = JSON.parse(execFileSync(process.execPath, [resolve(__dirname, '../leer-contrato.mjs')], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })) as typeof api;
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
    const cuentas: CuentasPort = { crearCiudadano: noDisponible, buscarPorCorreo: noDisponible, buscarPorId: noDisponible, obtenerPerfil: noDisponible, actualizarPerfil: noDisponible };
    const sesiones: SesionesPort = { crearSiUsuarioHabilitado: noDisponible, buscarVigente: noDisponible, revocar: noDisponible, revocarTodasDe: noDisponible };
    const a503 = crearArnes({ prisma, sobrescribir: { cuentas, sesiones } }).app;
    verificar(REG, 'post', await request(a503).post(RUTA_REGISTRO).send(alta(20)));
    verificar(LOG, 'post', await request(a503).post(RUTA_LOGIN).send({ correo: 'u20@ejemplo.com', contrasena: CLAVE }));
    verificar(SES, 'get', await request(a503).get(RUTA_SESION).set('Authorization', 'Bearer abc'));
    verificar(SES, 'delete', await request(a503).delete(RUTA_SESION).set('Authorization', 'Bearer abc'));

    const cuentas500: CuentasPort = { crearCiudadano: reventada, buscarPorCorreo: reventada, buscarPorId: reventada, obtenerPerfil: reventada, actualizarPerfil: reventada };
    const sesiones500: SesionesPort = { crearSiUsuarioHabilitado: reventada, buscarVigente: reventada, revocar: reventada, revocarTodasDe: reventada };
    const a500 = crearArnes({ prisma, sobrescribir: { cuentas: cuentas500, sesiones: sesiones500 } }).app;
    verificar(REG, 'post', await request(a500).post(RUTA_REGISTRO).send(alta(21)));
    verificar(LOG, 'post', await request(a500).post(RUTA_LOGIN).send({ correo: 'u21@ejemplo.com', contrasena: CLAVE }));
    verificar(SES, 'get', await request(a500).get(RUTA_SESION).set('Authorization', 'Bearer abc'));
    verificar(SES, 'delete', await request(a500).delete(RUTA_SESION).set('Authorization', 'Bearer abc'));
    expect(urlPruebas()).toBeTruthy();
    expect(crearPrismaClient).toBeDefined();
  });

  it('recuperacion y activacion: cada estado documentado coincide con la respuesta real', async () => {
    const REC = '/auth/recuperaciones';
    const CON = '/auth/tokens/consulta';
    const RES = '/auth/contrasena/restablecer';
    const ACT = '/auth/activaciones';
    const URL_REC = '/api/v1/auth/recuperaciones';
    const URL_CON = '/api/v1/auth/tokens/consulta';
    const URL_RES = '/api/v1/auth/contrasena/restablecer';
    const URL_ACT = '/api/v1/auth/activaciones';
    const NUEVA = 'una contraseña nueva de contrato 8a1';
    const normal = crearArnes({ prisma });
    const { app, modulo, reloj } = normal;
    await request(app).post(RUTA_REGISTRO).send(alta(30)).expect(201);
    const usuarioId = (await prisma.usuario.findUniqueOrThrow({ where: { correoNormalizado: 'u30@ejemplo.com' } })).id;
    const pendienteId = (
      await prisma.usuario.create({
        data: { nombre: 'Inv', correoNormalizado: 'inv30@ejemplo.com', passwordHash: null, rol: 'operador', estado: 'pendiente_activacion' },
      })
    ).id;

    // --- POST /auth/recuperaciones
    verificar(REC, 'post', await request(app).post(URL_REC).send({ correo: 'u30@ejemplo.com' })); // 202
    await modulo.gestorEnvios.esperarReposo();
    verificar(REC, 'post', await request(app).post(URL_REC).send({})); // 400
    verificar(REC, 'post', await request(app).post(URL_REC).set('Content-Type', 'text/plain').send('x')); // 415
    verificar(REC, 'post', await request(app).post(URL_REC).send({ correo: 'a'.repeat(9000) })); // 413

    // --- consulta / restablecer / activaciones: exito y errores de token
    const recuperacion = await modulo.emitirToken.ejecutar(usuarioId, 'recuperacion');
    verificar(CON, 'post', await request(app).post(URL_CON).send({ token: recuperacion.token })); // 200
    verificar(CON, 'post', await request(app).post(URL_CON).send({})); // 400
    verificar(CON, 'post', await request(app).post(URL_CON).send({ token: 'desconocido' })); // 404
    verificar(CON, 'post', await request(app).post(URL_CON).set('Content-Type', 'text/plain').send('x')); // 415
    verificar(CON, 'post', await request(app).post(URL_CON).send({ token: 'a'.repeat(9000) })); // 413

    verificar(RES, 'post', await request(app).post(URL_RES).send({ token: recuperacion.token })); // 400 (falta contrasena)
    verificar(RES, 'post', await request(app).post(URL_RES).send({ token: 'desconocido', contrasena: NUEVA })); // 404
    verificar(RES, 'post', await request(app).post(URL_RES).set('Content-Type', 'text/plain').send('x')); // 415
    verificar(RES, 'post', await request(app).post(URL_RES).send({ token: 'a'.repeat(9000), contrasena: NUEVA })); // 413
    verificar(RES, 'post', await request(app).post(URL_RES).send({ token: recuperacion.token, contrasena: NUEVA })); // 204
    const usado = await request(app).post(URL_CON).send({ token: recuperacion.token });
    verificar(CON, 'post', usado); // 410 usado
    expect(usado.body.error.code).toBe('TOKEN_USED');
    verificar(RES, 'post', await request(app).post(URL_RES).send({ token: recuperacion.token, contrasena: NUEVA })); // 410

    const vencible = await modulo.emitirToken.ejecutar(usuarioId, 'recuperacion');
    reloj.avanzar(31 * 60 * 1000);
    const vencido = await request(app).post(URL_CON).send({ token: vencible.token });
    verificar(CON, 'post', vencido);
    expect(vencido.body.error.code).toBe('TOKEN_EXPIRED');
    reloj.avanzar(-31 * 60 * 1000);

    const activacion = await modulo.emitirToken.ejecutar(pendienteId, 'activacion');
    verificar(ACT, 'post', await request(app).post(URL_ACT).send({ token: activacion.token })); // 400
    verificar(ACT, 'post', await request(app).post(URL_ACT).send({ token: 'desconocido', contrasena: NUEVA })); // 404
    verificar(ACT, 'post', await request(app).post(URL_ACT).set('Content-Type', 'text/plain').send('x')); // 415
    verificar(ACT, 'post', await request(app).post(URL_ACT).send({ token: 'a'.repeat(9000), contrasena: NUEVA })); // 413
    verificar(ACT, 'post', await request(app).post(URL_ACT).send({ token: activacion.token, contrasena: NUEVA })); // 204
    verificar(ACT, 'post', await request(app).post(URL_ACT).send({ token: activacion.token, contrasena: NUEVA })); // 410

    // --- 429
    const limitada = crearArnes({ prisma, politica: { recuperacionPorIp: 1, tokenPorIp: 1 } }).app;
    await request(limitada).post(URL_REC).send({ correo: 'nadie@ejemplo.com' });
    verificar(REC, 'post', await request(limitada).post(URL_REC).send({ correo: 'nadie@ejemplo.com' }));
    await request(limitada).post(URL_CON).send({ token: 'x' });
    verificar(CON, 'post', await request(limitada).post(URL_CON).send({ token: 'x' }));
    verificar(RES, 'post', await request(limitada).post(URL_RES).send({ token: 'x', contrasena: NUEVA }));
    verificar(ACT, 'post', await request(limitada).post(URL_ACT).send({ token: 'x', contrasena: NUEVA }));

    // --- 503 por cuota diaria agotada (con Retry-After) y por dependencia no disponible
    // Otro dia UTC: el contador diario es global y las solicitudes anteriores ya contaron en el actual.
    const sinCuota = crearArnes({ prisma, reloj: new RelojControlable(new Date('2027-01-05T12:00:00.000Z')), politica: { correoDiarioMax: 1 } }).app;
    await request(sinCuota).post(URL_REC).send({ correo: 'nadie@ejemplo.com' }).expect(202);
    const cuota = await request(sinCuota).post(URL_REC).send({ correo: 'nadie@ejemplo.com' });
    verificar(REC, 'post', cuota);
    expect(cuota.headers['retry-after']).toBeDefined();

    const tokensRotos = {
      emitir: noDisponible,
      consultar: noDisponible,
      consumir: noDisponible,
    };
    const a503 = crearArnes({
      prisma,
      sobrescribir: {
        tokensCuenta: tokensRotos,
        cuentas: {
          crearCiudadano: noDisponible, buscarPorCorreo: noDisponible, buscarPorId: noDisponible,
          obtenerPerfil: noDisponible, actualizarPerfil: noDisponible,
        },
      },
    }).app;
    const caida = await request(a503).post(URL_REC).send({ correo: 'u30@ejemplo.com' });
    verificar(REC, 'post', caida);
    expect(caida.headers['retry-after']).toBeUndefined();
    verificar(CON, 'post', await request(a503).post(URL_CON).send({ token: 'abc' }));
    verificar(RES, 'post', await request(a503).post(URL_RES).send({ token: 'abc', contrasena: NUEVA }));
    verificar(ACT, 'post', await request(a503).post(URL_ACT).send({ token: 'abc', contrasena: NUEVA }));

    // --- 500
    const a500 = crearArnes({
      prisma,
      sobrescribir: {
        tokensCuenta: { emitir: reventada, consultar: reventada, consumir: reventada },
        cuentas: { crearCiudadano: reventada, buscarPorCorreo: reventada, buscarPorId: reventada, obtenerPerfil: reventada, actualizarPerfil: reventada },
      },
    }).app;
    verificar(REC, 'post', await request(a500).post(URL_REC).send({ correo: 'u30@ejemplo.com' }));
    verificar(CON, 'post', await request(a500).post(URL_CON).send({ token: 'abc' }));
    verificar(RES, 'post', await request(a500).post(URL_RES).send({ token: 'abc', contrasena: NUEVA }));
    verificar(ACT, 'post', await request(a500).post(URL_ACT).send({ token: 'abc', contrasena: NUEVA }));
  });

  it('perfil y contenido publico: cada estado documentado coincide con la respuesta real', async () => {
    const PER = '/perfil';
    const CONT = '/publico/contenido';
    const URL_PER = '/api/v1/perfil';
    const { app } = crearArnes({ prisma });
    await request(app).post(RUTA_REGISTRO).send(alta(40)).expect(201);
    const login = await request(app).post(RUTA_LOGIN).send({ correo: 'u40@ejemplo.com', contrasena: CLAVE });
    const auth = { Authorization: `Bearer ${login.body.token}` };

    verificar(PER, 'get', await request(app).get(URL_PER).set(auth)); // 200
    verificar(PER, 'get', await request(app).get(URL_PER)); // 401
    verificar(PER, 'patch', await request(app).patch(URL_PER).set(auth).send({ nombre: 'Rosa Q', telefono: '987654321', compartirTelefono: true })); // 200
    verificar(PER, 'patch', await request(app).patch(URL_PER).set(auth).send({ correo: 'otro@ejemplo.com' })); // 400
    verificar(PER, 'patch', await request(app).patch(URL_PER).send({ nombre: 'X' })); // 401
    verificar(PER, 'patch', await request(app).patch(URL_PER).set(auth).set('Content-Type', 'text/plain').send('x')); // 415
    verificar(PER, 'patch', await request(app).patch(URL_PER).set(auth).send({ nombre: 'a'.repeat(9000) })); // 413
    verificar(CONT, 'get', await request(app).get('/api/v1/publico/contenido')); // 200

    // Las sesiones son reales (el token es valido); solo falla el almacenamiento de cuentas.
    const cuentas503: CuentasPort = { crearCiudadano: noDisponible, buscarPorCorreo: noDisponible, buscarPorId: noDisponible, obtenerPerfil: noDisponible, actualizarPerfil: noDisponible };
    const a503 = crearArnes({ prisma, sobrescribir: { cuentas: cuentas503 } }).app;
    verificar(PER, 'get', await request(a503).get(URL_PER).set(auth)); // 503
    verificar(PER, 'patch', await request(a503).patch(URL_PER).set(auth).send({ nombre: 'X' })); // 503

    const cuentas500: CuentasPort = { crearCiudadano: reventada, buscarPorCorreo: reventada, buscarPorId: reventada, obtenerPerfil: reventada, actualizarPerfil: reventada };
    const a500 = crearArnes({ prisma, sobrescribir: { cuentas: cuentas500 } }).app;
    verificar(PER, 'get', await request(a500).get(URL_PER).set(auth)); // 500
    verificar(PER, 'patch', await request(a500).patch(URL_PER).set(auth).send({ nombre: 'X' })); // 500
  });

  it('acceso institucional y paneles: cada estado documentado coincide con la respuesta real', async () => {
    const INST = '/auth/institucional/sesiones';
    const ISES = '/auth/institucional/sesion';
    const PA = '/administrador/panel';
    const PO = '/operador/panel';
    const U = (r: string) => `/api/v1${r}`;
    const origen = { Origin: ORIGEN_WEB_PRUEBA };
    const { app } = crearArnes({ prisma });
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const operador = await crearCuentaDePrueba(prisma, { rol: 'operador' });
    const cred = (c: { correo: string }) => ({ correo: c.correo, contrasena: CLAVE });

    const ok = await request(app).post(U(INST)).set(origen).send(cred(admin));
    verificar(INST, 'post', ok); // 200
    const cookieAdmin = `__Host-ayni_inst=${cookieDe(ok) as string}`;
    const okOp = await request(app).post(U(INST)).set(origen).send(cred(operador));
    const cookieOp = `__Host-ayni_inst=${cookieDe(okOp) as string}`;
    verificar(INST, 'post', await request(app).post(U(INST)).set(origen).send({ correo: 'x', contrasena: '' })); // 400
    verificar(INST, 'post', await request(app).post(U(INST)).set(origen).send({ correo: admin.correo, contrasena: 'otra-contraseña-larga-123' })); // 401
    verificar(INST, 'post', await request(app).post(U(INST)).send(cred(admin))); // 403 sin Origin
    verificar(INST, 'post', await request(app).post(U(INST)).set(origen).send({ correo: admin.correo, contrasena: 'a'.repeat(9000) })); // 413
    verificar(INST, 'post', await request(app).post(U(INST)).set({ ...origen, 'Content-Type': 'text/plain' }).send('x')); // 415

    verificar(ISES, 'get', await request(app).get(U(ISES)).set('Cookie', cookieAdmin)); // 200
    verificar(ISES, 'get', await request(app).get(U(ISES))); // 401
    verificar(PA, 'get', await request(app).get(U(PA)).set('Cookie', cookieAdmin)); // 200
    verificar(PA, 'get', await request(app).get(U(PA))); // 401
    verificar(PA, 'get', await request(app).get(U(PA)).set('Cookie', cookieOp)); // 403
    verificar(PO, 'get', await request(app).get(U(PO)).set('Cookie', cookieOp)); // 200
    verificar(PO, 'get', await request(app).get(U(PO))); // 401
    verificar(PO, 'get', await request(app).get(U(PO)).set('Cookie', cookieAdmin)); // 403

    verificar(ISES, 'delete', await request(app).delete(U(ISES)).set({ ...origen, Cookie: cookieOp })); // 204
    verificar(ISES, 'delete', await request(app).delete(U(ISES)).set('Origin', 'https://malo.test')); // 403
    verificar(ISES, 'delete', await request(app).delete(U(ISES)).set({ ...origen, 'Content-Type': 'text/plain' }).send('x')); // 415

    // 429: contador institucional de 1 intento por correo+IP.
    const limitado = crearArnes({ prisma, politica: { loginInstPorCorreoIp: 1 } }).app;
    await request(limitado).post(U(INST)).set(origen).send({ correo: admin.correo, contrasena: 'otra-contraseña-larga-123' });
    verificar(INST, 'post', await request(limitado).post(U(INST)).set(origen).send(cred(admin))); // 429

    // 503 y 500: las cuentas y sesiones reales existen; solo falla el almacenamiento de sesiones.
    for (const [falla, estado] of [[noDisponible, 503], [reventada, 500]] as const) {
      const sesiones: SesionesPort = { crearSiUsuarioHabilitado: falla, buscarVigente: falla, revocar: falla, revocarTodasDe: falla };
      const rota = crearArnes({ prisma, sobrescribir: { sesiones } }).app;
      const r1 = await request(rota).post(U(INST)).set(origen).send(cred(admin));
      expect(r1.status).toBe(estado);
      verificar(INST, 'post', r1);
      for (const [ruta, metodo] of [[ISES, 'get'], [PA, 'get'], [PO, 'get']] as const) {
        const r = await request(rota).get(U(ruta)).set('Cookie', cookieAdmin);
        expect(r.status).toBe(estado);
        verificar(ruta, metodo, r);
      }
      const rd = await request(rota).delete(U(ISES)).set({ ...origen, Cookie: cookieAdmin });
      expect(rd.status).toBe(estado);
      verificar(ISES, 'delete', rd);
    }
  });

  it('territorio: respuestas reales cubren el contrato, versiones y errores sin permisos ni persistencia de puntos', async () => {
    const arnes = crearArnes({ prisma, saltosProxy: 1 });
    const app = arnes.app;
    const repo = new PrismaTerritorioAdapter(prisma);
    const C = '/publico/territorio/distritos', L = '/publico/territorio/limites', P = '/publico/territorio/resolver';
    const url = (ruta: string) => `/api/v1${ruta}`;
    verificar(C, 'get', await request(app).get(url(C))); // 200 sin activa
    verificar(C, 'get', await request(app).get(url(C)).query({ inventado: 'x' })); // 422
    verificar(L, 'get', await request(app).get(url(L))); // 503
    verificar(P, 'post', await request(app).post(url(P)).send({ latitud: 1, longitud: 1 })); // 503
    await repo.importar(paqueteSintetico().preparado, true);
    const limites = await request(app).get(url(L));
    verificar(L, 'get', limites); // 200 Polygon
    verificar(L, 'get', await request(app).get(url(L)).query({ version: 'f'.repeat(64) })); // 404
    verificar(L, 'get', await request(app).get(url(L)).query({ version: ['a', 'b'] })); // 422
    verificar(L, 'get', await request(app).get(url(L)).query({ extra: 1 }));
    verificar(P, 'post', await request(app).post(url(P)).send({ latitud: 1, longitud: 1, version: 'f'.repeat(64) })); // 404
    verificar(P, 'post', await request(app).post(url(P)).send({ latitud: '1', longitud: 1 })); // 422
    verificar(P, 'post', await request(app).post(url(P)).query({ latitud: 1 }).send({ latitud: 1, longitud: 1 }));
    verificar(P, 'post', await request(app).post(url(P)).set('Content-Type', 'application/json').send('{')); // 400
    verificar(P, 'post', await request(app).post(url(P)).send({ extra: 'x'.repeat(4097) })); // 413
    verificar(P, 'post', await request(app).post(url(P)).set('Content-Type', 'text/plain').send('texto')); // 415
    const resuelto = await request(app).post(url(P)).send({ latitud: 1, longitud: 1 });
    verificar(P, 'post', resuelto);
    expect(resuelto.body.estado).toBe('resuelto');
    for (const [latitud, longitud, motivo] of [[0, 0, 'frontera'], [40, 40, 'fuera_area']] as const) {
      const r = await request(app).post(url(P)).send({ latitud, longitud });
      verificar(P, 'post', r); expect(r.body.motivo).toBe(motivo);
    }
    const anonimo = (await request(app).get(url(C))).body;
    for (const rol of ['ciudadano', 'administrador', 'operador'] as const) {
      const cuenta = await crearCuentaDePrueba(prisma, { rol });
      const sesion = rol === 'ciudadano'
        ? await request(app).post('/api/v1/auth/ciudadanos/sesiones').send({ correo: cuenta.correo, contrasena: CLAVE })
        : await request(app).post('/api/v1/auth/institucional/sesiones').set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: cuenta.correo, contrasena: CLAVE });
      expect(sesion.status).toBe(200);
      const cabecera = rol === 'ciudadano' ? { Authorization: `Bearer ${sesion.body.token}` } : { Cookie: cookieDe(sesion) };
      expect((await request(app).get(url(C)).set(cabecera)).body).toEqual(anonimo);
      expect((await request(app).get(url(L)).set(cabecera)).body).toEqual(limites.body);
      expect((await request(app).post(url(P)).set(cabecera).send({ latitud: 1, longitud: 1 })).body).toEqual(resuelto.body);
    }
    const cuentas = await prisma.usuario.count(), sesiones = await prisma.sesion.count();
    for (const ruta of [C, L, P]) {
      const r = ruta === P ? await request(app).get(url(ruta)) : await request(app).post(url(ruta));
      expect(r.status).toBe(405); expect(r.headers.allow).toBe(ruta === P ? 'POST' : 'GET, HEAD');
      const componentes = api as unknown as { components: { schemas: Record<string, Esquema> } };
      expect(ajv.validate(componentes.components.schemas.ErrorTerritorialRespuesta!, r.body)).toBe(true);
    }
    expect((await request(app).head(url(L))).text).toBeUndefined();
    for (let i = 0; i < 60; i++) await request(app).post(url(P)).set('X-Forwarded-For', '192.0.2.31').send({ latitud: 1, longitud: 1 });
    const cuota = await request(app).post(url(P)).set('X-Forwarded-For', '192.0.2.31').send({ latitud: 1, longitud: 1 });
    expect(cuota.status).toBe(429); verificar(P, 'post', cuota);
    const otraIp = await request(app).post(url(P)).set('X-Forwarded-For', '192.0.2.32').send({ latitud: 1, longitud: 1 });
    expect(otraIp.status).toBe(200);
    const rota = crearApp({ saltosProxyConfianza: 0, identidad: arnes.modulo, reportes: arnes.reportes,
      consultas: crearModuloConsultas(undefined, { repositorio: { leer: async () => { throw new Error('secreto SQL'); } }, secretoLimitador: 'solo-pruebas' }) });
    for (const ruta of [C, L]) {
      const r = await request(rota).get(url(ruta)); verificar(ruta, 'get', r);
      expect(r.text).not.toContain('secreto');
    }
    verificar(P, 'post', await request(rota).post(url(P)).send({ latitud: 1, longitud: 1 }));
    expect(await prisma.usuario.count()).toBe(cuentas); expect(await prisma.sesion.count()).toBe(sesiones);
    expect(await prisma.geometriaDistrital.count()).toBe(5);
    expect(arnes.logger.texto()).not.toMatch(/latitud|longitud|secreto SQL/);
  });

  it('organizacion y categorias: cada estado documentado coincide con la respuesta real', async () => {
    const ORG = '/administrador/organizacion';
    const U = (r: string) => `/api/v1${r}`;
    const arnes = crearArnes({ prisma });
    const { app, modulo, correo } = arnes;
    const NUEVA = 'contraseña de operador del contrato 4b';
    const sesion = async (rol: 'administrador' | 'operador', cuenta?: { correo: string }, clave = CLAVE) => {
      const c = cuenta ?? (await crearCuentaDePrueba(prisma, { rol }));
      const r = await request(app).post('/api/v1/auth/institucional/sesiones').set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: c.correo, contrasena: clave });
      expect(r.status).toBe(200);
      return `__Host-ayni_inst=${cookieDe(r) as string}`;
    };
    const cookieAdmin = await sesion('administrador');
    const cookieOpSinSede = await sesion('operador');
    const conAdmin = { Cookie: cookieAdmin, Origin: ORIGEN_WEB_PRUEBA };
    const conOp = { Cookie: cookieOpSinSede, Origin: ORIGEN_WEB_PRUEBA };
    const grande = { nombre: 'x'.repeat(9000) };
    const NADA = '00000000-0000-4000-8000-000000000000';
    const activar = async (para: string) => {
      await modulo.gestorEnvios.esperarReposo();
      const token = /#t=([A-Za-z0-9_-]+)/.exec([...correo.enviados].reverse().find((m) => m.para === para)!.texto)![1];
      expect((await request(app).post('/api/v1/auth/activaciones').send({ token, contrasena: NUEVA })).status).toBe(204);
    };
    type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';
    const llamar = (metodo: Metodo, ruta: string, cabeceras: Record<string, string>, cuerpo?: object | string, tipo?: string) => {
      let r = request(app)[metodo](U(ruta)).set(cabeceras);
      if (tipo) r = r.set('Content-Type', tipo);
      return cuerpo === undefined ? r : r.send(cuerpo);
    };
    const v = async (doc: string, metodo: Metodo, ruta: string, cab: Record<string, string>, esperado: number, cuerpo?: object | string, tipo?: string) => {
      const r = await llamar(metodo, ruta, cab, cuerpo, tipo);
      expectConContexto(r.status, `${metodo.toUpperCase()} ${ruta} ${JSON.stringify(r.body)}`).toBe(esperado);
      verificar(doc, metodo, r);
      return r;
    };

    // --- Instituciones
    await v(`${ORG}/instituciones`, 'get', `${ORG}/instituciones`, conAdmin, 200);
    await v(`${ORG}/instituciones`, 'get', `${ORG}/instituciones`, {}, 401);
    await v(`${ORG}/instituciones`, 'get', `${ORG}/instituciones`, conOp, 403);
    const INS = `${ORG}/instituciones/{id}`;
    await v(INS, 'patch', `${ORG}/instituciones/samu`, conAdmin, 200, { contacto: '106' });
    await v(INS, 'patch', `${ORG}/instituciones/samu`, conAdmin, 400, { tipo: 'pnp' });
    await v(INS, 'patch', `${ORG}/instituciones/samu`, {}, 401, { contacto: '106' });
    await v(INS, 'patch', `${ORG}/instituciones/samu`, conOp, 403, { contacto: '106' });
    await v(INS, 'patch', `${ORG}/instituciones/samu`, { Cookie: cookieAdmin }, 403, { contacto: '106' });
    await v(INS, 'patch', `${ORG}/instituciones/otra`, conAdmin, 404, { contacto: '106' });
    await v(INS, 'patch', `${ORG}/instituciones/samu`, conAdmin, 413, grande);
    await v(INS, 'patch', `${ORG}/instituciones/samu`, conAdmin, 415, 'x', 'text/plain');

    // --- Sedes
    const SED = `${ORG}/sedes`;
    const alta = (n: number) => ({ institucionId: 'pnp', nombre: `Sede contrato ${n}`, operador: { nombre: `Op ${n}`, correo: `opc${n}@ejemplo.com` } });
    const creada = await v(SED, 'post', SED, conAdmin, 201, alta(1));
    const sedeId = creada.body.sede.id as string;
    const operadorId = creada.body.operador.id as string;
    await v(SED, 'post', SED, conAdmin, 409, alta(1));
    await v(SED, 'post', SED, conAdmin, 400, { institucionId: 'municipalidad' });
    await v(SED, 'post', SED, {}, 401, alta(2));
    await v(SED, 'post', SED, conOp, 403, alta(2));
    await v(SED, 'post', SED, conAdmin, 413, { ...alta(2), nombre: 'x'.repeat(9000) });
    await v(SED, 'post', SED, conAdmin, 415, 'x', 'text/plain');
    await v(SED, 'get', SED, conAdmin, 200);
    await v(SED, 'get', SED, {}, 401);
    await v(SED, 'get', SED, conOp, 403);

    const SID = `${ORG}/sedes/{id}`;
    const sede = `${SED}/${sedeId}`;
    await v(SID, 'patch', sede, conAdmin, 200, { verificacion: { estado: 'verificada', fuente: 'Oficio', fecha: '2026-11-25' } });
    await v(SID, 'patch', sede, conAdmin, 400, { habilitadaAtencion: true });
    await v(SID, 'patch', sede, {}, 401, { nombre: 'X' });
    await v(SID, 'patch', sede, conOp, 403, { nombre: 'X' });
    await v(SID, 'patch', `${SED}/${NADA}`, conAdmin, 404, { nombre: 'X' });
    await v(SID, 'patch', sede, conAdmin, 413, grande);
    await v(SID, 'patch', sede, conAdmin, 415, 'x', 'text/plain');

    for (const [sufijo, cuerpo, malo] of [
      ['cobertura', { distritos: ['DIS-01'] }, { distritos: ['DIS-09'] }],
      ['competencias', { categorias: ['robo'] }, { categorias: ['inventada'] }],
    ] as const) {
      const doc = `${ORG}/sedes/{id}/${sufijo}`;
      const ruta = `${sede}/${sufijo}`;
      await v(doc, 'put', ruta, conAdmin, 200, cuerpo);
      await v(doc, 'put', ruta, conAdmin, 400, malo);
      await v(doc, 'put', ruta, {}, 401, cuerpo);
      await v(doc, 'put', ruta, conOp, 403, cuerpo);
      await v(doc, 'put', `${SED}/${NADA}/${sufijo}`, conAdmin, 404, cuerpo);
      await v(doc, 'put', ruta, conAdmin, 413, { [Object.keys(cuerpo)[0]!]: ['x'.repeat(9000)] });
      await v(doc, 'put', ruta, conAdmin, 415, 'x', 'text/plain');
    }

    const HAB = `${ORG}/sedes/{id}/habilitacion`;
    const habilitacion = `${sede}/habilitacion`;
    const faltan = await v(HAB, 'post', habilitacion, conAdmin, 409);
    expect(faltan.body.error.faltantes).toEqual(['operador_activo']);
    await v(HAB, 'post', habilitacion, {}, 401);
    await v(HAB, 'post', habilitacion, conOp, 403);
    await v(HAB, 'post', `${SED}/${NADA}/habilitacion`, conAdmin, 404);
    await v(HAB, 'post', habilitacion, conAdmin, 415, 'x', 'text/plain');
    await v(HAB, 'delete', habilitacion, conAdmin, 200);
    await v(HAB, 'delete', habilitacion, {}, 401);
    await v(HAB, 'delete', habilitacion, conOp, 403);
    await v(HAB, 'delete', `${SED}/${NADA}/habilitacion`, conAdmin, 404);
    await v(HAB, 'delete', habilitacion, conAdmin, 415, 'x', 'text/plain');

    // --- Operadores e invitacion
    const OPS = `${ORG}/sedes/{id}/operadores`;
    await v(OPS, 'post', `${sede}/operadores`, conAdmin, 201, { nombre: 'Ana', correo: 'anac@ejemplo.com' });
    await v(OPS, 'post', `${sede}/operadores`, conAdmin, 409, { nombre: 'Ana', correo: 'anac@ejemplo.com' });
    await v(OPS, 'post', `${sede}/operadores`, conAdmin, 400, { nombre: 'Ana' });
    await v(OPS, 'post', `${sede}/operadores`, {}, 401, { nombre: 'B', correo: 'b@ejemplo.com' });
    await v(OPS, 'post', `${sede}/operadores`, conOp, 403, { nombre: 'B', correo: 'b@ejemplo.com' });
    await v(OPS, 'post', `${SED}/${NADA}/operadores`, conAdmin, 404, { nombre: 'B', correo: 'b@ejemplo.com' });
    await v(OPS, 'post', `${sede}/operadores`, conAdmin, 413, grande);
    await v(OPS, 'post', `${sede}/operadores`, conAdmin, 415, 'x', 'text/plain');
    await v(OPS, 'get', `${sede}/operadores`, conAdmin, 200);
    await v(OPS, 'get', `${sede}/operadores`, {}, 401);
    await v(OPS, 'get', `${sede}/operadores`, conOp, 403);
    await v(OPS, 'get', `${SED}/${NADA}/operadores`, conAdmin, 404);

    const INV = `${ORG}/operadores/{id}/invitacion`;
    const invitacion = `${ORG}/operadores/${operadorId}/invitacion`;
    await v(INV, 'post', invitacion, conAdmin, 202);
    await v(INV, 'post', invitacion, {}, 401);
    await v(INV, 'post', invitacion, conOp, 403);
    await v(INV, 'post', `${ORG}/operadores/${NADA}/invitacion`, conAdmin, 404);
    await v(INV, 'post', invitacion, conAdmin, 415, 'x', 'text/plain');
    await activar('opc1@ejemplo.com');
    await v(INV, 'post', invitacion, conAdmin, 409);

    await v(HAB, 'post', habilitacion, conAdmin, 200);
    await v(SID, 'patch', sede, conAdmin, 409, { verificacion: { estado: 'sin_verificar' } });
    await v(`${ORG}/sedes/{id}/cobertura`, 'put', `${sede}/cobertura`, conAdmin, 409, { distritos: [] });
    await v(`${ORG}/sedes/{id}/competencias`, 'put', `${sede}/competencias`, conAdmin, 409, { categorias: [] });
    await v(INS, 'patch', `${ORG}/instituciones/pnp`, conAdmin, 409, { activa: false });

    const OP = `${ORG}/operadores/{id}`;
    const operador = `${ORG}/operadores/${operadorId}`;
    await v(OP, 'patch', operador, conAdmin, 409, { estado: 'suspendido' });
    await v(OP, 'patch', operador, conAdmin, 200, { estado: 'activo' });
    await v(OP, 'patch', operador, conAdmin, 400, { estado: 'borrado' });
    await v(OP, 'patch', operador, {}, 401, { estado: 'activo' });
    await v(OP, 'patch', operador, conOp, 403, { estado: 'activo' });
    await v(OP, 'patch', `${ORG}/operadores/${NADA}`, conAdmin, 404, { estado: 'activo' });
    await v(OP, 'patch', operador, conAdmin, 413, grande);
    await v(OP, 'patch', operador, conAdmin, 415, 'x', 'text/plain');

    // --- Ambito del operador
    const cookieOp = await sesion('operador', { correo: 'opc1@ejemplo.com' }, NUEVA);
    await v('/operador/ambito', 'get', '/operador/ambito', { Cookie: cookieOp }, 200);
    await v('/operador/ambito', 'get', '/operador/ambito', {}, 401);
    await v('/operador/ambito', 'get', '/operador/ambito', { Cookie: cookieAdmin }, 403);

    // --- 503 y 500: sesiones reales; falla el almacenamiento de organizacion y los catalogos.
    for (const [falla, estado] of [[noDisponible, 503], [reventada, 500]] as const) {
      const organizacion = new Proxy({}, { get: () => falla }) as never;
      // Un catalogo caido es una dependencia no disponible (503) en ambos casos: solo se rompe en el 503.
      const catalogo = estado === 503 ? { catalogoDistritos: { idsValidos: falla }, catalogoCategorias: { idsValidos: falla } } : {};
      const rota = crearArnes({ prisma, sobrescribir: { organizacion, ...catalogo } }).app;
      const casos: [string, Metodo, string, object?][] = [
        [`${ORG}/instituciones`, 'get', `${ORG}/instituciones`],
        [INS, 'patch', `${ORG}/instituciones/samu`, { contacto: '1' }],
        [SED, 'get', SED], [SED, 'post', SED, alta(9)],
        [SID, 'patch', sede, { nombre: 'X' }],
        [`${ORG}/sedes/{id}/cobertura`, 'put', `${sede}/cobertura`, { distritos: ['DIS-01'] }],
        [`${ORG}/sedes/{id}/competencias`, 'put', `${sede}/competencias`, { categorias: ['robo'] }],
        [HAB, 'post', habilitacion], [HAB, 'delete', habilitacion],
        [OPS, 'get', `${sede}/operadores`], [OPS, 'post', `${sede}/operadores`, { nombre: 'Z', correo: 'z@ejemplo.com' }],
        [OP, 'patch', operador, { estado: 'activo' }], [INV, 'post', invitacion],
      ];
      for (const [doc, metodo, ruta, cuerpo] of casos) {
        const r = request(rota)[metodo](U(ruta)).set(conAdmin);
        const res = await (cuerpo ? r.send(cuerpo) : r);
        expectConContexto(res.status, `${metodo} ${ruta}`).toBe(estado);
        verificar(doc, metodo, res);
      }
      const ambito = await request(rota).get(U('/operador/ambito')).set('Cookie', cookieOp);
      expect(ambito.status).toBe(estado);
      verificar('/operador/ambito', 'get', ambito);
    }

    // --- Catalogo publico de categorias: mismo cuerpo con o sin sesion
    const CAT = '/publico/categorias';
    const anonimo = await v(CAT, 'get', CAT, {}, 200);
    expect(anonimo.body.categorias).toHaveLength(16);
    const ciudadano = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    const token = (await request(app).post(RUTA_LOGIN).send({ correo: ciudadano.correo, contrasena: CLAVE })).body.token as string;
    for (const cab of [{ Authorization: `Bearer ${token}` }, { Cookie: cookieAdmin }, { Cookie: cookieOp }]) {
      expect((await request(app).get(U(CAT)).set(cab)).body).toEqual(anonimo.body);
    }
    await v(CAT, 'get', `${CAT}?activa=true`, {}, 400);
    const sinCatalogo = crearApp({
      saltosProxyConfianza: 0, identidad: arnes.modulo, consultas: crearModuloConsultas(),
      reportes: crearModuloReportes({ listar: async () => { throw new Error('secreto SQL'); } }),
    });
    const caido = await request(sinCatalogo).get(U(CAT));
    expect(caido.status).toBe(503);
    expect(caido.text).not.toContain('secreto');
    verificar(CAT, 'get', caido);
    const post = await request(app).post(U(CAT));
    expect(post.status).toBe(405);
    expect(post.headers.allow).toBe('GET, HEAD');
  });

  it('registro de incidentes: cada estado documentado coincide con la respuesta real', async () => {
    const INC = '/incidentes';
    const U = `/api/v1${INC}`;
    const arnes = crearArnes({ prisma, limiteInvitado: { maximo: 1, ventanaMs: 60 * 60 * 1000 } });
    const { app } = arnes;
    const datos = (extra: Record<string, unknown> = {}) => ({
      categoriaId: 'robo',
      descripcion: 'Me arrebataron el celular',
      ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
      punto: { latitud: -13.16, longitud: -74.22, origen: 'manual' },
      ...extra,
    });
    const enviar = (cuerpo: unknown, cab: Record<string, string> = {}, clave: string | null = randomUUID(), tipo = 'application/json') => {
      let r = request(app).post(U).set('Content-Type', tipo);
      if (clave) r = r.set('Idempotency-Key', clave);
      return r.set(cab).send(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
    };
    const invitado = datos({ telefonoContacto: '987654321' });
    const clave = randomUUID();
    const r201 = await enviar(invitado, {}, clave);
    expect(r201.status).toBe(201);
    verificar(INC, 'post', r201);
    expect(r201.body).not.toHaveProperty('telefonoContacto');
    const r200 = await enviar(invitado, {}, clave);
    expect(r200.status).toBe(200);
    verificar(INC, 'post', r200);
    verificar(INC, 'post', await enviar(datos({ telefonoContacto: '987654321', descripcion: 'Otro texto' }), {}, clave)); // 409
    verificar(INC, 'post', await enviar(datos({ telefonoContacto: '987654321' }))); // 429 (limite 1)
    verificar(INC, 'post', await enviar(invitado, {}, null)); // 400 sin clave
    verificar(INC, 'post', await enviar({ ...invitado, prioridad: 'Alta' })); // 400 campo reservado
    verificar(INC, 'post', await enviar(invitado, { Authorization: 'Bearer desconocido' })); // 401
    verificar(INC, 'post', await enviar('x', {}, randomUUID(), 'text/plain')); // 415
    verificar(INC, 'post', await enviar({ ...invitado, descripcion: 'x'.repeat(9000) })); // 413
    const operador = await crearCuentaDePrueba(prisma, { rol: 'operador' });
    const login = await request(app).post('/api/v1/auth/institucional/sesiones').set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: operador.correo, contrasena: CLAVE });
    verificar(INC, 'post', await enviar(invitado, { Cookie: `__Host-ayni_inst=${cookieDe(login) as string}` })); // 403

    // Con cuenta: 201 sin codigo de seguimiento.
    const ciudadano = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    const token = (await request(app).post(RUTA_LOGIN).send({ correo: ciudadano.correo, contrasena: CLAVE })).body.token as string;
    const conCuenta = await enviar(datos(), { Authorization: `Bearer ${token}` });
    expect(conCuenta.status).toBe(201);
    expect(conCuenta.body).not.toHaveProperty('codigoSeguimiento');
    verificar(INC, 'post', conCuenta);

    // 503: falla una escritura del registro; no queda nada parcial.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fallo_contrato_p4() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'secreto SQL'; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER fallo_contrato_p4 BEFORE INSERT ON envios_incidente FOR EACH ROW EXECUTE FUNCTION fallo_contrato_p4()');
    try {
      const caido = await enviar(datos(), { Authorization: `Bearer ${token}` });
      expect(caido.status).toBe(503);
      expect(caido.text).not.toContain('secreto');
      verificar(INC, 'post', caido);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fallo_contrato_p4 ON envios_incidente');
      await prisma.$executeRawUnsafe('DROP FUNCTION fallo_contrato_p4()');
    }

    // Sin rutas para cambiar el estado del incidente.
    for (const metodo of ['patch', 'put', 'delete'] as const) {
      expect(Object.keys(api.paths).some((p) => p.startsWith('/incidentes') && metodo in (api.paths[p] ?? {}))).toBe(false);
    }
    const get = await request(app).get(U);
    expect(get.status).toBe(405);
    expect(get.headers.allow).toBe('POST');
  });

  it('seguimiento ciudadano: cada estado documentado coincide con la respuesta real', async () => {
    const MIOS = '/ciudadano/incidentes';
    const DET = '/ciudadano/incidentes/{referencia}';
    const INV = '/publico/seguimiento';
    const U = (r: string) => `/api/v1${r}`;
    const arnes = crearArnes({
      prisma,
      limitesSeguimiento: { porReferencia: { maximo: 2, ventanaMs: 15 * 60 * 1000 }, porOrigen: { maximo: 1000, ventanaMs: 60 * 60 * 1000 } },
    });
    const { app } = arnes;
    const datos = (extra: Record<string, unknown> = {}) => ({
      categoriaId: 'robo',
      descripcion: 'Me arrebataron el celular',
      ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
      punto: { latitud: -13.16, longitud: -74.22, origen: 'manual' },
      ...extra,
    });
    const registrar = (cab: Record<string, string>, cuerpo: unknown) =>
      request(app).post(U('/incidentes')).set('Content-Type', 'application/json').set('Idempotency-Key', randomUUID()).set(cab).send(JSON.stringify(cuerpo));
    const ciudadano = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    const token = (await request(app).post(RUTA_LOGIN).send({ correo: ciudadano.correo, contrasena: CLAVE })).body.token as string;
    const bearer = { Authorization: `Bearer ${token}` };
    const propio = (await registrar(bearer, datos())).body as { referencia: string };
    const invitado = (await registrar({}, datos({ telefonoContacto: '987654321' }))).body as { referencia: string; codigoSeguimiento: string };
    const operador = await crearCuentaDePrueba(prisma, { rol: 'operador' });
    const login = await request(app).post('/api/v1/auth/institucional/sesiones').set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: operador.correo, contrasena: CLAVE });
    const cookieOp = { Cookie: `__Host-ayni_inst=${cookieDe(login) as string}` };

    verificar(MIOS, 'get', await request(app).get(U(MIOS)).set(bearer)); // 200
    verificar(MIOS, 'get', await request(app).get(U(`${MIOS}?cursor=roto!`)).set(bearer)); // 400
    verificar(MIOS, 'get', await request(app).get(U(MIOS))); // 401
    verificar(MIOS, 'get', await request(app).get(U(MIOS)).set(cookieOp)); // 403
    verificar(DET, 'get', await request(app).get(U(`${MIOS}/${propio.referencia}`)).set(bearer)); // 200
    verificar(DET, 'get', await request(app).get(U(`${MIOS}/${propio.referencia}?x=1`)).set(bearer)); // 400
    verificar(DET, 'get', await request(app).get(U(`${MIOS}/${propio.referencia}`))); // 401
    verificar(DET, 'get', await request(app).get(U(`${MIOS}/${propio.referencia}`)).set(cookieOp)); // 403
    verificar(DET, 'get', await request(app).get(U(`${MIOS}/${invitado.referencia}`)).set(bearer)); // 404

    const consultar = (cuerpo: unknown, tipo = 'application/json', ruta = INV) =>
      request(app).post(U(ruta)).set('Content-Type', tipo).send(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
    verificar(INV, 'post', await consultar({ referencia: invitado.referencia, codigo: invitado.codigoSeguimiento })); // 200
    verificar(INV, 'post', await consultar({ referencia: invitado.referencia })); // 400
    verificar(INV, 'post', await consultar({ referencia: invitado.referencia, codigo: 'AAAA-BBBB-CCCC-DDDD' })); // 404
    verificar(INV, 'post', await consultar({ referencia: invitado.referencia, codigo: invitado.codigoSeguimiento })); // 429 (limite 2)
    verificar(INV, 'post', await consultar('x', 'text/plain')); // 415
    verificar(INV, 'post', await consultar({ referencia: 'x'.repeat(3000), codigo: 'y' })); // 413

    // 503: los puertos de seguimiento fallan (Reportes/Operaciones no disponibles).
    const falla = () => Promise.reject(new Error('secreto SQL'));
    const caida = crearApp({
      saltosProxyConfianza: 0,
      identidad: arnes.modulo,
      reportes: arnes.reportes,
      consultas: crearModuloConsultas(undefined, {
        repositorio: { leer: async () => null },
        secretoLimitador: 'x'.repeat(40),
        seguimiento: {
          envios: { listarDeAutor: falla, detalleDeAutor: falla, verificarCodigo: falla },
          incidentes: { normalizarReferencia: (t: string) => t, porReferencia: falla, estados: falla },
          categorias: { nombres: falla },
          limitador: { consumir: async () => ({ permitido: true, reintentarEnSegundos: 1 }) },
          identificar: async () => ({ tipo: 'ciudadano' as const, usuarioId: ciudadano.id }),
          logger: arnes.logger,
        },
      }),
    });
    for (const [doc, metodo, ruta, cuerpo] of [
      [MIOS, 'get', MIOS, undefined],
      [DET, 'get', `${MIOS}/${propio.referencia}`, undefined],
      [INV, 'post', INV, { referencia: invitado.referencia, codigo: invitado.codigoSeguimiento }],
    ] as const) {
      const r = metodo === 'get'
        ? await request(caida).get(U(ruta))
        : await request(caida).post(U(ruta)).set('Content-Type', 'application/json').send(JSON.stringify(cuerpo));
      expect(r.status).toBe(503);
      expect(r.text).not.toContain('secreto');
      verificar(doc, metodo, r);
    }
  });

  it('enrutamiento y bandeja (P4.2): cada estado documentado coincide con la respuesta real', async () => {
    const PEN = '/admin/enrutamientos-pendientes';
    const DES = '/admin/enrutamientos-pendientes/{incidenteId}/designaciones';
    const REE = '/admin/enrutamientos-pendientes/{incidenteId}/reevaluar';
    const BAN = '/operador/incidentes';
    const RES = '/operador/incidentes/{id}';
    const DET = '/ciudadano/incidentes/{referencia}';
    const INV = '/publico/seguimiento';
    const U = (r: string) => `/api/v1${r}`;
    const arnes = crearArnes({ prisma, enrutar: true });
    const { app, procesador } = arnes;
    await new PrismaTerritorioAdapter(prisma).importar(paqueteSintetico().preparado, true);
    const enrutar = async () => {
      await procesador.esperarReposo();
      await procesador.procesarPendientes();
    };
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const cookieAdmin = await cookieInstitucional(app, admin.correo);
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'], creadoPor: admin.id });
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', distritos: ['DIS-05'], creadoPor: admin.id });
    const samuOff = await crearSedeDePrueba(prisma, { institucion: 'samu', habilitada: false, creadoPor: admin.id });
    const cookieOp = await cookieInstitucional(app, pnp.operadores[0]!.correo);
    const ciudadano = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    const token = (await request(app).post(RUTA_LOGIN).send({ correo: ciudadano.correo, contrasena: CLAVE })).body.token as string;
    const accidente = {
      categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida', heridos: 'si',
      ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() }, punto: { latitud: 1, longitud: 1, origen: 'manual' },
    };
    const propio = (await request(app).post(U('/incidentes')).set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/json')
      .set('Idempotency-Key', randomUUID()).send(JSON.stringify(accidente))).body as { referencia: string };
    const inv = await registrarIncidente(app, prisma, accidente);
    await enrutar();
    const idPropio = (await prisma.incidente.findUniqueOrThrow({ where: { referencia: propio.referencia } })).id;

    // Bandeja del operador PNP (simultanea en el accidente).
    verificar(BAN, 'get', await request(app).get(U(BAN)).set('Cookie', cookieOp)); // 200
    verificar(BAN, 'get', await request(app).get(U(`${BAN}?cursor=@@`)).set('Cookie', cookieOp)); // 400
    verificar(BAN, 'get', await request(app).get(U(BAN))); // 401
    verificar(BAN, 'get', await request(app).get(U(BAN)).set('Cookie', cookieAdmin)); // 403
    verificar(RES, 'get', await request(app).get(U(`${BAN}/${inv.id}`)).set('Cookie', cookieOp)); // 200
    verificar(RES, 'get', await request(app).get(U(`${BAN}/${inv.id}?x=1`)).set('Cookie', cookieOp)); // 400
    verificar(RES, 'get', await request(app).get(U(`${BAN}/${inv.id}`))); // 401
    verificar(RES, 'get', await request(app).get(U(`${BAN}/${inv.id}`)).set('Cookie', cookieAdmin)); // 403
    verificar(RES, 'get', await request(app).get(U(`${BAN}/${randomUUID()}`)).set('Cookie', cookieOp)); // 404

    // Pendientes del administrador (falta SAMU principal en ambos accidentes).
    const designar = (id: string, cuerpo: unknown, cookie = cookieAdmin, tipo = 'application/json') =>
      request(app).post(U(`${PEN}/${id}/designaciones`)).set('Cookie', cookie).set('Origin', ORIGEN_WEB_PRUEBA)
        .set('Content-Type', tipo).send(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
    const reevaluar = (id: string, cookie = cookieAdmin) =>
      request(app).post(U(`${PEN}/${id}/reevaluar`)).set('Cookie', cookie).set('Origin', ORIGEN_WEB_PRUEBA);
    const motivo = 'No hay sede SAMU con cobertura en el distrito';
    verificar(PEN, 'get', await request(app).get(U(PEN)).set('Cookie', cookieAdmin)); // 200
    verificar(PEN, 'get', await request(app).get(U(`${PEN}?cursor=@@`)).set('Cookie', cookieAdmin)); // 400
    verificar(PEN, 'get', await request(app).get(U(PEN))); // 401
    verificar(PEN, 'get', await request(app).get(U(PEN)).set('Cookie', cookieOp)); // 403
    verificar(REE, 'post', await reevaluar(inv.id)); // 200 (sigue pendiente)
    verificar(REE, 'post', await request(app).post(U(`${PEN}/${inv.id}/reevaluar`)).set('Cookie', cookieAdmin)
      .set('Origin', ORIGEN_WEB_PRUEBA).set('Content-Type', 'application/json').send('{"a":1}')); // 400
    verificar(REE, 'post', await request(app).post(U(`${PEN}/${inv.id}/reevaluar`)).set('Origin', ORIGEN_WEB_PRUEBA)); // 401
    verificar(REE, 'post', await reevaluar(inv.id, cookieOp)); // 403
    verificar(REE, 'post', await reevaluar(randomUUID())); // 404
    verificar(DES, 'post', await designar(inv.id, { institucion: 'samu', sedeId: samuOff.id, motivo })); // 409
    verificar(DES, 'post', await designar(inv.id, { institucion: 'samu', sedeId: samu.id, motivo: 'x' })); // 400
    verificar(DES, 'post', await request(app).post(U(`${PEN}/${inv.id}/designaciones`)).set('Origin', ORIGEN_WEB_PRUEBA)
      .set('Content-Type', 'application/json').send('{}')); // 401
    verificar(DES, 'post', await designar(inv.id, { institucion: 'samu', sedeId: samu.id, motivo }, cookieOp)); // 403
    verificar(DES, 'post', await designar(randomUUID(), { institucion: 'samu', sedeId: samu.id, motivo })); // 404
    verificar(DES, 'post', await designar(inv.id, 'x', cookieAdmin, 'text/plain')); // 415
    verificar(DES, 'post', await designar(inv.id, { institucion: 'samu', sedeId: samu.id, motivo: 'm'.repeat(5000) })); // 413
    verificar(DES, 'post', await designar(inv.id, { institucion: 'samu', sedeId: samu.id, motivo })); // 201
    verificar(REE, 'post', await reevaluar(inv.id)); // 409 (ya no pendiente)
    verificar(DES, 'post', await designar(idPropio, { institucion: 'samu', sedeId: samu.id, motivo })); // 201

    // Seguimiento con institucion responsable asignada.
    verificar(DET, 'get', await request(app).get(U(`/ciudadano/incidentes/${propio.referencia}`)).set('Authorization', `Bearer ${token}`)); // 200
    verificar(INV, 'post', await request(app).post(U(INV)).set('Content-Type', 'application/json')
      .send(JSON.stringify({ referencia: inv.referencia, codigo: inv.codigo }))); // 200

    // 503: Operaciones no disponible para el router de pendientes y la bandeja.
    const falla = () => Promise.reject(new Error('secreto SQL'));
    const servicioCaido = { pendientes: falla, designar: falla, reevaluar: falla } as unknown as ServicioEnrutamiento;
    const caida = crearApp({
      saltosProxyConfianza: 0,
      identidad: arnes.modulo,
      reportes: arnes.reportes,
      consultas: crearModuloConsultas(undefined, {
        repositorio: { leer: async () => null },
        secretoLimitador: 'x'.repeat(40),
        bandeja: {
          ambito: { de: async () => ({ sedeId: pnp.id, distritos: ['DIS-01'], categorias: ['robo'], habilitadaAtencion: true }) },
          participaciones: { bandeja: falla, participacionDe: falla },
          originales: { resumenOperativo: falla },
          categorias: { nombres: falla },
          identificar: arnes.modulo.identificarSolicitante,
          logger: arnes.logger,
        },
      }),
      operaciones: crearRouterEnrutamiento(servicioCaido, {
        identificar: arnes.modulo.identificarSolicitante,
        origenWebPermitido: arnes.modulo.origenWebPermitido,
        vista: { nombresCategorias: falla, nombreDistrito: () => null, motivoTerritorial: falla },
        logger: arnes.logger,
      }),
    });
    const casos = [
      [BAN, 'get', request(caida).get(U(BAN)).set('Cookie', cookieOp)],
      [RES, 'get', request(caida).get(U(`${BAN}/${inv.id}`)).set('Cookie', cookieOp)],
      [PEN, 'get', request(caida).get(U(PEN)).set('Cookie', cookieAdmin)],
      [DES, 'post', request(caida).post(U(`${PEN}/${inv.id}/designaciones`)).set('Cookie', cookieAdmin).set('Origin', ORIGEN_WEB_PRUEBA)
        .set('Content-Type', 'application/json').send(JSON.stringify({ institucion: 'samu', sedeId: samu.id, motivo }))],
      [REE, 'post', request(caida).post(U(`${PEN}/${inv.id}/reevaluar`)).set('Cookie', cookieAdmin).set('Origin', ORIGEN_WEB_PRUEBA)],
    ] as const;
    for (const [doc, metodo, pendiente] of casos) {
      const r = await pendiente;
      expect(r.status).toBe(503);
      expect(r.text).not.toContain('secreto');
      verificar(doc, metodo, r);
    }
  });

  it('evaluacion rapida (P5.1): cada estado documentado coincide con la respuesta real', async () => {
    const CIU = '/ciudadano/incidentes/{referencia}/evaluacion';
    const OPE = '/operador/incidentes/{id}/evaluacion';
    const RES = '/operador/incidentes/{id}';
    const DET = '/ciudadano/incidentes/{referencia}';
    const U = (r: string) => `/api/v1${r}`;
    const arnes = crearArnes({ prisma, enrutar: true });
    const { app, procesador } = arnes;
    await limpiarBd(prisma);
    await new PrismaTerritorioAdapter(prisma).importar(paqueteSintetico().preparado, true);
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const cookieAdmin = await cookieInstitucional(app, admin.correo);
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'], creadoPor: admin.id });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'], creadoPor: admin.id });
    const cookieSamu = await cookieInstitucional(app, samu.operadores[0]!.correo);
    const cookiePnp = await cookieInstitucional(app, pnp.operadores[0]!.correo);
    const ciudadano = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    const token = (await request(app).post(RUTA_LOGIN).send({ correo: ciudadano.correo, contrasena: CLAVE })).body.token as string;
    const accidente = (extra: Record<string, unknown> = {}) => ({
      categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida', heridos: 'no_se',
      ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() }, punto: { latitud: 1, longitud: 1, origen: 'manual' },
      ...extra,
    });
    const registrar = async (cuerpo: unknown) => {
      const r = await request(app).post(U('/incidentes')).set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/json')
        .set('Idempotency-Key', randomUUID()).send(JSON.stringify(cuerpo));
      verificar('/incidentes', 'post', r); // 201 con evaluacion
      return (await prisma.incidente.findUniqueOrThrow({ where: { referencia: r.body.referencia } }));
    };
    const inc = await registrar(accidente());
    const cerrado = await registrar(accidente({ heridos: 'si', evaluacion: { cantidadHeridos: 2, personaPrincipal: { consciente: 'si' } } }));
    await prisma.incidente.update({ where: { id: cerrado.id }, data: { estado: 'CERRADO', resultado: 'DESCARTADO', resumenCiudadano: 'Cierre de prueba del caso.', cerradoEn: new Date() } });
    await procesador.esperarReposo();
    await procesador.procesarPendientes();

    const ciu = (ref: string, cuerpo: unknown, auth: { token?: string; cookie?: string } = { token }) => {
      let r = request(app).post(U(`/ciudadano/incidentes/${ref}/evaluacion`)).set('Content-Type', 'application/json');
      if (auth.token) r = r.set('Authorization', `Bearer ${auth.token}`);
      if (auth.cookie) r = r.set('Cookie', auth.cookie);
      return r.send(JSON.stringify(cuerpo));
    };
    const ope = (id: string, cuerpo: unknown, cookie = cookiePnp, tipo = 'application/json') =>
      request(app).post(U(`/operador/incidentes/${id}/evaluacion`)).set('Cookie', cookie).set('Origin', ORIGEN_WEB_PRUEBA)
        .set('Content-Type', tipo).send(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
    const motivo = 'Confirmado por llamada al lugar';

    // Autor con cuenta.
    verificar(CIU, 'post', await ciu(inc.referencia, { heridos: 'si', cantidadHeridos: 2 })); // 200
    verificar(CIU, 'post', await ciu(inc.referencia, { heridos: 'quizas' })); // 400
    verificar(CIU, 'post', await ciu(inc.referencia, { heridos: 'si' }, {})); // 401
    verificar(CIU, 'post', await ciu(inc.referencia, { heridos: 'si' }, { cookie: cookiePnp })); // 403
    verificar(CIU, 'post', await ciu('INC-00000-00000', { heridos: 'si' })); // 404
    verificar(CIU, 'post', await ciu(cerrado.referencia, { heridos: 'no' })); // 409
    verificar(DET, 'get', await request(app).get(U(`/ciudadano/incidentes/${inc.referencia}`)).set('Authorization', `Bearer ${token}`)); // 200 con evaluacion

    // Operador: precision PNP y observaciones SAMU.
    verificar(OPE, 'post', await ope(inc.id, { atencionMedica: 'si', motivo })); // 200
    verificar(OPE, 'post', await ope(inc.id, { personaPrincipal: { consciente: 'si' }, motivo })); // 400 (PNP)
    verificar(OPE, 'post', await request(app).post(U(`/operador/incidentes/${inc.id}/evaluacion`)).set('Origin', ORIGEN_WEB_PRUEBA)
      .set('Content-Type', 'application/json').send('{}')); // 401
    verificar(OPE, 'post', await ope(inc.id, { heridos: 'si', motivo }, cookieAdmin)); // 403
    verificar(OPE, 'post', await ope(randomUUID(), { heridos: 'si', motivo })); // 404
    verificar(OPE, 'post', await ope(cerrado.id, { heridos: 'no', motivo })); // 409
    verificar(OPE, 'post', await ope(inc.id, 'x', cookiePnp, 'text/plain')); // 415
    verificar(OPE, 'post', await ope(inc.id, { personaPrincipal: { sangrado: 'si' }, motivo }, cookieSamu)); // 200 SAMU
    verificar(RES, 'get', await request(app).get(U(`/operador/incidentes/${inc.id}`)).set('Cookie', cookiePnp)); // 200 con condicion
    verificar(RES, 'get', await request(app).get(U(`/operador/incidentes/${inc.id}`)).set('Cookie', cookieSamu)); // 200 con acceso

    // Detalle sanitario.
    verificar(OPE, 'get', await request(app).get(U(`/operador/incidentes/${inc.id}/evaluacion`)).set('Cookie', cookieSamu)); // 200
    verificar(OPE, 'get', await request(app).get(U(`/operador/incidentes/${inc.id}/evaluacion?x=1`)).set('Cookie', cookieSamu)); // 400
    verificar(OPE, 'get', await request(app).get(U(`/operador/incidentes/${inc.id}/evaluacion`))); // 401
    verificar(OPE, 'get', await request(app).get(U(`/operador/incidentes/${inc.id}/evaluacion`)).set('Cookie', cookieAdmin)); // 403
    verificar(OPE, 'get', await request(app).get(U(`/operador/incidentes/${inc.id}/evaluacion`)).set('Cookie', cookiePnp)); // 404

    // 503: la escritura de versiones y del registro de accesos falla (triggers temporales).
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION falla_contrato_p5() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'secreto SQL'; END $$`,
    );
    await prisma.$executeRawUnsafe('CREATE TRIGGER falla_versiones BEFORE INSERT ON versiones_evaluacion FOR EACH ROW EXECUTE FUNCTION falla_contrato_p5()');
    await prisma.$executeRawUnsafe('CREATE TRIGGER falla_accesos BEFORE INSERT ON accesos_evaluacion FOR EACH ROW EXECUTE FUNCTION falla_contrato_p5()');
    try {
      const casos = [
        [CIU, 'post', ciu(inc.referencia, { heridos: 'no' })],
        [OPE, 'post', ope(inc.id, { heridos: 'no', motivo })],
        [OPE, 'get', request(app).get(U(`/operador/incidentes/${inc.id}/evaluacion`)).set('Cookie', cookieSamu)],
      ] as const;
      for (const [doc, metodo, pendiente] of casos) {
        const r = await pendiente;
        expect(r.status).toBe(503);
        expect(r.text).not.toContain('secreto');
        verificar(doc, metodo, r);
      }
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS falla_versiones ON versiones_evaluacion');
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS falla_accesos ON accesos_evaluacion');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS falla_contrato_p5()');
    }
  });

  it('evidencias fotograficas (P5.2): cada estado documentado coincide con la respuesta real', async () => {
    const CAR = '/incidentes/{referencia}/evidencias';
    const COP = '/operador/incidentes/{id}/evidencias/{evidenciaId}/contenido';
    const CCI = '/ciudadano/incidentes/{referencia}/evidencias/{evidenciaId}/contenido';
    const RES = '/operador/incidentes/{id}';
    const DET = '/ciudadano/incidentes/{referencia}';
    const U = (r: string) => `/api/v1${r}`;
    const arnes = crearArnes({ prisma, enrutar: true });
    const { app, procesador, almacenEvidencias } = arnes;
    await limpiarBd(prisma);
    await new PrismaTerritorioAdapter(prisma).importar(paqueteSintetico().preparado, true);
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const cookieAdmin = await cookieInstitucional(app, admin.correo);
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'], creadoPor: admin.id });
    const cookiePnp = await cookieInstitucional(app, pnp.operadores[0]!.correo);
    const ciudadano = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    const token = (await request(app).post(RUTA_LOGIN).send({ correo: ciudadano.correo, contrasena: CLAVE })).body.token as string;
    const robo = (extra: Record<string, unknown> = {}) => JSON.stringify({
      categoriaId: 'robo', descripcion: 'Me arrebataron el celular en la esquina',
      ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() }, punto: { latitud: 1, longitud: 1, origen: 'manual' },
      ...extra,
    });
    const conCuenta = await request(app).post(U('/incidentes')).set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/json')
      .set('Idempotency-Key', randomUUID()).send(robo());
    const invitado = await request(app).post(U('/incidentes')).set('Content-Type', 'application/json')
      .set('Idempotency-Key', randomUUID()).send(robo({ telefonoContacto: '987654321' }));
    verificar('/incidentes', 'post', invitado); // 201 con permisoEvidencias
    await procesador.esperarReposo();
    await procesador.procesarPendientes();
    const ref = conCuenta.body.referencia as string;
    const inc = await prisma.incidente.findUniqueOrThrow({ where: { referencia: ref } });
    const jpg = await jpegRuido(24, 24, 80, 5);
    const subir = (referencia: string, o: { token?: string; permiso?: string; cookie?: string; clave?: string | null; archivo?: Buffer; tipo?: string } = { token }, a = app) => {
      let q = request(a).post(U(`/incidentes/${referencia}/evidencias`));
      if (o.token) q = q.set('Authorization', `Bearer ${o.token}`);
      if (o.permiso) q = q.set('X-Permiso-Evidencias', o.permiso);
      if (o.cookie) q = q.set('Cookie', o.cookie);
      if (o.clave !== null) q = q.set('Idempotency-Key', o.clave ?? randomUUID());
      return q.attach('foto', o.archivo ?? jpg, { filename: 'f.jpg', contentType: o.tipo ?? 'image/jpeg' });
    };

    const clave = randomUUID();
    const nueva = await subir(ref, { token, clave });
    verificar(CAR, 'post', nueva); // 201
    verificar(CAR, 'post', await subir(ref, { token, clave })); // 200
    verificar(CAR, 'post', await subir(ref, { token, clave: null })); // 400
    verificar(CAR, 'post', await subir(ref, {})); // 401
    verificar(CAR, 'post', await subir(ref, { cookie: cookiePnp })); // 403
    verificar(CAR, 'post', await subir('INC-00000-00000', { token })); // 404
    verificar(CAR, 'post', await subir(ref, { token, clave, archivo: await jpegRuido(24, 24, 80, 6) })); // 409
    verificar(CAR, 'post', await subir(ref, { token, archivo: Buffer.alloc(5 * 1024 * 1024 + 1, 1) })); // 413
    verificar(CAR, 'post', await request(app).post(U(`/incidentes/${ref}/evidencias`)).set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID()).set('Content-Type', 'application/json').send('{}')); // 415
    verificar(CAR, 'post', await subir(ref, { token, archivo: Buffer.from('%PDF-1.4 falso') })); // 422
    const estricto = crearArnes({ prisma, limiteCargasInvitado: { maximo: 1, ventanaMs: 60 * 60 * 1000 } });
    const permiso = invitado.body.permisoEvidencias.valor as string;
    expect((await subir(invitado.body.referencia, { permiso }, estricto.app)).status).toBe(201);
    verificar(CAR, 'post', await subir(invitado.body.referencia, { permiso }, estricto.app)); // 429
    const deshabilitado = crearArnes({ prisma, almacenEvidencias: null });
    verificar(CAR, 'post', await subir(ref, { token }, deshabilitado.app)); // 503

    const ev = nueva.body.id as string;
    const cop = (id: string, e: string, cookie?: string, query = '') => {
      const q = request(app).get(U(`/operador/incidentes/${id}/evidencias/${e}/contenido${query}`)).buffer(true);
      return cookie ? q.set('Cookie', cookie) : q;
    };
    verificar(COP, 'get', await cop(inc.id, ev, cookiePnp)); // 200
    verificar(COP, 'get', await cop(inc.id, ev, cookiePnp, '?x=1')); // 400
    verificar(COP, 'get', await cop(inc.id, ev)); // 401
    verificar(COP, 'get', await cop(inc.id, ev, cookieAdmin)); // 403
    verificar(COP, 'get', await cop(inc.id, randomUUID(), cookiePnp)); // 404
    verificar(RES, 'get', await request(app).get(U(`/operador/incidentes/${inc.id}`)).set('Cookie', cookiePnp)); // 200 con evidencias

    const cci = (referencia: string, e: string, auth: { token?: string; cookie?: string } = { token }, query = '') => {
      let q = request(app).get(U(`/ciudadano/incidentes/${referencia}/evidencias/${e}/contenido${query}`)).buffer(true);
      if (auth.token) q = q.set('Authorization', `Bearer ${auth.token}`);
      if (auth.cookie) q = q.set('Cookie', auth.cookie);
      return q;
    };
    verificar(CCI, 'get', await cci(ref, ev)); // 200
    verificar(CCI, 'get', await cci(ref, ev, { token }, '?x=1')); // 400
    verificar(CCI, 'get', await cci(ref, ev, {})); // 401
    verificar(CCI, 'get', await cci(ref, ev, { cookie: cookiePnp })); // 403
    verificar(CCI, 'get', await cci(ref, randomUUID())); // 404
    verificar(DET, 'get', await request(app).get(U(`/ciudadano/incidentes/${ref}`)).set('Authorization', `Bearer ${token}`)); // 200 con evidencias

    almacenEvidencias.fallarObtener = true;
    try {
      verificar(COP, 'get', await cop(inc.id, ev, cookiePnp)); // 503
      verificar(CCI, 'get', await cci(ref, ev)); // 503
    } finally {
      almacenEvidencias.fallarObtener = false;
    }
  });

  it('atencion institucional (P6): cada estado documentado coincide con la respuesta real', async () => {
    const ASU = '/operador/incidentes/{id}/asumir';
    const TRA = '/operador/incidentes/{id}/transiciones';
    const VER = '/operador/incidentes/{id}/verificacion';
    const ASI = '/admin/asignaciones';
    const CAN = '/admin/asignaciones/{id}/candidatos';
    const LIB = '/admin/asignaciones/{id}/liberar';
    const REA = '/admin/asignaciones/{id}/reasignar';
    const U = (r: string) => `/api/v1${r}`;
    const arnes = crearArnes({ prisma, enrutar: true });
    const { app, procesador } = arnes;
    await limpiarBd(prisma);
    await new PrismaTerritorioAdapter(prisma).importar(paqueteSintetico().preparado, true);
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const cookieAdmin = await cookieInstitucional(app, admin.correo);
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'], operadores: ['activo', 'activo'], creadoPor: admin.id });
    const ajena = await crearSedeDePrueba(prisma, { institucion: 'pnp', distritos: ['DIS-02'], categorias: ['robo'], creadoPor: admin.id });
    const [opA, opB] = await Promise.all(pnp.operadores.map((o) => cookieInstitucional(app, o.correo)));
    const opAjeno = await cookieInstitucional(app, ajena.operadores[0]!.correo);
    const inc = await registrarIncidente(app, prisma);
    const otro = await registrarIncidente(app, prisma);
    await procesador.esperarReposo();
    await procesador.procesarPendientes();
    const motivo = 'Confirmado por llamada al lugar';
    const post = (ruta: string, cookie: string | null, cuerpo?: unknown, tipo = 'application/json') => {
      let r = request(app).post(U(ruta)).set('Origin', ORIGEN_WEB_PRUEBA);
      if (cookie) r = r.set('Cookie', cookie);
      return cuerpo === undefined ? r : r.set('Content-Type', tipo).send(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
    };
    const get = (ruta: string, cookie: string | null) => (cookie ? request(app).get(U(ruta)).set('Cookie', cookie) : request(app).get(U(ruta)));

    // Asumir.
    verificar(ASU, 'post', await post(`/operador/incidentes/${inc.id}/asumir`, opA!)); // 201
    verificar(ASU, 'post', await post(`/operador/incidentes/${inc.id}/asumir`, opA!)); // 200
    verificar(ASU, 'post', await post(`/operador/incidentes/${inc.id}/asumir`, opB!)); // 409
    verificar(ASU, 'post', await post(`/operador/incidentes/${inc.id}/asumir`, opA!, {})); // 400
    verificar(ASU, 'post', await post(`/operador/incidentes/${inc.id}/asumir`, null)); // 401
    verificar(ASU, 'post', await post(`/operador/incidentes/${inc.id}/asumir`, cookieAdmin)); // 403
    verificar(ASU, 'post', await post(`/operador/incidentes/${inc.id}/asumir`, opAjeno)); // 404

    // Verificacion.
    const v = { valor: 'VERIFICADO', motivo, estadoEsperado: 'EN_REVISION' };
    verificar(VER, 'post', await post(`/operador/incidentes/${inc.id}/verificacion`, opA!, v)); // 200
    verificar(VER, 'post', await post(`/operador/incidentes/${inc.id}/verificacion`, opA!, { valor: 'x' })); // 400
    verificar(VER, 'post', await post(`/operador/incidentes/${inc.id}/verificacion`, null, v)); // 401
    verificar(VER, 'post', await post(`/operador/incidentes/${inc.id}/verificacion`, opB!, v)); // 403
    verificar(VER, 'post', await post(`/operador/incidentes/${inc.id}/verificacion`, opAjeno, v)); // 404
    verificar(VER, 'post', await post(`/operador/incidentes/${inc.id}/verificacion`, opA!, { ...v, estadoEsperado: 'REGISTRADO' })); // 409

    // Transiciones.
    const ini = { accion: 'iniciar_atencion', estadoEsperado: 'EN_REVISION' };
    verificar(TRA, 'post', await post(`/operador/incidentes/${inc.id}/transiciones`, opA!, { accion: 'cerrar' })); // 400
    verificar(TRA, 'post', await post(`/operador/incidentes/${inc.id}/transiciones`, null, ini)); // 401
    verificar(TRA, 'post', await post(`/operador/incidentes/${inc.id}/transiciones`, opB!, ini)); // 403
    verificar(TRA, 'post', await post(`/operador/incidentes/${inc.id}/transiciones`, opAjeno, ini)); // 404
    verificar(TRA, 'post', await post(`/operador/incidentes/${inc.id}/transiciones`, opA!, 'x', 'text/plain')); // 415
    verificar(TRA, 'post', await post(`/operador/incidentes/${inc.id}/transiciones`, opA!, ini)); // 200
    verificar(TRA, 'post', await post(`/operador/incidentes/${inc.id}/transiciones`, opA!, ini)); // 409

    // Prioridad (grupo C).
    const PRI = '/operador/incidentes/{id}/prioridad';
    const pri = { valor: 'URGENTE', motivo };
    verificar(PRI, 'post', await post(`/operador/incidentes/${inc.id}/prioridad`, opA!, pri)); // 200
    verificar(PRI, 'post', await post(`/operador/incidentes/${inc.id}/prioridad`, opA!, { valor: 'BAJA', motivo })); // 400
    verificar(PRI, 'post', await post(`/operador/incidentes/${inc.id}/prioridad`, null, pri)); // 401
    verificar(PRI, 'post', await post(`/operador/incidentes/${inc.id}/prioridad`, opB!, pri)); // 403
    verificar(PRI, 'post', await post(`/operador/incidentes/${inc.id}/prioridad`, opAjeno, pri)); // 404

    // Vinculo (grupo B): `tercero` se vincula a `inc`.
    const VIN = '/operador/incidentes/{id}/vinculo';
    const tercero = await registrarIncidente(app, prisma);
    await procesador.esperarReposo();
    await procesador.procesarPendientes();
    const vin = { referenciaPrincipal: inc.referencia, motivo };
    verificar(VIN, 'post', await post(`/operador/incidentes/${tercero.id}/vinculo`, opA!, { motivo })); // 400
    verificar(VIN, 'post', await post(`/operador/incidentes/${tercero.id}/vinculo`, null, vin)); // 401
    verificar(VIN, 'post', await post(`/operador/incidentes/${tercero.id}/vinculo`, opA!, vin)); // 403 (sin asumir)
    verificar(VIN, 'post', await post(`/operador/incidentes/${tercero.id}/vinculo`, opAjeno, vin)); // 404
    await post(`/operador/incidentes/${tercero.id}/asumir`, opA!);
    verificar(VIN, 'post', await post(`/operador/incidentes/${tercero.id}/vinculo`, opA!, { referenciaPrincipal: tercero.referencia, motivo })); // 409
    verificar(VIN, 'post', await post(`/operador/incidentes/${tercero.id}/vinculo`, opA!, vin)); // 200

    // Administrador.
    verificar(ASI, 'get', await get(ASI, cookieAdmin)); // 200
    verificar(ASI, 'get', await get(`${ASI}?x=1`, cookieAdmin)); // 400
    verificar(ASI, 'get', await get(ASI, null)); // 401
    verificar(ASI, 'get', await get(ASI, opA!)); // 403
    const asig = (await get(ASI, cookieAdmin)).body.elementos[0].id as string;
    verificar(CAN, 'get', await get(`${ASI}/${asig}/candidatos`, cookieAdmin)); // 200
    verificar(CAN, 'get', await get(`${ASI}/${asig}/candidatos`, null)); // 401
    verificar(CAN, 'get', await get(`${ASI}/${asig}/candidatos`, opA!)); // 403
    verificar(CAN, 'get', await get(`${ASI}/${randomUUID()}/candidatos`, cookieAdmin)); // 404
    verificar(REA, 'post', await post(`${ASI}/${asig}/reasignar`, cookieAdmin, { operadorId: 'x', motivo })); // 400
    verificar(REA, 'post', await post(`${ASI}/${asig}/reasignar`, null, { operadorId: pnp.operadores[1]!.id, motivo })); // 401
    verificar(REA, 'post', await post(`${ASI}/${asig}/reasignar`, opA!, { operadorId: pnp.operadores[1]!.id, motivo })); // 403
    verificar(REA, 'post', await post(`${ASI}/${randomUUID()}/reasignar`, cookieAdmin, { operadorId: pnp.operadores[1]!.id, motivo })); // 404
    verificar(REA, 'post', await post(`${ASI}/${asig}/reasignar`, cookieAdmin, { operadorId: ajena.operadores[0]!.id, motivo })); // 409
    verificar(REA, 'post', await post(`${ASI}/${asig}/reasignar`, cookieAdmin, { operadorId: pnp.operadores[1]!.id, motivo })); // 200
    const nueva = (await get(ASI, cookieAdmin)).body.elementos[0].id as string;
    verificar(LIB, 'post', await post(`${ASI}/${nueva}/liberar`, cookieAdmin, { motivo: 'x' })); // 400
    verificar(LIB, 'post', await post(`${ASI}/${nueva}/liberar`, null, { motivo })); // 401
    verificar(LIB, 'post', await post(`${ASI}/${nueva}/liberar`, opA!, { motivo })); // 403
    verificar(LIB, 'post', await post(`${ASI}/${asig}/liberar`, cookieAdmin, { motivo })); // 404 (ya inactiva)
    verificar(LIB, 'post', await post(`${ASI}/${nueva}/liberar`, cookieAdmin, { motivo })); // 200
    // 409: asignacion activa de un incidente cerrado.
    await post(`/operador/incidentes/${otro.id}/asumir`, opA!);
    const deOtro = (await get(ASI, cookieAdmin)).body.elementos.find((e: { referencia: string }) => e.referencia === otro.referencia).id as string;
    await post(`/operador/incidentes/${otro.id}/transiciones`, opA!, { accion: 'cerrar', estadoEsperado: 'EN_REVISION', resultado: 'DESCARTADO', motivo, resumenCiudadano: 'El hecho no pudo confirmarse.' });
    verificar(LIB, 'post', await post(`${ASI}/${deOtro}/liberar`, cookieAdmin, { motivo })); // 409
    verificar(PRI, 'post', await post(`/operador/incidentes/${otro.id}/prioridad`, opA!, pri)); // 409 (cerrado)

    // Seguimiento del invitado con hitos y cierre conforme al esquema.
    verificar('/publico/seguimiento', 'post', await request(app).post(U('/publico/seguimiento')).set('Content-Type', 'application/json')
      .send(JSON.stringify({ referencia: otro.referencia, codigo: otro.codigo })));
    verificar('/operador/incidentes/{id}', 'get', await get(`/operador/incidentes/${inc.id}`, opB!));

    // 503: servicio de atencion averiado.
    const falla = () => Promise.reject(new Error('bd caida'));
    const roto = new Proxy({}, { get: () => falla }) as unknown as ServicioAtencion;
    const caida = express();
    caida.use('/api/v1', crearRouterAtencion(roto, arnes.enrutamiento, {
      idPorReferencia: async () => inc.id,
      identificar: arnes.modulo.identificarSolicitante,
      origenWebPermitido: arnes.modulo.origenWebPermitido,
      ambito: async (id) => {
        const a = await arnes.modulo.consultarAmbitoOperador.ejecutar(id);
        return a ? { sedeId: a.sede.id, distritos: a.distritos, categorias: a.categorias } : null;
      },
      logger: arnes.logger,
    }));
    const casos = [
      [ASU, 'post', request(caida).post(U(`/operador/incidentes/${inc.id}/asumir`)).set('Cookie', opA!).set('Origin', ORIGEN_WEB_PRUEBA)],
      [TRA, 'post', request(caida).post(U(`/operador/incidentes/${inc.id}/transiciones`)).set('Cookie', opA!).set('Origin', ORIGEN_WEB_PRUEBA)
        .set('Content-Type', 'application/json').send(JSON.stringify(ini))],
      [VER, 'post', request(caida).post(U(`/operador/incidentes/${inc.id}/verificacion`)).set('Cookie', opA!).set('Origin', ORIGEN_WEB_PRUEBA)
        .set('Content-Type', 'application/json').send(JSON.stringify(v))],
      [PRI, 'post', request(caida).post(U(`/operador/incidentes/${inc.id}/prioridad`)).set('Cookie', opA!).set('Origin', ORIGEN_WEB_PRUEBA)
        .set('Content-Type', 'application/json').send(JSON.stringify(pri))],
      [VIN, 'post', request(caida).post(U(`/operador/incidentes/${otro.id}/vinculo`)).set('Cookie', opA!).set('Origin', ORIGEN_WEB_PRUEBA)
        .set('Content-Type', 'application/json').send(JSON.stringify(vin))],
      [ASI, 'get', request(caida).get(U(ASI)).set('Cookie', cookieAdmin)],
      [CAN, 'get', request(caida).get(U(`${ASI}/${nueva}/candidatos`)).set('Cookie', cookieAdmin)],
      [LIB, 'post', request(caida).post(U(`${ASI}/${nueva}/liberar`)).set('Cookie', cookieAdmin).set('Origin', ORIGEN_WEB_PRUEBA)
        .set('Content-Type', 'application/json').send(JSON.stringify({ motivo }))],
      [REA, 'post', request(caida).post(U(`${ASI}/${nueva}/reasignar`)).set('Cookie', cookieAdmin).set('Origin', ORIGEN_WEB_PRUEBA)
        .set('Content-Type', 'application/json').send(JSON.stringify({ operadorId: pnp.operadores[1]!.id, motivo }))],
    ] as const;
    for (const [doc, metodo, pendiente] of casos) {
      const r = await pendiente;
      expect(r.status).toBe(503);
      verificar(doc, metodo, r);
    }
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
