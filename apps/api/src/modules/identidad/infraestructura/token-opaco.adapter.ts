import { createHash, randomBytes } from 'node:crypto';
import type { TokenGenerado, TokenPort } from '../aplicacion/puertos/token.port';

/** Token opaco: 32 bytes de un CSPRNG en base64url. Solo se persiste su SHA-256. */
export class TokenOpacoAdapter implements TokenPort {
  generar(): TokenGenerado {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.huella(token) };
  }

  /** SHA-256 solo para tokens de alta entropia; nunca para contrasenas. */
  huella(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
