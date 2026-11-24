export type TipoLimite =
  | 'registro_ip'
  | 'login_ip'
  | 'login_correo_ip'
  | 'login_inst_ip'
  | 'login_inst_correo_ip'
  | 'recuperacion_ip'
  | 'recuperacion_correo_ip'
  | 'recuperacion_correo'
  | 'token_ip'
  | 'correo_dia';

export interface ConsumoLimite {
  readonly tipo: TipoLimite;
  /** Identificador en claro (IP o correo+IP); la implementacion solo persiste su HMAC. */
  readonly identificador: string;
  readonly maximo: number;
  /** Duracion de la ventana fija de este limite; por defecto la del limitador (15 min). */
  readonly ventanaMs?: number;
}

export interface ResultadoLimite {
  readonly permitido: boolean;
  /** Si no esta permitido: mayor plazo restante entre los limites superados, en segundos (>= 1). */
  readonly reintentarEnSegundos: number;
}

export interface LimitadorPort {
  /**
   * Cuenta una solicitud en cada limite indicado de forma atomica y persistente.
   * Fallos de almacenamiento lanzan ServicioNoDisponibleError.
   */
  consumir(consumos: readonly ConsumoLimite[], ahora: Date): Promise<ResultadoLimite>;
}
