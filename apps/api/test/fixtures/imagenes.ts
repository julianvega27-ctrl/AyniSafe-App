import sharp from 'sharp';

/** Imagenes sinteticas para pruebas y spike: sin personas ni datos reales. */
export async function jpegConGps(ancho = 64, alto = 32, orientacion?: number): Promise<Buffer> {
  let img = sharp({ create: { width: ancho, height: alto, channels: 3, background: { r: 200, g: 40, b: 40 } } }).withExif({
    IFD0: { Make: 'AyniSafePrueba', Model: 'Sintetica' },
    IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '13/1 9/1 30/1', GPSLongitudeRef: 'W', GPSLongitude: '74/1 13/1 20/1' },
  });
  if (orientacion) img = img.withMetadata({ orientation: orientacion });
  return img.jpeg({ quality: 90 }).toBuffer();
}

export function png(ancho = 40, alto = 20): Promise<Buffer> {
  return sharp({ create: { width: ancho, height: alto, channels: 4, background: { r: 10, g: 120, b: 90, alpha: 1 } } }).png().toBuffer();
}

export function webp(ancho = 40, alto = 20): Promise<Buffer> {
  return sharp({ create: { width: ancho, height: alto, channels: 3, background: { r: 10, g: 20, b: 200 } } }).webp().toBuffer();
}

/** Ruido aleatorio en JPEG: sirve para tamaños grandes o salidas que crecen al re-codificar. */
export function jpegRuido(ancho: number, alto: number, calidad: number, semilla = 7): Promise<Buffer> {
  const datos = Buffer.alloc(ancho * alto * 3);
  let x = semilla;
  for (let i = 0; i < datos.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    datos[i] = x & 0xff;
  }
  return sharp(datos, { raw: { width: ancho, height: alto, channels: 3 } }).jpeg({ quality: calidad }).toBuffer();
}

export const PDF_FALSO = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
