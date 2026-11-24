import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import type { CuentasPort } from '../../src/modules/identidad/aplicacion/puertos/cuentas.port';
import { CLAVE, crearArnes, limpiarBd, RUTA_LOGIN, RUTA_REGISTRO, RUTA_SESION } from './arnes';

const base = crearArnes();
const { app, prisma, reloj, logger } = base;
const RUTA_PERFIL = '/api/v1/perfil';

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

async function entrar(correo: string, nombre = 'Rosa') {
  const alta = await request(app).post(RUTA_REGISTRO).send({ nombre, correo, contrasena: CLAVE });
  expect(alta.status).toBe(201);
  const login = await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE });
  expect(login.status).toBe(200);
  return { id: alta.body.usuario.id as string, token: login.body.token as string };
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const leer = (token: string) => request(app).get(RUTA_PERFIL).set(bearer(token));
const editar = (token: string, cuerpo: unknown) => request(app).patch(RUTA_PERFIL).set(bearer(token)).send(cuerpo as object);

describe('GET /perfil', () => {
  it('200: devuelve solo el perfil del titular, sin telefono por defecto y sin datos internos', async () => {
    const a = await entrar('a@ejemplo.com', 'Ana');
    const b = await entrar('b@ejemplo.com', 'Beto');
    const r = await leer(a.token);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toEqual({ id: a.id, nombre: 'Ana', correo: 'a@ejemplo.com', telefono: null, compartirTelefono: false });
    expect(JSON.stringify(r.body)).not.toContain(b.id);
    expect(JSON.stringify(r.body)).not.toMatch(/hash|argon2|rol|estado/i);
  });

  it('401: token ausente, desconocido, mal formado, revocado, vencido y cuenta suspendida', async () => {
    const a = await entrar('a@ejemplo.com');
    for (const r of [
      await request(app).get(RUTA_PERFIL),
      await request(app).get(RUTA_PERFIL).set('Authorization', 'Basic abc'),
      await leer('token-desconocido'),
      await request(app).patch(RUTA_PERFIL).send({ nombre: 'X' }),
    ]) {
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('UNAUTHENTICATED');
      expect(r.body.id).toBeUndefined();
    }
    const otra = await entrar('revocada@ejemplo.com');
    await request(app).delete(RUTA_SESION).set(bearer(otra.token));
    expect((await leer(otra.token)).status).toBe(401);

    const suspendida = await entrar('susp@ejemplo.com');
    await prisma.usuario.update({ where: { id: suspendida.id }, data: { estado: 'suspendido' } });
    expect((await leer(suspendida.token)).status).toBe(401);
    expect((await editar(suspendida.token, { nombre: 'Otro' })).status).toBe(401);

    reloj.avanzar(24 * 60 * 60 * 1000 + 1000);
    expect((await leer(a.token)).status).toBe(401);
    reloj.fijar(new Date('2026-11-21T12:00:00.000Z'));
  });

  it('no existe perfil por identificador: ni ruta, ni consulta, ni cuerpo permiten ver a otra cuenta', async () => {
    const a = await entrar('a@ejemplo.com', 'Ana');
    const b = await entrar('b@ejemplo.com', 'Beto');
    expect((await request(app).get(`${RUTA_PERFIL}/${b.id}`).set(bearer(a.token))).status).toBe(404);
    expect((await request(app).patch(`${RUTA_PERFIL}/${b.id}`).set(bearer(a.token)).send({ nombre: 'X' })).status).toBe(404);
    const conConsulta = await request(app).get(`${RUTA_PERFIL}?id=${b.id}`).set(bearer(a.token));
    expect(conConsulta.body.id).toBe(a.id);
    const intento = await editar(a.token, { id: b.id, nombre: 'Hackeado' });
    expect(intento.status).toBe(400);
    const intentoUsuario = await editar(a.token, { usuarioId: b.id, nombre: 'Hackeado' });
    expect(intentoUsuario.status).toBe(400);
    expect((await leer(b.token)).body.nombre).toBe('Beto');
  });

  it('GET /auth/sesion no incluye el telefono', async () => {
    const a = await entrar('a@ejemplo.com');
    await editar(a.token, { telefono: '987654321' });
    const r = await request(app).get(RUTA_SESION).set(bearer(a.token));
    expect(JSON.stringify(r.body)).not.toContain('987654321');
    expect(r.body.usuario.telefono).toBeUndefined();
  });
});

