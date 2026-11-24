import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import {
  TokenInvalidoError,
  TokenUsadoError,
  TokenVencidoError,
  ValidacionError,
  ServicioNoDisponibleError,
} from '../../src/modules/identidad/dominio/errores';
import type { PropositoToken } from '../../src/modules/identidad/dominio/token-cuenta';
import {
  CLAVE,
  RUTA_LOGIN,
  RUTA_REGISTRO,
  RUTA_SESION,
  crearArnes,
  limpiarBd,
} from './arnes';

const { app, prisma, reloj, modulo, deps } = crearArnes();
const RUTA_CONSULTA = '/api/v1/auth/tokens/consulta';
const MIN = 60 * 1000;
const NUEVA = 'otra contraseña nueva y larga 7c1d';

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

async function ciudadano(correo = 'rosa@ejemplo.com') {
  const r = await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
  expect(r.status).toBe(201);
  return { id: r.body.usuario.id as string, correo };
}

async function sesion(correo: string, contrasena = CLAVE) {
  const r = await request(app).post(RUTA_LOGIN).send({ correo, contrasena });
  return r;
}

const emitir = (usuarioId: string, proposito: PropositoToken = 'recuperacion') =>
  modulo.emitirToken.ejecutar(usuarioId, proposito);
const consumir = (cuerpo: unknown, proposito: PropositoToken = 'recuperacion') =>
  modulo.consumirToken.ejecutar({ cuerpo, proposito, ip: '127.0.0.1' });

async function pendiente(correo = 'invitado@ejemplo.com') {
  const u = await prisma.usuario.create({
    data: { nombre: 'Invitada', correoNormalizado: correo, passwordHash: null, rol: 'operador', estado: 'pendiente_activacion' },
  });
  return u.id;
}

describe('3.1 emision de tokens', () => {
  it('vencen a los 30 minutos (recuperacion) y a las 72 horas (activacion)', async () => {
    const { id } = await ciudadano();
    const ahora = reloj.ahora().getTime();
    expect((await emitir(id)).expiresAt.getTime()).toBe(ahora + 30 * MIN);
    expect((await emitir(id, 'activacion')).expiresAt.getTime()).toBe(ahora + 72 * 60 * MIN);
  });

  it('no persiste el token en claro: solo su huella SHA-256', async () => {
    const { id } = await ciudadano();
    const { token } = await emitir(id);
    const filas = await prisma.$queryRawUnsafe<Record<string, unknown>[]>('SELECT * FROM tokens_cuenta');
    expect(filas).toHaveLength(1);
    expect(JSON.stringify(filas)).not.toContain(token);
    expect(filas[0]!.token_hash).toBe(deps.tokens.huella(token));
  });

  it('un token nuevo invalida los pendientes del mismo usuario y proposito, pero no los de otro proposito', async () => {
    const { id } = await ciudadano();
    const a = await emitir(id);
    const act = await emitir(id, 'activacion');
    const b = await emitir(id);
    await expect(modulo.consumirToken.ejecutar({ cuerpo: { token: a.token, contrasena: NUEVA }, proposito: 'recuperacion', ip: '127.0.0.1' })).rejects.toBeInstanceOf(TokenUsadoError);
    const filas = await prisma.$queryRawUnsafe<{ token_hash: string; invalidado_at: Date | null }[]>(
      'SELECT token_hash, invalidado_at FROM tokens_cuenta',
    );
    const de = (t: string) => filas.find((f) => f.token_hash === deps.tokens.huella(t))!;
    expect(de(a.token).invalidado_at).not.toBeNull();
    expect(de(b.token).invalidado_at).toBeNull();
    expect(de(act.token).invalidado_at).toBeNull();
  });

  it('vencimiento: a los 31 minutos el token de recuperacion esta vencido', async () => {
    const { id } = await ciudadano();
    const { token } = await emitir(id);
    reloj.avanzar(31 * MIN);
    await expect(consumir({ token, contrasena: NUEVA })).rejects.toBeInstanceOf(TokenVencidoError);
    reloj.avanzar(-31 * MIN);
  });
});

