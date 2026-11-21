/** Duracion absoluta de la sesion: 24 horas desde su creacion, sin renovacion. */
export const DURACION_SESION_MS = 24 * 60 * 60 * 1000;

export interface Sesion {
  readonly id: string;
  readonly usuarioId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}
