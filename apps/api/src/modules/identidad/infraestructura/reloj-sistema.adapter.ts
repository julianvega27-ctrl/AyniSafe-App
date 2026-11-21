import type { RelojPort } from '../aplicacion/puertos/reloj.port';

export class RelojSistemaAdapter implements RelojPort {
  ahora(): Date {
    return new Date();
  }
}
