import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { TokensCuentaPort } from '../../src/modules/identidad/aplicacion/puertos/tokens-cuenta.port';
import { ServicioNoDisponibleError } from '../../src/modules/identidad/dominio/errores';
import {
  CLAVE,
  HUELLA_PRUEBA,
  RUTA_LOGIN,
  RUTA_REGISTRO,
  RUTA_SESION,
  RelojControlable,
  URL_PUBLICA_PRUEBA,
  crearArnes,
  limpiarBd,
} from './arnes';

const base = crearArnes();
const { app, prisma, reloj, correo, modulo, logger } = base;
const RUTA_RECUPERACION = '/api/v1/auth/recuperaciones';
const RUTA_CONSULTA = '/api/v1/auth/tokens/consulta';
const RUTA_RESTABLECER = '/api/v1/auth/contrasena/restablecer';
const RUTA_ACTIVACION = '/api/v1/auth/activaciones';
const NUEVA = 'una contraseña nueva bien larga 5e2b';
const MIN = 60 * 1000;
const HORA = 60 * MIN;

afterAll(async () => {
  await base.modulo.gestorEnvios.detener();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
  correo.enviados.length = 0;
  correo.programarFallos(0);
  logger.eventos.length = 0;
});

async function ciudadano(email: string, ap = app) {
  const r = await request(ap).post(RUTA_REGISTRO).send({ nombre: 'Rosa Quispe', correo: email, contrasena: CLAVE });
  expect(r.status).toBe(201);
  return r.body.usuario.id as string;
}

async function pendiente(email: string, rol: 'ciudadano' | 'operador' = 'operador') {
  const u = await prisma.usuario.create({
    data: { nombre: 'Invitada', correoNormalizado: email, passwordHash: null, rol, estado: 'pendiente_activacion' },
  });
  return u.id;
}

const login = (email: string, contrasena: string, ap = app) => request(ap).post(RUTA_LOGIN).send({ correo: email, contrasena });
const recuperar = (email: unknown, ap = app) => request(ap).post(RUTA_RECUPERACION).send({ correo: email });
const contarEnvios = async () =>
  (await prisma.$queryRawUnsafe<{ n: number }[]>('SELECT count(*)::int AS n FROM envios_correo'))[0]!.n;
const contarTokens = async () =>
  (await prisma.$queryRawUnsafe<{ n: number }[]>('SELECT count(*)::int AS n FROM tokens_cuenta'))[0]!.n;

describe('5.1 POST /auth/recuperaciones', () => {
  it('202 uniforme: mismo estado y cuerpo para cuenta existente, inexistente, suspendida, pendiente y operador; solo la ciudadana activa recibe correo', async () => {
    await ciudadano('activa@ejemplo.com');
    const s = await ciudadano('suspendida@ejemplo.com');
    await prisma.usuario.update({ where: { id: s }, data: { estado: 'suspendido' } });
    const o = await ciudadano('operador@ejemplo.com');
    await prisma.usuario.update({ where: { id: o }, data: { rol: 'operador' } });
    await pendiente('pendiente@ejemplo.com');

    const respuestas = [];
    for (const c of ['activa', 'inexistente', 'suspendida', 'pendiente', 'operador']) {
      respuestas.push(await recuperar(`${c}@ejemplo.com`));
    }
    await modulo.gestorEnvios.esperarReposo();

    for (const r of respuestas) {
      expect(r.status).toBe(202);
      expect(r.body).toEqual({ estado: 'solicitud_recibida' });
      expect(r.headers['cache-control']).toBe('no-store');
    }
    expect(new Set(respuestas.map((r) => JSON.stringify(r.body))).size).toBe(1);
    expect(correo.enviados.map((m) => m.para)).toEqual(['activa@ejemplo.com']);
    expect(await contarEnvios()).toBe(1);
  });

  it('normaliza el correo como en Spec 01 (mayusculas y espacios externos)', async () => {
    await ciudadano('vecina@ejemplo.com');
    expect((await recuperar('  Vecina@Ejemplo.COM ')).status).toBe(202);
    await modulo.gestorEnvios.esperarReposo();
    expect(correo.enviados).toHaveLength(1);
  });

  it('no depende del proveedor: con el correo caido responde igual 202 y deja el envio pendiente', async () => {
    await ciudadano('a@ejemplo.com');
    correo.programarFallos(5, 'CONEXION');
    const r = await recuperar('a@ejemplo.com');
    await modulo.gestorEnvios.esperarReposo();
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ estado: 'solicitud_recibida' });
    const [fila] = await prisma.$queryRawUnsafe<{ estado: string; intentos: number }[]>('SELECT estado::text, intentos FROM envios_correo');
    expect(fila).toMatchObject({ estado: 'pendiente', intentos: 1 });
  });

  it('una segunda solicitud con un envio activo no apila otro correo', async () => {
    await ciudadano('a@ejemplo.com');
    correo.programarFallos(1);
    await recuperar('a@ejemplo.com');
    await modulo.gestorEnvios.esperarReposo();
    await recuperar('a@ejemplo.com');
    await modulo.gestorEnvios.esperarReposo();
    expect(await contarEnvios()).toBe(1);
  });

  it('400 VALIDATION_ERROR con error del campo correo, sin token ni envio', async () => {
    for (const cuerpo of [{}, { correo: 5 }, { correo: 'no-es-correo' }, { correo: '' }]) {
      const r = await request(app).post(RUTA_RECUPERACION).send(cuerpo);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
      expect(r.body.error.fields).toHaveProperty('correo');
    }
    const extra = await request(app).post(RUTA_RECUPERACION).send({ correo: 'a@ejemplo.com', rol: 'administrador' });
    expect(extra.status).toBe(400);
    expect(await contarEnvios()).toBe(0);
    expect(await contarTokens()).toBe(0);
  });

  it('415 si el contenido no es JSON', async () => {
    const r = await request(app).post(RUTA_RECUPERACION).set('Content-Type', 'text/plain').send('correo=a@ejemplo.com');
    expect(r.status).toBe(415);
  });
});

