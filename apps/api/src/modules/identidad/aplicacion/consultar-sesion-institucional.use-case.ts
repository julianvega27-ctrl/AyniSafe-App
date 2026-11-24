import { NoAutenticadoError } from '../dominio/errores';
import { aUsuarioInstitucional, esInstitucionalActivo, ROLES_INSTITUCIONALES, type UsuarioInstitucional } from '../dominio/usuario';
import { TOKEN_LONGITUD_MAX } from './consultar-sesion.use-case';
import type { RelojPort } from './puertos/reloj.port';
import type { SesionesPort } from './puertos/sesiones.port';
import type { TokenPort } from './puertos/token.port';

export interface SesionInstitucionalActual {
  readonly usuario: UsuarioInstitucional;
  readonly expiresAt: Date;
}

export class ConsultarSesionInstitucionalUseCase {
  constructor(
    private readonly sesiones: SesionesPort,
    private readonly tokens: TokenPort,
    private readonly reloj: RelojPort,
  ) {}

  /** La identidad sale siempre del servidor; cada peticion revalida estado y rol de la cuenta. */
  async ejecutar(token: string | undefined): Promise<SesionInstitucionalActual> {
    if (!token || token.length > TOKEN_LONGITUD_MAX) throw new NoAutenticadoError();
    const encontrada = await this.sesiones.buscarVigente(
      this.tokens.huella(token),
      this.reloj.ahora(),
      ROLES_INSTITUCIONALES,
    );
    if (!encontrada || !esInstitucionalActivo(encontrada.usuario)) throw new NoAutenticadoError();
    return { usuario: aUsuarioInstitucional(encontrada.usuario), expiresAt: encontrada.sesion.expiresAt };
  }
}
