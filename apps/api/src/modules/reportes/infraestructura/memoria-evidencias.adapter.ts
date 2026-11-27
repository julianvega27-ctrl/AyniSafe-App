import { exigirPublicId, type TipoMedio } from '../dominio/evidencia';
import {
  ProveedorNoDisponibleError,
  type AlmacenEvidenciasPort,
  type ObjetoAlmacenado,
} from '../aplicacion/puertos/evidencias.port';

/**
 * Doble en memoria del almacen (P5.2). Solo para pruebas y desarrollo local; la configuracion lo
 * rechaza en produccion. Nunca se presenta como validacion del proveedor real.
 */
export class MemoriaEvidenciasAdapter implements AlmacenEvidenciasPort {
  readonly proveedor = 'memoria' as const;
  private readonly objetos = new Map<string, { bytes: Buffer; tipo: TipoMedio }>();
  /** Fallos inyectables por las pruebas. */
  fallarSubida: 'no' | 'antes' | 'despues' = 'no';
  fallarObtener = false;
  fallarEliminar = false;
  readonly eliminados: string[] = [];

  async subir(publicId: string, bytes: Buffer, tipo: TipoMedio): Promise<ObjetoAlmacenado> {
    exigirPublicId(publicId);
    if (this.fallarSubida === 'antes') throw new ProveedorNoDisponibleError('simulado');
    if (this.objetos.has(publicId)) throw new ProveedorNoDisponibleError('ya_existe');
    this.objetos.set(publicId, { bytes: Buffer.from(bytes), tipo });
    // Subida completada pero respuesta perdida: el objeto existe y el llamador no lo sabe.
    if (this.fallarSubida === 'despues') throw new ProveedorNoDisponibleError('respuesta_perdida');
    return { publicId, tipo, bytes: bytes.length };
  }

  async obtener(publicId: string, _tipo?: TipoMedio): Promise<Buffer> {
    exigirPublicId(publicId);
    if (this.fallarObtener) throw new ProveedorNoDisponibleError('simulado');
    const o = this.objetos.get(publicId);
    if (!o) throw new ProveedorNoDisponibleError('no_existe');
    return Buffer.from(o.bytes);
  }

  async eliminar(publicId: string): Promise<'eliminado' | 'no_existe'> {
    exigirPublicId(publicId);
    if (this.fallarEliminar) throw new ProveedorNoDisponibleError('simulado');
    this.eliminados.push(publicId);
    return this.objetos.delete(publicId) ? 'eliminado' : 'no_existe';
  }

  existe(publicId: string): boolean {
    return this.objetos.has(publicId);
  }

  get cantidad(): number {
    return this.objetos.size;
  }
}