describe('5.2 consulta, restablecimiento y activacion por HTTP', () => {
  const emitir = (id: string, p: 'recuperacion' | 'activacion' = 'recuperacion') => modulo.emitirToken.ejecutar(id, p);

  it('restablecer: 204 sin cuerpo ni sesion, no-store, y la contraseña nueva autentica', async () => {
    const id = await ciudadano('a@ejemplo.com');
    const { token } = await emitir(id);
    const r = await request(app).post(RUTA_RESTABLECER).send({ token, contrasena: NUEVA });
    expect(r.status).toBe(204);
    expect(r.text).toBe('');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(await prisma.sesion.count()).toBe(0);
    expect((await login('a@ejemplo.com', NUEVA)).status).toBe(200);
    expect((await login('a@ejemplo.com', CLAVE)).status).toBe(401);
  });

  it('400 por contraseña no admitida: error del campo y el token sigue vigente', async () => {
    const id = await ciudadano('a@ejemplo.com');
    const { token } = await emitir(id);
    for (const contrasena of ['a'.repeat(14), 'a'.repeat(129)]) {
      const r = await request(app).post(RUTA_RESTABLECER).send({ token, contrasena });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
      expect(r.body.error.fields).toHaveProperty('contrasena');
      expect(JSON.stringify(r.body)).not.toContain('aaaaaaaaaaaaaa');
    }
    expect((await request(app).post(RUTA_CONSULTA).send({ token })).status).toBe(200);
  });

  it('404 TOKEN_INVALID, 410 TOKEN_USED y 410 TOKEN_EXPIRED con su mensaje propio', async () => {
    const id = await ciudadano('a@ejemplo.com');
    const a = await emitir(id);
    const desconocido = await request(app).post(RUTA_RESTABLECER).send({ token: 'no-existe', contrasena: NUEVA });
    expect(desconocido.status).toBe(404);
    expect(desconocido.body.error.code).toBe('TOKEN_INVALID');

    await request(app).post(RUTA_RESTABLECER).send({ token: a.token, contrasena: NUEVA }).expect(204);
    const usado = await request(app).post(RUTA_RESTABLECER).send({ token: a.token, contrasena: NUEVA });
    expect(usado.status).toBe(410);
    expect(usado.body.error.code).toBe('TOKEN_USED');

    const b = await emitir(id);
    reloj.avanzar(31 * MIN);
    const vencido = await request(app).post(RUTA_RESTABLECER).send({ token: b.token, contrasena: NUEVA });
    reloj.avanzar(-31 * MIN);
    expect(vencido.status).toBe(410);
    expect(vencido.body.error.code).toBe('TOKEN_EXPIRED');
    expect(new Set([desconocido, usado, vencido].map((r) => r.body.error.message)).size).toBe(3);
  });

  it('un token de activacion no sirve en restablecer y viceversa: 404 sin cambios', async () => {
    const id = await ciudadano('a@ejemplo.com');
    const act = await emitir(id, 'activacion');
    const rec = await emitir(id);
    expect((await request(app).post(RUTA_RESTABLECER).send({ token: act.token, contrasena: NUEVA })).status).toBe(404);
    expect((await request(app).post(RUTA_ACTIVACION).send({ token: rec.token, contrasena: NUEVA })).status).toBe(404);
    expect((await login('a@ejemplo.com', CLAVE)).status).toBe(200);
  });

  it('activaciones: 204, la cuenta pendiente queda activa con su contraseña y no se crea sesion', async () => {
    const id = await pendiente('invitada@ejemplo.com', 'ciudadano');
    const { token } = await emitir(id, 'activacion');
    const r = await request(app).post(RUTA_ACTIVACION).send({ token, contrasena: NUEVA });
    expect(r.status).toBe(204);
    expect(r.text).toBe('');
    expect(await prisma.sesion.count()).toBe(0);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id } })).estado).toBe('activo');
    expect((await login('invitada@ejemplo.com', NUEVA)).status).toBe(200);
  });

  it('una cuenta de operador activada no habilita el acceso ciudadano (el login sigue siendo solo ciudadano)', async () => {
    const id = await pendiente('operador@ejemplo.com', 'operador');
    const { token } = await emitir(id, 'activacion');
    await request(app).post(RUTA_ACTIVACION).send({ token, contrasena: NUEVA }).expect(204);
    const r = await login('operador@ejemplo.com', NUEVA);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('413 y 415 heredan el contrato comun', async () => {
    const grande = await request(app).post(RUTA_RESTABLECER).send({ token: 'x'.repeat(9000), contrasena: NUEVA });
    expect(grande.status).toBe(413);
    const texto = await request(app).post(RUTA_ACTIVACION).set('Content-Type', 'text/plain').send('x');
    expect(texto.status).toBe(415);
  });

  it('503 si la persistencia no esta disponible, sin detalles internos', async () => {
    const roto: TokensCuentaPort = {
      emitir: () => Promise.reject(new ServicioNoDisponibleError(new Error('detalle-interno'))),
      consultar: () => Promise.reject(new ServicioNoDisponibleError(new Error('detalle-interno'))),
      consumir: () => Promise.reject(new ServicioNoDisponibleError(new Error('detalle-interno'))),
    };
    const { app: appRota } = crearArnes({ prisma, sobrescribir: { tokensCuenta: roto } });
    for (const [ruta, cuerpo] of [
      [RUTA_CONSULTA, { token: 'abc' }],
      [RUTA_RESTABLECER, { token: 'abc', contrasena: NUEVA }],
      [RUTA_ACTIVACION, { token: 'abc', contrasena: NUEVA }],
    ] as const) {
      const r = await request(appRota).post(ruta).send(cuerpo);
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(JSON.stringify(r.body)).not.toContain('detalle-interno');
    }
  });

  it('no existe ninguna ruta para crear operadores, administradores ni sedes', async () => {
    for (const ruta of ['/api/v1/auth/operadores', '/api/v1/operadores', '/api/v1/administradores', '/api/v1/invitaciones', '/api/v1/sedes', '/api/v1/auth/activaciones/crear']) {
      expect((await request(app).post(ruta).send({ nombre: 'X', correo: 'x@ejemplo.com' })).status).toBe(404);
    }
    const alta = await request(app).post(RUTA_REGISTRO).send({ nombre: 'X', correo: 'x@ejemplo.com', contrasena: CLAVE, rol: 'operador' });
    expect(alta.status).toBe(400);
    expect(await prisma.usuario.count()).toBe(0);
  });
});

