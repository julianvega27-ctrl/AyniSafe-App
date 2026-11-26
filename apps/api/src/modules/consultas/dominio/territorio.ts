export const DISTRITOS_PILOTO = [
  { id: 'DIS-01', nombre: 'Ayacucho' },
  { id: 'DIS-02', nombre: 'San Juan Bautista' },
  { id: 'DIS-03', nombre: 'Carmen Alto' },
  { id: 'DIS-04', nombre: 'Jesús Nazareno' },
  { id: 'DIS-05', nombre: 'Andrés Avelino Cáceres Dorregaray' },
] as const;

export class ErrorTerritorial extends Error {
  constructor(readonly codigo: 'VALIDATION_ERROR' | 'TERRITORY_UNAVAILABLE' | 'TERRITORY_VERSION_NOT_FOUND') {
    super(codigo);
  }
}
export type Posicion = readonly [number, number];
export type Anillo = readonly Posicion[];
export type Poligono = readonly Anillo[];
export type Geometria =
  | { readonly type: 'Polygon'; readonly coordinates: Poligono }
  | { readonly type: 'MultiPolygon'; readonly coordinates: readonly Poligono[] };
export type Bbox = readonly [number, number, number, number];
export interface Distrito { readonly id: string; readonly nombre: string; readonly ubigeo: string | null }
export interface LimiteDistrital {
  readonly distrito: Distrito;
  readonly geometry: Geometria;
  readonly bbox: Bbox;
}
export interface MetadatosTerritoriales {
  readonly fuente: string;
  readonly publicador: string;
  readonly versionFuente: string;
  readonly actualizadoFuente: string;
  readonly obtenidoEn: string;
  readonly sha256Fuente: string;
  readonly sha256GeoPackage: string;
  readonly sha256Archivo: string;
  readonly referencia: boolean;
  readonly contraste: string;
}
export interface SnapshotTerritorial {
  readonly version: string;
  readonly metadatos: MetadatosTerritoriales;
  readonly limites: readonly LimiteDistrital[];
}
export interface SolicitudPunto { readonly latitud: number; readonly longitud: number; readonly version?: string }
export type ResultadoTerritorial =
  | { readonly estado: 'resuelto'; readonly distrito: Distrito; readonly motivo: null; readonly version: string }
  | { readonly estado: 'pendiente'; readonly distrito: null; readonly motivo: 'frontera' | 'solapamiento' | 'fuera_area'; readonly version: string };

export function objeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}
export function validarVersion(valor: unknown): string | undefined {
  if (valor === undefined) return undefined;
  if (typeof valor !== 'string' || !/^[a-f0-9]{64}$/.test(valor)) throw new ErrorTerritorial('VALIDATION_ERROR');
  return valor;
}
export function validarPunto(valor: unknown): SolicitudPunto {
  if (!objeto(valor) || Object.keys(valor).some(k => !['latitud', 'longitud', 'version'].includes(k))) {
    throw new ErrorTerritorial('VALIDATION_ERROR');
  }
  const { latitud, longitud } = valor;
  if (typeof latitud !== 'number' || typeof longitud !== 'number' || !Number.isFinite(latitud) || !Number.isFinite(longitud)
    || latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) throw new ErrorTerritorial('VALIDATION_ERROR');
  const version = validarVersion(valor.version);
  return { latitud, longitud, ...(version ? { version } : {}) };
}