describe('3.2 consulta del estado del enlace (POST /auth/tokens/consulta)', () => {
  const consultar = (cuerpo: unknown) => request(app).post(RUTA_CONSULTA).send(cuerpo as object);
  const leerFilas = () => prisma.$queryRawUnsafe<unknown[]>('SELECT * FROM tokens_cuenta ORDER BY token_hash');

  it('200 con proposito y vencimiento si esta vigente, sin modificar el token', async () => {
    const { id } = await ciudadano();
    const { token, expiresAt } = await emitir(id);
    const antes = JSON.stringify(await leerFilas());
    const r = await consultar({ token });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ proposito: 'recuperacion', expiresAt: expiresAt.toISOString() });
    expect(r.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(await leerFilas())).toBe(antes);
  });

  it('410 TOKEN_USED para uno consumido o reemplazado', async () => {
    const { id } = await ciudadano();
    const a = await emitir(id);
    await consumir({ token: a.token, contrasena: NUEVA });
    const r = await consultar({ token: a.token });
    expect(r.status).toBe(410);
    expect(r.body.error.code).toBe('TOKEN_USED');
    const b = await emitir(id);
    const c = await emitir(id);
    expect((await consultar({ token: b.token })).body.error.code).toBe('TOKEN_USED');
    expect((await consultar({ token: c.token })).status).toBe(200);
  });

  it('410 TOKEN_EXPIRED para uno vencido', async () => {
    const { id } = await ciudadano();
    const { token } = await emitir(id);
    reloj.avanzar(31 * MIN);
    const r = await consultar({ token });
    reloj.avanzar(-31 * MIN);
    expect(r.status).toBe(410);
    expect(r.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('404 TOKEN_INVALID para uno desconocido, alterado o demasiado largo', async () => {
    const { id } = await ciudadano();
    const { token } = await emitir(id);
    const alterado = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    for (const valor of [alterado, 'no-existe', 'x'.repeat(500)]) {
      const r = await consultar({ token: valor });
      expect(r.status).toBe(404);
      expect(r.body.error.code).toBe('TOKEN_INVALID');
    }
  });

  it('400 si falta el token, no es texto o hay campos extra', async () => {
    for (const cuerpo of [{}, { token: 5 }, { token: '' }, { token: 'a', otro: 1 }]) {
      const r = await consultar(cuerpo);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('el token solo se acepta en el cuerpo: en la URL se ignora', async () => {
    const { id } = await ciudadano();
    const { token } = await emitir(id);
    const r = await request(app).post(`${RUTA_CONSULTA}?token=${token}`).send({});
    expect(r.status).toBe(400);
  });
});

describe('3.3 consumo atomico', () => {
  it('cambia la contrasena, deja de autenticar la anterior y revoca todas las sesiones', async () => {
    const { id, correo } = await ciudadano();
    const s1 = (await sesion(correo)).body.token as string;
    const s2 = (await sesion(correo)).body.token as string;
    const { token } = await emitir(id);

    await consumir({ token, contrasena: NUEVA });

    expect((await sesion(correo, CLAVE)).status).toBe(401);
    expect((await sesion(correo, NUEVA)).status).toBe(200);
    for (const t of [s1, s2]) {
      expect((await request(app).get(RUTA_SESION).set('Authorization', `Bearer ${t}`)).status).toBe(401);
    }
  });

  it('no inicia sesion ni crea una nueva al consumir', async () => {
    const { id } = await ciudadano();
    const { token } = await emitir(id);
    await consumir({ token, contrasena: NUEVA });
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('invalida los demas tokens pendientes de la cuenta, incluidos los de activacion', async () => {
    const { id } = await ciudadano();
    const rec = await emitir(id);
    const act = await emitir(id, 'activacion');
    await consumir({ token: rec.token, contrasena: NUEVA });
    await expect(consumir({ token: act.token, contrasena: NUEVA }, 'activacion')).rejects.toBeInstanceOf(TokenUsadoError);
  });

  it('dos consumos simultaneos: exactamente uno gana y solo su contrasena autentica', async () => {
    const { id, correo } = await ciudadano();
    const { token } = await emitir(id);
    const A = 'contraseña ganadora A — 111111';
    const B = 'contraseña ganadora B — 222222';
    const r = await Promise.allSettled([
      consumir({ token, contrasena: A }),
      consumir({ token, contrasena: B }),
    ]);
    const ok = r.filter((x) => x.status === 'fulfilled');
    const ko = r.filter((x): x is PromiseRejectedResult => x.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect(ko[0]!.reason).toBeInstanceOf(TokenUsadoError);
    const ganoA = r[0]!.status === 'fulfilled';
    expect((await sesion(correo, ganoA ? A : B)).status).toBe(200);
    expect((await sesion(correo, ganoA ? B : A)).status).toBe(401);
  });

  it('un fallo antes del commit responde 503 y deja token, contrasena y sesiones sin cambios', async () => {
    const { id, correo } = await ciudadano();
    const s = (await sesion(correo)).body.token as string;
    const { token } = await emitir(id);
    // Fallo real dentro de la transaccion: la ultima sentencia (revocar sesiones) no puede ejecutarse.
    await prisma.$executeRawUnsafe('ALTER TABLE sesiones RENAME TO sesiones_fuera');
    try {
      await expect(consumir({ token, contrasena: NUEVA })).rejects.toBeInstanceOf(ServicioNoDisponibleError);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE sesiones_fuera RENAME TO sesiones');
    }
    expect((await prisma.$queryRawUnsafe<{ used_at: Date | null }[]>('SELECT used_at FROM tokens_cuenta'))[0]!.used_at).toBeNull();
    expect((await sesion(correo, CLAVE)).status).toBe(200);
    expect((await request(app).get(RUTA_SESION).set('Authorization', `Bearer ${s}`)).status).toBe(200);
    // El mismo token sigue siendo utilizable.
    await consumir({ token, contrasena: NUEVA });
  });

  it('propósito cruzado: un token de activacion no sirve para recuperar y viceversa, sin cambios', async () => {
    const { id, correo } = await ciudadano();
    const act = await emitir(id, 'activacion');
    const rec = await emitir(id);
    await expect(consumir({ token: act.token, contrasena: NUEVA }, 'recuperacion')).rejects.toBeInstanceOf(TokenInvalidoError);
    await expect(consumir({ token: rec.token, contrasena: NUEVA }, 'activacion')).rejects.toBeInstanceOf(TokenInvalidoError);
    expect((await sesion(correo, CLAVE)).status).toBe(200);
    const sinUsar = await prisma.$queryRawUnsafe<{ n: number }[]>(
      'SELECT count(*)::int AS n FROM tokens_cuenta WHERE used_at IS NULL AND invalidado_at IS NULL',
    );
    expect(sinUsar[0]!.n).toBe(2);
  });

  it('cuenta suspendida tras emitir: token invalido, sin cambios y sin distinguir la causa', async () => {
    const { id, correo } = await ciudadano();
    const { token } = await emitir(id);
    await prisma.usuario.update({ where: { id }, data: { estado: 'suspendido' } });
    await expect(consumir({ token, contrasena: NUEVA })).rejects.toBeInstanceOf(TokenInvalidoError);
    await prisma.usuario.update({ where: { id }, data: { estado: 'activo' } });
    expect((await sesion(correo, CLAVE)).status).toBe(200);
    expect((await sesion(correo, NUEVA)).status).toBe(401);
  });

  it('activacion: deja la cuenta pendiente activa con su contrasena, sin crear sesion', async () => {
    const id = await pendiente();
    const { token } = await emitir(id, 'activacion');
    await consumir({ token, contrasena: NUEVA }, 'activacion');
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id } });
    expect(u.estado).toBe('activo');
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('una cuenta activa no puede "activarse" con un token de activacion', async () => {
    const { id } = await ciudadano();
    const { token } = await emitir(id, 'activacion');
    await expect(consumir({ token, contrasena: NUEVA }, 'activacion')).rejects.toBeInstanceOf(TokenInvalidoError);
  });

  it('una cuenta pendiente no puede recuperarse (sin hash ni acceso previo)', async () => {
    const id = await pendiente();
    const { token } = await emitir(id);
    await expect(consumir({ token, contrasena: NUEVA })).rejects.toBeInstanceOf(TokenInvalidoError);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id } })).estado).toBe('pendiente_activacion');
  });
});

describe('3.4 politica de contraseña reutilizada y orden de validacion', () => {
  const de = (n: number, unidad = 'a') => unidad.repeat(n);

  it('rechaza 14 y 129 puntos de codigo con error del campo contrasena y deja el token vigente', async () => {
    const { id } = await ciudadano();
    const { token } = await emitir(id);
    for (const contrasena of [de(14), de(129), undefined, 12345]) {
      const error = await consumir({ token, contrasena }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ValidacionError);
      expect((error as ValidacionError).campos).toHaveProperty('contrasena');
    }
    const r = await request(app).post(RUTA_CONSULTA).send({ token });
    expect(r.status).toBe(200);
  });

  it('acepta 15 y 128, con espacios en los extremos, acentos y caracteres fuera del plano basico', async () => {
    for (const contrasena of [de(15), de(128), `  ${de(13, 'é')}  `, de(15, '\u{1F600}'), de(128, '\u{1F600}')]) {
      const { id, correo } = await ciudadano(`u${Math.random().toString(36).slice(2)}@ejemplo.com`);
      const { token } = await emitir(id);
      await consumir({ token, contrasena });
      expect((await sesion(correo, contrasena)).status).toBe(200);
      // Un valor de la misma longitud pero distinto no autentica: la contrasena se conserva exacta.
      const distinta = ['z', ...Array.from(contrasena).slice(1)].join('');
      expect((await sesion(correo, distinta)).status).toBe(401);
    }
    const emojis14 = de(14, '\u{1F600}');
    const { id } = await ciudadano('emoji14@ejemplo.com');
    const { token } = await emitir(id);
    await expect(consumir({ token, contrasena: emojis14 })).rejects.toBeInstanceOf(ValidacionError);
  });

  it('un 400 por campos ocurre antes de revisar el estado: no gasta CPU de hash con tokens inservibles', async () => {
    const error = await consumir({ token: 'no-existe', contrasena: de(3) }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidacionError);
    const error2 = await consumir({ token: 'no-existe', contrasena: de(20) }).catch((e: unknown) => e);
    expect(error2).toBeInstanceOf(TokenInvalidoError);
  });
});
