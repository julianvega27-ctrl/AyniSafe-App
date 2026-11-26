import type { ContextoTransaccional } from '../../../compartido/transaccion';
import {
  BYTES_REFERENCIA,
  ReferenciaNoDisponibleError,
  referenciaDesdeBytes,
  type EstadoIncidente,
  type Incidente,
} from '../dominio/incidente';

/** Persistencia de incidentes. Solo Operaciones escribe o lee su tabla. */
export interface IncidentesRepositorio {
  /**
   * Inserta un incidente REGISTRADO con la referencia indicada dentro de la transaccion. Devuelve null
   * si la referencia ya existe, sin abortar la transaccion.
   */
  insertar(tx: ContextoTransaccional, referencia: string): Promise<Incidente | null>;
  porReferencia(referencia: string): Promise<Incidente | null>;
  porIds(ids: readonly string[]): Promise<readonly Incidente[]>;
}

export type FuenteAleatoria = (bytes: number) => Uint8Array;

const INTENTOS_REFERENCIA = 5;

/**
 * Contrato publico del incidente unico. Crea el incidente en la transaccion del llamador (Reportes
 * coordina el registro) y ofrece lecturas por referencia o identificadores para el seguimiento.
 */
export class ServicioIncidentes {
  constructor(
    private readonly repositorio: IncidentesRepositorio,
    private readonly aleatorio: FuenteAleatoria,
  ) {}

  /** Crea un incidente REGISTRADO. Una colision de referencia se reintenta sin fallar el envio. */
  async crear(tx: ContextoTransaccional): Promise<Incidente> {
    for (let i = 0; i < INTENTOS_REFERENCIA; i++) {
      const creado = await this.repositorio.insertar(tx, referenciaDesdeBytes(this.aleatorio(BYTES_REFERENCIA)));
      if (creado) return creado;
    }
    throw new ReferenciaNoDisponibleError();
  }

  porReferencia(referencia: string): Promise<Incidente | null> {
    return this.repositorio.porReferencia(referencia);
  }

  /** Estado ciudadano por identificador. Los ausentes no aparecen en el mapa. */
  async estados(ids: readonly string[]): Promise<ReadonlyMap<string, { readonly referencia: string; readonly estado: EstadoIncidente; readonly registradoEn: Date }>> {
    if (ids.length === 0) return new Map();
    const filas = await this.repositorio.porIds(ids);
    return new Map(filas.map((f) => [f.id, { referencia: f.referencia, estado: f.estado, registradoEn: f.registradoEn }]));
  }
}
