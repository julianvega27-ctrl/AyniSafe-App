import { DISTRITOS_PILOTO, ErrorTerritorial, validarPunto, validarVersion, type ResultadoTerritorial, type SnapshotTerritorial } from '../dominio/territorio';
import { resolverPunto } from '../dominio/geometria';

export interface TerritorioRepositorio {
  /** Sin ID devuelve la activa; null significa que no existe. Cada lectura es un snapshot completo. */
  leer(version?: string): Promise<SnapshotTerritorial | null>;
}
export class ConsultarTerritorio {
  constructor(private readonly repositorio: TerritorioRepositorio) {}
  async snapshot(version?: unknown): Promise<SnapshotTerritorial> {
    const id = validarVersion(version);
    let snapshot: SnapshotTerritorial | null;
    try { snapshot = await this.repositorio.leer(id); }
    catch { throw new ErrorTerritorial('TERRITORY_UNAVAILABLE'); }
    if (!snapshot) throw new ErrorTerritorial(id ? 'TERRITORY_VERSION_NOT_FOUND' : 'TERRITORY_UNAVAILABLE');
    return snapshot;
  }
  async catalogo() {
    let snapshot: SnapshotTerritorial | null;
    try { snapshot = await this.repositorio.leer(); }
    catch { throw new ErrorTerritorial('TERRITORY_UNAVAILABLE'); }
    return { estado: snapshot ? 'disponible' as const : 'pendiente' as const, version: snapshot?.version ?? null,
      distritos: DISTRITOS_PILOTO.map(d => ({ ...d, ubigeo: snapshot?.limites.find(l => l.distrito.id === d.id)?.distrito.ubigeo ?? null })) };
  }
  async limites(version?: unknown) {
    const s = await this.snapshot(version);
    return { type: 'FeatureCollection' as const, version: s.version, metadatos: s.metadatos,
      features: s.limites.map(l => ({ type: 'Feature' as const, properties: l.distrito, geometry: l.geometry, bbox: l.bbox })) };
  }
  async resolver(entrada: unknown) {
    const punto = validarPunto(entrada);
    return resolverPunto(punto, await this.snapshot(punto.version));
  }
  /**
   * Resolucion para el registro de incidentes (P4.1) con la version activa. Devuelve null si no hay
   * cartografia activa, para registrar con distrito pendiente; un fallo de lectura se propaga (503)
   * en lugar de confundirse con la ausencia de cartografia.
   */
  async resolverParaRegistro(latitud: number, longitud: number): Promise<ResultadoTerritorial | null> {
    const punto = validarPunto({ latitud, longitud });
    const snapshot = await this.repositorio.leer();
    return snapshot ? resolverPunto(punto, snapshot) : null;
  }
}
