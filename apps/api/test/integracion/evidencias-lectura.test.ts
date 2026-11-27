import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { CLAVE, crearArnes, crearCuentaDePrueba, limpiarBd, RUTA_LOGIN, RUTA_REGISTRO } from './arnes';
import { activarTerritorio, cookieInstitucional, crearSedeDePrueba, PUNTO_DIS01 } from './fixtures-enrutamiento';
import { jpegRuido } from '../fixtures/imagenes';

/** Lectura autorizada de fotos (P5.2, spec consultas/acceso-evidencias, EQ-04), con el doble en memoria. */
const { app, prisma, procesador, logger, almacenEvidencias } = crearArnes({ enrutar: true });

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
  await activarTerritorio(prisma);
});

async function ciudadano(): Promise<string> {
  const correo = `c-${randomUUID().slice(0, 8)}@ejemplo.com`;
  await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
  return (await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE })).body.token as string;
}

const subir = (referencia: string, cred: { token?: string; permiso?: string }, archivo: Buffer) => {
  let r = request(app).post(`/api/v1/incidentes/${referencia}/evidencias`).set('Idempotency-Key', randomUUID());
  if (cred.token) r = r.set('Authorization', `Bearer ${cred.token}`);
  if (cred.permiso) r = r.set('X-Permiso-Evidencias', cred.permiso);
  return r.attach('foto', archivo, { filename: 'foto.jpg', contentType: 'image/jpeg' });
};

/** Accidente con heridos de un autor con cuenta: SAMU principal y PNP simultanea; Bomberos no participa. */
async function escenario() {
  const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
  const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
  const bomberos = await crearSedeDePrueba(prisma, { institucion: 'bomberos', categorias: ['incendio'] });
  const token = await ciudadano();
  const r = await request(app)
    .post('/api/v1/incidentes')
    .set('Idempotency-Key', randomUUID())
    .set('Authorization', `Bearer ${token}`)
    .send({
      categoriaId: 'accidente-transito',
      descripcion: 'Choque en la avenida principal',
      ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
      punto: PUNTO_DIS01,
      heridos: 'si',
    });
  expect(r.status).toBe(201);
  await procesador.esperarReposo();
  await procesador.procesarPendientes();
  const inc = await prisma.incidente.findUniqueOrThrow({ where: { referencia: r.body.referencia } });
  const fotos: { id: string; bytes: Buffer }[] = [];
  for (let i = 0; i < 2; i++) {
    const archivo = await jpegRuido(32 + i, 32, 80, 40 + i);
    const s = await subir(inc.referencia, { token }, archivo);
    expect(s.status).toBe(201);
    const fila = await prisma.evidenciaIncidente.findUniqueOrThrow({ where: { id: s.body.id } });
    fotos.push({ id: s.body.id, bytes: await almacenEvidencias.obtener(fila.publicId) });
  }
  return {
    inc,
    token,
    fotos,
    cookieSamu: await cookieInstitucional(app, samu.operadores[0]!.correo),
    cookiePnp: await cookieInstitucional(app, pnp.operadores[0]!.correo),
    cookieBomberos: await cookieInstitucional(app, bomberos.operadores[0]!.correo),
  };
}

const contenidoOperador = (id: string, evidencia: string, cookie: string) =>
  request(app).get(`/api/v1/operador/incidentes/${id}/evidencias/${evidencia}/contenido`).set('Cookie', cookie).buffer(true);
const contenidoAutor = (referencia: string, evidencia: string, token: string) =>
  request(app).get(`/api/v1/ciudadano/incidentes/${referencia}/evidencias/${evidencia}/contenido`).set('Authorization', `Bearer ${token}`).buffer(true);

