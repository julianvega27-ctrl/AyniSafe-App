import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { PrismaSesionesAdapter } from '../../src/modules/identidad/infraestructura/prisma-sesiones.adapter';
import {
  CLAVE,
  cookieDe,
  crearArnes,
  crearCuentaDePrueba,
  limpiarBd,
  ORIGEN_WEB_PRUEBA,
  RUTA_INST_SESION,
  RUTA_INST_SESIONES,
  RUTA_LOGIN,
  RUTA_PANEL_ADMIN,
  RUTA_PANEL_OPERADOR,
  RUTA_REGISTRO,
  RUTA_SESION,
  urlPruebas,
} from './arnes';

const { app, prisma, reloj, logger } = crearArnes();
const COOKIE = '__Host-ayni_inst';
const DIA = 24 * 60 * 60 * 1000;

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

const login = (correo: string, contrasena: string = CLAVE, cabeceras: Record<string, string> = {}) =>
  request(app)
    .post(RUTA_INST_SESIONES)
    .set({ Origin: ORIGEN_WEB_PRUEBA, ...cabeceras })
    .send({ correo, contrasena });

const conCookie = (valor: string) => `${COOKIE}=${valor}`;

async function ingresar(rol: 'administrador' | 'operador') {
  const cuenta = await crearCuentaDePrueba(prisma, { rol });
  const r = await login(cuenta.correo);
  expect(r.status).toBe(200);
  return { cuenta, cookie: conCookie(cookieDe(r) as string), respuesta: r };
}