describe('5.3 invitacion reutilizable (sin crear operadores aqui)', () => {
  it('dentro de la transaccion del llamador: confirma cuenta pendiente y envio, y el correo de activacion llega tras el commit', async () => {
    const id = await prisma.$transaction(async (tx) => {
      const u = await tx.usuario.create({
        data: { nombre: 'Invitado', correoNormalizado: 'inv@ejemplo.com', passwordHash: null, rol: 'operador', estado: 'pendiente_activacion' },
      });
      expect(await modulo.invitarCuenta.ejecutar(u.id, tx)).toBe(true);
      return u.id;
    });
    modulo.gestorEnvios.despertar();
    await modulo.gestorEnvios.esperarReposo();
    expect(correo.enviados).toHaveLength(1);
    expect(correo.enviados[0]).toMatchObject({ para: 'inv@ejemplo.com', asunto: 'Activa tu cuenta de AyniSafe' });
    const token = /#t=([A-Za-z0-9_-]{43})/.exec(correo.enviados[0]!.texto)![1]!;
    await request(app).post(RUTA_ACTIVACION).send({ token, contrasena: NUEVA }).expect(204);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id } })).estado).toBe('activo');
  });

  it('si la transaccion del llamador se revierte no quedan cuenta, token ni envio', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const u = await tx.usuario.create({
          data: { nombre: 'Invitado', correoNormalizado: 'inv@ejemplo.com', passwordHash: null, rol: 'operador', estado: 'pendiente_activacion' },
        });
        await modulo.invitarCuenta.ejecutar(u.id, tx);
        throw new Error('revertir');
      }),
    ).rejects.toThrow('revertir');
    expect(await prisma.usuario.count()).toBe(0);
    expect(await contarEnvios()).toBe(0);
    expect(await contarTokens()).toBe(0);
  });
});

