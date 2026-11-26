import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SecretosPort } from '../aplicacion/puertos/secretos.port';
import { BYTES_CODIGO, codigoDesdeBytes } from '../dominio/envio';

/**
 * HMAC-SHA256 con el secreto del servidor. Con 80 bits de entropia del codigo no hace falta un KDF
 * lento; el secreto impide verificar codigos a quien solo obtenga una copia de la base (design §4).
 * Contenido y codigo usan prefijos distintos para separar ambos usos del mismo secreto.
 */
export class HmacSecretosAdapter implements SecretosPort {
  constructor(private readonly secreto: string) {
    if (secreto.length < 32) throw new Error('El secreto de seguimiento debe tener al menos 32 caracteres');
  }

  private hmac(texto: string): string {
    return createHmac('sha256', this.secreto).update(texto, 'utf8').digest('hex');
  }

  huellaContenido(canonico: string): string {
    return this.hmac(`contenido\0${canonico}`);
  }

  huellaCodigo(incidenteId: string, codigoNormalizado: string): string {
    return this.hmac(`codigo\0${incidenteId}\0${codigoNormalizado}`);
  }

  iguales(a: string, b: string): boolean {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
  }

  nuevoCodigo(): string {
    return codigoDesdeBytes(randomBytes(BYTES_CODIGO));
  }
}
