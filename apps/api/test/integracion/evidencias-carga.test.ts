import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { CLAVE, cookieDe, crearArnes, crearCuentaDePrueba, limpiarBd, ORIGEN_WEB_PRUEBA, RUTA_INST_SESIONES, RUTA_LOGIN, RUTA_REGISTRO } from './arnes';
import { PDF_FALSO, jpegConGps, jpegRuido, png } from '../fixtures/imagenes';

/** Carga de fotos tras el registro (P5.2, EQ-15), con PostgreSQL real y el doble en memoria. */
const base = crearArnes({ limiteCargasInvitado: { maximo: 1000, ventanaMs: 60 * 60 * 1000 } });
const { app, prisma, logger, almacenEvidencias } = base;

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  categoriaId: 'robo',
  descripcion: 'Me arrebataron el celular en la esquina',
  ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
  punto: { latitud: 1, longitud: 1, origen: 'manual' },
  ...extra,
});

async function ciudadano(): Promise<string> {
  const correo = `c-${randomUUID().slice(0, 8)}@ejemplo.com`;
  await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
  return (await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE })).body.token as string;
}

async function registrar(token?: string): Promise<{ referencia: string; permiso?: string }> {
  let r = request(app).post('/api/v1/incidentes').set('Content-Type', 'application/json').set('Idempotency-Key', randomUUID());
  if (token) r = r.set('Authorization', `Bearer ${token}`);
  const res = await r.send(JSON.stringify(token ? cuerpo() : cuerpo({ telefonoContacto: '987654321' })));
  expect(res.status).toBe(201);
  return { referencia: res.body.referencia, permiso: res.body.permisoEvidencias?.valor };
}

interface OpcionesCarga {
  token?: string;
  permiso?: string;
  clave?: string | null;
  archivo?: Buffer;
  tipo?: string;
  nombre?: string;
}
function subir(referencia: string, o: OpcionesCarga = {}) {
  let r = request(app).post(`/api/v1/incidentes/${referencia}/evidencias`);
  if (o.token) r = r.set('Authorization', `Bearer ${o.token}`);
  if (o.permiso) r = r.set('X-Permiso-Evidencias', o.permiso);
  if (o.clave !== null) r = r.set('Idempotency-Key', o.clave ?? randomUUID());
  return r.attach('foto', o.archivo ?? FOTO, { filename: o.nombre ?? 'mi-casa-secreta.jpg', contentType: o.tipo ?? 'image/jpeg' });
}

let FOTO: Buffer;
beforeEach(async () => {
  FOTO ??= await jpegConGps(120, 80);
});

