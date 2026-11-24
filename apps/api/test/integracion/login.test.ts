import { createHash } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import type { HashContrasenaPort } from '../../src/modules/identidad/aplicacion/puertos/hash-contrasena.port';
import type { SesionesPort } from '../../src/modules/identidad/aplicacion/puertos/sesiones.port';
import { ServicioNoDisponibleError } from '../../src/modules/identidad/dominio/errores';
import { Argon2idHashAdapter } from '../../src/modules/identidad/infraestructura/argon2id-hash.adapter';
import {
  CLAVE,
  crearArnes,
  limpiarBd,
  RUTA_LOGIN,
  RUTA_REGISTRO,
  RUTA_SESION,
  urlPruebas,
} from './arnes';

const base = crearArnes();
const { app, prisma, reloj } = base;

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

async function registrar(app_ = app, correo = 'rosa@ejemplo.com', contrasena = CLAVE) {
  const r = await request(app_).post(RUTA_REGISTRO).send({ nombre: 'Rosa Quispe', correo, contrasena });
  expect(r.status).toBe(201);
  return r.body.usuario as { id: string };
}

const sinRequestId = (body: { error: { requestId?: string } & Record<string, unknown> }) => {
  const { requestId: _r, ...resto } = body.error;
  return resto;
};

describe('POST /auth/ciudadanos/sesiones', () => {
  it('200: primer acceso inmediato tras el registro, sin confirmar el correo', async () => {
    const usuario = await registrar();
    const r = await request(app).post(RUTA_LOGIN).send({ correo: 'rosa@ejemplo.com', contrasena: CLAVE });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes en base64url
    expect(r.body.usuario).toEqual({ id: usuario.id, nombre: 'Rosa Quispe', correo: 'rosa@ejemplo.com', rol: 'ciudadano' });
    expect(Object.keys(r.body).sort()).toEqual(['expiresAt', 'token', 'usuario']);
    expect(JSON.stringify(r.body)).not.toMatch(/argon2|passwordHash|hash/i);
  });

  it('el vencimiento es absoluto a las 24 horas desde la creacion', async () => {
    await registrar();
    const r = await request(app).post(RUTA_LOGIN).send({ correo: 'rosa@ejemplo.com', contrasena: CLAVE });
    expect(new Date(r.body.expiresAt).getTime()).toBe(reloj.ahora().getTime() + 24 * 60 * 60 * 1000);
  });

  it('el correo se compara sin distinguir mayusculas ni espacios externos', async () => {
    await registrar(app, ' Vecina@Ejemplo.com ');
    const r = await request(app).post(RUTA_LOGIN).send({ correo: 'VECINA@ejemplo.com', contrasena: CLAVE });
    expect(r.status).toBe(200);
    expect(r.body.usuario.correo).toBe('vecina@ejemplo.com');
  });

  it('conserva la contrasena exacta: espacios en extremos y Unicode no BMP', async () => {
    const exacta = ' clave \u{1F600} con espacios y acentos: ñá ';
    await registrar(app, 'exacta@ejemplo.com', exacta);
    const ok = await request(app).post(RUTA_LOGIN).send({ correo: 'exacta@ejemplo.com', contrasena: exacta });
    expect(ok.status).toBe(200);
    for (const variante of [exacta.trim(), exacta + ' ', exacta.replace('con', 'con ')]) {
      const mal = await request(app).post(RUTA_LOGIN).send({ correo: 'exacta@ejemplo.com', contrasena: variante });
      expect(mal.status).toBe(401);
    }
  });

  it('401 uniforme: contrasena incorrecta, correo desconocido, cuenta suspendida y rol no ciudadano', async () => {
    const u = await registrar(app, 'a@ejemplo.com');
    const s = await registrar(app, 'suspendida@ejemplo.com');
    const o = await registrar(app, 'operador@ejemplo.com');
    await prisma.usuario.update({ where: { id: s.id }, data: { estado: 'suspendido' } });
    await prisma.usuario.update({ where: { id: o.id }, data: { rol: 'operador' } });
    expect(u.id).toBeTruthy();

    const casos = [
      { correo: 'a@ejemplo.com', contrasena: 'una contraseña incorrecta' },
      { correo: 'nadie@ejemplo.com', contrasena: CLAVE },
      { correo: 'suspendida@ejemplo.com', contrasena: CLAVE },
      { correo: 'operador@ejemplo.com', contrasena: CLAVE },
    ];
    const respuestas = [];
    for (const c of casos) respuestas.push(await request(app).post(RUTA_LOGIN).send(c));
    for (const r of respuestas) {
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(r.body.error.message).toBe('Correo o contraseña incorrectos.');
      expect(r.body.token).toBeUndefined();
    }
    const primero = JSON.stringify(sinRequestId(respuestas[0]!.body));
    for (const r of respuestas) expect(JSON.stringify(sinRequestId(r.body))).toBe(primero);
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('las cuentas inexistentes o no admitidas ejecutan una verificacion ficticia de costo equivalente', async () => {
    const real = new Argon2idHashAdapter();
    const llamadas = { verificar: 0, ficticio: 0 };
    const espia: HashContrasenaPort = {
      hash: (c) => real.hash(c),
      verificar: (h, c) => {
        llamadas.verificar += 1;
        return real.verificar(h, c);
      },
      verificarFicticio: (c) => {
        llamadas.ficticio += 1;
        return real.verificarFicticio(c);
      },
    };
    const conEspia = crearArnes({ prisma, hash: espia });
    await registrar(conEspia.app, 'existe@ejemplo.com');
    const s = await registrar(conEspia.app, 'susp@ejemplo.com');
    await prisma.usuario.update({ where: { id: s.id }, data: { estado: 'suspendido' } });

    await request(conEspia.app).post(RUTA_LOGIN).send({ correo: 'nadie@ejemplo.com', contrasena: CLAVE });
    await request(conEspia.app).post(RUTA_LOGIN).send({ correo: 'susp@ejemplo.com', contrasena: CLAVE });
    expect(llamadas).toEqual({ verificar: 0, ficticio: 2 });
    await request(conEspia.app).post(RUTA_LOGIN).send({ correo: 'existe@ejemplo.com', contrasena: CLAVE });
    expect(llamadas.verificar).toBe(1);
  });

  it('cuenta pendiente de activacion (sin hash): mismo 401 uniforme, verificacion ficticia y sin sesion', async () => {
    const real = new Argon2idHashAdapter();
    const llamadas = { verificar: 0, ficticio: 0 };
    const espia: HashContrasenaPort = {
      hash: (c) => real.hash(c),
      verificar: (h, c) => {
        llamadas.verificar += 1;
        return real.verificar(h, c);
      },
      verificarFicticio: (c) => {
        llamadas.ficticio += 1;
        return real.verificarFicticio(c);
      },
    };
    const conEspia = crearArnes({ prisma, hash: espia });
    await registrar(conEspia.app, 'real@ejemplo.com');
    for (const [correo, rol] of [
      ['pendiente@ejemplo.com', 'ciudadano'],
      ['invitado@ejemplo.com', 'operador'],
    ] as const) {
      await prisma.usuario.create({
        data: { nombre: 'Invitado', correoNormalizado: correo, passwordHash: null, rol, estado: 'pendiente_activacion' },
      });
    }
    const desconocido = await request(conEspia.app).post(RUTA_LOGIN).send({ correo: 'nadie@ejemplo.com', contrasena: CLAVE });
    for (const correo of ['pendiente@ejemplo.com', 'invitado@ejemplo.com']) {
      const r = await request(conEspia.app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE });
      expect(r.status).toBe(401);
      expect(r.body.token).toBeUndefined();
      expect(JSON.stringify(sinRequestId(r.body))).toBe(JSON.stringify(sinRequestId(desconocido.body)));
    }
    expect(llamadas).toEqual({ verificar: 0, ficticio: 3 });
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('400: campos invalidos o no admitidos no producen sesion', async () => {
    const r1 = await request(app).post(RUTA_LOGIN).send({ correo: 'mal', contrasena: 'x' });
    expect(r1.status).toBe(400);
    const r2 = await request(app).post(RUTA_LOGIN).send({ correo: 'a@ejemplo.com', contrasena: CLAVE, rol: 'operador' });
    expect(r2.status).toBe(400);
    expect(await prisma.sesion.count()).toBe(0);
  });
});

describe('emision de la sesion', () => {
  it('persiste solo el SHA-256 del token, nunca el token', async () => {
    await registrar();
    const r = await request(app).post(RUTA_LOGIN).send({ correo: 'rosa@ejemplo.com', contrasena: CLAVE });
    const filas = await prisma.sesion.findMany();
    expect(filas).toHaveLength(1);
    expect(filas[0]!.tokenHash).toBe(createHash('sha256').update(r.body.token).digest('hex'));
    expect(filas[0]!.tokenHash).not.toBe(r.body.token);
    const volcado = JSON.stringify(await prisma.$queryRawUnsafe('SELECT * FROM sesiones'));
    expect(volcado).not.toContain(r.body.token);
  });

  it('cada inicio genera un token distinto y las sesiones son independientes', async () => {
    await registrar();
    const [a, b] = await Promise.all([
      request(app).post(RUTA_LOGIN).send({ correo: 'rosa@ejemplo.com', contrasena: CLAVE }),
      request(app).post(RUTA_LOGIN).send({ correo: 'rosa@ejemplo.com', contrasena: CLAVE }),
    ]);
    expect(a.body.token).not.toBe(b.body.token);
    expect(await prisma.sesion.count()).toBe(2);
  });

  it('503: si falla la persistencia de la sesion no se entrega token ni se declara acceso', async () => {
    await registrar();
    const fallida: SesionesPort = {
      crearSiUsuarioHabilitado: () => Promise.reject(new ServicioNoDisponibleError(new Error('boom'))),
      buscarVigente: () => Promise.resolve(null),
      revocar: () => Promise.resolve(),
      revocarTodasDe: () => Promise.resolve(0),
    };
    const conFallo = crearArnes({ prisma, sobrescribir: { sesiones: fallida } });
    const r = await request(conFallo.app).post(RUTA_LOGIN).send({ correo: 'rosa@ejemplo.com', contrasena: CLAVE });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(r.body.token).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toContain('boom');
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('carrera: una suspension concurrente impide emitir una sesion utilizable', async () => {
    const usuario = await registrar();
    const bloqueo = new Client({ connectionString: urlPruebas() });
    await bloqueo.connect();
    try {
      // La suspension esta sin confirmar: sostiene el bloqueo de la fila del usuario.
      await bloqueo.query('BEGIN');
      await bloqueo.query(`UPDATE usuarios SET estado = 'suspendido' WHERE id = $1`, [usuario.id]);

      let terminada = false;
      const login = request(app)
        .post(RUTA_LOGIN)
        .send({ correo: 'rosa@ejemplo.com', contrasena: CLAVE })
        .then((r) => {
          terminada = true;
          return r;
        });

      await new Promise((resolver) => setTimeout(resolver, 600));
      expect(terminada).toBe(false); // la emision espera el bloqueo de la fila
      await bloqueo.query('COMMIT');

      const r = await login;
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(r.body.token).toBeUndefined();
      expect(await prisma.sesion.count()).toBe(0);
    } finally {
      await bloqueo.end();
    }
    // Ninguna consulta privada posterior queda habilitada.
    const g = await request(app).get(RUTA_SESION).set('Authorization', 'Bearer cualquier-token');
    expect(g.status).toBe(401);
  });
});
