export interface PurgaPort {
  /**
   * Elimina hasta `lote` sesiones revocadas o vencidas antes de `corte`. Devuelve cuantas
   * elimino. Nunca toca sesiones vigentes.
   */
  purgarSesionesAnterioresA(corte: Date, lote: number): Promise<number>;
  /** Elimina hasta `lote` ventanas de intentos cuyo inicio es anterior a `corte`. */
  purgarVentanasAnterioresA(corte: Date, lote: number): Promise<number>;
  /**
   * Elimina hasta `lote` tokens de cuenta ya inservibles (vencidos, usados o invalidados) desde
   * antes de `corte`. Nunca toca un token vigente.
   */
  purgarTokensAnterioresA(corte: Date, lote: number): Promise<number>;
  /** Elimina hasta `lote` envios terminados (enviado o fallido) creados antes de `corte`. Nunca los activos. */
  purgarEnviosTerminadosAnterioresA(corte: Date, lote: number): Promise<number>;
}
