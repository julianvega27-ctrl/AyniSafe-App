import { VIGENCIA_TOKEN_MS, type PropositoToken } from '../dominio/token-cuenta';
import type { RelojPort } from './puertos/reloj.port';
import type { TokenPort } from './puertos/token.port';
import type { TokensCuentaPort } from './puertos/tokens-cuenta.port';

export interface TokenEmitido {
  /** Token en claro: se entrega una sola vez (en el correo). Nunca se persiste ni se registra. */
  readonly token: string;
  readonly expiresAt: Date;
}

/** Caso de uso interno: lo invoca la entrega de correo, no una ruta publica. */
export class EmitirTokenCuentaUseCase {
  constructor(
    private readonly tokensCuenta: TokensCuentaPort,
    private readonly tokens: TokenPort,
    private readonly reloj: RelojPort,
  ) {}

  async ejecutar(usuarioId: string, proposito: PropositoToken): Promise<TokenEmitido> {
    const { token, tokenHash } = this.tokens.generar();
    const ahora = this.reloj.ahora();
    const expiresAt = new Date(ahora.getTime() + VIGENCIA_TOKEN_MS[proposito]);
    await this.tokensCuenta.emitir({ usuarioId, proposito, tokenHash, createdAt: ahora, expiresAt });
    return { token, expiresAt };
  }
}
