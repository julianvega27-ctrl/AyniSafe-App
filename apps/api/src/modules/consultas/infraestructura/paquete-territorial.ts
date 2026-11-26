import { createHash } from 'node:crypto';
import { DISTRITOS_PILOTO, ErrorTerritorial, objeto, type SnapshotTerritorial, type MetadatosTerritoriales, type LimiteDistrital } from '../dominio/territorio';
import { calcularBbox, poligonos, seSuperponen, validarGeometria } from '../dominio/geometria';

export interface ConstanciaContraste {
  readonly sha256Archivo: string;
  readonly sha256Fuente: string;
  readonly sha256GeoPackage: string;
  readonly evidencia: string;
}
/** Constancia del paquete contrastado; los bytes se verifican antes de preparar el snapshot. */
export const CONTRASTE_INEI: ConstanciaContraste = {
  sha256Archivo: 'd070ef33e3aa6dcb53c4bec8731ddde641195389b6b6750273e29e2e6d16d938',
  sha256Fuente: 'ae22428029000d801b3d68afd0914ba94ca40a789a9b56231f6131a75abb9654',
  sha256GeoPackage: 'b4b6485e4161ce4413bf118f39411071f7627d979a4c271acb35103f1d3e2756',
  evidencia: 'docs/validacion/p3/contraste-inei.json',
};
const CODIGOS: Record<string, string> = { 'DIS-01': '050101', 'DIS-02': '050110', 'DIS-03': '050104', 'DIS-04': '050115', 'DIS-05': '050116' };
export const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const fallo = (): never => { throw new ErrorTerritorial('VALIDATION_ERROR'); };
function texto(o: Record<string, unknown>, clave: string): string {
  const v = o[clave];
  return typeof v === 'string' && v.trim() && v.length < 2048 ? v : fallo();
}
function fecha(o: Record<string, unknown>, clave: string): string {
  const v = texto(o, clave);
  return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(v) && Number.isFinite(Date.parse(v))
    && new Date(v).toISOString().slice(0, 10) === v.slice(0, 10) ? v : fallo();
}
export function calcularVersion(limites: readonly LimiteDistrital[], metadatos: MetadatosTerritoriales): string {
  return sha256(JSON.stringify({ limites, fuente: metadatos.fuente, publicador: metadatos.publicador,
    versionFuente: metadatos.versionFuente, actualizadoFuente: metadatos.actualizadoFuente,
    sha256Fuente: metadatos.sha256Fuente, sha256GeoPackage: metadatos.sha256GeoPackage, referencia: metadatos.referencia }));
}
/** Sin constancia permite simulación estructural; la persistencia exige contraste. */
export function prepararPaquete(bytes: Buffer, constancia?: ConstanciaContraste): { snapshot: SnapshotTerritorial; contrastado: boolean; solapamientos: string[] } {
  if (bytes.length > 5 * 1024 * 1024) return fallo();
  let data: unknown;
  try { data = JSON.parse(bytes.toString('utf8')); } catch { return fallo(); }
  if (!objeto(data) || data.type !== 'FeatureCollection' || data.scope !== 'ayacucho-metropolitan' || !Array.isArray(data.features)
    || data.features.length !== 5 || data.referenceOnly !== true) return fallo();
  const sha256Archivo = sha256(bytes);
  for (const campo of ['sourceSha256', 'geopackageSha256']) if (!/^[a-f0-9]{64}$/.test(texto(data, campo))) return fallo();
  const metadatos = { fuente: texto(data, 'source'), publicador: texto(data, 'publisher'), versionFuente: texto(data, 'portalVersion'),
    actualizadoFuente: fecha(data, 'sourceUpdatedAt'), obtenidoEn: fecha(data, 'downloadedAt'), sha256Fuente: texto(data, 'sourceSha256'),
    sha256GeoPackage: texto(data, 'geopackageSha256'), sha256Archivo, referencia: true,
    contraste: constancia?.evidencia ?? 'pendiente' };
  if (!metadatos.fuente.startsWith('https://')) return fallo();
  const limites = DISTRITOS_PILOTO.map(distrito => {
    const features = (data.features as unknown[]).filter(f => objeto(f) && objeto(f.properties)
      && f.properties.code === CODIGOS[distrito.id] && f.properties.name === distrito.nombre);
    const f = features[0];
    if (features.length !== 1 || !objeto(f)) return fallo();
    const geometry = validarGeometria(f.geometry), bbox = calcularBbox(geometry);
    if (!Array.isArray(f.bbox) || f.bbox.length !== 4 || f.bbox.some((v, i) => v !== bbox[i])) return fallo();
    return { distrito: { ...distrito, ubigeo: CODIGOS[distrito.id]! }, geometry, bbox };
  });
  const contrastado = !!constancia && constancia.sha256Archivo === sha256Archivo
    && constancia.sha256Fuente === metadatos.sha256Fuente && constancia.sha256GeoPackage === metadatos.sha256GeoPackage
    && !!constancia.evidencia.trim();
  if (constancia && !contrastado) return fallo();
  // Orden fijo del catálogo y objetos normalizados. Las fechas/huellas de obtención no cambian la identidad semántica.
  const version = calcularVersion(limites, metadatos);
  const solapamientos: string[] = [];
  for (let i = 0; i < limites.length; i++) for (let j = 0; j < i; j++) {
    if (poligonos(limites[i]!.geometry).some(a => poligonos(limites[j]!.geometry).some(b => seSuperponen(a, b)))) {
      solapamientos.push(`${limites[j]!.distrito.id}/${limites[i]!.distrito.id}`);
    }
  }
  return { snapshot: { version, metadatos, limites }, contrastado, solapamientos };
}
