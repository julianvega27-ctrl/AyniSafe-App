import { aCrockford, normalizarCrockford } from '../../../compartido/crockford';

/**
 * Incidente unico (P4.1). Operaciones es el unico dueno de su identidad, referencia publica y estado
 * operativo. Cada envio confirmado crea un incidente en REGISTRADO; no hay entidad Reporte con ciclo
 * propio. Las transiciones se incorporan en P6.
 */
export const ESTADOS_INCIDENTE = ['REGISTRADO', 'EN_REVISION', 'EN_ATENCION', 'CERRADO'] as const;
export type EstadoIncidente = (typeof ESTADOS_INCIDENTE)[number];

export interface Incidente {
  readonly id: string;
  readonly referencia: string;
  readonly estado: EstadoIncidente;
  readonly registradoEn: Date;
}

/** `INC-` y 10 simbolos Crockford en dos grupos: 50 bits aleatorios, sin secuencia. */
export const FORMATO_REFERENCIA = /^INC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;
export const BYTES_REFERENCIA = 7;

export function referenciaDesdeBytes(bytes: Uint8Array): string {
  const simbolos = aCrockford(bytes, 10);
  return `INC-${simbolos.slice(0, 5)}-${simbolos.slice(5)}`;
}

/** Normaliza una referencia escrita por una persona (minusculas, sin guiones, O/I/L). Null si no es valida. */
export function normalizarReferencia(texto: unknown): string | null {
  if (typeof texto !== 'string' || texto.length > 40) return null;
  const sinPrefijo = texto.trim().replace(/^inc[\s-]*/i, '');
  const simbolos = normalizarCrockford(sinPrefijo);
  if (simbolos === null || simbolos.length !== 10) return null;
  return `INC-${simbolos.slice(0, 5)}-${simbolos.slice(5)}`;
}

export class ReferenciaNoDisponibleError extends Error {
  constructor() {
    super('No se pudo generar una referencia unica');
    this.name = 'ReferenciaNoDisponibleError';
  }
}