describe('POST /auth/institucional/sesiones', () => {
  it.each(['administrador', 'operador'] as const)(
    '200 para %s activo: identidad con rol y cookie, sin token en el cuerpo',
    async (rol) => {
      const cuenta = await crearCuentaDePrueba(prisma, { rol });
      const r = await login(cuenta.correo);
      expect(r.status).toBe(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body.usuario).toEqual({ id: cuenta.id, nombre: 'Cuenta de prueba', correo: cuenta.correo, rol });
      expect(Object.keys(r.body).sort()).toEqual(['expiresAt', 'usuario']);
      const token = cookieDe(r) as string;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(JSON.stringify(r.body)).not.toContain(token);
    },
  );

  it('la cookie es HttpOnly, Secure, SameSite=Strict, Path=/, sin Domain, y no excede 24 horas', async () => {
    const cuenta = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const r = await login(cuenta.correo);
    const linea = (r.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${COOKIE}=`)) as string;
    const atributos = linea.split(';').map((a) => a.trim());
    expect(atributos).toEqual(expect.arrayContaining(['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']));
    expect(atributos.some((a) => /^domain=/i.test(a))).toBe(false);
    expect(atributos).toContain(`Max-Age=${DIA / 1000}`);
    expect(new Date(r.body.expiresAt).getTime()).toBe(reloj.ahora().getTime() + DIA);
  });

  it('401 uniforme para ciudadano, suspendido, pendiente, inexistente y contrasena incorrecta, sin cookie ni sesion', async () => {
    const ciudadano = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    const suspendido = await crearCuentaDePrueba(prisma, { rol: 'administrador', estado: 'suspendido' });
    const pendiente = await crearCuentaDePrueba(prisma, { rol: 'administrador', estado: 'pendiente_activacion' });
    const activo = await crearCuentaDePrueba(prisma, { rol: 'operador' });
    const respuestas = await Promise.all([
      login(ciudadano.correo),
      login(suspendido.correo),
      login(pendiente.correo),
      login('nadie@ejemplo.com'),
      login(activo.correo, 'otra-contraseña-incorrecta-123'),
    ]);
    const cuerpos = respuestas.map((r) => {
      expect(r.status).toBe(401);
      expect(r.headers['set-cookie']).toBeUndefined();
      expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
      const { requestId: _r, ...resto } = r.body.error;
      return resto;
    });
    for (const c of cuerpos) expect(c).toEqual(cuerpos[0]);
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('400 por campo ante datos mal formados', async () => {
    const r = await request(app)
      .post(RUTA_INST_SESIONES)
      .set({ Origin: ORIGEN_WEB_PRUEBA })
      .send({ correo: 'no-es-correo', contrasena: '' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('415 si el contenido no es JSON', async () => {
    const r = await request(app)
      .post(RUTA_INST_SESIONES)
      .set({ Origin: ORIGEN_WEB_PRUEBA, 'Content-Type': 'text/plain' })
      .send('correo=a');
    expect(r.status).toBe(415);
  });

  it('un administrador no puede usar el acceso ciudadano', async () => {
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const r = await request(app).post(RUTA_LOGIN).send({ correo: admin.correo, contrasena: CLAVE });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('una cuenta suspendida no recibe sesion al emitir, aunque su contrasena fuese correcta', async () => {
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    await prisma.usuario.update({ where: { id: admin.id }, data: { estado: 'suspendido' } });
    const creada = await new PrismaSesionesAdapter(prisma).crearSiUsuarioHabilitado(
      {
        usuarioId: admin.id,
        tokenHash: 'h'.repeat(64),
        createdAt: reloj.ahora(),
        expiresAt: new Date(reloj.ahora().getTime() + DIA),
      },
      ['administrador', 'operador'],
    );
    expect(creada).toBeNull();
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('el puerto distingue por rol: un rol no admitido no obtiene sesion ni la encuentra', async () => {
    const sesiones = new PrismaSesionesAdapter(prisma);
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const nueva = {
      usuarioId: admin.id,
      tokenHash: 'a'.repeat(64),
      createdAt: reloj.ahora(),
      expiresAt: new Date(reloj.ahora().getTime() + DIA),
    };
    expect(await sesiones.crearSiUsuarioHabilitado(nueva, ['ciudadano'])).toBeNull();
    expect(await sesiones.crearSiUsuarioHabilitado(nueva, ['administrador'])).not.toBeNull();
    expect(await sesiones.buscarVigente('a'.repeat(64), reloj.ahora(), ['ciudadano'])).toBeNull();
    expect(await sesiones.buscarVigente('a'.repeat(64), reloj.ahora(), ['administrador', 'operador'])).not.toBeNull();
    expect(await sesiones.buscarVigente('a'.repeat(64), reloj.ahora(), [])).toBeNull();
  });
});

describe('carrera de suspension', () => {
  it('una suspension concurrente impide emitir una sesion institucional utilizable', async () => {
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const bloqueo = new Client({ connectionString: urlPruebas() });
    await bloqueo.connect();
    try {
      // La suspension esta sin confirmar: sostiene el bloqueo de la fila del usuario.
      await bloqueo.query('BEGIN');
      await bloqueo.query(`UPDATE usuarios SET estado = 'suspendido' WHERE id = $1`, [admin.id]);
      let terminada = false;
      const intento = login(admin.correo).then((r) => {
        terminada = true;
        return r;
      });
      await new Promise((resolver) => setTimeout(resolver, 600));
      expect(terminada).toBe(false); // la emision espera el bloqueo de la fila
      await bloqueo.query('COMMIT');
      const r = await intento;
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(r.headers['set-cookie']).toBeUndefined();
      expect(await prisma.sesion.count()).toBe(0);
    } finally {
      await bloqueo.end();
    }
  });
});

describe('GET/DELETE /auth/institucional/sesion', () => {
  it('restaura la sesion con la cookie (refrescar el navegador) sin pedir credenciales', async () => {
    const { cuenta, cookie } = await ingresar('administrador');
    const r = await request(app).get(RUTA_INST_SESION).set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body.usuario).toEqual({
      id: cuenta.id,
      nombre: 'Cuenta de prueba',
      correo: cuenta.correo,
      rol: 'administrador',
    });
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('401 sin cookie, con cookie desconocida y con cookie malformada', async () => {
    expect((await request(app).get(RUTA_INST_SESION)).status).toBe(401);
    expect((await request(app).get(RUTA_INST_SESION).set('Cookie', conCookie('x'.repeat(43)))).status).toBe(401);
    expect((await request(app).get(RUTA_INST_SESION).set('Cookie', `${COOKIE}=a b;c`)).status).toBe(401);
  });

  it('una cookie duplicada es ambigua y se rechaza', async () => {
    const { cookie } = await ingresar('operador');
    const r = await request(app).get(RUTA_INST_SESION).set('Cookie', `${cookie}; ${cookie}`);
    expect(r.status).toBe(401);
  });

  it('cierre: 204, revoca, borra la cookie y la consulta posterior da 401; repetirlo sigue dando 204', async () => {
    const { cookie } = await ingresar('operador');
    const cierre = await request(app).delete(RUTA_INST_SESION).set({ Origin: ORIGEN_WEB_PRUEBA, Cookie: cookie });
    expect(cierre.status).toBe(204);
    const borrada = (cierre.headers['set-cookie'] as unknown as string[])[0] as string;
    expect(borrada.startsWith(`${COOKIE}=;`)).toBe(true);
    expect(borrada).toContain('Max-Age=0');
    expect((await request(app).get(RUTA_INST_SESION).set('Cookie', cookie)).status).toBe(401);
    const otra = await request(app).delete(RUTA_INST_SESION).set({ Origin: ORIGEN_WEB_PRUEBA, Cookie: cookie });
    expect(otra.status).toBe(204);
    const sinSesion = await request(app).delete(RUTA_INST_SESION).set({ Origin: ORIGEN_WEB_PRUEBA });
    expect(sinSesion.status).toBe(204);
    expect(sinSesion.headers['set-cookie']).toBeDefined();
  });

  it('el cierre acepta un DELETE sin cuerpo con Content-Length: 0 (como lo envian navegadores y proxies)', async () => {
    const { cookie } = await ingresar('administrador');
    const r = await request(app)
      .delete(RUTA_INST_SESION)
      .set({ Origin: ORIGEN_WEB_PRUEBA, Cookie: cookie, 'Content-Length': '0' });
    expect(r.status).toBe(204);
    expect((await request(app).get(RUTA_INST_SESION).set('Cookie', cookie)).status).toBe(401);
  });

  it('suspender a la cuenta durante la sesion da 401 en la siguiente peticion', async () => {
    const { cuenta, cookie } = await ingresar('administrador');
    expect((await request(app).get(RUTA_PANEL_ADMIN).set('Cookie', cookie)).status).toBe(200);
    await prisma.usuario.update({ where: { id: cuenta.id }, data: { estado: 'suspendido' } });
    expect((await request(app).get(RUTA_INST_SESION).set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).get(RUTA_PANEL_ADMIN).set('Cookie', cookie)).status).toBe(401);
  });

  it('vence a las 24 horas exactas y no se renueva con el uso', async () => {
    const { cookie } = await ingresar('operador');
    const inicio = await request(app).get(RUTA_INST_SESION).set('Cookie', cookie);
    reloj.avanzar(DIA - 1000);
    const antes = await request(app).get(RUTA_INST_SESION).set('Cookie', cookie);
    expect(antes.status).toBe(200);
    expect(antes.body.expiresAt).toBe(inicio.body.expiresAt);
    reloj.avanzar(1000);
    const despues = await request(app).get(RUTA_INST_SESION).set('Cookie', cookie);
    expect(despues.status).toBe(401);
    expect(despues.body.error.code).toBe('UNAUTHENTICATED');
    reloj.avanzar(-DIA);
  });
});

describe('proteccion contra solicitudes entre sitios', () => {
  it('Origin ajeno, ausente o cross-site dan 403 sin cookies ni sesion, antes de limitar o verificar', async () => {
    const cuenta = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const cuerpo = { correo: cuenta.correo, contrasena: CLAVE };
    const ajeno = await request(app).post(RUTA_INST_SESIONES).set('Origin', 'https://malo.test').send(cuerpo);
    const ausente = await request(app).post(RUTA_INST_SESIONES).send(cuerpo);
    const cross = await request(app)
      .post(RUTA_INST_SESIONES)
      .set({ Origin: ORIGEN_WEB_PRUEBA, 'Sec-Fetch-Site': 'cross-site' })
      .send(cuerpo);
    const prefijo = await request(app)
      .post(RUTA_INST_SESIONES)
      .set('Origin', `${ORIGEN_WEB_PRUEBA}.malo.test`)
      .send(cuerpo);
    for (const r of [ajeno, ausente, cross, prefijo]) {
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('FORBIDDEN_ORIGIN');
      expect(r.headers['set-cookie']).toBeUndefined();
    }
    expect(await prisma.sesion.count()).toBe(0);
    expect(await prisma.ventanaIntentos.count()).toBe(0);
  });

  it('el cierre de sesion con Origin ajeno no revoca ni borra la cookie', async () => {
    const { cookie } = await ingresar('administrador');
    const r = await request(app).delete(RUTA_INST_SESION).set({ Origin: 'https://malo.test', Cookie: cookie });
    expect(r.status).toBe(403);
    expect(r.headers['set-cookie']).toBeUndefined();
    expect((await request(app).get(RUTA_INST_SESION).set('Cookie', cookie)).status).toBe(200);
  });

  it('con el Origin correcto y same-origin se procesa', async () => {
    const cuenta = await crearCuentaDePrueba(prisma, { rol: 'operador' });
    const r = await login(cuenta.correo, CLAVE, { 'Sec-Fetch-Site': 'same-origin' });
    expect(r.status).toBe(200);
  });
});

describe('sin CORS', () => {
  it('ninguna respuesta lleva Access-Control-*, ni con preflight ni con Origin ajeno', async () => {
    const cuenta = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const { cookie } = await ingresar('operador');
    const respuestas = [
      await request(app)
        .options(RUTA_INST_SESIONES)
        .set({ Origin: 'https://malo.test', 'Access-Control-Request-Method': 'POST' }),
      await request(app)
        .post(RUTA_INST_SESIONES)
        .set('Origin', 'https://malo.test')
        .send({ correo: cuenta.correo, contrasena: CLAVE }),
      await request(app).get('/api/v1/publico/contenido').set('Origin', 'https://malo.test'),
      await request(app).get(RUTA_INST_SESION).set({ Origin: 'https://malo.test', Cookie: cookie }),
      await request(app).get(RUTA_PANEL_ADMIN).set('Origin', ORIGEN_WEB_PRUEBA),
      await request(app).post(RUTA_REGISTRO).set('Origin', ORIGEN_WEB_PRUEBA).send({}),
    ];
    for (const r of respuestas) {
      expect(Object.keys(r.headers).filter((h) => h.startsWith('access-control-'))).toEqual([]);
    }
  });
});

describe('aislamiento entre sesion de panel y sesion ciudadana', () => {
  it('un Bearer ciudadano no abre el panel y la cookie institucional no abre rutas ciudadanas', async () => {
    const reg = await request(app)
      .post(RUTA_REGISTRO)
      .send({ nombre: 'Rosa Quispe', correo: 'rosa@ejemplo.com', contrasena: CLAVE });
    expect(reg.status).toBe(201);
    const ses = await request(app).post(RUTA_LOGIN).send({ correo: 'rosa@ejemplo.com', contrasena: CLAVE });
    const bearer = `Bearer ${ses.body.token as string}`;
    for (const ruta of [RUTA_PANEL_ADMIN, RUTA_PANEL_OPERADOR, RUTA_INST_SESION]) {
      expect((await request(app).get(ruta).set('Authorization', bearer)).status).toBe(401);
    }
    // El mismo token ciudadano presentado como cookie institucional tampoco sirve.
    const comoCookie = await request(app).get(RUTA_PANEL_ADMIN).set('Cookie', conCookie(ses.body.token as string));
    expect(comoCookie.status).toBe(401);

    const { cookie } = await ingresar('administrador');
    expect((await request(app).get(RUTA_SESION).set('Cookie', cookie)).status).toBe(401);
    const tokenInst = cookie.slice(COOKIE.length + 1);
    expect((await request(app).get(RUTA_SESION).set('Authorization', `Bearer ${tokenInst}`)).status).toBe(401);
    // Authorization no sustituye a la cookie en el panel.
    expect((await request(app).get(RUTA_PANEL_ADMIN).set('Authorization', `Bearer ${tokenInst}`)).status).toBe(401);
  });
});

describe('sin recuperacion publica ni altas privilegiadas', () => {
  const RECUP = '/api/v1/auth/recuperaciones';

  it('la recuperacion de un administrador u operador activo da el mismo 202 uniforme y no encola correo', async () => {
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const operador = await crearCuentaDePrueba(prisma, { rol: 'operador' });
    const ciudadano = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    const inexistente = await request(app).post(RECUP).send({ correo: 'nadie@ejemplo.com' });
    for (const c of [admin, operador]) {
      const r = await request(app).post(RECUP).send({ correo: c.correo });
      expect(r.status).toBe(202);
      expect(r.body).toEqual(inexistente.body);
    }
    expect(await prisma.envioCorreo.count()).toBe(0);
    // Control: para el ciudadano si se encola, de modo que la ausencia anterior es significativa.
    expect((await request(app).post(RECUP).send({ correo: ciudadano.correo })).status).toBe(202);
    expect(await prisma.envioCorreo.count()).toBe(1);
  });

  it('el consumo de recuperacion rechaza tokens de cuentas privilegiadas como token invalido', async () => {
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const { token, tokenHash } = crearArnes({ prisma }).deps.tokens.generar();
    await prisma.tokenCuenta.create({
      data: { usuarioId: admin.id, proposito: 'recuperacion', tokenHash, createdAt: reloj.ahora(), expiresAt: new Date(reloj.ahora().getTime() + 30 * 60_000) },
    });
    const r = await request(app)
      .post('/api/v1/auth/contrasena/restablecer')
      .send({ token, contrasena: 'otra-contraseña-larga-123' });
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('TOKEN_INVALID');
    // La contrasena anterior sigue siendo la valida.
    expect((await login(admin.correo)).status).toBe(200);
  });

  it('el registro ciudadano sigue rechazando rol y campos extra', async () => {
    const r = await request(app)
      .post(RUTA_REGISTRO)
      .send({ nombre: 'X Y', correo: 'x@ejemplo.com', contrasena: CLAVE, rol: 'administrador' });
    expect(r.status).toBe(400);
    expect(await prisma.usuario.count()).toBe(0);
  });
});

describe('paneles minimos y permisos por rol', () => {
  it('administrador: 200 en su panel con las secciones no disponibles; 403 en el del operador', async () => {
    const { cuenta, cookie } = await ingresar('administrador');
    const ok = await request(app).get(RUTA_PANEL_ADMIN).set('Cookie', cookie);
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(ok.body.usuario).toEqual({
      id: cuenta.id,
      nombre: 'Cuenta de prueba',
      correo: cuenta.correo,
      rol: 'administrador',
    });
    expect(ok.body.secciones.map((s: { titulo: string }) => s.titulo)).toEqual([
      'Inicio',
      'Instituciones y sedes',
      'Operadores',
      'Coberturas',
      'Categorías',
      'Reglas',
      'Contenido y contactos',
      'Historial',
    ]);
    expect(ok.body.secciones.every((s: { disponible: boolean }) => s.disponible === false)).toBe(true);
    const ajeno = await request(app).get(RUTA_PANEL_OPERADOR).set('Cookie', cookie);
    expect(ajeno.status).toBe(403);
    expect(ajeno.body.error.code).toBe('FORBIDDEN');
    expect(ajeno.body.secciones).toBeUndefined();
  });

  it('operador (fixture directo en BD): 200 en su panel y 403 en el del administrador', async () => {
    const { cookie } = await ingresar('operador');
    const ok = await request(app).get(RUTA_PANEL_OPERADOR).set('Cookie', cookie);
    expect(ok.status).toBe(200);
    expect(ok.body.secciones.map((s: { titulo: string }) => s.titulo)).toEqual(['Inicio', 'Incidentes', 'Mapa', 'Indicadores', 'Historial']);
    expect(ok.body.secciones.every((s: { disponible: boolean }) => s.disponible === false)).toBe(true);
    const ajeno = await request(app).get(RUTA_PANEL_ADMIN).set('Cookie', cookie);
    expect(ajeno.status).toBe(403);
    expect(ajeno.body.usuario).toBeUndefined();
  });

  it('401 sin sesion en ambos paneles', async () => {
    expect((await request(app).get(RUTA_PANEL_ADMIN)).status).toBe(401);
    expect((await request(app).get(RUTA_PANEL_OPERADOR)).status).toBe(401);
  });
});

describe('limitacion de intentos institucionales', () => {
  it('429 con Retry-After al exceder, sin verificar mas contrasenas, y sin afectar al acceso ciudadano', async () => {
    const limitado = crearArnes({ politica: { loginInstPorCorreoIp: 2 }, prisma });
    const cuenta = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const intento = (contrasena: string) =>
      request(limitado.app)
        .post(RUTA_INST_SESIONES)
        .set('Origin', ORIGEN_WEB_PRUEBA)
        .send({ correo: cuenta.correo, contrasena });
    expect((await intento('incorrecta-incorrecta-1')).status).toBe(401);
    expect((await intento('incorrecta-incorrecta-1')).status).toBe(401);
    const r = await intento('incorrecta-incorrecta-1');
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
    expect(Number(r.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    // Ni siquiera la contrasena correcta pasa en esa ventana.
    expect((await intento(CLAVE)).status).toBe(429);
    // Los contadores ciudadanos son otros.
    const ciudadano = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    const acceso = await request(limitado.app).post(RUTA_LOGIN).send({ correo: ciudadano.correo, contrasena: CLAVE });
    expect(acceso.status).toBe(200);
    const tipos = (await prisma.ventanaIntentos.findMany()).map((v) => v.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['login_inst_ip', 'login_inst_correo_ip', 'login_ip']));
  });
});

describe('secretos fuera de los registros', () => {
  it('ni el token, ni la cookie, ni la contrasena aparecen en los logs', async () => {
    const cuenta = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const ok = await login(cuenta.correo);
    const token = cookieDe(ok) as string;
    await request(app).get(RUTA_INST_SESION).set('Cookie', conCookie(token));
    await login(cuenta.correo, 'contraseña-incorrecta-identificable-77');
    await request(app).delete(RUTA_INST_SESION).set({ Origin: ORIGEN_WEB_PRUEBA, Cookie: conCookie(token) });
    const texto = logger.texto().toLowerCase();
    for (const secreto of [token, CLAVE, 'contraseña-incorrecta-identificable-77', COOKIE, 'set-cookie']) {
      expect(texto).not.toContain(secreto.toLowerCase());
    }
  });
});
