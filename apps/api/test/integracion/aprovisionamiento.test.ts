import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ejecutarCli, leerArgumentos } from '../../src/cli/aprovisionamiento';
import {
  AprovisionamientoAdministrador,
  AprovisionamientoRechazadoError,
  type EntornoEjecucion,
} from '../../src/modules/identidad/infraestructura/aprovisionamiento-administrador';
import {
  CLAVE,
  cookieDe,
  crearArnes,
  crearCuentaDePrueba,
  limpiarBd,
  ORIGEN_WEB_PRUEBA,
  RUTA_INST_SESION,
  RUTA_INST_SESIONES,
  RUTA_PANEL_ADMIN,
  SECRETO_PRUEBA,
  urlPruebas,
} from './arnes';

const arnes = crearArnes();
const { app, prisma, reloj, modulo } = arnes;
const CORREO = 'admin-inicial@ejemplo.com';
const NUEVA_CLAVE = 'contraseña-nueva-del-titular-4821';

const LOCAL: EntornoEjecucion = { integracionContinua: false, terminal: true };
const servicio = (entorno: EntornoEjecucion = LOCAL, invitar = modulo.invitarCuenta) =>
  new AprovisionamientoAdministrador(prisma, invitar, modulo.emitirToken, reloj, ORIGEN_WEB_PRUEBA, entorno);

const alta = (s = servicio(), opciones = {}) => s.altaAdministrador({ correo: CORREO, nombre: 'Ana Torres' }, opciones);
const cuenta = () => prisma.usuario.findUniqueOrThrow({ where: { correoNormalizado: CORREO } });

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

describe('alta controlada del administrador (5.1)', () => {
  it('crea una cuenta administrador pendiente, sin contrasena, con su invitacion encolada', async () => {
    const r = await alta();
    expect(r.resultado).toBe('creada');
    const u = await cuenta();
    expect(u).toMatchObject({ rol: 'administrador', estado: 'pendiente_activacion', passwordHash: null, nombre: 'Ana Torres' });
    const envios = await prisma.envioCorreo.findMany();
    expect(envios).toHaveLength(1);
    expect(envios[0]).toMatchObject({ usuarioId: u.id, tipo: 'activacion', estado: 'pendiente' });
  });

  it('es idempotente: repetirlo no duplica la cuenta ni apila invitaciones', async () => {
    await alta();
    const segunda = await alta();
    expect(segunda.resultado).toBe('reencolada');
    expect(await prisma.usuario.count()).toBe(1);
    expect(await prisma.envioCorreo.count()).toBe(1);
  });

  it('dos altas simultaneas del mismo correo dejan una sola cuenta', async () => {
    const resultados = await Promise.all([alta(), alta()]);
    expect(resultados.map((r) => r.resultado).sort()).toEqual(['creada', 'reencolada']);
    expect(await prisma.usuario.count()).toBe(1);
    expect(await prisma.envioCorreo.count()).toBe(1);
  });

  it('un administrador activo no se modifica: ni contrasena, ni estado, ni sesiones', async () => {
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador', correo: CORREO });
    const antes = await cuenta();
    const r = await alta();
    expect(r).toMatchObject({ resultado: 'ya_activa', usuarioId: admin.id });
    const despues = await cuenta();
    expect(despues.passwordHash).toBe(antes.passwordHash);
    expect(despues.estado).toBe('activo');
    expect(await prisma.envioCorreo.count()).toBe(0);
  });

  it('un administrador suspendido tampoco se toca: reactivarlo exige el reinicio explicito', async () => {
    await crearCuentaDePrueba(prisma, { rol: 'administrador', estado: 'suspendido', correo: CORREO });
    expect((await alta()).resultado).toBe('suspendida');
    expect((await cuenta()).estado).toBe('suspendido');
    expect(await prisma.envioCorreo.count()).toBe(0);
  });

  it.each(['ciudadano', 'operador'] as const)('rechaza un correo de %s sin modificarlo', async (rol) => {
    await crearCuentaDePrueba(prisma, { rol, correo: CORREO });
    const antes = await cuenta();
    await expect(alta()).rejects.toMatchObject({ codigo: 'CORREO_DE_OTRO_ROL' });
    const despues = await cuenta();
    expect(despues).toMatchObject({ rol, estado: 'activo', passwordHash: antes.passwordHash });
    expect(await prisma.envioCorreo.count()).toBe(0);
  });

  it('si falla la invitacion no queda ni cuenta ni envio', async () => {
    const rota = { ejecutar: () => Promise.reject(new Error('fallo al encolar')) } as unknown as typeof modulo.invitarCuenta;
    await expect(alta(servicio(LOCAL, rota))).rejects.toThrow('fallo al encolar');
    expect(await prisma.usuario.count()).toBe(0);
    expect(await prisma.envioCorreo.count()).toBe(0);
  });

  it.each([
    ['correo sin forma', { correo: 'no-es-correo', nombre: 'Ana' }],
    ['correo vacio', { correo: '', nombre: 'Ana' }],
    ['nombre vacio', { correo: CORREO, nombre: '   ' }],
    ['nombre demasiado largo', { correo: CORREO, nombre: 'a'.repeat(101) }],
  ])('rechaza datos invalidos (%s) sin tocar la base', async (_n, datos) => {
    await expect(servicio().altaAdministrador(datos)).rejects.toBeInstanceOf(AprovisionamientoRechazadoError);
    expect(await prisma.usuario.count()).toBe(0);
  });

  it('activar la cuenta invitada la deja lista para el acceso institucional, sin sesion previa', async () => {
    await alta();
    await modulo.gestorEnvios.despertar();
    await modulo.gestorEnvios.esperarReposo();
    const sesion = await request(app)
      .post(RUTA_INST_SESIONES)
      .set({ Origin: ORIGEN_WEB_PRUEBA })
      .send({ correo: CORREO, contrasena: CLAVE });
    expect(sesion.status).toBe(401); // pendiente: nadie puede entrar con un valor conocido
    expect(await prisma.sesion.count()).toBe(0);
  });
});

