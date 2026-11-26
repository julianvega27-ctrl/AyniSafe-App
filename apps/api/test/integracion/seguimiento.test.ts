import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import {
  CLAVE,
  cookieDe,
  crearArnes,
  crearCuentaDePrueba,
  limpiarBd,
  ORIGEN_WEB_PRUEBA,
  RUTA_INST_SESIONES,
  RUTA_LOGIN,
  RUTA_REGISTRO,
} from './arnes';

const base = crearArnes();
const { app, prisma, logger } = base;
const RUTA_INC = '/api/v1/incidentes';
const RUTA_MIOS = '/api/v1/ciudadano/incidentes';
const RUTA_INV = '/api/v1/publico/seguimiento';

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  categoriaId: 'pelea',
  descripcion: 'Pelea entre varias personas frente al mercado',
  ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
  punto: { latitud: -13.16, longitud: -74.22, origen: 'manual' },
  heridos: 'no_se',
  ...extra,
});

async function ciudadano(): Promise<{ id: string; token: string }> {
  const correo = `c-${randomUUID().slice(0, 8)}@ejemplo.com`;
  const alta = await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
  const login = await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE });
  return { id: alta.body.usuario.id as string, token: login.body.token as string };
}
async function registrar(token?: string, extra: Record<string, unknown> = {}) {
  let r = request(app).post(RUTA_INC).set('Content-Type', 'application/json').set('Idempotency-Key', randomUUID());
  if (token) r = r.set('Authorization', `Bearer ${token}`);
  const res = await r.send(JSON.stringify(token ? cuerpo(extra) : cuerpo({ telefonoContacto: '987654321', ...extra })));
  expect(res.status).toBe(201);
  return res.body as { referencia: string; codigoSeguimiento?: string };
}
const mios = (token: string, consulta = '') => request(app).get(`${RUTA_MIOS}${consulta}`).set('Authorization', `Bearer ${token}`);
const consultar = (datos: unknown, app2 = app) =>
  request(app2).post(RUTA_INV).set('Content-Type', 'application/json').send(JSON.stringify(datos));

