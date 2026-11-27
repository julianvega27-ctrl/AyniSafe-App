import type { TipoMedio } from '../dominio/evidencia';
import type { AlmacenEvidenciasPort, EvidenciasRepositorio } from './puertos/evidencias.port';

/** Metadatos visibles de una foto: sin public_id, URL, autor ni nombre de archivo. */
export interface MetadatosEvidencia {
  readonly id: string;
  readonly tipo: TipoMedio;
  readonly bytes: number;
  readonly adjuntadaEn: string;
}

/** El proveedor fallo al entregar una foto autorizada (503 reintentable). */
export class EntregaEvidenciaNoDisponibleError extends Error {
  constructor() {
    super('Entrega de evidencia no disponible');
    this.name = 'EntregaEvidenciaNoDisponibleError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lecturas de evidencias para Consultas (P5.2; design, decision 8). Consultas autoriza (ambito y
 * participacion, o autoria) antes de llamar; aqui solo se entregan las disponibles y se registra el
 * acceso despues de obtener los bytes.
 */
export class LecturaEvidencias {
  constructor(
    private readonly evidencias: EvidenciasRepositorio,
    private readonly almacen: AlmacenEvidenciasPort | null,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async metadatos(incidenteIds: readonly string[]): Promise<ReadonlyMap<string, readonly MetadatosEvidencia[]>> {
    const filas = await this.evidencias.disponibles(incidenteIds);
    const porIncidente = new Map<string, MetadatosEvidencia[]>();
    for (const f of filas) {
      const lista = porIncidente.get(f.incidenteId) ?? [];
      lista.push({ id: f.id, tipo: f.tipo, bytes: f.bytes, adjuntadaEn: (f.confirmadaEn ?? f.creadaEn).toISOString() });
      porIncidente.set(f.incidenteId, lista);
    }
    return porIncidente;
  }

  /** null = evidencia inexistente, de otro incidente o no disponible (el llamador responde 404). */
  async contenido(
    incidenteId: string,
    evidenciaId: string,
    lector: { readonly usuarioId: string; readonly rol: 'operador' | 'ciudadano' },
  ): Promise<{ readonly bytes: Buffer; readonly tipo: TipoMedio } | null> {
    if (!UUID.test(evidenciaId)) return null;
    const e = await this.evidencias.disponible(incidenteId, evidenciaId);
    if (!e) return null;
    if (!this.almacen) throw new EntregaEvidenciaNoDisponibleError();
    let bytes: Buffer;
    try {
      bytes = await this.almacen.obtener(e.publicId, e.tipo);
    } catch {
      throw new EntregaEvidenciaNoDisponibleError();
    }
    await this.evidencias.registrarAcceso(e.id, lector.usuarioId, lector.rol, this.ahora());
    return { bytes, tipo: e.tipo };
  }
}