describe('enlace emitido solo en terminal local (5.2)', () => {
  it('imprime el enlace de la web una vez, guarda solo la huella y no encola correo', async () => {
    const r = await alta(servicio(), { emitirEnlace: true });
    expect(r.resultado).toBe('enlace_emitido');
    const url = new URL(r.enlace as string);
    expect(url.origin).toBe(ORIGEN_WEB_PRUEBA);
    expect(url.pathname).toBe('/activar');
    expect(url.hash).toMatch(/^#t=[A-Za-z0-9_-]{43}$/);
    const token = url.hash.slice(3);
    const tokens = await prisma.tokenCuenta.findMany();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ proposito: 'activacion' });
    expect(tokens[0]!.tokenHash).not.toContain(token);
    expect(await prisma.envioCorreo.count()).toBe(0);
    // El token del enlace es el vigente y activa la cuenta con la contrasena del titular.
    const activar = await request(app).post('/api/v1/auth/activaciones').send({ token, contrasena: NUEVA_CLAVE });
    expect(activar.status).toBe(204);
  });

  it('con CI=true se niega antes de tocar la base: ni cuenta ni token', async () => {
    await expect(alta(servicio({ integracionContinua: true, terminal: true }), { emitirEnlace: true })).rejects.toMatchObject({
      codigo: 'CI_NO_PERMITIDO',
    });
    expect(await prisma.usuario.count()).toBe(0);
    expect(await prisma.tokenCuenta.count()).toBe(0);
  });

  it('sin terminal (salida a archivo o registro) tambien se niega', async () => {
    await expect(alta(servicio({ integracionContinua: false, terminal: false }), { emitirEnlace: true })).rejects.toMatchObject({
      codigo: 'SIN_TERMINAL',
    });
    expect(await prisma.usuario.count()).toBe(0);
  });

  it('con una cuenta ya activa no emite ningun token', async () => {
    await crearCuentaDePrueba(prisma, { rol: 'administrador', correo: CORREO });
    const r = await alta(servicio(), { emitirEnlace: true });
    expect(r.resultado).toBe('ya_activa');
    expect(r.enlace).toBeUndefined();
    expect(await prisma.tokenCuenta.count()).toBe(0);
  });
});

