import type { PropositoToken } from '../../dominio/token-cuenta';

export interface NuevoTokenCuenta {
  readonly usuarioId: string;
  readonly proposito: PropositoToken;
  /** Huella SHA-256 del token; el token en claro nunca llega a la persistencia. */
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export type ConsultaToken =
  | { readonly estado: 'vigente'; readonly proposito: PropositoToken; readonly expiresAt: Date }
  | { readonly estado: 'usado' | 'vencido' | 'invalido' };

export interface ConsumoToken {
  readonly tokenHash: string;
  /** El token solo se acepta para este proposito; otro se trata como invalido. */
  readonly proposito: PropositoToken;
  readonly nuevoPasswordHash: string;
  readonly ahora: Date;
}

export type ResultadoConsumo =
  | { readonly resultado: 'consumido'; readonly usuarioId: string }
  | { readonly resultado: 'usado' | 'vencido' | 'invalido' };

export interface TokensCuentaPort {
  /**
   * Invalida los tokens pendientes del mismo usuario y proposito e inserta el nuevo, en una sola
   * transaccion. Un fallo lanza ServicioNoDisponibleError sin dejar cambios parciales.
   */
  emitir(nuevo: NuevoTokenCuenta): Promise<void>;
  /** Estado de un token sin modificarlo. */
  consultar(tokenHash: string, ahora: Date): Promise<ConsultaToken>;
  /**
   * Consumo atomico y de un solo uso. En una unica transaccion: marca el token como usado,
   * guarda el hash nuevo (y en una activacion deja la cuenta activa), invalida los demas tokens
   * del usuario y revoca todas sus sesiones. De varias llamadas simultaneas con el mismo token
   * solo una devuelve `consumido`. Si algo falla antes de confirmar lanza
   * ServicioNoDisponibleError y el token queda sin consumir. Una cuenta que ya no puede usar el
   * token (suspendida, rol distinto, estado inadecuado) devuelve `invalido` sin cambios.
   */
  consumir(consumo: ConsumoToken): Promise<ResultadoConsumo>;
}
