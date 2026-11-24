import { expectConContexto } from '../expect-contexto';
import { execFileSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { resolve } from 'node:path';
import request, { type Response } from 'supertest';
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