describe('5.4 paginas de respaldo y assetlinks.json', () => {
  const sha = (t: string) => `'sha256-${createHash('sha256').update(t).digest('base64')}'`;

  it.each(['/cuenta/restablecer', '/cuenta/activar'])('%s: HTML con CSP por hash, sin cache y sin leer el token en el servidor', async (ruta) => {
    const r = await request(app).get(`${ruta}?t=NO-DEBE-REFLEJARSE`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/html; charset=utf-8/);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.text).not.toContain('NO-DEBE-REFLEJARSE');

    const csp = r.headers['content-security-policy']!;
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    const script = /<script>([\s\S]*?)<\/script>/.exec(r.text)![1]!;
    const estilo = /<style>([\s\S]*?)<\/style>/.exec(r.text)![1]!;
    expect(csp).toContain(`script-src ${sha(script)}`);
    expect(csp).toContain(`style-src ${sha(estilo)}`);
    // El token solo se lee en el cliente, desde el fragmento, y se retira de la direccion.
    expect(script).toContain('location.hash');
    expect(script).toContain('history.replaceState');
    expect(r.text).toContain('id="codigo"');
    expect(r.text).toContain('Copiar código');
  });

  it('las paginas no estan bajo /api/v1 ni exigen sesion, y no registran solicitud con datos', async () => {
    await request(app).get('/cuenta/restablecer').expect(200);
    await request(app).get('/api/v1/cuenta/restablecer').expect(404);
    expect(logger.texto()).not.toContain('t=');
  });

  it('assetlinks.json: paquete y huellas configurados', async () => {
    const r = await request(app).get('/.well-known/assetlinks.json');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect(r.body).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'pe.edu.unsch.ayni_safe', sha256_cert_fingerprints: [HUELLA_PRUEBA] },
      },
    ]);
  });

  it('assetlinks.json sin huellas configuradas: 404, no se publica una asociacion vacia', async () => {
    const { app: sinHuellas } = crearArnes({
      prisma,
      sobrescribir: { android: { paquete: 'pe.edu.unsch.ayni_safe', huellasSha256: [] } },
    });
    expect((await request(sinHuellas).get('/.well-known/assetlinks.json')).status).toBe(404);
  });

  it('el enlace del correo apunta a una de estas paginas', async () => {
    const r = await request(app).get('/cuenta/restablecer');
    expect(r.status).toBe(200);
    expect(new URL('/cuenta/restablecer', URL_PUBLICA_PRUEBA).pathname).toBe('/cuenta/restablecer');
  });
});

