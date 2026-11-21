import { TokenInvalidoError, TokenUsadoError, TokenVencidoError, ValidacionError } from '../dominio/errores';
import type { PropositoToken } from '../dominio/token-cuenta';
import { TOKEN_MAX, validarConsumoToken } from '../dominio/validacion';
import { aplicarLimites } from './limitar';
import type { PoliticaLimites } from './politica-limites';
import type { LimitadorPort } from './puertos/limitador.port';
import type { HashContrasenaPort } from './puertos/hash-contrasena.port';
import type { RelojPort } from './puertos/reloj.port';
import type { TokenPort } from './puertos/token.port';
import type { TokensCuentaPort } from './puertos/tokens-cuenta.port';

export interface ConsumirTokenComando {
  readonly cuerpo: unknown;
  readonly proposito: PropositoToken;
  readonly ip: string;
}

/**
 * Cambia la contrasena con un token de un solo uso: recuperacion (restablecer) o activacion de
 * una cuenta invitada. No inicia sesion ni devuelve ningun token de sesion.
 */
export class ConsumirTokenCuentaUseCase {
  constructor(
    private readonly tokensCuenta: TokensCuentaPort,
    private readonly hash: HashContrasenaPort,
    private readonly tokens: TokenPort,
    private readonly reloj: RelojPort,
    private readonly limitador: LimitadorPort,
    private readonly politica: PoliticaLimites,
  ) {}

  async ejecutar(comando: ConsumirTokenComando): Promise<void> {
    // La validacion de campos va primero: un 400 de contrasena deja el token vigente y sin usar.
    const validado = validarConsumoToken(comando.cuerpo);
    if (!validado.ok) throw new ValidacionError(validado.campos);
    const { token, contrasena } = validado.valor;
    await aplicarLimites(
      this.limitador,
      [{ tipo: 'token_ip', identificador: comando.ip, maximo: this.politica.tokenPorIp }],
      this.reloj.ahora(),
    );
    if (token.length > TOKEN_MAX) throw new TokenInvalidoError();
    const tokenHash = this.tokens.huella(token);

    // Comprobacion barata y sin efectos: un token basura o ya gastado no consume CPU de Argon2id.
    const previa = await this.tokensCuenta.consultar(tokenHash, this.reloj.ahora());
    if (previa.estado === 'usado') throw new TokenUsadoError();
    if (previa.estado === 'vencido') throw new TokenVencidoError();
    if (previa.estado !== 'vigente' || previa.proposito !== comando.proposito) throw new TokenInvalidoError();

    // El hash se calcula fuera de la transaccion; la autoridad del uso unico es el consumo.
    const nuevoPasswordHash = await this.hash.hash(contrasena);
    const resultado = await this.tokensCuenta.consumir({
      tokenHash,
      proposito: comando.proposito,
      nuevoPasswordHash,
      ahora: this.reloj.ahora(),
    });
    switch (resultado.resultado) {
      case 'consumido':
        return;
      case 'usado':
        throw new TokenUsadoError();
      case 'vencido':
        throw new TokenVencidoError();
      default:
        throw new TokenInvalidoError();
    }
  }
}
