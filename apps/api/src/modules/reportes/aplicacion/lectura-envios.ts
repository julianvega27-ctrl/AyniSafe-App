import { normalizarCodigo, type ModoOcurrencia, type RespuestaSamu } from '../dominio/envio';
import type { TerritorioEnvio } from './puertos/registro.port';
import type { SecretosPort } from './puertos/secretos.port';

/** Resumen de un envio propio para el historial del autor (sin telefono ni coordenadas). */
export interface EnvioResumen {
  readonly incidenteId: string;
  readonly categoriaId: string;
  readonly recibidoEn: Date;
  readonly territorio: TerritorioEnvio;
}

/** Originales visibles para su autor con cuenta. Sin coordenadas, telefono ni huellas. */
export interface EnvioDetalleAutor extends EnvioResumen {
  readonly descripcion: string;
  readonly ocurrencia: { readonly modo: ModoOcurrencia; readonly instante: Date };
  readonly heridos: RespuestaSamu | null;
  readonly atencionMedica: RespuestaSamu | null;
}

/** Lo unico que la vista del invitado obtiene de Reportes tras verificar el codigo. */
export interface EnvioInvitadoVerificado {
  readonly categoriaId: string;
  readonly recibidoEn: Date;
}

/** Condiciones del enrutamiento de Operaciones (P4.2). Sin narrativa, telefono ni coordenadas. */
export interface DatosEnrutamientoEnvio {
  readonly categoriaId: string;
  readonly territorio: TerritorioEnvio;
  readonly heridos: RespuestaSamu | null;
  readonly atencionMedica: RespuestaSamu | null;
  readonly recibidoEn: Date;
}

/**
 * Originales para el resumen operativo del panel (P4.2). Sin telefono, coordenadas, autor,
 * huellas ni modalidad.
 */
export interface EnvioResumenOperativo {
  readonly incidenteId: string;
  readonly categoriaId: string;
  readonly descripcion: string;
  readonly ocurrencia: { readonly modo: ModoOcurrencia; readonly instante: Date };
  readonly territorio: TerritorioEnvio;
  readonly heridos: RespuestaSamu | null;
  readonly atencionMedica: RespuestaSamu | null;
  readonly recibidoEn: Date;
}

/**
 * Ubicacion exacta, categoria y ocurrencia (P7). Solo para Operaciones, que guarda el centro de la
 * celda al publicar, y para el mapa operativo autorizado. Nunca se expone en lecturas publicas.
 */
export interface UbicacionEnvio {
  readonly incidenteId: string;
  readonly categoriaId: string;
  readonly distritoId: string | null;
  readonly latitud: number;
  readonly longitud: number;
  readonly ocurridoEn: Date;
}

export interface CursorHistorial {
  readonly recibidoEn: Date;
  readonly incidenteId: string;
}

/** Lecturas de Reportes para el seguimiento (Consultas las usa por la fachada). */
export interface EnviosLecturaRepositorio {
  /** Envios de cuenta del autor, del mas reciente al mas antiguo, estrictamente despues del cursor. */
  listarDeAutor(usuarioId: string, despuesDe: CursorHistorial | null, limite: number): Promise<readonly EnvioResumen[]>;
  /** Null si no existe o no es un envio de cuenta de ese autor. */
  detalleDeAutor(usuarioId: string, incidenteId: string): Promise<EnvioDetalleAutor | null>;
  /** Solo envios de invitado; null en cualquier otro caso. */
  huellaCodigoDe(incidenteId: string): Promise<(EnvioInvitadoVerificado & { readonly codigoHuella: string }) | null>;
  /** Null si el incidente no tiene envio. */
  datosEnrutamiento(incidenteId: string): Promise<DatosEnrutamientoEnvio | null>;
  resumenOperativo(ids: readonly string[]): Promise<readonly EnvioResumenOperativo[]>;
  ubicaciones(ids: readonly string[]): Promise<readonly UbicacionEnvio[]>;
}

/** Identificador fijo para igualar el trabajo cuando la referencia no existe. */
const INCIDENTE_FICTICIO = '00000000-0000-4000-8000-000000000000';

export class LecturaEnvios {
  constructor(
    private readonly repositorio: EnviosLecturaRepositorio,
    private readonly secretos: SecretosPort,
  ) {}

  listarDeAutor(usuarioId: string, despuesDe: CursorHistorial | null, limite: number): Promise<readonly EnvioResumen[]> {
    return this.repositorio.listarDeAutor(usuarioId, despuesDe, limite);
  }

  detalleDeAutor(usuarioId: string, incidenteId: string): Promise<EnvioDetalleAutor | null> {
    return this.repositorio.detalleDeAutor(usuarioId, incidenteId);
  }

  /** Contrato interno del enrutamiento de Operaciones (P4.2). */
  datosEnrutamiento(incidenteId: string): Promise<DatosEnrutamientoEnvio | null> {
    return this.repositorio.datosEnrutamiento(incidenteId);
  }

  /** Ubicaciones exactas (P7); el llamador ya autorizo la publicacion o el ambito del operador. */
  async ubicaciones(ids: readonly string[]): Promise<ReadonlyMap<string, UbicacionEnvio>> {
    if (ids.length === 0) return new Map();
    return new Map((await this.repositorio.ubicaciones(ids)).map((e) => [e.incidenteId, e]));
  }

  /** Originales para el resumen operativo; el llamador ya comprobo el ambito del operador. */
  async resumenOperativo(ids: readonly string[]): Promise<ReadonlyMap<string, EnvioResumenOperativo>> {
    if (ids.length === 0) return new Map();
    return new Map((await this.repositorio.resumenOperativo(ids)).map((e) => [e.incidenteId, e]));
  }

  /**
   * Verifica el codigo de un envio de invitado. Hace la misma lectura y el mismo HMAC exista o no el
   * incidente, para que el tiempo no distinga una referencia inexistente de un codigo incorrecto.
   * Comparacion en tiempo constante. Un incidente de cuenta nunca verifica.
   */
  async verificarCodigo(incidenteId: string | null, codigo: unknown): Promise<EnvioInvitadoVerificado | null> {
    const normalizado = normalizarCodigo(codigo) ?? '0000000000000000';
    const id = incidenteId ?? INCIDENTE_FICTICIO;
    const fila = await this.repositorio.huellaCodigoDe(id);
    const esperado = this.secretos.huellaCodigo(id, normalizado);
    const coincide = fila !== null && this.secretos.iguales(fila.codigoHuella, esperado);
    if (!coincide || incidenteId === null || normalizarCodigo(codigo) === null) return null;
    return { categoriaId: fila.categoriaId, recibidoEn: fila.recibidoEn };
  }
}