describe('5.5 sesiones tras restablecer', () => {
  it('todas las sesiones previas devuelven 401, las de otro usuario siguen y el cierre voluntario sigue siendo individual', async () => {
    const a = await ciudadano('a@ejemplo.com');
    await ciudadano('b@ejemplo.com');
    const tokenDe = async (email: string) => (await login(email, CLAVE)).body.token as string;
    const a1 = await tokenDe('a@ejemplo.com');
    const a2 = await tokenDe('a@ejemplo.com');
    const b1 = await tokenDe('b@ejemplo.com');
    const consultar = (t: string) => request(app).get(RUTA_SESION).set('Authorization', `Bearer ${t}`);

    await request(app).delete(RUTA_SESION).set('Authorization', `Bearer ${a1}`).expect(204);
    expect((await consultar(a2)).status).toBe(200);

    const { token } = await modulo.emitirToken.ejecutar(a, 'recuperacion');
    await request(app).post(RUTA_RESTABLECER).send({ token, contrasena: NUEVA }).expect(204);

    expect((await consultar(a2)).status).toBe(401);
    expect((await consultar(b1)).status).toBe(200);
  });
});

describe('6.1 limites de abuso', () => {
  const nueva = (politica: object, extra: object = {}) => {
    const relojLocal = new RelojControlable();
    const a = crearArnes({ prisma, reloj: relojLocal, politica, ...extra });
    return { ...a, reloj: relojLocal };
  };

  it('por IP: al superar el umbral responde 429 con Retry-After, sin token ni envio', async () => {
    const { app: a, modulo: m } = nueva({ recuperacionPorIp: 2 });
    await ciudadano('a@ejemplo.com', a);
    for (let i = 0; i < 2; i++) await recuperar('a@ejemplo.com', a).expect(202);
    await m.gestorEnvios.esperarReposo();
    const antes = [await contarEnvios(), await contarTokens()];
    const r = await recuperar('a@ejemplo.com', a);
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBe('900');
    expect(r.body.error.code).toBe('RATE_LIMITED');
    expect([await contarEnvios(), await contarTokens()]).toEqual(antes);
    await m.gestorEnvios.detener();
  });

  it('por correo+IP: el tercer intento seguido del mismo correo desde la misma IP se limita', async () => {
    const { app: a, modulo: m } = nueva({ recuperacionPorCorreoIp: 2 });
    for (let i = 0; i < 2; i++) await recuperar('x@ejemplo.com', a).expect(202);
    expect((await recuperar('x@ejemplo.com', a)).status).toBe(429);
    expect((await recuperar('otro@ejemplo.com', a)).status).toBe(202);
    await m.gestorEnvios.detener();
  });

  it('por correo en una hora: limita desde distintas IP y no bloquea de forma permanente', async () => {
    const { app: a, reloj: r, modulo: m } = nueva({ recuperacionPorCorreo: 2 }, { saltosProxy: 1 });
    const desde = (ip: string) => request(a).post(RUTA_RECUPERACION).set('X-Forwarded-For', ip).send({ correo: 'v@ejemplo.com' });
    await desde('198.51.100.1').expect(202);
    await desde('198.51.100.2').expect(202);
    const bloqueada = await desde('198.51.100.3');
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.headers['retry-after']).toBe('3600');
    r.avanzar(HORA + MIN);
    await desde('198.51.100.3').expect(202);
    await m.gestorEnvios.detener();
  });

  it('el limite persiste tras reiniciar la API durante la ventana', async () => {
    const relojLocal = new RelojControlable();
    const primera = crearArnes({ prisma, reloj: relojLocal, politica: { recuperacionPorIp: 1 } });
    await recuperar('a@ejemplo.com', primera.app).expect(202);
    const reiniciada = crearArnes({ prisma, reloj: relojLocal, politica: { recuperacionPorIp: 1 } });
    expect((await recuperar('a@ejemplo.com', reiniciada.app)).status).toBe(429);
    await primera.modulo.gestorEnvios.detener();
    await reiniciada.modulo.gestorEnvios.detener();
  });

  it('consulta y consumo de tokens: limite por IP y otra IP no se ve afectada', async () => {
    const { app: a } = nueva({ tokenPorIp: 2 }, { saltosProxy: 1 });
    const consultar = (ip: string) => request(a).post(RUTA_CONSULTA).set('X-Forwarded-For', ip).send({ token: 'desconocido' });
    await consultar('203.0.113.7').expect(404);
    await consultar('203.0.113.7').expect(404);
    const r = await consultar('203.0.113.7');
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBe('900');
    await consultar('203.0.113.8').expect(404);
    const restablecer = await request(a).post(RUTA_RESTABLECER).set('X-Forwarded-For', '203.0.113.7').send({ token: 'x', contrasena: NUEVA });
    expect(restablecer.status).toBe(429);
  });
});

