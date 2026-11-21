import type { PropositoToken } from '../../dominio/token-cuenta';

/**
 * Contexto transaccional opaco del llamador. Permite encolar un envio dentro de la misma
 * transaccion que crea la cuenta (por ejemplo, el alta de un operador): si esa transaccion se
 * revierte, no queda ningun envio. La aplicacion no conoce su forma; el adaptador la interpreta.
 */
export type ContextoTransaccional = unknown;

export interface NuevoEnvio {
  readonly usuarioId: string;
  readonly tipo: PropositoToken;
  readonly creadoAt: Date;
  /** Fin del plazo de reintentos: despues el envio se descarta sin enviar. */
  readonly venceAt: Date;
}

/** Envio que un trabajador acaba de reclamar, con los datos de la cuenta destinataria. */
export interface EnvioReclamado {
  readonly id: string;
  readonly tipo: PropositoToken;
  readonly usuarioId: string;
  readonly intentos: number;
  readonly venceAt: Date;
  readonly destinatario: {
    readonly correo: string;
    readonly nombre: string;
    readonly rol: string;
    readonly estado: string;
  } | null;
}

export interface EnviosCorreoPort {
  /**
   * Encola un envio. Devuelve false si ya hay uno activo (pendiente o enviando) del mismo
   * usuario y tipo: no se apilan correos iguales. Dentro de `tx` participa de su transaccion.
   */
  encolar(nuevo: NuevoEnvio, tx?: ContextoTransaccional): Promise<boolean>;
  /**
   * Reclama de forma exclusiva el siguiente envio listo: pendiente con su hora cumplida, o uno
   * "enviando" cuyo arrendamiento vencio (trabajador caido). Null si no hay ninguno.
   */
  reclamarSiguiente(ahora: Date, arrendamientoMs: number): Promise<EnvioReclamado | null>;
  marcarEnviado(id: string, ahora: Date): Promise<void>;
  reprogramar(id: string, datos: { intentos: number; proximoIntentoAt: Date; codigo: string }): Promise<void>;
  marcarFallido(id: string, datos: { intentos: number; codigo: string }): Promise<void>;
  /** Pasa a fallido (VENCIDO) los envios cuyo plazo termino, sin enviarlos. Devuelve cuantos. */
  descartarVencidos(ahora: Date): Promise<number>;
  /**
   * Proximo instante en que habra trabajo (hora del siguiente reintento o fin de un
   * arrendamiento), o null si no hay envios activos: sirve para no sondear en reposo.
   */
  proximoMomento(): Promise<Date | null>;
}
