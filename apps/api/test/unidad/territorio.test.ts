import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConsultarTerritorio } from '../../src/modules/consultas/aplicacion/territorio.use-case';
import { validarPunto, validarVersion, type Geometria } from '../../src/modules/consultas/dominio/territorio';
import { calcularBbox, lugarEnGeometria, resolverPunto, validarGeometria } from '../../src/modules/consultas/dominio/geometria';
import { CONTRASTE_INEI, prepararPaquete, sha256 } from '../../src/modules/consultas/infraestructura/paquete-territorial';
import { cuadrado, paqueteSintetico, snapshotSintetico } from '../fixtures/territorio';

describe('territorio: validación de punto y versión', () => {
  it.each([null, [], {}, { latitud: null, longitud: 0 }, { latitud: '0', longitud: 0 }, { latitud: NaN, longitud: 0 },
    { latitud: 0, longitud: Infinity }, { latitud: 91, longitud: 0 }, { latitud: 0, longitud: -181 },
    { latitud: 1, longitud: 1, distrito: 'DIS-01' }, { latitud: 1, longitud: 1, version: [] }])('rechaza entrada inválida %#', valor => {
    expect(() => validarPunto(valor)).toThrow('VALIDATION_ERROR');
  });
  it('admite extremos, cero y versión de snapshot', () => {
    expect(validarPunto({ latitud: -90, longitud: 180 })).toEqual({ latitud: -90, longitud: 180 });
    expect(validarPunto({ latitud: 0, longitud: 0, version: 'a'.repeat(64) }).version).toBe('a'.repeat(64));
    expect(validarVersion(undefined)).toBeUndefined();
    expect(() => validarVersion('otra')).toThrow();
  });
});
describe('geometría pura', () => {
  const hueco: Geometria = { type: 'Polygon', coordinates: [
    [[0, 0], [8, 0], [8, 8], [0, 8], [0, 0]], [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]],
  ] };
  it('valida geometrías, bbox, huecos y componentes separados', () => {
    expect(validarGeometria(hueco)).toEqual(hueco);
    expect(calcularBbox(hueco)).toEqual([0, 0, 8, 8]);
    expect(lugarEnGeometria([3, 3], hueco)).toBe('exterior');
    expect(lugarEnGeometria([2, 3], hueco)).toBe('borde');
    const multi = { type: 'MultiPolygon', coordinates: [(cuadrado() as {coordinates: unknown}).coordinates, (cuadrado(5) as {coordinates: unknown}).coordinates] };
    expect(lugarEnGeometria([6, 1], validarGeometria(multi))).toBe('interior');
  });
  it.each([
    { type: 'Point', coordinates: [0, 0] }, { type: 'MultiPolygon', coordinates: [] },
    { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] },
    { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [2, 0], [0, 0]]] },
    { type: 'Polygon', coordinates: [[[0, 0], [3, 3], [0, 4], [3, 0], [0, 0]]] },
    { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 0], [0, 2], [0, 0]]] },
    { type: 'Polygon', coordinates: [hueco.coordinates[0], [[10, 10], [11, 10], [11, 11], [10, 10]]] },
    { type: 'Polygon', coordinates: [hueco.coordinates[0], [[0, 0], [1, 0], [1, 1], [0, 0]]] },
    { type: 'MultiPolygon', coordinates: [(cuadrado() as {coordinates: unknown}).coordinates, (cuadrado(1) as {coordinates: unknown}).coordinates] },
  ])('rechaza topología inválida %#', g => expect(() => validarGeometria(g)).toThrow('VALIDATION_ERROR'));
  it('clasifica interior, borde, vértice, exterior y tolerancia sin depender del orden', () => {
    const s = snapshotSintetico([cuadrado(), cuadrado(4)]);
    expect(resolverPunto({ latitud: 1, longitud: 1 }, s).distrito?.id).toBe('DIS-01');
    for (const [longitud, latitud] of [[0, 0], [2, 1], [-5e-11, 1], [5e-11, 1]]) {
      expect(resolverPunto({ latitud: latitud!, longitud: longitud! }, s).motivo).toBe('frontera');
    }
    expect(resolverPunto({ latitud: 1, longitud: -2e-10 }, s).motivo).toBe('fuera_area');
    expect(resolverPunto({ latitud: 1, longitud: 2e-10 }, s).estado).toBe('resuelto');
    const superpuesto = snapshotSintetico([cuadrado(), cuadrado(1)]);
    expect(resolverPunto({ latitud: 1, longitud: 1.5 }, superpuesto).motivo).toBe('solapamiento');
    expect(resolverPunto({ latitud: 1, longitud: 1.5 }, { ...superpuesto, limites: [...superpuesto.limites].reverse() }).motivo).toBe('solapamiento');
    expect(resolverPunto({ latitud: 3, longitud: 3 }, snapshotSintetico([hueco])).motivo).toBe('fuera_area');
  });
});
describe('casos de uso y sustitución del repositorio', () => {
  it('catálogo pendiente y errores diferenciados sin fuga del repositorio', async () => {
    const vacio = new ConsultarTerritorio({ leer: async () => null });
    expect((await vacio.catalogo()).distritos).toHaveLength(5);
    expect((await vacio.catalogo()).distritos.every(d => d.ubigeo === null)).toBe(true);
    await expect(vacio.snapshot()).rejects.toThrow('TERRITORY_UNAVAILABLE');
    await expect(vacio.snapshot('a'.repeat(64))).rejects.toThrow('TERRITORY_VERSION_NOT_FOUND');
    const fallo = new ConsultarTerritorio({ leer: async () => { throw new Error('secreto SQL'); } });
    await expect(fallo.catalogo()).rejects.toThrow('TERRITORY_UNAVAILABLE');
    await expect(fallo.snapshot()).rejects.toThrow('TERRITORY_UNAVAILABLE');
  });
  it('el resultado usa el snapshot y el catálogo comparte IDs', async () => {
    const s = snapshotSintetico();
    const servicio = new ConsultarTerritorio({ leer: async id => { expect(id).toBeUndefined(); return s; } });
    expect((await servicio.catalogo()).version).toBe(s.version);
    expect((await servicio.limites()).features[0]?.properties.id).toBe('DIS-01');
    expect(await servicio.resolver({ latitud: 1, longitud: 1 })).toMatchObject({ estado: 'resuelto', version: s.version });
  });
});
describe('paquete y procedencia', () => {
  it('la huella del archivo contrastado y los cinco UBIGEO coinciden', () => {
    const bytes = readFileSync(resolve(__dirname, '../../data/ayacucho-metropolitano.geojson'));
    expect(sha256(bytes)).toBe(CONTRASTE_INEI.sha256Archivo);
    const p = prepararPaquete(bytes, CONTRASTE_INEI);
    expect(p.contrastado).toBe(true);
    expect(p.snapshot.limites.map(l => l.distrito.ubigeo)).toEqual(['050101', '050110', '050104', '050115', '050116']);
    expect(p.snapshot.metadatos.referencia).toBe(true);
  });
  it('digest estable ante orden, espaciado y fecha de descarga, no ante geometría', () => {
    const f = paqueteSintetico();
    const alterado = { ...f.data, downloadedAt: '2026-11-26', features: [...f.data.features].reverse() };
    const p = prepararPaquete(Buffer.from(JSON.stringify(alterado, null, 2)));
    expect(p.contrastado).toBe(false);
    expect(p.snapshot.version).toBe(f.preparado.snapshot.version);
    expect(paqueteSintetico(1).preparado.snapshot.version).not.toBe(p.snapshot.version);
  });
  it('rechaza paquetes incompletos, códigos repetidos, bbox falsa y constancia ajena', () => {
    const f = paqueteSintetico();
    for (const data of [{ ...f.data, features: f.data.features.slice(1) }, { ...f.data, features: Array(5).fill(f.data.features[0]) },
      { ...f.data, features: f.data.features.map((x, i) => i ? x : { ...x, bbox: [0, 0, 0, 0] }) }]) {
      expect(() => prepararPaquete(Buffer.from(JSON.stringify(data)))).toThrow();
    }
    expect(() => prepararPaquete(f.bytes, CONTRASTE_INEI)).toThrow();
    expect(() => prepararPaquete(Buffer.from('{'))).toThrow();
  });
});
