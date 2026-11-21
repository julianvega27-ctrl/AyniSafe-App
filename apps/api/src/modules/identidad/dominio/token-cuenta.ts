/** Para que se emite un token de cuenta. */
export type PropositoToken = 'recuperacion' | 'activacion';

/** Vigencia desde la emision: 30 min para recuperar la contrasena y 72 h para activar una cuenta. */
export const VIGENCIA_TOKEN_MS: Readonly<Record<PropositoToken, number>> = {
  recuperacion: 30 * 60 * 1000,
  activacion: 72 * 60 * 60 * 1000,
};

/** Fila persistida minima para clasificar un token. */
export interface FilaToken {
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly invalidadoAt: Date | null;
}

export type EstadoToken = 'vigente' | 'usado' | 'vencido';

/**
 * Un token consumido o invalidado cuenta como usado aunque ademas haya vencido: el enlace ya no
 * sirve y la causa mas informativa para quien lo tiene es que ya se uso.
 */
export function clasificarToken(fila: FilaToken, ahora: Date): EstadoToken {
  if (fila.usedAt !== null || fila.invalidadoAt !== null) return 'usado';
  if (fila.expiresAt.getTime() <= ahora.getTime()) return 'vencido';
  return 'vigente';
}
