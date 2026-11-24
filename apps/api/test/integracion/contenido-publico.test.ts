import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { CLAVE, crearArnes, limpiarBd, RUTA_LOGIN, RUTA_REGISTRO } from './arnes';

const { app, prisma } = crearArnes();
const RUTA = '/api/v1/publico/contenido';

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

describe('GET /publico/contenido', () => {
  it('200 sin sesion con version, fecha y todas las secciones, incluido el alcance del piloto', async () => {
    const r = await request(app).get(RUTA);
    expect(r.status).toBe(200);
    expect(r.body.version).toBeGreaterThanOrEqual(1);
    expect(r.body.actualizadoAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const seccion of ['app', 'piloto', 'desarrolladores', 'privacidad', 'contactos']) {
      expect(r.body[seccion]).toBeDefined();
      expect(['aprobado', 'pendiente']).toContain(r.body[seccion].estado);
    }
    expect(r.body.desarrolladores.personas[0].nombre).toBe('Julián Anthony Vega Salvatierra');
  });

  it('el alcance del piloto esta pendiente y sin texto, y la version es posterior a la primera', async () => {
    const r = await request(app).get(RUTA);
    expect(r.body.piloto).toEqual({ estado: 'pendiente' });
    expect(r.body.version).toBeGreaterThanOrEqual(2);
  });

  it('contactos sin aprobar: lista vacia y ningun numero inventado', async () => {
    const r = await request(app).get(RUTA);
    expect(r.body.contactos).toEqual({ estado: 'pendiente', items: [] });
    expect(JSON.stringify(r.body)).not.toMatch(/\b\d{3}\b/);
  });

  it('es identico con y sin sesion y no contiene datos de cuentas', async () => {
    await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa Privada', correo: 'rosa@ejemplo.com', contrasena: CLAVE });
    const login = await request(app).post(RUTA_LOGIN).send({ correo: 'rosa@ejemplo.com', contrasena: CLAVE });
    const anonimo = await request(app).get(RUTA);
    const conSesion = await request(app).get(RUTA).set('Authorization', `Bearer ${login.body.token}`);
    expect(conSesion.body).toEqual(anonimo.body);
    const texto = JSON.stringify(anonimo.body);
    expect(texto).not.toMatch(/rosa@ejemplo|Rosa Privada|hash|token/i);
  });

  it('permite cache publica breve (no no-store) y no se mezcla con el cache de autenticacion', async () => {
    const r = await request(app).get(RUTA);
    expect(r.headers['cache-control']).toBe('public, max-age=300');
    const perfil = await request(app).get('/api/v1/perfil');
    expect(perfil.headers['cache-control']).toBe('no-store');
  });

  it('solo admite lectura: otros metodos responden 405', async () => {
    for (const metodo of ['post', 'put', 'patch', 'delete'] as const) {
      const r = await request(app)[metodo](RUTA);
      expect(r.status, metodo).toBe(405);
      expect(r.headers.allow).toContain('GET');
    }
  });
});
