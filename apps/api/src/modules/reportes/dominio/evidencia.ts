/**
 * Evidencias fotograficas (P5.2, RF08, RF52, documento 11 §7). Reglas puras: limites, identificadores
 * aislados bajo `aynisafe/`, estados y reintentos de la limpieza (design, decisiones 1, 2 y 7).
 */

export const MAX_FOTOS_POR_INCIDENTE = 3;
export const MAX_BYTES_FOTO = 5 * 1024 * 1024;
export const MAX_DIMENSION_FOTO = 10_000;
export const MAX_PIXELES_ENTRADA = 40_000_000;
/** Plazo para adjuntar fotos desde la recepcion del incidente. */
export const PLAZO_CARGA_MS = 24 * 60 * 60 * 1000;
/** Una carga sin confirmar pasado este plazo se trata como huerfana (design, decision 7). */
export const PLAZO_HUERFANA_MS = 15 * 60 * 1000;
export const BACKOFF_BASE_MS = 60 * 1000;
export const BACKOFF_TOPE_MS = 6 * 60 * 60 * 1000;

export const TIPOS_MEDIO = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type TipoMedio = (typeof TIPOS_MEDIO)[number];

export type EstadoEvidencia = 'pendiente' | 'disponible' | 'eliminacion_pendiente' | 'eliminada';
export type MotivoEliminacion = 'fallo_carga' | 'huerfana' | 'plazo';

/** Misma expresion que el CHECK de `evidencias_incidente.public_id`. */
export const PATRON_PUBLIC_ID = /^aynisafe\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class PublicIdInvalidoError extends Error {
  constructor() {
    super('Identificador de evidencia fuera del espacio aynisafe/');
    this.name = 'PublicIdInvalidoError';
  }
}

export function esPublicIdValido(publicId: unknown): publicId is string {
  return typeof publicId === 'string' && PATRON_PUBLIC_ID.test(publicId);
}

/** Lanza antes de cualquier llamada al proveedor si el identificador no es propio. */
export function exigirPublicId(publicId: unknown): string {
  if (!esPublicIdValido(publicId)) throw new PublicIdInvalidoError();
  return publicId;
}

/** `aynisafe/<uuid v4>` a partir de un uuid generado por el servidor. */
export function nuevoPublicId(uuid: string): string {
  return exigirPublicId(`aynisafe/${uuid.toLowerCase()}`);
}

export function esTipoMedio(valor: unknown): valor is TipoMedio {
  return typeof valor === 'string' && (TIPOS_MEDIO as readonly string[]).includes(valor);
}

const TRANSICIONES: Readonly<Record<EstadoEvidencia, readonly EstadoEvidencia[]>> = {
  pendiente: ['disponible', 'eliminacion_pendiente'],
  disponible: ['eliminacion_pendiente'],
  eliminacion_pendiente: ['eliminada'],
  eliminada: [],
};

export function puedeTransitar(desde: EstadoEvidencia, hacia: EstadoEvidencia): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

/** Dentro del plazo si `ahora` es como mucho recepcion + 24 h. */
export function dentroDePlazoCarga(recibidoEn: Date, ahora: Date): boolean {
  return ahora.getTime() - recibidoEn.getTime() <= PLAZO_CARGA_MS;
}

export function venceCarga(recibidoEn: Date): Date {
  return new Date(recibidoEn.getTime() + PLAZO_CARGA_MS);
}

/** Menor ranura libre (1-3) o null si estan ocupadas. */
export function ranuraLibre(ocupadas: readonly number[]): number | null {
  for (let r = 1; r <= MAX_FOTOS_POR_INCIDENTE; r++) if (!ocupadas.includes(r)) return r;
  return null;
}

export interface UsoAlmacen {
  readonly bytes: number;
  readonly objetos: number;
}
export interface CuotaLocal {
  readonly maxBytes: number;
  readonly maxObjetos: number;
}

/** La nueva foto cabe si el uso resultante no supera ninguno de los dos limites. */
export function cabeEnCuota(uso: UsoAlmacen, nuevosBytes: number, cuota: CuotaLocal): boolean {
  return uso.bytes + nuevosBytes <= cuota.maxBytes && uso.objetos + 1 <= cuota.maxObjetos;
}

/** Espera antes del intento `n` (1 = primer reintento): base * 2^(n-1), con tope de 6 h. */
export function esperaReintento(intentos: number): number {
  const n = Math.max(1, Math.floor(intentos));
  if (n > 30) return BACKOFF_TOPE_MS;
  return Math.min(BACKOFF_TOPE_MS, BACKOFF_BASE_MS * 2 ** (n - 1));
}

export function esHuerfana(creadaEn: Date, ahora: Date): boolean {
  return ahora.getTime() - creadaEn.getTime() > PLAZO_HUERFANA_MS;
}
