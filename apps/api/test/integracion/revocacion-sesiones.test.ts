import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CLAVE,
  RUTA_LOGIN,
  RUTA_REGISTRO,
  RUTA_SESION,
  crearArnes,
  limpiarBd,
} from './arnes';

const { app, prisma, reloj, deps } = crearArnes();

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

async function cuentaConSesiones(correo: string, cuantas: number) {
  const reg = await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
  expect(reg.status).toBe(201);
  const tokens: string[] = [];
  for (let i = 0; i < cuantas; i++) {
    const l = await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE });
    expect(l.status).toBe(200);
    tokens.push(l.body.token as string);
  }
  return { id: reg.body.usuario.id as string, tokens };
}

const consultar = (token: string) => request(app).get(RUTA_SESION).set('Authorization', `Bearer ${token}`);

describe('SesionesPort.revocarTodasDe', () => {
  it('revoca todas las sesiones del usuario y no toca las de otros', async () => {
    const a = await cuentaConSesiones('a@ejemplo.com', 2);
    const b = await cuentaConSesiones('b@ejemplo.com', 1);

    const n = await deps.sesiones.revocarTodasDe(a.id, reloj.ahora());

    expect(n).toBe(2);
    for (const t of a.tokens) expect((await consultar(t)).status).toBe(401);
    expect((await consultar(b.tokens[0]!)).status).toBe(200);
  });

  it('es idempotente: repetirlo no revoca nada mas ni falla', async () => {
    const a = await cuentaConSesiones('a@ejemplo.com', 2);
    expect(await deps.sesiones.revocarTodasDe(a.id, reloj.ahora())).toBe(2);
    expect(await deps.sesiones.revocarTodasDe(a.id, reloj.ahora())).toBe(0);
  });

  it('el cierre voluntario sigue revocando solo la sesion actual', async () => {
    const a = await cuentaConSesiones('a@ejemplo.com', 2);
    const r = await request(app).delete(RUTA_SESION).set('Authorization', `Bearer ${a.tokens[0]}`);
    expect(r.status).toBe(204);
    expect((await consultar(a.tokens[0]!)).status).toBe(401);
    expect((await consultar(a.tokens[1]!)).status).toBe(200);
  });
});
