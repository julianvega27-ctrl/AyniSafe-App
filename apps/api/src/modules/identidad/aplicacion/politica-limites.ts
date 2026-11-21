/** Umbrales de limitacion. Valores iniciales tecnicos del diseno; configurables por entorno. */
export interface PoliticaLimites {
  readonly registroPorIp: number;
  readonly loginPorIp: number;
  readonly loginPorCorreoIp: number;
}

export const POLITICA_LIMITES_POR_DEFECTO: PoliticaLimites = {
  registroPorIp: 5,
  loginPorIp: 30,
  loginPorCorreoIp: 5,
};
