import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { CLAVE, crearArnes, limpiarBd, RUTA_LOGIN, RUTA_REGISTRO, RUTA_SESION } from './arnes';

const base = crearArnes();
const { app, prisma, reloj } = base;

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

async function registrarYEntrar(correo: string, nombre = 'Rosa') {
  const alta = await request(app).post(RUTA_REGISTRO).send({ nombre, correo, contrasena: CLAVE });
  expect(alta.status).toBe(201);
  const login = await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE });
  expect(login.status).toBe(200);
  return { id: alta.body.usuario.id as string, token: login.body.token as string, expiresAt: login.body.expiresAt as string };
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('GET /auth/sesion', () => {
  it('200: devuelve solo la identidad del propietario y el vencimiento', async () => {
    const a = await registrarYEntrar('a@ejemplo.com', 'Ana');
    const b = await registrarYEntrar('b@ejemplo.com', 'Beto');
    const r = await request(app).get(RUTA_SESION).set(bearer(a.token));
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.usuario).toEqual({ id: a.id, nombre: 'Ana', correo: 'a@ejemplo.com', rol: 'ciudadano' });
    expect(r.body.expiresAt).toBe(a.expiresAt);
    expect(JSON.stringify(r.body)).not.toContain(b.id);
    expect(JSON.stringify(r.body)).not.toMatch(/hash|argon2/i);
  });

  it('401: token ausente, mal formado o desconocido, sin datos privados', async () => {
    await registrarYEntrar('a@ejemplo.com');
    const casos = [
      request(app).get(RUTA_SESION),
      request(app).get(RUTA_SESION).set('Authorization', 'Bearer'),
      request(app).get(RUTA_SESION).set('Authorization', 'Basic abc'),
      request(app).get(RUTA_SESION).set(bearer('token-desconocido')),
      request(app).get(RUTA_SESION).set(bearer('x'.repeat(2000))),
    ];
    for (const r of await Promise.all(casos)) {
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('UNAUTHENTICATED');
      expect(r.body.usuario).toBeUndefined();
    }
  });

  it('401 en el instante de vencer: la sesion dura 24 horas y no se renueva', async () => {
    const s = await registrarYEntrar('a@ejemplo.com');
    const dia = 24 * 60 * 60 * 1000;
    reloj.avanzar(dia - 1000);
    expect((await request(app).get(RUTA_SESION).set(bearer(s.token))).status).toBe(200);
    // Consultar no renueva: seguimos contando desde la creacion.
    reloj.avanzar(1000);
    const vencida = await request(app).get(RUTA_SESION).set(bearer(s.token));
    expect(vencida.status).toBe(401);
    expect(vencida.body.usuario).toBeUndefined();
    reloj.avanzar(-dia); // restablece el reloj para el resto de pruebas
  });

  it('401 tras revocar la sesion', async () => {
    const s = await registrarYEntrar('a@ejemplo.com');
    await request(app).delete(RUTA_SESION).set(bearer(s.token)).expect(204);
    expect((await request(app).get(RUTA_SESION).set(bearer(s.token))).status).toBe(401);
  });

  it('401 si la cuenta se suspende o deja de ser ciudadana despues de iniciar sesion', async () => {
    const s = await registrarYEntrar('a@ejemplo.com');
    const t = await registrarYEntrar('t@ejemplo.com');
    expect((await request(app).get(RUTA_SESION).set(bearer(s.token))).status).toBe(200);
    await prisma.usuario.update({ where: { id: s.id }, data: { estado: 'suspendido' } });
    await prisma.usuario.update({ where: { id: t.id }, data: { rol: 'operador' } });
    expect((await request(app).get(RUTA_SESION).set(bearer(s.token))).status).toBe(401);
    expect((await request(app).get(RUTA_SESION).set(bearer(t.token))).status).toBe(401);
  });

  it('no acepta el token en la URL ni elegir usuario por parametro', async () => {
    const a = await registrarYEntrar('a@ejemplo.com', 'Ana');
    const b = await registrarYEntrar('b@ejemplo.com', 'Beto');
    for (const ruta of [
      `${RUTA_SESION}?token=${a.token}`,
      `${RUTA_SESION}?access_token=${a.token}`,
      `${RUTA_SESION}/${a.token}`,
    ]) {
      expect((await request(app).get(ruta)).status).toBeGreaterThanOrEqual(401);
    }
    // Con cabecera valida, parametros como usuarioId o id se ignoran: siempre el propietario.
    const r = await request(app).get(`${RUTA_SESION}?usuarioId=${b.id}&id=${b.id}`).set(bearer(a.token));
    expect(r.status).toBe(200);
    expect(r.body.usuario.id).toBe(a.id);
  });
});

describe('DELETE /auth/sesion', () => {
  it('204: revoca la sesion y repetir la salida no produce error', async () => {
    const s = await registrarYEntrar('a@ejemplo.com');
    const uno = await request(app).delete(RUTA_SESION).set(bearer(s.token));
    expect(uno.status).toBe(204);
    expect(uno.headers['cache-control']).toBe('no-store');
    expect(uno.text).toBe('');
    expect((await request(app).delete(RUTA_SESION).set(bearer(s.token))).status).toBe(204);
    const fila = await prisma.sesion.findFirstOrThrow();
    expect(fila.revokedAt).not.toBeNull();
  });

  it('204 sin efectos: token ausente, desconocido o por URL', async () => {
    const s = await registrarYEntrar('a@ejemplo.com');
    expect((await request(app).delete(RUTA_SESION)).status).toBe(204);
    expect((await request(app).delete(RUTA_SESION).set(bearer('desconocido'))).status).toBe(204);
    expect((await request(app).delete(`${RUTA_SESION}?token=${s.token}`)).status).toBe(204);
    // La sesion real sigue vigente: nada de lo anterior la toco.
    expect((await request(app).get(RUTA_SESION).set(bearer(s.token))).status).toBe(200);
  });

  it('revoca solo la sesion actual: las otras sesiones del usuario siguen vigentes', async () => {
    await registrarYEntrar('a@ejemplo.com');
    const segunda = await request(app).post(RUTA_LOGIN).send({ correo: 'a@ejemplo.com', contrasena: CLAVE });
    const tercera = await request(app).post(RUTA_LOGIN).send({ correo: 'a@ejemplo.com', contrasena: CLAVE });
    await request(app).delete(RUTA_SESION).set(bearer(segunda.body.token)).expect(204);
    expect((await request(app).get(RUTA_SESION).set(bearer(segunda.body.token))).status).toBe(401);
    expect((await request(app).get(RUTA_SESION).set(bearer(tercera.body.token))).status).toBe(200);
    expect(await prisma.sesion.count({ where: { revokedAt: null } })).toBe(2);
  });

  it('el cierre de un usuario no afecta las sesiones de otro', async () => {
    const a = await registrarYEntrar('a@ejemplo.com');
    const b = await registrarYEntrar('b@ejemplo.com');
    await request(app).delete(RUTA_SESION).set(bearer(a.token)).expect(204);
    expect((await request(app).get(RUTA_SESION).set(bearer(b.token))).status).toBe(200);
  });
});

describe('persistencia tras reinicio', () => {
  it('una nueva instancia del servidor sobre la misma base conserva la sesion', async () => {
    const s = await registrarYEntrar('a@ejemplo.com');
    const reiniciada = crearArnes({ reloj });
    try {
      const r = await request(reiniciada.app).get(RUTA_SESION).set(bearer(s.token));
      expect(r.status).toBe(200);
      expect(r.body.usuario.id).toBe(s.id);
    } finally {
      await reiniciada.prisma.$disconnect();
    }
  });
});