describe('EQ-15: cantidad, tamaño y formato', () => {
  it('admite tres fotos y rechaza la cuarta con 409', async () => {
    const token = await ciudadano();
    const { referencia } = await registrar(token);
    for (let i = 0; i < 3; i++) {
      const r = await subir(referencia, { token, archivo: await jpegRuido(40 + i, 40, 80, i + 1) });
      expect(r.status).toBe(201);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(Object.keys(r.body).sort()).toEqual(['adjuntadaEn', 'bytes', 'id', 'tipo']);
      expect(JSON.stringify(r.body)).not.toMatch(/aynisafe\/|https?:/);
    }
    const cuarta = await subir(referencia, { token, archivo: await png() , tipo: 'image/png' });
    expect(cuarta.status).toBe(409);
    expect(cuarta.body.error.code).toBe('EVIDENCE_LIMIT');
    expect(await prisma.evidenciaIncidente.count({ where: { estado: 'disponible' } })).toBe(3);
    expect(almacenEvidencias.cantidad).toBeGreaterThanOrEqual(3);
  });

  it('dos cargas concurrentes sobre la tercera ranura dejan exactamente tres', async () => {
    const token = await ciudadano();
    const { referencia } = await registrar(token);
    for (let i = 0; i < 2; i++) expect((await subir(referencia, { token, archivo: await jpegRuido(30, 30, 80, 10 + i) })).status).toBe(201);
    const [a, b] = await Promise.all([
      subir(referencia, { token, archivo: await jpegRuido(30, 30, 80, 21) }),
      subir(referencia, { token, archivo: await jpegRuido(30, 30, 80, 22) }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prisma.evidenciaIncidente.count({ where: { estado: { not: 'eliminada' } } })).toBe(3);
  });

  it('mas de 5 MB da 413 sin almacenar nada', async () => {
    const token = await ciudadano();
    const { referencia } = await registrar(token);
    const antes = almacenEvidencias.cantidad;
    const r = await subir(referencia, { token, archivo: Buffer.alloc(5 * 1024 * 1024 + 1, 1) });
    expect(r.status).toBe(413);
    expect(almacenEvidencias.cantidad).toBe(antes);
    expect(await prisma.evidenciaIncidente.count()).toBe(0);
  });

  it('un PDF renombrado da 422 sin almacenar nada', async () => {
    const token = await ciudadano();
    const { referencia } = await registrar(token);
    const r = await subir(referencia, { token, archivo: PDF_FALSO, nombre: 'foto.jpg' });
    expect(r.status).toBe(422);
    expect(await prisma.evidenciaIncidente.count()).toBe(0);
  });

  it('JSON da 415; sin archivo da 400', async () => {
    const token = await ciudadano();
    const { referencia } = await registrar(token);
    const json = await request(app)
      .post(`/api/v1/incidentes/${referencia}/evidencias`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ foto: 'x' });
    expect(json.status).toBe(415);
    const vacio = await request(app)
      .post(`/api/v1/incidentes/${referencia}/evidencias`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .field('otro', 'x');
    expect(vacio.status).toBe(400);
  });

  it('la copia almacenada no tiene EXIF', async () => {
    const token = await ciudadano();
    const { referencia } = await registrar(token);
    await subir(referencia, { token });
    const fila = await prisma.evidenciaIncidente.findFirstOrThrow();
    const guardado = await almacenEvidencias.obtener(fila.publicId);
    expect(guardado.toString('latin1')).not.toContain('AyniSafePrueba');
  });
});

describe('idempotencia por foto', () => {
  it('misma clave y archivo: 200 con la misma evidencia; otro archivo: 409; sin clave: 400', async () => {
    const token = await ciudadano();
    const { referencia } = await registrar(token);
    const clave = randomUUID();
    const a = await subir(referencia, { token, clave });
    const b = await subir(referencia, { token, clave });
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.body.id).toBe(a.body.id);
    expect((await subir(referencia, { token, clave, archivo: await png(), tipo: 'image/png' })).status).toBe(409);
    expect((await subir(referencia, { token, clave: null })).status).toBe(400);
    expect(await prisma.evidenciaIncidente.count()).toBe(1);
  });
});

describe('autorizacion', () => {
  it('invitado con su permiso sube; otro permiso, vencido o reemplazado da el mismo 404', async () => {
    const inv = await registrar();
    const otro = await registrar();
    expect((await subir(inv.referencia, { permiso: inv.permiso! })).status).toBe(201);
    const ajeno = await subir(inv.referencia, { permiso: otro.permiso! });
    expect(ajeno.status).toBe(404);
    const inexistente = await subir('INC-AAAAA-AAAAA', { permiso: inv.permiso! });
    expect(inexistente.status).toBe(404);
    expect(ajeno.body.error.message).toBe(inexistente.body.error.message);
    await prisma.$executeRawUnsafe(`UPDATE permisos_evidencia SET vence_en = now() - interval '1 second', emitido_en = now() - interval '2 seconds'`);
    expect((await subir(inv.referencia, { permiso: inv.permiso! })).status).toBe(404);
  });

  it('un autor ajeno y un incidente fuera de plazo dan 404; una cookie institucional da 403', async () => {
    const token = await ciudadano();
    const otro = await ciudadano();
    const { referencia } = await registrar(token);
    expect((await subir(referencia, { token: otro })).status).toBe(404);
    await prisma.$executeRawUnsafe(`UPDATE incidentes SET registrado_en = now() - interval '25 hours'`);
    expect((await subir(referencia, { token })).status).toBe(404);
    expect(await prisma.evidenciaIncidente.count()).toBe(0);
    const cuenta = await crearCuentaDePrueba(prisma, { rol: 'operador' });
    const login = await request(app).post(RUTA_INST_SESIONES).set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: cuenta.correo, contrasena: CLAVE });
    const inst = await request(app)
      .post(`/api/v1/incidentes/${referencia}/evidencias`)
      .set('Cookie', `__Host-ayni_inst=${cookieDe(login) as string}`)
      .set('Idempotency-Key', randomUUID())
      .attach('foto', FOTO, { filename: 'f.jpg', contentType: 'image/jpeg' });
    expect(inst.status).toBe(403);
  });

  it('un permiso reemplazado por un reintento del registro deja de servir', async () => {
    const clave = randomUUID();
    const datos = JSON.stringify(cuerpo({ telefonoContacto: '987654321' }));
    const enviar = () => request(app).post('/api/v1/incidentes').set('Content-Type', 'application/json').set('Idempotency-Key', clave).send(datos);
    const a = await enviar();
    const b = await enviar();
    expect((await subir(a.body.referencia, { permiso: a.body.permisoEvidencias.valor })).status).toBe(404);
    expect((await subir(b.body.referencia, { permiso: b.body.permisoEvidencias.valor })).status).toBe(201);
  });

  it('sin credenciales da 401', async () => {
    const { referencia } = await registrar(await ciudadano());
    expect((await subir(referencia)).status).toBe(401);
  });
});