describe('PATCH /perfil: edicion', () => {
  it('persiste nombre y telefono normalizado, y una consulta posterior lo devuelve', async () => {
    const a = await entrar('a@ejemplo.com');
    const r = await editar(a.token, { nombre: '  Rosa Quispe ', telefono: '+51 987-654-321' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: a.id, nombre: 'Rosa Quispe', correo: 'a@ejemplo.com', telefono: '+51987654321', compartirTelefono: false });
    expect((await leer(a.token)).body).toEqual(r.body);
    const fila = await prisma.usuario.findUniqueOrThrow({ where: { id: a.id } });
    expect(fila.nombre).toBe('Rosa Quispe');
    expect(fila.telefono).toBe('+51987654321');
  });

  it('telefono vacio o null es valido, tambien para cuentas que nunca tuvieron uno', async () => {
    const a = await entrar('a@ejemplo.com');
    expect((await editar(a.token, { telefono: '' })).body.telefono).toBeNull();
    await editar(a.token, { telefono: '987654321' });
    expect((await editar(a.token, { telefono: null })).body.telefono).toBeNull();
  });

  it('400 por campo con datos invalidos y no cambia nada', async () => {
    const a = await entrar('a@ejemplo.com', 'Ana');
    for (const cuerpo of [
      { nombre: '' },
      { nombre: 'a'.repeat(101) },
      { telefono: '123456' },
      { telefono: '1234567890123456' },
      { telefono: 'abc' },
      { compartirTelefono: 'si' },
      {},
    ]) {
      const r = await editar(a.token, cuerpo);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await editar(a.token, { nombre: '' })).body.error.fields.nombre).toBeDefined();
    expect((await editar(a.token, { telefono: 'abc' })).body.error.fields.telefono).toBeDefined();
    expect((await leer(a.token)).body).toMatchObject({ nombre: 'Ana', telefono: null });
  });

  it('400 con campos no admitidos y el correo y el acceso no cambian', async () => {
    const a = await entrar('a@ejemplo.com', 'Ana');
    for (const extra of [{ correo: 'nuevo@ejemplo.com' }, { rol: 'administrador' }, { estado: 'suspendido' }, { dni: '12345678' }]) {
      const r = await editar(a.token, { nombre: 'Otra', ...extra });
      expect(r.status).toBe(400);
      expect(r.body.error.fields.cuerpo).toBeDefined();
    }
    const fila = await prisma.usuario.findUniqueOrThrow({ where: { id: a.id } });
    expect(fila).toMatchObject({ nombre: 'Ana', correoNormalizado: 'a@ejemplo.com', rol: 'ciudadano', estado: 'activo' });
    expect((await request(app).post(RUTA_LOGIN).send({ correo: 'a@ejemplo.com', contrasena: CLAVE })).status).toBe(200);
    expect((await request(app).post(RUTA_LOGIN).send({ correo: 'nuevo@ejemplo.com', contrasena: CLAVE })).status).toBe(401);
  });

  it('415 si no es JSON', async () => {
    const a = await entrar('a@ejemplo.com');
    const r = await request(app).patch(RUTA_PERFIL).set(bearer(a.token)).set('Content-Type', 'text/plain').send('x');
    expect(r.status).toBe(415);
  });
});

