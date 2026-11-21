/** Reloj autoritativo del servidor (UTC). Inyectable para pruebas con tiempo controlado. */
export interface RelojPort {
  ahora(): Date;
}
