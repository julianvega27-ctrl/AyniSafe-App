import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { PrismaTerritorioAdapter } from '../../src/modules/consultas/infraestructura/prisma-territorio.adapter';
import { crearArnes, limpiarBd } from './arnes';
import { paqueteSintetico } from '../fixtures/territorio';

const { app, prisma } = crearArnes();
const repo = new PrismaTerritorioAdapter(prisma);
const f = paqueteSintetico(), g = paqueteSintetico(1);
const RUTA = '/api/v1/publico/territorio';
beforeEach(() => limpiarBd(prisma));
afterAll(() => prisma.$disconnect());

describe('territorio con PostgreSQL aislado real', () => {
  it('base vacía conserva catálogo y contenido, sin versión activa ni puntos inventados', async () => {
    expect(await prisma.distrito.count()).toBe(5);
    const r = await request(app).get(`${RUTA}/distritos`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'pendiente', version: null });
    expect(r.body.distritos.every((d: {ubigeo: unknown}) => d.ubigeo === null)).toBe(true);
    expect((await request(app).get('/api/v1/publico/contenido')).status).toBe(200);
    expect((await request(app).get(`${RUTA}/limites`)).status).toBe(503);
    expect((await request(app).post(`${RUTA}/resolver`).send({ latitud: 1, longitud: 1 })).status).toBe(503);
  });
  it('carga, repetición concurrente, activación, consulta por ID y restauración conservan versiones', async () => {
    const results = await Promise.all([repo.importar(f.preparado, true), repo.importar(f.preparado, true)]);
    expect(results.map(x => x.existente).sort()).toEqual([false, true]);
    expect(await prisma.versionTerritorial.count()).toBe(1);
    expect(await prisma.geometriaDistrital.count()).toBe(5);
    const previo = await repo.leer();
    expect(previo?.version).toBe(f.preparado.snapshot.version);
    await repo.importar(g.preparado, true);
    expect((await repo.leer())?.version).toBe(g.preparado.snapshot.version);
    expect(await repo.leer(f.preparado.snapshot.version)).toEqual(previo);
    await repo.activar(f.preparado.snapshot.version);
    expect(await repo.leer()).toEqual(previo);
    await expect(repo.activar('e'.repeat(64))).rejects.toThrow('TERRITORY_VERSION_NOT_FOUND');
    expect(await prisma.versionTerritorial.count()).toBe(2);
    expect((await request(app).post(`${RUTA}/resolver`).send({ latitud: 1, longitud: 1 })).body).toMatchObject({ estado: 'resuelto', distrito: { id: 'DIS-01' }, version: previo!.version });
    expect(await prisma.usuario.count()).toBe(0);
    expect(await prisma.sesion.count()).toBe(0);
  });
  it('un fallo real antes de commit revierte versión y geometrías sin cambiar la activa', async () => {
    await repo.importar(f.preparado, true);
    // Trigger temporal solo en BD aislada: falla DESPUÉS de insertar las cinco geometrías.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fallo_activar_p3() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo de prueba'; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER fallo_p3 BEFORE UPDATE ON estado_territorial FOR EACH ROW EXECUTE FUNCTION fallo_activar_p3()');
    try { await expect(repo.importar(g.preparado, true)).rejects.toThrow(); }
    finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fallo_p3 ON estado_territorial');
      await prisma.$executeRawUnsafe('DROP FUNCTION fallo_activar_p3()');
    }
    expect(await prisma.versionTerritorial.count()).toBe(1);
    expect(await prisma.geometriaDistrital.count()).toBe(5);
    expect((await repo.leer())?.version).toBe(f.preparado.snapshot.version);
  });
  it('lecturas concurrentes con activaciones devuelven snapshots completos', async () => {
    await repo.importar(f.preparado, true); await repo.importar(g.preparado);
    const muestras = await Promise.all(Array.from({ length: 12 }, async (_, i) => {
      await repo.activar(i % 2 ? f.preparado.snapshot.version : g.preparado.snapshot.version);
      return repo.leer();
    }));
    for (const s of muestras) {
      expect(s?.limites).toHaveLength(5);
      const esperado = s!.version === f.preparado.snapshot.version ? f : g;
      expect(s!.limites).toEqual(esperado.preparado.snapshot.limites);
    }
  });
  it('FK, unicidad, completitud, bbox e inmutabilidad se exigen en BD', async () => {
    await repo.importar(f.preparado, true);
    await expect(prisma.distrito.create({ data: { id: 'DIS-06', nombre: 'Inventado' } })).rejects.toThrow();
    await expect(prisma.versionTerritorial.create({ data: { id: 'e'.repeat(64), metadatos: {} } })).rejects.toThrow();
    await expect(prisma.geometriaDistrital.create({ data: { versionId: 'e'.repeat(64), distritoId: 'DIS-01', ubigeo: '050101', geometria: {}, bbox: [0, 0, 1, 1] } })).rejects.toThrow();
    const geo = f.preparado.snapshot.limites[0]!;
    await expect(prisma.geometriaDistrital.create({ data: { versionId: f.preparado.snapshot.version, distritoId: geo.distrito.id,
      ubigeo: geo.distrito.ubigeo!, geometria: {}, bbox: [0, 0, 0, 0] } })).rejects.toThrow();
    await expect(prisma.versionTerritorial.update({ where: { id: f.preparado.snapshot.version }, data: { metadatos: {} } })).rejects.toThrow();
    await expect(prisma.geometriaDistrital.deleteMany({ where: { versionId: f.preparado.snapshot.version } })).rejects.toThrow();
    await expect(repo.importar({ ...f.preparado, contrastado: false })).rejects.toThrow('VALIDATION_ERROR');
    const cambiado = { ...f.preparado, snapshot: { ...g.preparado.snapshot, version: f.preparado.snapshot.version } };
    await expect(repo.importar(cambiado)).rejects.toThrow('VALIDATION_ERROR');
  });
  it('restricciones de geometría y bbox rechazan una versión que sería completa', async () => {
    await repo.importar(f.preparado, true);
    for (const caso of ['bbox', 'geometria'] as const) {
      await expect(prisma.$transaction(async tx => {
        const id = (caso === 'bbox' ? 'a' : 'b').repeat(64);
        await tx.versionTerritorial.create({ data: { id, metadatos: {} } });
        // Copia cinco filas válidas excepto un atributo: sin el CHECK este commit pasaría.
        if (caso === 'bbox') await tx.$executeRaw`
          INSERT INTO geometrias_distritales(version_id,distrito_id,ubigeo,geometria,bbox)
          SELECT ${id},distrito_id,ubigeo,geometria,CASE WHEN distrito_id='DIS-01' THEN ARRAY[0,0,0,0]::float8[] ELSE bbox END
          FROM geometrias_distritales WHERE version_id=${f.preparado.snapshot.version}`;
        else await tx.$executeRaw`
          INSERT INTO geometrias_distritales(version_id,distrito_id,ubigeo,geometria,bbox)
          SELECT ${id},distrito_id,ubigeo,CASE WHEN distrito_id='DIS-01' THEN '{}'::jsonb ELSE geometria END,bbox
          FROM geometrias_distritales WHERE version_id=${f.preparado.snapshot.version}`;
      })).rejects.toThrow();
    }
    expect(await prisma.versionTerritorial.count()).toBe(1);
  });
  it('repetición y snapshot conservan decimales geográficos de bbox derivados de JSONB', async () => {
    const decimal = paqueteSintetico(-74.21119698399997, -13.205488947999982);
    await repo.importar(decimal.preparado, true);
    expect(await repo.leer()).toEqual(decimal.preparado.snapshot);
    expect((await repo.importar(decimal.preparado, true)).existente).toBe(true);
    expect(await prisma.versionTerritorial.count()).toBe(1);
  });
});
