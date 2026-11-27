import { describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import { SharpProcesadorAdapter } from '../../src/modules/reportes/infraestructura/sharp-procesador.adapter';
import { FotoDemasiadoGrandeError, FotoInvalidaError } from '../../src/modules/reportes/aplicacion/puertos/evidencias.port';
import { MAX_BYTES_FOTO } from '../../src/modules/reportes/dominio/evidencia';
import { PDF_FALSO, jpegConGps, jpegRuido, png, webp } from '../fixtures/imagenes';

const procesador = new SharpProcesadorAdapter();

describe('SharpProcesadorAdapter', () => {
  it('el fixture tiene EXIF con GPS (control)', async () => {
    const meta = await sharp(await jpegConGps()).metadata();
    expect(meta.exif).toBeDefined();
    expect(meta.exif!.toString('latin1')).toContain('AyniSafePrueba');
  });

  it('JPEG con EXIF GPS: la salida no tiene exif, xmp ni iptc', async () => {
    const r = await procesador.normalizar(await jpegConGps(), 'image/jpeg');
    const meta = await sharp(r.bytes).metadata();
    expect(r.tipo).toBe('image/jpeg');
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(r.bytes.toString('latin1')).not.toContain('AyniSafePrueba');
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('aplica la orientacion antes de descartar metadatos', async () => {
    const r = await procesador.normalizar(await jpegConGps(64, 32, 6), 'image/jpeg');
    expect([r.ancho, r.alto]).toEqual([32, 64]);
  });

  it.each([
    ['png', png, 'image/png'],
    ['webp', webp, 'image/webp'],
  ] as const)('%s valido conserva su formato', async (_n, crear, tipo) => {
    const r = await procesador.normalizar(await crear(), tipo);
    expect(r.tipo).toBe(tipo);
    expect((await sharp(r.bytes).metadata()).format).toBe(_n);
  });

  it('PDF renombrado como JPEG se rechaza', async () => {
    await expect(procesador.normalizar(PDF_FALSO, 'image/jpeg')).rejects.toBeInstanceOf(FotoInvalidaError);
  });

  it('JPEG truncado se rechaza', async () => {
    const jpg = await jpegRuido(200, 200, 90);
    await expect(procesador.normalizar(jpg.subarray(0, Math.floor(jpg.length / 2)), 'image/jpeg')).rejects.toBeInstanceOf(FotoInvalidaError);
  });

  it('contenido JPEG declarado como PNG se rechaza', async () => {
    await expect(procesador.normalizar(await jpegConGps(), 'image/png')).rejects.toBeInstanceOf(FotoInvalidaError);
  });

  it('tipo declarado no admitido se rechaza', async () => {
    await expect(procesador.normalizar(await jpegConGps(), 'image/heic')).rejects.toBeInstanceOf(FotoInvalidaError);
  });

  it('imagen de 10 001 px se rechaza', async () => {
    const ancha = await sharp({ create: { width: 10_001, height: 1, channels: 3, background: '#000' } }).png().toBuffer();
    await expect(procesador.normalizar(ancha, 'image/png')).rejects.toBeInstanceOf(FotoInvalidaError);
  });

  it('entrada mayor de 5 MB da demasiado grande sin decodificar', async () => {
    await expect(procesador.normalizar(Buffer.alloc(MAX_BYTES_FOTO + 1), 'image/jpeg')).rejects.toBeInstanceOf(FotoDemasiadoGrandeError);
  });

  it('salida mayor que el limite tras re-codificar da demasiado grande', async () => {
    const entrada = await jpegRuido(400, 400, 5);
    const pequeno = new SharpProcesadorAdapter(entrada.length + 10);
    await expect(pequeno.normalizar(entrada, 'image/jpeg')).rejects.toBeInstanceOf(FotoDemasiadoGrandeError);
  });
});
