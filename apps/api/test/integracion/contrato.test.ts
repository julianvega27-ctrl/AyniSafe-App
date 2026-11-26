import { expectConContexto } from '../expect-contexto';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { resolve } from 'node:path';
import request, { type Response } from 'supertest';
import { PrismaTerritorioAdapter } from '../../src/modules/consultas/infraestructura/prisma-territorio.adapter';
import { paqueteSintetico } from '../fixtures/territorio';
import { crearApp } from '../../src/app';
import { crearModuloConsultas } from '../../src/modules/consultas';
import { crearModuloReportes } from '../../src/modules/reportes';
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
  if (esquema) {
    const valido = ajv.validate(esquema, r.body);
    expectConContexto(valido, JSON.stringify(ajv.errors)).toBe(true);
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
