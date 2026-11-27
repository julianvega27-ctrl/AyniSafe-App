import type { ContextoTransaccional } from '../../../../compartido/transaccion';
import type { EstadoEvidencia, MotivoEliminacion, TipoMedio, UsoAlmacen } from '../../dominio/evidencia';

/** Huella del permiso de carga del invitado (Reportes, P5.2). */
export interface PermisoGuardado {
  readonly huella: string;
  readonly venceEn: Date;
}

export interface PermisosEvidenciaRepositorio {
  /** Inserta o reemplaza la huella del permiso del incidente. */
  guardar(tx: ContextoTransaccional | null, incidenteId: string, huella: string, emitidoEn: Date, venceEn: Date): Promise<void>;
  leer(incidenteId: string): Promise<PermisoGuardado | null>;
}

/** Imagen decodificada, re-codificada y sin metadatos. No es un original forense. */
export interface FotoNormalizada {
  readonly bytes: Buffer;
  readonly tipo: TipoMedio;
  readonly ancho: number;
  readonly alto: number;
  readonly sha256: string;
}

/** Contenido no admitido: formato real, decodificacion o dimensiones (422). */
export class FotoInvalidaError extends Error {
  constructor() {
    super('Fotografia invalida');
    this.name = 'FotoInvalidaError';
  }
}

/** Supera 5 MB antes o despues de normalizar (413). */
export class FotoDemasiadoGrandeError extends Error {
  constructor() {
    super('Fotografia demasiado grande');
    this.name = 'FotoDemasiadoGrandeError';
  }
}

export interface ProcesadorImagenPort {
  /** Valida por contenido (no por el tipo declarado), aplica orientacion y descarta metadatos. */
  normalizar(bytes: Buffer, tipoDeclarado: string): Promise<FotoNormalizada>;
}

/** El proveedor no respondio, fallo o su resultado es incierto (503 reintentable). */
export class ProveedorNoDisponibleError extends Error {
  constructor(readonly causa?: string) {
    super('Almacen de evidencias no disponible');
    this.name = 'ProveedorNoDisponibleError';
  }
}

/** El proveedor indico falta de cuota (503 con el mismo codigo). */
export class CuotaProveedorError extends Error {
  constructor() {
    super('Cuota del almacen de evidencias agotada');
    this.name = 'CuotaProveedorError';
  }
}

/** La respuesta del proveedor no corresponde a lo solicitado (otro id, otro tipo). */
export class RespuestaInvalidaError extends Error {
  constructor(readonly motivo: string) {
    super('Respuesta invalida del almacen de evidencias');
    this.name = 'RespuestaInvalidaError';
  }
}

export interface ObjetoAlmacenado {
  readonly publicId: string;
  readonly tipo: TipoMedio;
  readonly bytes: number;
}

/**
 * Almacen privado de evidencias (ADR-006). Todas las operaciones rechazan un `publicId` fuera de
 * `aynisafe/` antes de llamar al proveedor. No existe borrado por prefijo, etiqueta ni carpeta.
 */
export interface AlmacenEvidenciasPort {
  readonly proveedor: 'cloudinary' | 'memoria';
  subir(publicId: string, bytes: Buffer, tipo: TipoMedio): Promise<ObjetoAlmacenado>;
  /** Devuelve los bytes; nunca una URL. */
  obtener(publicId: string, tipo: TipoMedio): Promise<Buffer>;
  eliminar(publicId: string): Promise<'eliminado' | 'no_existe'>;
}

/** Fila de evidencia vista por la aplicacion. `publicId` nunca sale de Reportes. */
export interface EvidenciaRegistrada {
  readonly id: string;
  readonly incidenteId: string;
  readonly ranura: number;
  readonly publicId: string;
  readonly estado: EstadoEvidencia;
  readonly tipo: TipoMedio;
  readonly bytes: number;
  readonly huellaCarga: string;
  readonly creadaEn: Date;
  readonly confirmadaEn: Date | null;
}

export interface NuevaEvidencia {
  readonly id: string;
  readonly incidenteId: string;
  readonly ranura: number;
  readonly publicId: string;
  readonly proveedor: 'cloudinary' | 'memoria';
  readonly tipo: TipoMedio;
  readonly bytes: number;
  readonly ancho: number;
  readonly alto: number;
  readonly sha256: string;
  readonly huellaCarga: string;
  readonly clave: string;
  readonly modalidad: 'cuenta' | 'invitado';
  readonly autorUsuarioId: string | null;
  readonly creadaEn: Date;
}

/** Autoria del envio original, leida en Reportes. */
export interface AutoriaEnvio {
  readonly modalidad: 'cuenta' | 'invitado';
  readonly autorUsuarioId: string | null;
}

/** Tarea de eliminacion tomada por la limpieza. */
export interface TareaEliminacion {
  readonly id: string;
  readonly publicId: string;
  readonly intentos: number;
}

export interface EvidenciasRepositorio extends PermisosEvidenciaRepositorio {
  autoria(incidenteId: string): Promise<AutoriaEnvio | null>;
  /** Serializa las cargas de un incidente (FOR UPDATE sobre su envio). */
  bloquearIncidente(tx: ContextoTransaccional, incidenteId: string): Promise<void>;
  /** Evidencia vigente (pendiente o disponible) con esa clave en el incidente. */
  vigentePorClave(tx: ContextoTransaccional, incidenteId: string, clave: string): Promise<EvidenciaRegistrada | null>;
  ranurasOcupadas(tx: ContextoTransaccional, incidenteId: string): Promise<number[]>;
  /** Uso total registrado en el proveedor (todo lo no eliminado). */
  uso(tx: ContextoTransaccional): Promise<UsoAlmacen>;
  insertarPendiente(tx: ContextoTransaccional, nueva: NuevaEvidencia): Promise<void>;
  /** pendiente -> disponible. Devuelve false si la fila ya no estaba pendiente. */
  confirmar(id: string, ahora: Date): Promise<boolean>;
  /** pendiente|disponible -> eliminacion_pendiente, con el primer intento inmediato. */
  marcarEliminacion(id: string, motivo: MotivoEliminacion, ahora: Date): Promise<void>;
  /**
   * En una transaccion corta (FOR UPDATE SKIP LOCKED): pasa a eliminacion_pendiente las pendientes
   * creadas antes de `huerfanaAntesDe` y toma hasta `limite` tareas vencidas, arrendandolas hasta
   * `arriendoHasta` para que otro proceso no las tome mientras se borran.
   */
  tomarTareas(ahora: Date, huerfanaAntesDe: Date, limite: number, arriendoHasta: Date): Promise<TareaEliminacion[]>;
  marcarEliminada(id: string, ahora: Date): Promise<void>;
  reprogramar(id: string, intentos: number, proximo: Date): Promise<void>;
  /** Disponibles de los incidentes indicados, ordenadas por ranura. */
  disponibles(incidenteIds: readonly string[]): Promise<EvidenciaRegistrada[]>;
  disponible(incidenteId: string, evidenciaId: string): Promise<EvidenciaRegistrada | null>;
  registrarAcceso(evidenciaId: string, usuarioId: string, rol: 'operador' | 'ciudadano', ahora: Date): Promise<void>;
}
