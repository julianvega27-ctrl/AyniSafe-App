import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CuentasPort } from '../../src/modules/identidad/aplicacion/puertos/cuentas.port';
import { CLAVE, crearArnes, limpiarBd, RUTA_LOGIN, RUTA_REGISTRO, RUTA_SESION } from './arnes';

const base = crearArnes();
const { app, prisma } = base;

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

const alta = { nombre: 'Rosa', correo: 'rosa@ejemplo.com', contrasena: CLAVE };

describe('limite de cuerpo y tipo de contenido', () => {
  it('413: cuerpo JSON mayor de 8 KiB, sin crear cuenta', async () => {
    const grande = { ...alta, nombre: 'a'.repeat(9 * 1024) };
    const r = await request(app).post(RUTA_REGISTRO).send(grande);
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(await prisma.usuario.count()).toBe(0);
  });

  it('413 tambien en login; un cuerpo justo bajo el limite se procesa', async () => {
    expect((await request(app).post(RUTA_LOGIN).send({ correo: 'a@ejemplo.com', contrasena: 'a'.repeat(9000) })).status).toBe(413);
    const casiLleno = { nombre: 'Rosa', correo: 'rosa@ejemplo.com', contrasena: CLAVE, relleno: 'x'.repeat(7000) };
    // Bajo 8 KiB pasa el limite de tamano y falla por el campo no admitido (400), no por 413.
    expect((await request(app).post(RUTA_REGISTRO).send(casiLleno)).status).toBe(400);
  });

  it('415: tipo de contenido distinto de application/json', async () => {
    const casos = [
      request(app).post(RUTA_REGISTRO).set('Content-Type', 'text/plain').send('nombre=Rosa'),
      request(app).post(RUTA_REGISTRO).type('form').send(alta),
      request(app).post(RUTA_LOGIN).set('Content-Type', 'application/xml').send('<a/>'),
      request(app).post(RUTA_LOGIN).send(),
      request(app).post(RUTA_REGISTRO).set('Content-Type', 'application/json; charset=utf-16').send('{}'),
    ];
    for (const r of await Promise.all(casos)) {
      expect(r.status).toBe(415);
      expect(r.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    }
    expect(await prisma.usuario.count()).toBe(0);
  });

  it('application/json con charset utf-8 es valido', async () => {
    const r = await request(app).post(RUTA_REGISTRO).set('Content-Type', 'application/json; charset=utf-8').send(JSON.stringify(alta));
    expect(r.status).toBe(201);
  });
});

describe('500: errores inesperados', () => {
  it('responde un mensaje generico con requestId, sin detalles internos', async () => {
    const reventada: CuentasPort = {
      crearCiudadano: () => Promise.reject(new Error('DETALLE-INTERNO: select * from usuarios en 10.0.0.5')),
      buscarPorCorreo: () => Promise.reject(new Error('DETALLE-INTERNO: select * from usuarios en 10.0.0.5')),
      buscarPorId: () => Promise.resolve(null),
    };
    const conFallo = crearArnes({ prisma, sobrescribir: { cuentas: reventada } });
    const r = await request(conFallo.app).post(RUTA_REGISTRO).send(alta);
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('INTERNAL_ERROR');
    expect(r.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.headers['x-request-id']).toBe(r.body.error.requestId);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toMatch(/DETALLE-INTERNO|select|10\.0\.0\.5|stack|at Object/i);
    // El log interno guarda solo el nombre del error, nunca su mensaje.
    expect(conFallo.logger.texto()).not.toContain('DETALLE-INTERNO');
    expect(conFallo.logger.eventos.some((e) => e.evento === 'error_interno' && e.error === 'Error')).toBe(true);
  });
});

describe('cabeceras', () => {
  it('toda respuesta de autenticacion lleva Cache-Control: no-store', async () => {
    await request(app).post(RUTA_REGISTRO).send(alta).expect(201);
    const respuestas = [
      await request(app).post(RUTA_REGISTRO).send(alta), // 409
      await request(app).post(RUTA_REGISTRO).send({}), // 400
      await request(app).post(RUTA_LOGIN).send({ correo: alta.correo, contrasena: CLAVE }), // 200
      await request(app).post(RUTA_LOGIN).send({ correo: alta.correo, contrasena: 'incorrecta-pero-larga' }), // 401
      await request(app).get(RUTA_SESION), // 401
      await request(app).delete(RUTA_SESION), // 204
      await request(app).post(RUTA_REGISTRO).set('Content-Type', 'text/plain').send('x'), // 415
    ];
    expect(respuestas.map((r) => r.status)).toEqual([409, 400, 200, 401, 401, 204, 415]);
    for (const r of respuestas) expect(r.headers['cache-control']).toBe('no-store');
  });

  it('no expone X-Powered-By y cada solicitud recibe un requestId distinto', async () => {
    const a = await request(app).get(RUTA_SESION);
    const b = await request(app).get(RUTA_SESION);
    expect(a.headers['x-powered-by']).toBeUndefined();
    expect(a.body.error.requestId).not.toBe(b.body.error.requestId);
  });
});

describe('registros sin secretos', () => {
  it('ni contrasenas, tokens, correos, cuerpos ni cabeceras Authorization llegan a logs o consola', async () => {
    const consola = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info')];
    const arnes = crearArnes({ prisma });
    const claveUnica = 'clave-unica-detectable-7c1e9b';
    const correoUnico = 'detectable.7c1e9b@ejemplo.com';

    await request(arnes.app).post(RUTA_REGISTRO).send({ nombre: 'Nombre Detectable', correo: correoUnico, contrasena: claveUnica }).expect(201);
    await request(arnes.app).post(RUTA_REGISTRO).send({ nombre: 'Otra', correo: correoUnico, contrasena: claveUnica }).expect(409);
    await request(arnes.app).post(RUTA_REGISTRO).send({ correo: correoUnico, contrasena: 'corta' }).expect(400);
    const login = await request(arnes.app).post(RUTA_LOGIN).send({ correo: correoUnico, contrasena: claveUnica });
    await request(arnes.app).post(RUTA_LOGIN).send({ correo: correoUnico, contrasena: 'otra-incorrecta-larga' }).expect(401);
    const token = login.body.token as string;
    await request(arnes.app).get(`${RUTA_SESION}?token=${token}`).set('Authorization', `Bearer ${token}`).expect(200);
    await request(arnes.app).delete(RUTA_SESION).set('Authorization', `Bearer ${token}`).expect(204);

    const registro = arnes.logger.texto();
    const salidaConsola = JSON.stringify(consola.flatMap((s) => s.mock.calls));
    for (const secreto of [claveUnica, 'otra-incorrecta-larga', token, correoUnico, 'Nombre Detectable', 'Bearer', 'authorization', 'token=']) {
      expect(registro.toLowerCase()).not.toContain(secreto.toLowerCase());
      expect(salidaConsola.toLowerCase()).not.toContain(secreto.toLowerCase());
    }
    // Si registra: requestId, metodo, patron de ruta, estado y duracion.
    const evento = arnes.logger.eventos.find((e) => e.ruta?.endsWith('/auth/sesion') && e.metodo === 'GET');
    expect(evento).toMatchObject({ evento: 'solicitud', estado: 200 });
    expect(evento?.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof evento?.duracionMs).toBe('number');
    consola.forEach((s) => s.mockRestore());
  });
});

describe('el token solo se acepta por cabecera Authorization', () => {
  it('rechaza el token en la URL o en el cuerpo', async () => {
    await request(app).post(RUTA_REGISTRO).send(alta).expect(201);
    const { body } = await request(app).post(RUTA_LOGIN).send({ correo: alta.correo, contrasena: CLAVE });
    expect((await request(app).get(`${RUTA_SESION}?token=${body.token}`)).status).toBe(401);
    expect((await request(app).get(RUTA_SESION).set('Content-Type', 'application/json').send({ token: body.token })).status).toBe(401);
    expect((await request(app).get(RUTA_SESION).set('Authorization', body.token)).status).toBe(401); // sin esquema Bearer
    expect((await request(app).get(RUTA_SESION).set('Authorization', `Bearer ${body.token}`)).status).toBe(200);
  });
});
