export interface TokenGenerado {
  /** Token opaco en claro: se entrega una sola vez al cliente. */
  readonly token: string;
  /** Huella unidireccional que es lo unico que se persiste. */
  readonly tokenHash: string;
}

export interface TokenPort {
  generar(): TokenGenerado;
  /** Huella de un token presentado por el cliente. */
  huella(token: string): string;
}
