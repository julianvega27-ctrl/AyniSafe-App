import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { crearPrismaClient } from '../../src/modules/identidad/infraestructura/prisma-cliente';
import { CLAVE, crearArnes, limpiarBd, RUTA_REGISTRO, urlPruebas } from './arnes';

const base = crearArnes();
const { app, prisma } = base;

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  nombre: 'Rosa Quispe',
  correo: 'rosa@ejemplo.com',
  contrasena: CLAVE,
  ...extra,
});

describe('POST /auth/ciudadanos/registro', () => {
  it('201: crea la cuenta sin sesion, sin contrasena y sin hash', async () => {
    const r = await request(app).post(RUTA_REGISTRO).send(cuerpo());
    expect(r.status).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(Object.keys(r.body)).toEqual(['usuario']);
    expect(r.body.usuario).toMatchObject({ nombre: 'Rosa Quispe', correo: 'rosa@ejemplo.com', rol: 'ciudadano' });
    expect(r.body.usuario.id).toMatch(/^[0-9a-f-]{36}$/);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toContain(CLAVE);
    expect(texto).not.toContain('argon2');
    expect(texto.toLowerCase()).not.toContain('token');
    expect(await prisma.sesion.count()).toBe(0);
    const fila = await prisma.usuario.findFirstOrThrow();
    expect(fila.passwordHash).not.toBeNull();
    expect(fila.passwordHash!.startsWith('$argon2id$')).toBe(true);
    expect(fila.passwordHash).not.toContain(CLAVE);
  });

  it('201: no exige DNI, telefono ni verificacion de correo', async () => {
    const r = await request(app).post(RUTA_REGISTRO).send(cuerpo());
    expect(r.status).toBe(201);
  });

  it('400: campos ausentes e invalidos con error por campo y sin crear cuenta', async () => {
    const r = await request(app).post(RUTA_REGISTRO).send({ nombre: '   ', correo: 'no-es-correo', contrasena: 'corta' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(r.body.error.fields).sort()).toEqual(['contrasena', 'correo', 'nombre']);
    expect(r.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(r.body)).not.toContain('corta');
    expect(await prisma.usuario.count()).toBe(0);
  });

  it('400: una solicitud directa aplica las mismas reglas aunque omita la validacion movil', async () => {
    const r = await request(app).post(RUTA_REGISTRO).send({ nombre: 'x'.repeat(101), correo: 'a@b.co', contrasena: 'a'.repeat(129) });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.fields).sort()).toEqual(['contrasena', 'nombre']);
  });

  it('400: rol, institucion u otros campos no admitidos no crean cuenta ni privilegios', async () => {
    for (const extra of [{ rol: 'administrador' }, { institucionId: 'x', sedeId: 'y' }, { estado: 'activo' }]) {
      const r = await request(app).post(RUTA_REGISTRO).send(cuerpo(extra));
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await prisma.usuario.count()).toBe(0);
  });

  it('400: JSON mal formado', async () => {
    const r = await request(app).post(RUTA_REGISTRO).set('Content-Type', 'application/json').send('{"nombre": ');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('409: correo ya registrado, con variaciones de mayusculas y espacios, sin revelar datos', async () => {
    await request(app).post(RUTA_REGISTRO).send(cuerpo({ nombre: 'Primera Cuenta' })).expect(201);
    const r = await request(app).post(RUTA_REGISTRO).send(cuerpo({ nombre: 'Otra', correo: '  ROSA@Ejemplo.COM ' }));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('EMAIL_IN_USE');
    expect(JSON.stringify(r.body)).not.toContain('Primera Cuenta');
    expect(JSON.stringify(r.body)).not.toContain('ciudadano');
    expect(await prisma.usuario.count()).toBe(1);
  });

  it('carrera: dos solicitudes simultaneas con el mismo correo dan un 201, un 409 y una cuenta', async () => {
    const [a, b] = await Promise.all([
      request(app).post(RUTA_REGISTRO).send(cuerpo({ correo: ' Vecina@Ejemplo.com ' })),
      request(app).post(RUTA_REGISTRO).send(cuerpo({ correo: 'vecina@ejemplo.com' })),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prisma.usuario.count()).toBe(1);
  });

  it('503: fallo de almacenamiento sin cuenta parcial ni detalles internos', async () => {
    const sinBd = crearPrismaClient('postgresql://nadie:nada@127.0.0.1:1/inexistente');
    const caido = crearArnes({ prisma: sinBd });
    try {
      const r = await request(caido.app).post(RUTA_REGISTRO).send(cuerpo({ correo: 'caido@ejemplo.com' }));
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(JSON.stringify(r.body)).not.toMatch(/127\.0\.0\.1|prisma|postgres|ECONNREFUSED/i);
    } finally {
      await sinBd.$disconnect();
    }
    expect(await prisma.usuario.count()).toBe(0);
    expect(urlPruebas()).toBeTruthy();
  });
});
