import type { ContextoTransaccional } from '../../../../compartido/transaccion';
import type { EnvioValido, Modalidad } from '../../dominio/envio';

/** Resultado territorial del punto, calculado por Consultas con la version activa. */
export type TerritorioEnvio =
  | { readonly estado: 'resuelto'; readonly distritoId: string; readonly motivo: null; readonly version: string }
  | {
      readonly estado: 'pendiente';
      readonly distritoId: null;
      readonly motivo: 'frontera' | 'solapamiento' | 'fuera_area' | 'sin_cartografia';
      readonly version: string | null;
    };

/** Puerto hacia la fachada de Consultas (territorio). */
export interface TerritorioPort {
  /** Fallos de lectura se propagan; sin cartografia activa devuelve pendiente `sin_cartografia`. */
  resolver(latitud: number, longitud: number): Promise<TerritorioEnvio>;
  nombreDistrito(id: string): string | null;
}

export interface IncidenteCreado {
  readonly id: string;
  readonly referencia: string;
  readonly estado: string;
  readonly registradoEn: Date;
}

/** Puerto hacia la fachada de Operaciones: el incidente unico y su estado. */
export interface IncidentesPort {
  crear(tx: ContextoTransaccional): Promise<IncidenteCreado>;
  estados(ids: readonly string[]): Promise<ReadonlyMap<string, Omit<IncidenteCreado, 'id'>>>;
}

/** Puerto hacia el limitador persistente de Identidad. */
export interface LimitadorEnviosPort {
  consumir(
    consumos: readonly { readonly tipo: 'incidente_invitado_ip'; readonly identificador: string; readonly maximo: number; readonly ventanaMs: number }[],
    ahora: Date,
  ): Promise<{ readonly permitido: boolean; readonly reintentarEnSegundos: number }>;
}

export interface SolicitudPrevia {
  readonly huellaContenido: string;
  readonly incidenteId: string;
}

export interface NuevoEnvio {
  readonly incidenteId: string;
  readonly modalidad: Modalidad;
  readonly autorUsuarioId: string | null;
  readonly envio: EnvioValido;
  readonly territorio: TerritorioEnvio;
  readonly codigoHuella: string | null;
  readonly recibidoEn: Date;
}

export interface EnvioGuardado {
  readonly incidenteId: string;
  readonly modalidad: Modalidad;
  readonly territorio: TerritorioEnvio;
}

/** La clave ya existe en el ambito (otra solicitud la registro antes o al mismo tiempo). */
export class ClaveDuplicadaError extends Error {
  constructor() {
    super('Clave de idempotencia ya registrada');
    this.name = 'ClaveDuplicadaError';
  }
}

/** Persistencia de originales y claves. Solo Reportes escribe o lee estas tablas. */
export interface EnviosRepositorio {
  buscarSolicitud(ambito: string, clave: string): Promise<SolicitudPrevia | null>;
  /** Lanza ClaveDuplicadaError si (ambito, clave) ya existe. */
  insertarSolicitud(tx: ContextoTransaccional, ambito: string, clave: string, huella: string, incidenteId: string): Promise<void>;
  insertarEnvio(tx: ContextoTransaccional, nuevo: NuevoEnvio): Promise<void>;
  leerEnvio(incidenteId: string): Promise<EnvioGuardado | null>;
  /** Reemplaza la huella del codigo de un envio de invitado (reintento idempotente). */
  rotarCodigo(incidenteId: string, codigoHuella: string, emitidoEn: Date): Promise<void>;
}
