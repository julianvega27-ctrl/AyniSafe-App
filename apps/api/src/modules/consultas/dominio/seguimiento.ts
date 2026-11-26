import { DISTRITOS_PILOTO } from './territorio';

/**
 * Seguimiento ciudadano (P4.1): proyecciones autorizadas del incidente para su autor con cuenta y para
 * el invitado con codigo. Reglas puras. Las vistas se construyen con listas cerradas de campos: nunca
 * telefono, coordenadas, huellas, notas internas ni identidad de operadores.
 */
export type TerritorioSeguimiento =
  | { readonly estado: 'resuelto'; readonly distritoId: string }
  | { readonly estado: 'pendiente'; readonly motivo: string };

export interface CategoriaVista {
  readonly id: string;
  readonly nombre: string | null;
}

/** Mientras no exista enrutamiento (P4.2) ni actuaciones (P6), se informan como pendientes. */
export const INSTITUCION_PENDIENTE = { estado: 'pendiente' } as const;

export const PAGINA_HISTORIAL = 20;

export function territorioVista(t: TerritorioSeguimiento) {
  if (t.estado === 'resuelto') {
    const nombre = DISTRITOS_PILOTO.find((d) => d.id === t.distritoId)?.nombre ?? null;
    return { estado: 'resuelto' as const, distrito: { id: t.distritoId, nombre } };
  }
  return { estado: 'pendiente' as const, motivo: t.motivo };
}

export interface CursorSeguimiento {
  readonly recibidoEn: Date;
  readonly incidenteId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Cursor opaco (base64url de [instante ISO, id]). */
export function codificarCursor(c: CursorSeguimiento): string {
  return Buffer.from(JSON.stringify([c.recibidoEn.toISOString(), c.incidenteId]), 'utf8').toString('base64url');
}

/** Null si el cursor no es valido (el llamador responde 400). */
export function decodificarCursor(texto: unknown): CursorSeguimiento | null {
  if (typeof texto !== 'string' || texto.length > 200 || !/^[A-Za-z0-9_-]+$/.test(texto)) return null;
  try {
    const valor: unknown = JSON.parse(Buffer.from(texto, 'base64url').toString('utf8'));
    if (!Array.isArray(valor) || valor.length !== 2) return null;
    const [instante, id] = valor as unknown[];
    if (typeof instante !== 'string' || typeof id !== 'string' || !UUID.test(id)) return null;
    const recibidoEn = new Date(instante);
    if (Number.isNaN(recibidoEn.getTime()) || recibidoEn.toISOString() !== instante) return null;
    return { recibidoEn, incidenteId: id };
  } catch {
    return null;
  }
}

/** Cuerpo de la consulta del invitado: exactamente `referencia` y `codigo`, como texto. */
export function validarConsultaInvitado(entrada: unknown): { readonly referencia: string; readonly codigo: string } | null {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) return null;
  const o = entrada as Record<string, unknown>;
  if (Object.keys(o).length !== 2 || typeof o.referencia !== 'string' || typeof o.codigo !== 'string') return null;
  if (o.referencia.length > 40 || o.codigo.length > 40) return null;
  return { referencia: o.referencia, codigo: o.codigo };
}
