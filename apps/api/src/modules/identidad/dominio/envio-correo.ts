import type { PropositoToken } from './token-cuenta';

export type EstadoEnvio = 'pendiente' | 'enviando' | 'enviado' | 'fallido';

/**
 * Plazo maximo de reintentos desde que se encola: un correo de recuperacion que llega despues de
 * 15 minutos ya casi no sirve (el enlace vive 30), mientras que una invitacion reintenta 24 horas.
 */
export const PLAZO_ENVIO_MS: Readonly<Record<PropositoToken, number>> = {
  recuperacion: 15 * 60 * 1000,
  activacion: 24 * 60 * 60 * 1000,
};

/** Espera creciente entre reintentos (1, 5, 15, 30 y 60 minutos; despues se repite la ultima). */
const ESPERAS_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000] as const;

/** Tiempo que un trabajador conserva un envio antes de que otro pueda retomarlo si se cayo. */
export const ARRENDAMIENTO_MS = 2 * 60 * 1000;

/** Espera antes del reintento numero `intentos` (el primero fallido es intentos = 1). */
export function esperaTrasFallo(intentos: number): number {
  const i = Math.min(Math.max(intentos, 1), ESPERAS_MS.length) - 1;
  return ESPERAS_MS[i]!;
}
