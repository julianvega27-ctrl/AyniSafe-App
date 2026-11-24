import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { CLAVE, crearArnes, limpiarBd, RUTA_LOGIN, RUTA_REGISTRO } from './arnes';

const { prisma } = crearArnes();

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

const alta = (n: number) => ({ nombre: 'Rosa', correo: `u${n}@ejemplo.com`, contrasena: CLAVE });

describe('limite de registro por IP', () => {
  it('permite hasta el umbral y responde 429 con Retry-After sin crear la cuenta', async () => {
    const { app, reloj } = crearArnes({ prisma, politica: { registroPorIp: 3, loginPorIp: 100, loginPorCorreoIp: 100 } });
    for (let i = 1; i <= 3; i += 1) expect((await request(app).post(RUTA_REGISTRO).send(alta(i))).status).toBe(201);
    const bloqueada = await request(app).post(RUTA_REGISTRO).send(alta(4));
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.headers['retry-after']).toBe('900'); // el reloj esta al inicio de la ventana de 15 min
    expect(bloqueada.headers['cache-control']).toBe('no-store');
    expect(bloqueada.body.error.code).toBe('RATE_LIMITED');
    expect(await prisma.usuario.count()).toBe(3);
    expect(await prisma.usuario.count({ where: { correoNormalizado: 'u4@ejemplo.com' } })).toBe(0);

    // La espera restante disminuye con el tiempo dentro de la misma ventana...
    reloj.avanzar(5 * 60 * 1000);
    const luego = await request(app).post(RUTA_REGISTRO).send(alta(4));
    expect(luego.status).toBe(429);
    expect(luego.headers['retry-after']).toBe('600');
    // ...y al terminar la ventana se vuelve a permitir.
    reloj.avanzar(10 * 60 * 1000);
    expect((await request(app).post(RUTA_REGISTRO).send(alta(4))).status).toBe(201);
  });

  it('las solicitudes invalidas sintacticamente no consumen el limite', async () => {
    const { app } = crearArnes({ prisma, politica: { registroPorIp: 2, loginPorIp: 100, loginPorCorreoIp: 100 } });
    for (let i = 0; i < 6; i += 1) {
      expect((await request(app).post(RUTA_REGISTRO).send({ nombre: '', correo: 'x', contrasena: 'y' })).status).toBe(400);
    }
    expect((await request(app).post(RUTA_REGISTRO).send(alta(1))).status).toBe(201);
  });

  it('se cuentan tambien los intentos sin exito (409), no solo los fallos de formato', async () => {
    const { app } = crearArnes({ prisma, politica: { registroPorIp: 2, loginPorIp: 100, loginPorCorreoIp: 100 } });
    await request(app).post(RUTA_REGISTRO).send(alta(1)).expect(201);
    await request(app).post(RUTA_REGISTRO).send(alta(1)).expect(409);
    await request(app).post(RUTA_REGISTRO).send(alta(2)).expect(429);
  });

  it('concurrencia: 20 solicitudes simultaneas con umbral 5 dejan pasar exactamente 5', async () => {
    const { app } = crearArnes({ prisma, politica: { registroPorIp: 5, loginPorIp: 100, loginPorCorreoIp: 100 } });
    const r = await Promise.all(Array.from({ length: 20 }, (_, i) => request(app).post(RUTA_REGISTRO).send(alta(i))));
    expect(r.filter((x) => x.status === 201)).toHaveLength(5);
    expect(r.filter((x) => x.status === 429)).toHaveLength(15);
    expect(await prisma.usuario.count()).toBe(5);
    const filas = await prisma.$queryRawUnsafe<{ contador: number }[]>('SELECT contador FROM ventanas_intentos');
    expect(filas).toHaveLength(1);
    expect(filas[0]!.contador).toBe(20); // el contador no pierde incrementos concurrentes
  });
});