describe('autorizacion para compartir el telefono', () => {
  it('otorgar y revocar conservan el numero y fijan la fecha solo al otorgar', async () => {
    const a = await entrar('a@ejemplo.com');
    expect((await editar(a.token, { telefono: '987654321', compartirTelefono: true })).body).toMatchObject({
      telefono: '987654321',
      compartirTelefono: true,
    });
    const otorgada = (await prisma.usuario.findUniqueOrThrow({ where: { id: a.id } })).telefonoCompartirConsentidoAt;
    expect(otorgada).not.toBeNull();

    // Una edicion de nombre no toca la autorizacion ni su fecha.
    reloj.avanzar(60_000);
    expect((await editar(a.token, { nombre: 'Nueva' })).body.compartirTelefono).toBe(true);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: a.id } })).telefonoCompartirConsentidoAt).toEqual(otorgada);
    // Reenviar el mismo numero no es un cambio.
    expect((await editar(a.token, { telefono: '987 654 321' })).body.compartirTelefono).toBe(true);

    const revocada = await editar(a.token, { compartirTelefono: false });
    expect(revocada.body).toMatchObject({ telefono: '987654321', compartirTelefono: false });
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: a.id } })).telefonoCompartirConsentidoAt).toBeNull();
  });

  it('400 al otorgar sin telefono, registrado ni enviado, y no registra la autorizacion', async () => {
    const a = await entrar('a@ejemplo.com');
    const r = await editar(a.token, { compartirTelefono: true });
    expect(r.status).toBe(400);
    expect(r.body.error.fields.compartirTelefono).toBeDefined();
    const r2 = await editar(a.token, { telefono: null, compartirTelefono: true });
    expect(r2.status).toBe(400);
    expect((await leer(a.token)).body.compartirTelefono).toBe(false);
  });

  it('borrar el telefono revoca la autorizacion', async () => {
    const a = await entrar('a@ejemplo.com');
    await editar(a.token, { telefono: '987654321', compartirTelefono: true });
    const r = await editar(a.token, { telefono: null });
    expect(r.body).toMatchObject({ telefono: null, compartirTelefono: false });
  });

  it('cambiar el numero revoca la autorizacion salvo que la misma solicitud la otorgue', async () => {
    const a = await entrar('a@ejemplo.com');
    await editar(a.token, { telefono: '987654321', compartirTelefono: true });
    expect((await editar(a.token, { telefono: '912345678' })).body).toMatchObject({
      telefono: '912345678',
      compartirTelefono: false,
    });
    await editar(a.token, { compartirTelefono: true });
    expect((await editar(a.token, { telefono: '999888777', compartirTelefono: true })).body).toMatchObject({
      telefono: '999888777',
      compartirTelefono: true,
    });
  });
});

describe('privacidad y concurrencia', () => {
  it('ningun registro del servidor contiene telefono ni nombre ni cuerpo', async () => {
    const a = await entrar('a@ejemplo.com');
    await editar(a.token, { nombre: 'NombreIdentificable-77', telefono: '987612345' });
    await leer(a.token);
    const texto = logger.texto();
    expect(texto).not.toContain('987612345');
    expect(texto).not.toContain('NombreIdentificable-77');
    expect(texto).toContain('/perfil');
  });

  it('ediciones simultaneas dejan un estado consistente y nunca autorizacion sin telefono', async () => {
    const a = await entrar('a@ejemplo.com');
    await editar(a.token, { telefono: '987654321', compartirTelefono: true });
    const lote = await Promise.all([
      editar(a.token, { telefono: null }),
      editar(a.token, { compartirTelefono: true }),
      editar(a.token, { telefono: '911111111', compartirTelefono: true }),
      editar(a.token, { compartirTelefono: false }),
      editar(a.token, { nombre: 'Concurrente' }),
    ]);
    for (const r of lote) expect([200, 400]).toContain(r.status);
    const fila = await prisma.usuario.findUniqueOrThrow({ where: { id: a.id } });
    expect(fila.telefonoCompartirConsentidoAt === null || fila.telefono !== null).toBe(true);
    expect(fila.nombre).toBe('Concurrente');
  });

  it('503 sin cambios parciales si falla la escritura', async () => {
    const a = await entrar('a@ejemplo.com', 'Ana');
    // La transaccion revienta al actualizar: se simula quitando la columna que se escribe.
    await prisma.$executeRawUnsafe('ALTER TABLE usuarios RENAME COLUMN telefono TO telefono_x');
    try {
      const r = await editar(a.token, { nombre: 'Cambiado', telefono: '987654321' });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(JSON.stringify(r.body)).not.toMatch(/telefono|select|update/i);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE usuarios RENAME COLUMN telefono_x TO telefono');
    }
    expect((await leer(a.token)).body).toMatchObject({ nombre: 'Ana', telefono: null });
  });

  it('500 generico sin detalles si el almacenamiento revienta de forma inesperada', async () => {
    const a = await entrar('a@ejemplo.com');
    const reventada: CuentasPort = {
      ...base.deps.cuentas,
      obtenerPerfil: () => Promise.reject(new Error('DETALLE-INTERNO telefono 987654321')),
      actualizarPerfil: () => Promise.reject(new Error('DETALLE-INTERNO telefono 987654321')),
      buscarPorId: base.deps.cuentas.buscarPorId.bind(base.deps.cuentas),
    };
    const conFallo = crearArnes({ prisma, sobrescribir: { cuentas: reventada } });
    const r = await request(conFallo.app).get(RUTA_PERFIL).set(bearer(a.token));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/DETALLE-INTERNO|987654321/);
  });
});
