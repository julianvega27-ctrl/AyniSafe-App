import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  MAX_BYTES_FOTO,
  MAX_DIMENSION_FOTO,
  MAX_PIXELES_ENTRADA,
  esTipoMedio,
  type TipoMedio,
} from '../dominio/evidencia';
import {
  FotoDemasiadoGrandeError,
  FotoInvalidaError,
  type FotoNormalizada,
  type ProcesadorImagenPort,
} from '../aplicacion/puertos/evidencias.port';

const POR_FORMATO: Readonly<Record<string, TipoMedio>> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Normalizacion con sharp (design, decision 6; adaptado de `evidence.js#cleanPhoto` del donante).
 * sharp descarta EXIF, XMP e IPTC salvo que se pida `withMetadata`, que aqui no se usa.
 */
export class SharpProcesadorAdapter implements ProcesadorImagenPort {
  /** `limiteBytes` solo se reduce en pruebas, para provocar una salida mayor que la entrada. */
  constructor(private readonly limiteBytes: number = MAX_BYTES_FOTO) {}

  async normalizar(bytes: Buffer, tipoDeclarado: string): Promise<FotoNormalizada> {
    if (bytes.length > this.limiteBytes) throw new FotoDemasiadoGrandeError();
    if (!esTipoMedio(tipoDeclarado)) throw new FotoInvalidaError();
    let salida: Buffer;
    let formato: string;
    try {
      const imagen = sharp(bytes, { failOn: 'error', limitInputPixels: MAX_PIXELES_ENTRADA, animated: false });
      const meta = await imagen.metadata();
      formato = meta.format ?? '';
      const ancho = meta.width ?? 0;
      const alto = meta.height ?? 0;
      if (POR_FORMATO[formato] !== tipoDeclarado) throw new FotoInvalidaError();
      if (ancho < 1 || alto < 1 || ancho > MAX_DIMENSION_FOTO || alto > MAX_DIMENSION_FOTO) throw new FotoInvalidaError();
      salida = await imagen.rotate().toFormat(formato as 'jpeg' | 'png' | 'webp').toBuffer();
    } catch (e) {
      if (e instanceof FotoInvalidaError) throw e;
      throw new FotoInvalidaError();
    }
    if (salida.length > this.limiteBytes) throw new FotoDemasiadoGrandeError();
    const final = await sharp(salida).metadata();
    return {
      bytes: salida,
      tipo: POR_FORMATO[formato]!,
      ancho: final.width ?? 0,
      alto: final.height ?? 0,
      sha256: createHash('sha256').update(salida).digest('hex'),
    };
  }
}