describe('6.2 tope diario global de correos', () => {
  it('al agotarse responde el mismo 503 con Retry-After exista o no la cuenta, y se libera al cambiar el dia', async () => {
    const relojLocal = new RelojControlable();
    const { app: a, modulo: m } = crearArnes({ prisma, reloj: relojLocal, politica: { correoDiarioMax: 2 } });
    await ciudadano('real@ejemplo.com', a);
    await recuperar('n1@ejemplo.com', a).expect(202);
    await recuperar('n2@ejemplo.com', a).expect(202);

    const existente = await recuperar('real@ejemplo.com', a);
    const inexistente = await recuperar('n3@ejemplo.com', a);
    for (const r of [existente, inexistente]) {
      expect(r.status).toBe(503);
      expect(r.headers['retry-after']).toBe(String(12 * 60 * 60));
      expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
    }
    const forma = (r: typeof existente) => ({ ...r.body.error, requestId: undefined });
    expect(forma(existente)).toEqual(forma(inexistente));
    expect(await contarEnvios()).toBe(0);

    relojLocal.avanzar(12 * HORA);
    await recuperar('real@ejemplo.com', a).expect(202);
    await m.gestorEnvios.detener();
  });

  it('una solicitud bloqueada por limites de IP no gasta cuota diaria', async () => {
    const relojLocal = new RelojControlable();
    const { app: a, modulo: m } = crearArnes({ prisma, reloj: relojLocal, politica: { recuperacionPorIp: 1, correoDiarioMax: 5 } });
    await recuperar('a@ejemplo.com', a).expect(202);
    await recuperar('a@ejemplo.com', a).expect(429);
    await recuperar('a@ejemplo.com', a).expect(429);
    const [fila] = await prisma.$queryRawUnsafe<{ contador: number }[]>(
      `SELECT contador FROM ventanas_intentos WHERE tipo = 'correo_dia'`,
    );
    expect(fila!.contador).toBe(1);
    await m.gestorEnvios.detener();
  });
});

describe('6.5 los secretos no aparecen en registros, errores, respuestas ni persistencia', () => {
  it('solicitud, envio fallido, consulta y cambio con valores identificables', async () => {
    const email = 'secreta-identificable@ejemplo.com';
    const id = await ciudadano(email);
    correo.programarFallos(1, 'RECHAZADO');
    const respuestas: string[] = [];
    respuestas.push(JSON.stringify((await recuperar(email)).body));
    await modulo.gestorEnvios.esperarReposo();
    // El primer intento fallo: al cumplirse la espera de 1 minuto se reintenta con una pasada manual.
    reloj.avanzar(2 * MIN);
    modulo.gestorEnvios.despertar();
    await modulo.gestorEnvios.esperarReposo();
    reloj.avanzar(-2 * MIN);

    const texto = correo.enviados[0]?.texto ?? '';
    const token = /#t=([A-Za-z0-9_-]{43})/.exec(texto)?.[1];
    expect(token).toBeDefined();
    respuestas.push(JSON.stringify((await request(app).post(RUTA_CONSULTA).send({ token })).body));
    const nuevoToken = (await modulo.emitirToken.ejecutar(id, 'recuperacion')).token;
    const cambio = await request(app).post(RUTA_RESTABLECER).send({ token: nuevoToken, contrasena: NUEVA });
    respuestas.push(cambio.text, JSON.stringify(cambio.headers));
    const mal = await request(app).post(RUTA_RESTABLECER).send({ token: nuevoToken, contrasena: NUEVA });
    respuestas.push(JSON.stringify(mal.body));

    const secretos = [NUEVA, nuevoToken, token!, `#t=${token}`, 'Restablece tu contraseña'];
    const volcados = [logger.texto(), ...respuestas];
    for (const v of volcados) for (const s of secretos) expect(v).not.toContain(s);
    expect(logger.texto()).not.toContain(email);

    // Persistencia: ni el token ni la contraseña nueva en claro en ninguna tabla.
    const tablas = ['usuarios', 'sesiones', 'tokens_cuenta', 'envios_correo', 'ventanas_intentos'];
    for (const t of tablas) {
      const filas = JSON.stringify(await prisma.$queryRawUnsafe(`SELECT * FROM ${t}`));
      for (const s of [NUEVA, nuevoToken, token!, CLAVE]) expect(filas).not.toContain(s);
    }
  });
});
