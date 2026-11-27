import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { CLAVE, crearArnes, limpiarBd, RUTA_LOGIN, RUTA_REGISTRO, SECRETO_SEGUIMIENTO_PRUEBA } from './arnes';
import { HmacSecretosAdapter } from '../../src/modules/reportes/infraestructura/hmac-secretos.adapter';

/** Permiso de carga de fotos del invitado en el comprobante (P5.2, spec reportes/registro-incidentes). */
const { app, prisma, logger } = crearArnes();
const RUTA = '/api/v1/incidentes';
const secretos = new HmacSecretosAdapter(SECRETO_SEGUIMIENTO_PRUEBA);

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
const deInvitado = () => cuerpo({ telefonoContacto: '987654321' });

function enviar(datos: unknown, opciones: { token?: string; clave?: string } = {}) {
  let r = request(app).post(RUTA).set('Content-Type', 'application/json').set('Idempotency-Key', opciones.clave ?? randomUUID());
  if (opciones.token) r = r.set('Authorization', `Bearer ${opciones.token}`);
  return r.send(JSON.stringify(datos));
}

async function token(): Promise<string> {
  const correo = `c-${randomUUID().slice(0, 8)}@ejemplo.com`;
  await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
  return (await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE })).body.token as string;
}

describe('permiso de carga del invitado', () => {
  it('se emite una vez con vencimiento a 24 h y la BD guarda solo su huella', async () => {
    const r = await enviar(deInvitado());
    expect(r.status).toBe(201);
    const permiso = r.body.permisoEvidencias as { valor: string; venceEn: string };
    expect(permiso.valor).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(permiso.valor).not.toBe(r.body.codigoSeguimiento);
    expect(new Date(permiso.venceEn).getTime() - new Date(r.body.recibidoEn).getTime()).toBe(24 * 60 * 60 * 1000);
    const fila = await prisma.permisoEvidencia.findFirstOrThrow();
    expect(fila.permisoHuella).toBe(secretos.huellaPermisoEvidencias(fila.incidenteId, permiso.valor));
    const tablas = JSON.stringify(await prisma.$queryRawUnsafe('SELECT * FROM permisos_evidencia')) +
      JSON.stringify(await prisma.$queryRawUnsafe('SELECT * FROM envios_incidente'));
    expect(tablas).not.toContain(permiso.valor);
  });

  it('el permiso no aparece en eventos ni logs', async () => {
    const r = await enviar(deInvitado());
    const valor = r.body.permisoEvidencias.valor as string;
    expect(JSON.stringify(await prisma.evento.findMany())).not.toContain(valor);
    expect(logger.texto()).not.toContain(valor);
  });

  it('un reintento idempotente emite uno nuevo que reemplaza al anterior', async () => {
    const clave = randomUUID();
    const mismo = deInvitado();
    const a = await enviar(mismo, { clave });
    const b = await enviar(mismo, { clave });
    expect(b.status).toBe(200);
    expect(b.body.permisoEvidencias.valor).not.toBe(a.body.permisoEvidencias.valor);
    expect(b.body.permisoEvidencias.venceEn).toBe(a.body.permisoEvidencias.venceEn);
    const fila = await prisma.permisoEvidencia.findFirstOrThrow();
    expect(fila.permisoHuella).toBe(secretos.huellaPermisoEvidencias(fila.incidenteId, b.body.permisoEvidencias.valor));
    expect(fila.permisoHuella).not.toBe(secretos.huellaPermisoEvidencias(fila.incidenteId, a.body.permisoEvidencias.valor));
    expect(await prisma.permisoEvidencia.count()).toBe(1);
  });

  it('un reintento pasado el plazo no emite permiso', async () => {
    const clave = randomUUID();
    const mismo = deInvitado();
    await enviar(mismo, { clave });
    await prisma.$executeRawUnsafe(`UPDATE incidentes SET registrado_en = now() - interval '25 hours'`);
    const b = await enviar(mismo, { clave });
    expect(b.status).toBe(200);
    expect(b.body.codigoSeguimiento).toEqual(expect.any(String));
    expect(b.body).not.toHaveProperty('permisoEvidencias');
  });

  it('con cuenta no hay permiso', async () => {
    const r = await enviar(cuerpo(), { token: await token() });
    expect(r.status).toBe(201);
    expect(r.body).not.toHaveProperty('permisoEvidencias');
    expect(await prisma.permisoEvidencia.count()).toBe(0);
  });

  it('el permiso no sirve como codigo de seguimiento', async () => {
    const r = await enviar(deInvitado());
    const v = await request(app).post('/api/v1/publico/seguimiento').send({ referencia: r.body.referencia, codigo: r.body.permisoEvidencias.valor });
    expect(v.status).not.toBe(200);
    expect(JSON.stringify(v.body)).not.toContain('REGISTRADO');
  });

  it('un fallo al guardar el permiso revierte el registro completo', async () => {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS falla_permiso_prueba ON permisos_evidencia');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS falla_permiso_prueba()');
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION falla_permiso_prueba() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo inyectado'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER falla_permiso_prueba BEFORE INSERT ON permisos_evidencia FOR EACH ROW EXECUTE FUNCTION falla_permiso_prueba()',
    );
    try {
      const clave = randomUUID();
      const r = await enviar(deInvitado(), { clave });
      expect(r.status).toBe(503);
      expect(await prisma.incidente.count()).toBe(0);
      expect(await prisma.envioIncidente.count()).toBe(0);
      expect(await prisma.solicitudEnvio.count()).toBe(0);
      expect(await prisma.evento.count()).toBe(0);
      await prisma.$executeRawUnsafe('DROP TRIGGER falla_permiso_prueba ON permisos_evidencia');
      const otra = await enviar(deInvitado(), { clave });
      expect(otra.status).toBe(201);
      expect(otra.body.permisoEvidencias).toBeDefined();
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS falla_permiso_prueba ON permisos_evidencia');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS falla_permiso_prueba()');
    }
  });
});