describe('limites de acceso', () => {
  const politica = { registroPorIp: 100, loginPorIp: 6, loginPorCorreoIp: 3 };

  it('por correo+IP: tras 3 solicitudes responde 429 aun con la contrasena correcta, sin sesion', async () => {
    const { app } = crearArnes({ prisma, politica });
    await request(app).post(RUTA_REGISTRO).send(alta(1)).expect(201);
    for (let i = 0; i < 3; i += 1) {
      await request(app).post(RUTA_LOGIN).send({ correo: 'u1@ejemplo.com', contrasena: 'incorrecta-pero-larga' }).expect(401);
    }
    const r = await request(app).post(RUTA_LOGIN).send({ correo: 'u1@ejemplo.com', contrasena: CLAVE });
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBe('900');
    expect(r.body.token).toBeUndefined();
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('por IP: varios correos desde la misma IP agotan el limite global de login', async () => {
    const { app } = crearArnes({ prisma, politica });
    for (let i = 0; i < 6; i += 1) {
      await request(app).post(RUTA_LOGIN).send({ correo: `n${i}@ejemplo.com`, contrasena: 'incorrecta-pero-larga' }).expect(401);
    }
    await request(app).post(RUTA_LOGIN).send({ correo: 'otro@ejemplo.com', contrasena: 'incorrecta-pero-larga' }).expect(429);
  });

  it('una IP no bloquea al correo desde otra IP (sin bloqueo permanente por correo)', async () => {
    const { app } = crearArnes({ prisma, politica, saltosProxy: 1 });
    await request(app).post(RUTA_REGISTRO).set('X-Forwarded-For', '198.51.100.1').send(alta(1)).expect(201);
    for (let i = 0; i < 3; i += 1) {
      await request(app).post(RUTA_LOGIN).set('X-Forwarded-For', '203.0.113.9').send({ correo: 'u1@ejemplo.com', contrasena: 'incorrecta-pero-larga' }).expect(401);
    }
    await request(app).post(RUTA_LOGIN).set('X-Forwarded-For', '203.0.113.9').send({ correo: 'u1@ejemplo.com', contrasena: CLAVE }).expect(429);
    // La persona legitima, desde su propia IP, entra con normalidad.
    const legitima = await request(app).post(RUTA_LOGIN).set('X-Forwarded-For', '198.51.100.1').send({ correo: 'u1@ejemplo.com', contrasena: CLAVE });
    expect(legitima.status).toBe(200);
  });

  it('el mismo correo bloqueado desde una IP no impide a esa IP usar otros correos', async () => {
    const { app } = crearArnes({ prisma, politica });
    await request(app).post(RUTA_REGISTRO).send(alta(1)).expect(201);
    await request(app).post(RUTA_REGISTRO).send(alta(2)).expect(201);
    for (let i = 0; i < 3; i += 1) {
      await request(app).post(RUTA_LOGIN).send({ correo: 'u1@ejemplo.com', contrasena: 'incorrecta-pero-larga' }).expect(401);
    }
    await request(app).post(RUTA_LOGIN).send({ correo: 'u1@ejemplo.com', contrasena: CLAVE }).expect(429);
    // El limite por IP (6) aun tiene margen: otro correo entra.
    await request(app).post(RUTA_LOGIN).send({ correo: 'u2@ejemplo.com', contrasena: CLAVE }).expect(200);
  });
});

describe('persistencia y proxy', () => {
  it('reiniciar la API durante la ventana no elimina la limitacion vigente', async () => {
    const politica = { registroPorIp: 2, loginPorIp: 100, loginPorCorreoIp: 100 };
    const primera = crearArnes({ prisma, politica });
    await request(primera.app).post(RUTA_REGISTRO).send(alta(1)).expect(201);
    await request(primera.app).post(RUTA_REGISTRO).send(alta(2)).expect(201);
    // "Reinicio": una instancia nueva (nuevo modulo, nuevo limitador) sobre la misma base.
    const reiniciada = crearArnes({ prisma, politica, reloj: primera.reloj });
    const r = await request(reiniciada.app).post(RUTA_REGISTRO).send(alta(3));
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBe('900');
  });

  it('sin proxy de confianza, X-Forwarded-For no permite eludir el limite', async () => {
    const { app } = crearArnes({ prisma, politica: { registroPorIp: 1, loginPorIp: 100, loginPorCorreoIp: 100 }, saltosProxy: 0 });
    await request(app).post(RUTA_REGISTRO).set('X-Forwarded-For', '1.1.1.1').send(alta(1)).expect(201);
    await request(app).post(RUTA_REGISTRO).set('X-Forwarded-For', '2.2.2.2').send(alta(2)).expect(429);
    await request(app).post(RUTA_REGISTRO).set('X-Forwarded-For', '3.3.3.3, 4.4.4.4').send(alta(3)).expect(429);
  });

  it('con un salto de proxy de confianza, cada IP de cliente tiene su propio contador', async () => {
    const { app } = crearArnes({ prisma, politica: { registroPorIp: 1, loginPorIp: 100, loginPorCorreoIp: 100 }, saltosProxy: 1 });
    await request(app).post(RUTA_REGISTRO).set('X-Forwarded-For', '1.1.1.1').send(alta(1)).expect(201);
    await request(app).post(RUTA_REGISTRO).set('X-Forwarded-For', '1.1.1.1').send(alta(2)).expect(429);
    await request(app).post(RUTA_REGISTRO).set('X-Forwarded-For', '2.2.2.2').send(alta(3)).expect(201);
    // Con un solo salto de confianza, entradas anteriores de la cadena (spoofing) se ignoran.
    await request(app).post(RUTA_REGISTRO).set('X-Forwarded-For', '9.9.9.9, 1.1.1.1').send(alta(4)).expect(429);
  });

  it('solo se persisten claves derivadas: ni correo ni IP en claro', async () => {
    const { app } = crearArnes({ prisma, saltosProxy: 1 });
    await request(app).post(RUTA_REGISTRO).set('X-Forwarded-For', '203.0.113.77').send(alta(1)).expect(201);
    await request(app).post(RUTA_LOGIN).set('X-Forwarded-For', '203.0.113.77').send({ correo: 'u1@ejemplo.com', contrasena: CLAVE }).expect(200);
    const filas = await prisma.$queryRawUnsafe<{ tipo: string; clave_hash: string }[]>('SELECT tipo, clave_hash FROM ventanas_intentos');
    expect(filas.map((f) => f.tipo).sort()).toEqual(['login_correo_ip', 'login_ip', 'registro_ip']);
    const volcado = JSON.stringify(filas);
    expect(volcado).not.toContain('203.0.113.77');
    expect(volcado).not.toContain('u1@ejemplo.com');
    for (const f of filas) expect(f.clave_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