describe('historial privado con cuenta', () => {
  it('cada ciudadano ve solo lo suyo, del mas reciente al mas antiguo; sin envios de invitado', async () => {
    const [a, b] = [await ciudadano(), await ciudadano()];
    const a1 = await registrar(a.token);
    const a2 = await registrar(a.token);
    const b1 = await registrar(b.token);
    await registrar();
    const ra = await mios(a.token);
    expect(ra.status).toBe(200);
    expect(ra.headers['cache-control']).toBe('no-store');
    expect(ra.body.elementos.map((e: { referencia: string }) => e.referencia)).toEqual([a2.referencia, a1.referencia]);
    expect(ra.body.siguiente).toBeNull();
    const rb = await mios(b.token);
    expect(rb.body.elementos.map((e: { referencia: string }) => e.referencia)).toEqual([b1.referencia]);
    expect(rb.body.elementos[0]).toMatchObject({ categoria: { id: 'pelea', nombre: 'Pelea' }, estado: 'REGISTRADO' });
  });

  it('historial vacio sin error', async () => {
    const c = await ciudadano();
    expect((await mios(c.token)).body).toEqual({ elementos: [], siguiente: null });
  });

  it('la paginacion de 20 no repite ni omite incidentes', async () => {
    const c = await ciudadano();
    const refs: string[] = [];
    for (let i = 0; i < 45; i++) refs.unshift((await registrar(c.token)).referencia);
    const vistas: string[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const r = await mios(c.token, cursor ? `?cursor=${cursor}` : '');
      expect(r.status).toBe(200);
      expect(r.body.elementos.length).toBeLessThanOrEqual(20);
      vistas.push(...r.body.elementos.map((e: { referencia: string }) => e.referencia));
      cursor = r.body.siguiente;
      paginas += 1;
    } while (cursor);
    expect(paginas).toBe(3);
    expect(vistas).toEqual(refs);
  });

  it('cursor manipulado o parametros extra: 400', async () => {
    const c = await ciudadano();
    expect((await mios(c.token, '?cursor=no-valido!')).status).toBe(400);
    expect((await mios(c.token, '?limite=100')).status).toBe(400);
  });

  it('detalle propio con originales, institucion pendiente y sin coordenadas ni telefono', async () => {
    const c = await ciudadano();
    const { referencia } = await registrar(c.token);
    const r = await request(app).get(`${RUTA_MIOS}/${referencia.toLowerCase()}`).set('Authorization', `Bearer ${c.token}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      referencia,
      descripcion: 'Pelea entre varias personas frente al mercado',
      respuestas: { heridos: 'no_se', atencionMedica: null },
      institucionResponsable: { estado: 'pendiente' },
      actuaciones: [],
      territorio: { estado: 'pendiente', motivo: 'sin_cartografia' },
    });
    expect(JSON.stringify(r.body)).not.toMatch(/latitud|longitud|telefono|-13\.16/);
  });
});

describe('EQ-04: accesos no autorizados al seguimiento', () => {
  it('rechaza el 100 % del conjunto de accesos indebidos sin datos sensibles', async () => {
    const [a, b] = [await ciudadano(), await ciudadano()];
    const propio = await registrar(a.token);
    const invitado = await registrar();
    const operador = await crearCuentaDePrueba(prisma, { rol: 'operador' });
    const login = await request(app).post(RUTA_INST_SESIONES).set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: operador.correo, contrasena: CLAVE });
    const cookieOp = `__Host-ayni_inst=${cookieDe(login) as string}`;
    const casos: [string, () => Promise<request.Response>, number][] = [
      ['historial sin token', () => request(app).get(RUTA_MIOS), 401],
      ['historial con token desconocido', () => mios('desconocido'), 401],
      ['historial con cookie de operador', () => request(app).get(RUTA_MIOS).set('Cookie', cookieOp), 403],
      ['detalle ajeno por URL directa', () => request(app).get(`${RUTA_MIOS}/${propio.referencia}`).set('Authorization', `Bearer ${b.token}`), 404],
      ['detalle de un envio de invitado', () => request(app).get(`${RUTA_MIOS}/${invitado.referencia}`).set('Authorization', `Bearer ${a.token}`), 404],
      ['detalle inexistente', () => request(app).get(`${RUTA_MIOS}/INC-00000-00000`).set('Authorization', `Bearer ${a.token}`), 404],
      ['detalle sin token', () => request(app).get(`${RUTA_MIOS}/${propio.referencia}`), 401],
      ['detalle con cookie de operador', () => request(app).get(`${RUTA_MIOS}/${propio.referencia}`).set('Cookie', cookieOp), 403],
      ['codigo de invitado sobre incidente de cuenta', () => consultar({ referencia: propio.referencia, codigo: invitado.codigoSeguimiento }), 404],
      ['referencia sola sin codigo', () => consultar({ referencia: invitado.referencia }), 400],
      ['codigo en la URL', () => request(app).post(`${RUTA_INV}?codigo=${invitado.codigoSeguimiento}`).set('Content-Type', 'application/json').send(JSON.stringify({ referencia: invitado.referencia, codigo: invitado.codigoSeguimiento })), 400],
    ];
    const rechazados: string[] = [];
    for (const [nombre, hacer, esperado] of casos) {
      const r = await hacer();
      expect([nombre, r.status]).toEqual([nombre, esperado]);
      const texto = JSON.stringify(r.body);
      expect(texto).not.toMatch(/descripcion|Pelea entre|987654321|latitud/);
      rechazados.push(nombre);
    }
    expect(rechazados).toHaveLength(casos.length);
  });
});

describe('vista limitada del invitado', () => {
  it('con referencia y codigo vigentes devuelve solo estado y resumen ciudadano', async () => {
    const inv = await registrar();
    const r = await consultar({ referencia: inv.referencia.toLowerCase(), codigo: inv.codigoSeguimiento!.toLowerCase() });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(Object.keys(r.body).sort()).toEqual(['actuaciones', 'categoria', 'estado', 'institucionResponsable', 'recibidoEn', 'referencia']);
    expect(r.body).toMatchObject({ referencia: inv.referencia, estado: 'REGISTRADO', categoria: { id: 'pelea', nombre: 'Pelea' } });
    expect(logger.texto()).not.toContain(inv.codigoSeguimiento!);
  });

  it('referencia inexistente, codigo incorrecto y codigo reemplazado responden lo mismo', async () => {
    const clave = randomUUID();
    const datos = cuerpo({ telefonoContacto: '987654321' });
    const enviar = () =>
      request(app).post(RUTA_INC).set('Content-Type', 'application/json').set('Idempotency-Key', clave).send(JSON.stringify(datos));
    const primero = (await enviar()).body as { referencia: string; codigoSeguimiento: string };
    const segundo = (await enviar()).body as { referencia: string; codigoSeguimiento: string };
    const respuestas = [
      await consultar({ referencia: 'INC-00000-00000', codigo: primero.codigoSeguimiento }),
      await consultar({ referencia: primero.referencia, codigo: 'AAAA-BBBB-CCCC-DDDD' }),
      await consultar({ referencia: primero.referencia, codigo: primero.codigoSeguimiento }),
    ];
    for (const r of respuestas) {
      expect(r.status).toBe(404);
      expect(r.body.error.code).toBe('TRACKING_NOT_FOUND');
      expect(r.body.error.message).toBe('Referencia o código incorrectos.');
    }
    expect((await consultar({ referencia: segundo.referencia, codigo: segundo.codigoSeguimiento })).status).toBe(200);
  });

  it('el intento 11 sobre una referencia responde 429 aunque el codigo sea correcto', async () => {
    const limitado = crearArnes({
      prisma,
      limitesSeguimiento: { porReferencia: { maximo: 10, ventanaMs: 15 * 60 * 1000 }, porOrigen: { maximo: 1000, ventanaMs: 60 * 60 * 1000 } },
    });
    const inv = await registrar();
    for (let i = 0; i < 10; i++) {
      expect((await consultar({ referencia: inv.referencia, codigo: 'AAAA-BBBB-CCCC-DDDD' }, limitado.app)).status).toBe(404);
    }
    const r = await consultar({ referencia: inv.referencia, codigo: inv.codigoSeguimiento }, limitado.app);
    expect(r.status).toBe(429);
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('el limite por origen corta la prueba de referencias distintas', async () => {
    const limitado = crearArnes({
      prisma,
      limitesSeguimiento: { porReferencia: { maximo: 100, ventanaMs: 15 * 60 * 1000 }, porOrigen: { maximo: 3, ventanaMs: 60 * 60 * 1000 } },
    });
    for (let i = 0; i < 3; i++) {
      expect((await consultar({ referencia: `INC-0000${i}-00000`, codigo: 'AAAA-BBBB-CCCC-DDDD' }, limitado.app)).status).toBe(404);
    }
    expect((await consultar({ referencia: 'INC-00009-00000', codigo: 'AAAA-BBBB-CCCC-DDDD' }, limitado.app)).status).toBe(429);
  });

  it('las ventanas guardan solo el HMAC de la referencia y del origen', async () => {
    const inv = await registrar();
    await consultar({ referencia: inv.referencia, codigo: 'AAAA-BBBB-CCCC-DDDD' });
    const filas = JSON.stringify(await prisma.$queryRawUnsafe(`SELECT * FROM ventanas_intentos WHERE tipo LIKE 'seguimiento%'`));
    expect(filas).not.toContain(inv.referencia);
    expect(filas).toContain('seguimiento_ref');
  });
});