describe('operadores participantes (9.1)', () => {
  it('PNP de apoyo y SAMU principal obtienen el contenido con las cabeceras de entrega', async () => {
    const e = await escenario();
    for (const cookie of [e.cookiePnp, e.cookieSamu]) {
      const r = await contenidoOperador(e.inc.id, e.fotos[0]!.id, cookie);
      expect(r.status).toBe(200);
      expect(Buffer.from(r.body as Buffer).equals(e.fotos[0]!.bytes)).toBe(true);
      expect(r.headers['content-type']).toBe('image/jpeg');
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['content-disposition']).toBe('inline');
      expect(r.headers['content-security-policy']).toContain('sandbox');
      expect(JSON.stringify(r.headers)).not.toMatch(/aynisafe\/|cloudinary|https?:\/\//);
    }
    expect(await prisma.accesoEvidencia.count({ where: { evidenciaId: e.fotos[0]!.id, rol: 'operador' } })).toBe(2);
  });

  it('el resumen lista solo las disponibles, sin URL ni public_id', async () => {
    const e = await escenario();
    await prisma.evidenciaIncidente.update({
      where: { id: e.fotos[1]!.id },
      data: { estado: 'eliminacion_pendiente', motivoEliminacion: 'plazo' },
    });
    const r = await request(app).get(`/api/v1/operador/incidentes/${e.inc.id}`).set('Cookie', e.cookiePnp);
    expect(r.status).toBe(200);
    expect(r.body.evidencias).toEqual([{ id: e.fotos[0]!.id, tipo: 'image/jpeg', bytes: expect.any(Number), adjuntadaEn: expect.any(String) }]);
    expect(JSON.stringify(r.body)).not.toMatch(/aynisafe\/|cloudinary|https?:\/\//);
    expect((await contenidoOperador(e.inc.id, e.fotos[1]!.id, e.cookiePnp)).status).toBe(404);
  });

  it('no participante, evidencia de otro incidente, id malformado y pendiente dan el mismo 404', async () => {
    const e = await escenario();
    const otro = await escenario();
    await prisma.evidenciaIncidente.update({ where: { id: e.fotos[1]!.id }, data: { estado: 'pendiente', confirmadaEn: null } });
    const respuestas = [
      await contenidoOperador(e.inc.id, e.fotos[0]!.id, e.cookieBomberos),
      await contenidoOperador(e.inc.id, otro.fotos[0]!.id, e.cookiePnp),
      await contenidoOperador(e.inc.id, 'no-es-uuid', e.cookiePnp),
      await contenidoOperador(e.inc.id, randomUUID(), e.cookiePnp),
      await contenidoOperador(e.inc.id, e.fotos[1]!.id, e.cookiePnp),
      await contenidoOperador(randomUUID(), e.fotos[0]!.id, e.cookiePnp),
    ];
    for (const r of respuestas) {
      expect(r.status).toBe(404);
      expect(r.body.error.message).toBe(respuestas[0]!.body.error.message);
    }
    expect(await prisma.accesoEvidencia.count()).toBe(0);
  });

  it('un administrador recibe 403', async () => {
    const e = await escenario();
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const r = await contenidoOperador(e.inc.id, e.fotos[0]!.id, await cookieInstitucional(app, admin.correo));
    expect(r.status).toBe(403);
  });

  it('un fallo del almacen da 503 sin registrar el acceso', async () => {
    const e = await escenario();
    almacenEvidencias.fallarObtener = true;
    try {
      expect((await contenidoOperador(e.inc.id, e.fotos[0]!.id, e.cookiePnp)).status).toBe(503);
    } finally {
      almacenEvidencias.fallarObtener = false;
    }
    expect(await prisma.accesoEvidencia.count()).toBe(0);
  });
});

describe('autor con cuenta (9.1)', () => {
  it('el autor ve sus metadatos y obtiene sus fotos; otro ciudadano recibe 404', async () => {
    const e = await escenario();
    const det = await request(app).get(`/api/v1/ciudadano/incidentes/${e.inc.referencia}`).set('Authorization', `Bearer ${e.token}`);
    expect(det.status).toBe(200);
    expect(det.body.evidencias.map((x: { id: string }) => x.id).sort()).toEqual(e.fotos.map((f) => f.id).sort());
    const r = await contenidoAutor(e.inc.referencia, e.fotos[0]!.id, e.token);
    expect(r.status).toBe(200);
    expect(Buffer.from(r.body as Buffer).equals(e.fotos[0]!.bytes)).toBe(true);
    expect(await prisma.accesoEvidencia.count({ where: { rol: 'ciudadano' } })).toBe(1);
    expect((await contenidoAutor(e.inc.referencia, e.fotos[0]!.id, await ciudadano())).status).toBe(404);
  });

  it('el codigo y el permiso de carga del invitado no dan acceso', async () => {
    await escenario();
    const res = await request(app)
      .post('/api/v1/incidentes')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', randomUUID())
      .send(JSON.stringify({
        categoriaId: 'robo',
        descripcion: 'Me arrebataron el celular en la esquina',
        ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
        punto: PUNTO_DIS01,
        telefonoContacto: '987654321',
      }));
    const permiso = res.body.permisoEvidencias.valor as string;
    const s = await subir(res.body.referencia, { permiso }, await jpegRuido(20, 20, 80, 99));
    expect(s.status).toBe(201);
    const conPermiso = await request(app)
      .get(`/api/v1/ciudadano/incidentes/${res.body.referencia}/evidencias/${s.body.id}/contenido`)
      .set('X-Permiso-Evidencias', permiso);
    expect(conPermiso.status).toBe(401);
    const vista = await request(app).post('/api/v1/publico/seguimiento').send({ referencia: res.body.referencia, codigo: res.body.codigoSeguimiento });
    expect(vista.status).toBe(200);
    expect(vista.body).not.toHaveProperty('evidencias');
    expect(JSON.stringify(vista.body)).not.toContain(s.body.id);
  });
});

describe('exclusiones (9.2, EQ-04)', () => {
  it('bandeja, consulta del invitado, pendientes del administrador, eventos y logs no contienen fotos ni referencias', async () => {
    const e = await escenario();
    const publicIds = (await prisma.evidenciaIncidente.findMany()).map((f) => f.publicId);
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const cookieAdmin = await cookieInstitucional(app, admin.correo);
    const textos = [
      JSON.stringify((await request(app).get('/api/v1/operador/incidentes').set('Cookie', e.cookiePnp)).body),
      JSON.stringify((await request(app).get('/api/v1/admin/enrutamientos-pendientes').set('Cookie', cookieAdmin)).body),
      JSON.stringify(await prisma.evento.findMany()),
      logger.texto(),
    ];
    for (const t of textos) {
      for (const p of publicIds) expect(t).not.toContain(p);
      expect(t).not.toMatch(/cloudinary|aynisafe\//);
      for (const f of e.fotos) expect(t).not.toContain(f.id);
    }
  });
});
