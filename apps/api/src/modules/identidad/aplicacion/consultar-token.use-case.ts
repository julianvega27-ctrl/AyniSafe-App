import { TokenInvalidoError, TokenUsadoError, TokenVencidoError, ValidacionError } from '../dominio/errores';
import type { PropositoToken } from '../dominio/token-cuenta';
import { TOKEN_MAX, validarConsultaToken } from '../dominio/validacion';
import { aplicarLimites } from './limitar';
import type { PoliticaLimites } from './politica-limites';
import type { LimitadorPort } from './puertos/limitador.port';
import type { RelojPort } from './puertos/reloj.port';
import type { TokenPort } from './puertos/token.port';
import type { TokensCuentaPort } from './puertos/tokens-cuenta.port';

export interface TokenVigente {
  readonly proposito: PropositoToken;
  readonly expiresAt: Date;
}

/** Consulta el estado de un enlace sin consumirlo. */
export class ConsultarTokenUseCase {
  constructor(
    private readonly tokensCuenta: TokensCuentaPort,
    private readonly tokens: TokenPort,
    private readonly reloj: RelojPort,
    private readonly limitador: LimitadorPort,
    private readonly politica: PoliticaLimites,
  ) {}

  async ejecutar(cuerpo: unknown, ip: string): Promise<TokenVigente> {
    const validado = validarConsultaToken(cuerpo);
    if (!validado.ok) throw new ValidacionError(validado.campos);
    const { token } = validado.valor;
    await aplicarLimites(
      this.limitador,
      [{ tipo: 'token_ip', identificador: ip, maximo: this.politica.tokenPorIp }],
      this.reloj.ahora(),
    );
    if (token.length > TOKEN_MAX) throw new TokenInvalidoError();

    const consulta = await this.tokensCuenta.consultar(this.tokens.huella(token), this.reloj.ahora());
    switch (consulta.estado) {
      case 'vigente':
        return { proposito: consulta.proposito, expiresAt: consulta.expiresAt };
      case 'usado':
        throw new TokenUsadoError();
      case 'vencido':
        throw new TokenVencidoError();
      default:
        throw new TokenInvalidoError();
    }
  }
}
