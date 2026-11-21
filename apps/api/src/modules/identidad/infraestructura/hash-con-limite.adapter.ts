import type { HashContrasenaPort } from '../aplicacion/puertos/hash-contrasena.port';
import { ServicioNoDisponibleError } from '../dominio/errores';

/**
 * Limita los hashes simultaneos para no agotar memoria (cada Argon2id usa unos 19 MiB).
 * Las solicitudes extra esperan en cola; si la cola esta llena se rechazan de inmediato con
 * ServicioNoDisponibleError (503), sin haber creado cuentas ni sesiones.
 */
export class HashConLimiteDeConcurrencia implements HashContrasenaPort {
  private enCurso = 0;
  private readonly cola: Array<() => void> = [];

  constructor(
    private readonly interno: HashContrasenaPort,
    private readonly maxEnCurso: number,
    private readonly maxEnCola: number,
  ) {
    if (maxEnCurso < 1 || maxEnCola < 0) throw new Error('Limites de concurrencia invalidos');
  }

  private async adquirir(): Promise<void> {
    if (this.enCurso < this.maxEnCurso) {
      this.enCurso += 1;
      return;
    }
    if (this.cola.length >= this.maxEnCola) {
      throw new ServicioNoDisponibleError('hash saturado');
    }
    // El hueco se transfiere directamente a quien espera (enCurso no cambia).
    await new Promise<void>((resolver) => this.cola.push(resolver));
  }

  private liberar(): void {
    const siguiente = this.cola.shift();
    if (siguiente) siguiente();
    else this.enCurso -= 1;
  }

  private async conLimite<T>(trabajo: () => Promise<T>): Promise<T> {
    await this.adquirir();
    try {
      return await trabajo();
    } finally {
      this.liberar();
    }
  }

  hash(contrasena: string): Promise<string> {
    return this.conLimite(() => this.interno.hash(contrasena));
  }

  verificar(hashCodificado: string, contrasena: string): Promise<boolean> {
    return this.conLimite(() => this.interno.verificar(hashCodificado, contrasena));
  }

  verificarFicticio(contrasena: string): Promise<false> {
    return this.conLimite(() => this.interno.verificarFicticio(contrasena));
  }
}
