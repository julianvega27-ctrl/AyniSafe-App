import { Algorithm, hash, verify } from '@node-rs/argon2';
import type { HashContrasenaPort } from '../aplicacion/puertos/hash-contrasena.port';

/** Parametros minimos del diseno (OWASP Password Storage): m=19456 KiB, t=2, p=1. */
export const PARAMETROS_ARGON2ID = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2idHashAdapter implements HashContrasenaPort {
  private hashFicticio?: Promise<string>;

  hash(contrasena: string): Promise<string> {
    // La sal individual aleatoria la genera la libreria en cada llamada.
    return hash(contrasena, PARAMETROS_ARGON2ID);
  }

  async verificar(hashCodificado: string, contrasena: string): Promise<boolean> {
    try {
      return await verify(hashCodificado, contrasena);
    } catch {
      return false;
    }
  }

  async verificarFicticio(contrasena: string): Promise<false> {
    this.hashFicticio ??= this.hash('hash-ficticio-sin-cuenta-asociada');
    await this.verificar(await this.hashFicticio, contrasena);
    return false;
  }
}
