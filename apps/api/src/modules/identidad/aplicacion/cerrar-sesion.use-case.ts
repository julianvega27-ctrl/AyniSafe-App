import { TOKEN_LONGITUD_MAX } from './consultar-sesion.use-case';
import type { RelojPort } from './puertos/reloj.port';
import type { SesionesPort } from './puertos/sesiones.port';
import type { TokenPort } from './puertos/token.port';

export class CerrarSesionUseCase {
  constructor(
    private readonly sesiones: SesionesPort,
    private readonly tokens: TokenPort,
    private readonly reloj: RelojPort,
  ) {}

  /**
   * Revoca solo la sesion del token presentado. Idempotente: token ausente, desconocido o ya
   * revocado no es un error ni afecta a otras sesiones.
   */
  async ejecutar(token: string | undefined): Promise<void> {
    if (!token || token.length > TOKEN_LONGITUD_MAX) return;
    await this.sesiones.revocar(this.tokens.huella(token), this.reloj.ahora());
  }
}
