/**
 * Huellas no reversibles con el secreto del servidor (TRACKING_CODE_HMAC_SECRET) y generacion de
 * codigos. La implementacion concreta vive en infraestructura; el dominio solo define formatos.
 */
export interface SecretosPort {
  /** Huella del contenido canonico de un envio (64 hex). */
  huellaContenido(canonico: string): string;
  /** Huella del codigo secreto ligado a un incidente (64 hex). */
  huellaCodigo(incidenteId: string, codigoNormalizado: string): string;
  /** Comparacion en tiempo constante de dos huellas hex. */
  iguales(a: string, b: string): boolean;
  /** Codigo secreto nuevo, formateado (XXXX-XXXX-XXXX-XXXX). */
  nuevoCodigo(): string;
}
