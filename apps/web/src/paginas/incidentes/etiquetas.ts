import type { EstadoIncidente, Faltante, PapelInstitucion, RespuestaCiudadano, TerritorioVista, TipoInstitucion } from '../../api/cliente';

/** Textos de negocio de AyniSafe para la bandeja y los pendientes (P4.2). Sin valores inventados. */

export const INSTITUCION: Record<TipoInstitucion, string> = {
  pnp: 'PNP',
  bomberos: 'Bomberos',
  samu: 'SAMU',
  serenazgo: 'Serenazgo',
};

export const PAPEL: Record<PapelInstitucion, string> = {
  principal: 'Principal',
  simultanea: 'Simultánea',
  condicionada: 'Condicionada',
};

export const ESTADO: Record<EstadoIncidente, string> = {
  REGISTRADO: 'Registrado',
  EN_REVISION: 'En revisión',
  EN_ATENCION: 'En atención',
  CERRADO: 'Cerrado',
};

export const MOTIVO_FALTANTE: Record<Faltante['motivo'], string> = {
  sin_distrito: 'sin distrito resuelto',
  sin_sede_elegible: 'sin sede habilitada con cobertura y competencia',
};

const MOTIVO_TERRITORIAL: Record<string, string> = {
  frontera: 'Punto en el límite entre distritos',
  solapamiento: 'Punto en una zona de solapamiento',
  fuera_area: 'Fuera del área del piloto',
  sin_cartografia: 'Sin cartografía activa al registrar',
  sin_distrito: 'Sin distrito resuelto',
};

export function textoTerritorio(t: TerritorioVista): string {
  if (t.estado === 'resuelto') return t.distrito.nombre ?? t.distrito.id;
  return `Pendiente: ${MOTIVO_TERRITORIAL[t.motivo] ?? 'sin distrito resuelto'}`;
}

const RESPUESTA: Record<Exclude<RespuestaCiudadano, null>, string> = { si: 'Sí', no: 'No', no_se: 'No sabe' };
export const textoRespuesta = (r: RespuestaCiudadano): string => (r === null ? 'Sin respuesta' : RESPUESTA[r]);

const FORMATO_FECHA = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' });
export const fecha = (iso: string): string => FORMATO_FECHA.format(new Date(iso));

export const REQUISITO_DESIGNACION: Record<string, string> = {
  sede_existente: 'La sede ya no existe.',
  misma_institucion: 'La sede debe pertenecer a la institución que falta.',
  institucion_activa: 'La institución debe estar activa.',
  sede_activa: 'La sede debe estar activa.',
  sede_habilitada: 'La sede debe estar habilitada para atención.',
  operador_activo: 'La sede necesita al menos un operador activo.',
};