describe('reinicio de emergencia (5.3)', () => {
  const reiniciar = (s = servicio(), opciones = {}) => s.reiniciarAdministrador({ correo: CORREO }, opciones);

  async function adminConSesion() {
    await crearCuentaDePrueba(prisma, { rol: 'administrador', correo: CORREO });
    const r = await request(app).post(RUTA_INST_SESIONES).set({ Origin: ORIGEN_WEB_PRUEBA }).send({ correo: CORREO, contrasena: CLAVE });
    expect(r.status).toBe(200);
    return `__Host-ayni_inst=${cookieDe(r) as string}`;
  }

  it('la contrasena anterior deja de autenticar, las sesiones mueren y llega una invitacion nueva', async () => {
    const cookie = await adminConSesion();
    expect((await request(app).get(RUTA_PANEL_ADMIN).set('Cookie', cookie)).status).toBe(200);
    const r = await reiniciar();
    expect(r.resultado).toBe('reiniciada');
    expect(await cuenta()).toMatchObject({ estado: 'pendiente_activacion', passwordHash: null, rol: 'administrador' });
    expect((await request(app).get(RUTA_INST_SESION).set('Cookie', cookie)).status).toBe(401);
    expect((await request(app).get(RUTA_PANEL_ADMIN).set('Cookie', cookie)).status).toBe(401);
    const viejo = await request(app).post(RUTA_INST_SESIONES).set({ Origin: ORIGEN_WEB_PRUEBA }).send({ correo: CORREO, contrasena: CLAVE });
    expect(viejo.status).toBe(401);
    const envios = await prisma.envioCorreo.findMany();
    expect(envios).toHaveLength(1);
    expect(envios[0]).toMatchObject({ tipo: 'activacion', estado: 'pendiente' });
  });

  it('invalida los tokens previos y, con enlace local, el nuevo es el unico vigente', async () => {
    await adminConSesion();
    const viejo = await reiniciar(servicio(), { emitirEnlace: true });
    const tokenViejo = new URL(viejo.enlace as string).hash.slice(3);
    const nuevo = await reiniciar(servicio(), { emitirEnlace: true });
    const tokenNuevo = new URL(nuevo.enlace as string).hash.slice(3);
    const usado = await request(app).post('/api/v1/auth/activaciones').send({ token: tokenViejo, contrasena: NUEVA_CLAVE });
    expect([404, 410]).toContain(usado.status);
    expect((await request(app).post('/api/v1/auth/activaciones').send({ token: tokenNuevo, contrasena: NUEVA_CLAVE })).status).toBe(204);
  });

  it('una cuenta suspendida solo recupera acceso tras reiniciarse y activarse', async () => {
    await crearCuentaDePrueba(prisma, { rol: 'administrador', estado: 'suspendido', correo: CORREO });
    const r = await reiniciar(servicio(), { emitirEnlace: true });
    expect((await cuenta()).estado).toBe('pendiente_activacion');
    const token = new URL(r.enlace as string).hash.slice(3);
    expect((await request(app).post('/api/v1/auth/activaciones').send({ token, contrasena: NUEVA_CLAVE })).status).toBe(204);
    expect((await cuenta()).estado).toBe('activo');
    const sesion = await request(app).post(RUTA_INST_SESIONES).set({ Origin: ORIGEN_WEB_PRUEBA }).send({ correo: CORREO, contrasena: NUEVA_CLAVE });
    expect(sesion.status).toBe(200);
  });

  it.each(['ciudadano', 'operador'] as const)('rechaza el correo de %s sin modificarlo', async (rol) => {
    await crearCuentaDePrueba(prisma, { rol, correo: CORREO });
    const antes = await cuenta();
    await expect(reiniciar()).rejects.toMatchObject({ codigo: 'NO_ES_ADMINISTRADOR' });
    expect(await cuenta()).toMatchObject({ rol, estado: 'activo', passwordHash: antes.passwordHash });
    expect(await prisma.envioCorreo.count()).toBe(0);
  });

  it('un correo inexistente termina con error y no crea nada', async () => {
    await expect(reiniciar()).rejects.toMatchObject({ codigo: 'NO_EXISTE' });
    expect(await prisma.usuario.count()).toBe(0);
  });

  it('con CI=true y enlace local se niega y no modifica la cuenta', async () => {
    await crearCuentaDePrueba(prisma, { rol: 'administrador', correo: CORREO });
    await expect(reiniciar(servicio({ integracionContinua: true, terminal: true }), { emitirEnlace: true })).rejects.toMatchObject({
      codigo: 'CI_NO_PERMITIDO',
    });
    expect((await cuenta()).estado).toBe('activo');
  });

  it('la recuperacion ciudadana no cambia tras el reinicio de un administrador', async () => {
    await adminConSesion();
    await reiniciar();
    const ciudadano = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    expect((await request(app).post('/api/v1/auth/recuperaciones').send({ correo: ciudadano.correo })).status).toBe(202);
    expect((await prisma.envioCorreo.findMany({ where: { tipo: 'recuperacion' } })).length).toBe(1);
  });
});

