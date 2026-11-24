/** Umbrales de limitacion. Valores iniciales tecnicos del diseno; configurables por entorno. */
export interface PoliticaLimites {
  readonly registroPorIp: number;
  readonly loginPorIp: number;
  readonly loginPorCorreoIp: number;
  /** Acceso institucional (administrador/operador): contadores propios, independientes del ciudadano. */
  readonly loginInstPorIp: number;
  readonly loginInstPorCorreoIp: number;
  /** Solicitudes de recuperacion por IP en 15 minutos. */
  readonly recuperacionPorIp: number;
  /** Por correo normalizado combinado con IP en 15 minutos. */
  readonly recuperacionPorCorreoIp: number;
  /** Por correo normalizado en una hora (frena el bombardeo de correo sin bloquear permanentemente). */
  readonly recuperacionPorCorreo: number;
  /** Consultas y consumos de tokens por IP en 15 minutos. */
  readonly tokenPorIp: number;
  /** Tope global de solicitudes de recuperacion por dia UTC, por debajo de la cuota del proveedor. */
  readonly correoDiarioMax: number;
}

export const POLITICA_LIMITES_POR_DEFECTO: PoliticaLimites = {
  registroPorIp: 5,
  loginPorIp: 30,
  loginPorCorreoIp: 5,
  loginInstPorIp: 30,
  loginInstPorCorreoIp: 5,
  recuperacionPorIp: 10,
  recuperacionPorCorreoIp: 3,
  recuperacionPorCorreo: 3,
  tokenPorIp: 20,
  correoDiarioMax: 400,
};