describe('fallos y privacidad', () => {
  it('el proveedor caido da 503 y el incidente sigue registrado', async () => {
    const token = await ciudadano();
    const { referencia } = await registrar(token);
    almacenEvidencias.fallarSubida = 'despues';
    try {
      const r = await subir(referencia, { token });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('EVIDENCE_STORAGE_UNAVAILABLE');
    } finally {
      almacenEvidencias.fallarSubida = 'no';
    }
    expect(await prisma.incidente.count()).toBe(1);
    const fila = await prisma.evidenciaIncidente.findFirstOrThrow();
    expect(fila.estado).toBe('eliminacion_pendiente');
    expect(fila.motivoEliminacion).toBe('fallo_carga');
  });

  it('los logs no contienen permiso, nombre de archivo ni EXIF', async () => {
    const inv = await registrar();
    await subir(inv.referencia, { permiso: inv.permiso! });
    await subir(inv.referencia, { permiso: inv.permiso!, archivo: PDF_FALSO });
    const texto = logger.texto();
    expect(texto).not.toContain(inv.permiso!);
    expect(texto).not.toContain('mi-casa-secreta');
    expect(texto).not.toContain('AyniSafePrueba');
    expect(texto).not.toContain('aynisafe/');
  });
});

describe('limite de cargas de invitado', () => {
  const estricto = crearArnes({ prisma, limiteCargasInvitado: { maximo: 1, ventanaMs: 60 * 60 * 1000 } });
  it('al superar el limite responde 429 con Retry-After sin almacenar', async () => {
    const res = await request(estricto.app)
      .post('/api/v1/incidentes')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', randomUUID())
      .send(JSON.stringify(cuerpo({ telefonoContacto: '987654321' })));
    const enviar = () =>
      request(estricto.app)
        .post(`/api/v1/incidentes/${res.body.referencia}/evidencias`)
        .set('X-Permiso-Evidencias', res.body.permisoEvidencias.valor)
        .set('Idempotency-Key', randomUUID())
        .attach('foto', FOTO, { filename: 'f.jpg', contentType: 'image/jpeg' });
    expect((await enviar()).status).toBe(201);
    const segunda = await enviar();
    expect(segunda.status).toBe(429);
    expect(Number(segunda.headers['retry-after'])).toBeGreaterThan(0);
    expect(await prisma.evidenciaIncidente.count()).toBe(1);
  });
});