describe('CLI de aprovisionamiento (5.4)', () => {
  let carpeta: string;
  beforeEach(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'ayni-correos-'));
  });
  afterAll(async () => {
    if (carpeta) await rm(carpeta, { recursive: true, force: true });
  });

  const envBase = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
    NODE_ENV: 'development',
    DATABASE_URL: urlPruebas(),
    RATE_LIMIT_HMAC_SECRET: SECRETO_PRUEBA,
    EMAIL_ADAPTER: 'archivo',
    EMAIL_ARCHIVO_DIR: carpeta,
    WEB_ORIGIN: ORIGEN_WEB_PRUEBA,
    WEB_PUBLIC_URL: ORIGEN_WEB_PRUEBA,
    ...extra,
  });

  async function correr(comando: 'bootstrap' | 'reiniciar', argv: string[], env: NodeJS.ProcessEnv, terminal = true) {
    const lineas: string[] = [];
    const codigo = await ejecutarCli({
      comando,
      argv,
      env,
      terminal,
      salida: (l) => lineas.push(l),
      error: (l) => lineas.push(l),
    });
    return { codigo, lineas, texto: lineas.join('\n') };
  }

  async function ultimoCorreo(): Promise<string> {
    const archivos = (await readdir(carpeta)).sort();
    return readFile(join(carpeta, archivos[archivos.length - 1] as string), 'utf8');
  }

  it('bootstrap -> activacion -> acceso institucional -> panel -> reinicio -> acceso anterior rechazado, sin secretos en la salida', async () => {
    const env = envBase();
    const b = await correr('bootstrap', ['--correo', CORREO, '--nombre', 'Ana Torres'], env);
    expect(b.codigo).toBe(0);
    expect(b.texto).toContain('resultado=creada');
    expect(b.texto).toContain('envio=enviado');

    const correo = await ultimoCorreo();
    const enlace = /https:\/\/\S+/.exec(correo)![0];
    expect(new URL(enlace).origin).toBe(ORIGEN_WEB_PRUEBA);
    expect(new URL(enlace).pathname).toBe('/activar');
    const token = new URL(enlace).hash.slice(3);

    const consulta = await request(app).post('/api/v1/auth/tokens/consulta').send({ token });
    expect(consulta.status).toBe(200);
    expect(consulta.body.proposito).toBe('activacion');
    expect((await request(app).post('/api/v1/auth/activaciones').send({ token, contrasena: NUEVA_CLAVE })).status).toBe(204);
    expect(await prisma.sesion.count()).toBe(0); // la activacion no inicia sesion

    const ingreso = await request(app).post(RUTA_INST_SESIONES).set({ Origin: ORIGEN_WEB_PRUEBA }).send({ correo: CORREO, contrasena: NUEVA_CLAVE });
    expect(ingreso.status).toBe(200);
    expect(ingreso.body.usuario.rol).toBe('administrador');
    const cookie = `__Host-ayni_inst=${cookieDe(ingreso) as string}`;
    const panel = await request(app).get(RUTA_PANEL_ADMIN).set('Cookie', cookie);
    expect(panel.status).toBe(200);

    const r = await correr('reiniciar', ['--correo', CORREO], env);
    expect(r.codigo).toBe(0);
    expect(r.texto).toContain('resultado=reiniciada');
    expect((await request(app).get(RUTA_PANEL_ADMIN).set('Cookie', cookie)).status).toBe(401);
    const viejo = await request(app).post(RUTA_INST_SESIONES).set({ Origin: ORIGEN_WEB_PRUEBA }).send({ correo: CORREO, contrasena: NUEVA_CLAVE });
    expect(viejo.status).toBe(401);

    // Ninguna salida del procedimiento contiene correo, contrasena, token, enlace ni cadena de conexion.
    const salida = `${b.texto}\n${r.texto}`;
    for (const secreto of [CORREO, NUEVA_CLAVE, CLAVE, token, '#t=', 'postgresql://', SECRETO_PRUEBA, 'Ana Torres']) {
      expect(salida).not.toContain(secreto);
    }
  });

  it('--emitir-enlace imprime el enlace una vez y no lo guarda en archivos ni lo encola', async () => {
    const r = await correr('bootstrap', ['--correo', CORREO, '--nombre', 'Ana Torres', '--emitir-enlace'], envBase());
    expect(r.codigo).toBe(0);
    const conEnlace = r.lineas.filter((l) => l.includes('#t='));
    expect(conEnlace).toHaveLength(1);
    expect(await readdir(carpeta)).toEqual([]);
    expect(await prisma.envioCorreo.count()).toBe(0);
  });

  it('con CI=true y --emitir-enlace se niega: no crea cuenta ni emite token ni imprime enlace', async () => {
    for (const ci of ['true', '1']) {
      const r = await correr('bootstrap', ['--correo', CORREO, '--nombre', 'Ana', '--emitir-enlace'], envBase({ CI: ci }));
      expect(r.codigo).toBe(1);
      expect(r.texto).toContain('CI_NO_PERMITIDO');
      expect(r.texto).not.toContain('#t=');
    }
    expect(await prisma.usuario.count()).toBe(0);
    expect(await prisma.tokenCuenta.count()).toBe(0);
  });

  it('sin terminal tambien se niega a imprimir el enlace', async () => {
    const r = await correr('bootstrap', ['--correo', CORREO, '--nombre', 'Ana', '--emitir-enlace'], envBase(), false);
    expect(r.codigo).toBe(1);
    expect(r.texto).toContain('SIN_TERMINAL');
    expect(await prisma.usuario.count()).toBe(0);
  });

  it('acepta correo y nombre desde el entorno y rechaza argumentos desconocidos', async () => {
    expect(leerArgumentos([], { ADMIN_CORREO: 'a@b.pe', ADMIN_NOMBRE: 'Ana' })).toEqual({ correo: 'a@b.pe', nombre: 'Ana', emitirEnlace: false });
    expect(leerArgumentos(['--correo=x@y.pe', '--emitir-enlace'], {})).toMatchObject({ correo: 'x@y.pe', emitirEnlace: true });
    const r = await correr('bootstrap', ['--contrasena', 'secreta-secreta-123'], envBase());
    expect(r.codigo).toBe(2);
    expect(r.texto).not.toContain('secreta-secreta-123');
    expect(await prisma.usuario.count()).toBe(0);
  });

  it('un error inesperado informa solo el nombre del error, sin la cadena de conexion', async () => {
    const r = await correr(
      'bootstrap',
      ['--correo', CORREO, '--nombre', 'Ana'],
      envBase({ DATABASE_URL: 'postgresql://usuario:clave-identificable-91@127.0.0.1:1/ayni_safe_test' }),
    );
    expect(r.codigo).toBe(1);
    expect(r.texto).not.toContain('clave-identificable-91');
    expect(r.texto).not.toContain('postgresql://');
  });

  it('el logger real del envio no registra correo, nombre, token ni enlace', async () => {
    const registrado: string[] = [];
    const espia = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      registrado.push(a.map(String).join(' '));
    });
    try {
      await correr('bootstrap', ['--correo', CORREO, '--nombre', 'Ana Torres'], envBase());
    } finally {
      espia.mockRestore();
    }
    const correo = await ultimoCorreo();
    const token = /#t=([A-Za-z0-9_-]{43})/.exec(correo)![1]!;
    expect(registrado.length).toBeGreaterThan(0); // el envio si se registro, de forma generica
    expect(registrado.some((l) => l.includes('envio_correo'))).toBe(true);
    const todo = registrado.join('\n');
    for (const secreto of [CORREO, 'Ana Torres', token, '#t=', ORIGEN_WEB_PRUEBA, '/activar']) {
      expect(todo).not.toContain(secreto);
    }
  });
});
