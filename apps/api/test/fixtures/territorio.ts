/** Geometrías sintéticas SOLO para pruebas; no representan Ayacucho. */
import { DISTRITOS_PILOTO, type Geometria, type MetadatosTerritoriales, type SnapshotTerritorial } from '../../src/modules/consultas/dominio/territorio';
import { calcularBbox } from '../../src/modules/consultas/dominio/geometria';
import { prepararPaquete, sha256 } from '../../src/modules/consultas/infraestructura/paquete-territorial';

export const cuadrado = (x = 0, y = 0, lado = 2): Geometria => ({ type: 'Polygon', coordinates: [[[x, y], [x + lado, y], [x + lado, y + lado], [x, y + lado], [x, y]]] });
export const metadatosSinteticos: MetadatosTerritoriales = { fuente: 'https://fixtures.invalid/solo-pruebas', publicador: 'FIXTURE SINTÉTICO',
  versionFuente: 'test', actualizadoFuente: '2026-11-25', obtenidoEn: '2026-11-25', sha256Fuente: 'a'.repeat(64),
  sha256GeoPackage: 'b'.repeat(64), sha256Archivo: 'c'.repeat(64), referencia: true, contraste: 'fixture solo pruebas' };
export function snapshotSintetico(geometrias: Geometria[] = [cuadrado()]): SnapshotTerritorial {
  return { version: 'd'.repeat(64), metadatos: metadatosSinteticos,
    limites: geometrias.map((geometry, i) => ({ distrito: { ...DISTRITOS_PILOTO[i]!, ubigeo: null }, geometry, bbox: calcularBbox(geometry) })) };
}
export function paqueteSintetico(desplazamiento = 0, latitud = 0) {
  const codigos = ['050101', '050110', '050104', '050115', '050116'];
  const data = { type: 'FeatureCollection', scope: 'ayacucho-metropolitan', source: metadatosSinteticos.fuente,
    publisher: metadatosSinteticos.publicador, portalVersion: 'test', sourceUpdatedAt: '2026-11-25', downloadedAt: '2026-11-25', referenceOnly: true,
    sourceSha256: 'a'.repeat(64), geopackageSha256: 'b'.repeat(64), features: DISTRITOS_PILOTO.map((d, i) => {
      const geometry = cuadrado(i * 4 + desplazamiento, latitud);
      return { type: 'Feature', properties: { code: codigos[i], name: d.nombre }, geometry, bbox: calcularBbox(geometry) };
    }) };
  const bytes = Buffer.from(JSON.stringify(data));
  const constancia = { sha256Archivo: sha256(bytes), sha256Fuente: data.sourceSha256, sha256GeoPackage: data.geopackageSha256, evidencia: 'fixture sintetico solo tests' };
  return { data, bytes, constancia, preparado: prepararPaquete(bytes, constancia) };
}
