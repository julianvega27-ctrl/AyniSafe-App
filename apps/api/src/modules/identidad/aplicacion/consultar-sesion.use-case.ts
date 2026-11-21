import { NoAutenticadoError } from '../dominio/errores';
import { aUsuarioPublico, esCiudadanoActivo, type UsuarioPublico } from '../dominio/usuario';
import type { RelojPort } from './puertos/reloj.port';
import type { SesionesPort } from './puertos/sesiones.port';
import type { TokenPort } from './puertos/token.port';

export interface SesionActual {
  readonly usuario: UsuarioPublico;
  readonly expiresAt: Date;
}

/** Longitud maxima razonable de un token presentado (el emitido mide 43 caracteres). */
export const TOKEN_LONGITUD_MAX = 512;

export class ConsultarSesionUseCase {
  constructor(
    private readonly sesiones: SesionesPort,
    private readonly tokens: TokenPort,
    private readonly reloj: RelojPort,
  ) {}

  /** Devuelve solo la identidad del propietario del token. La identidad no viene del cliente. */
  async ejecutar(token: string | undefined): Promise<SesionActual> {
    if (!token || token.length > TOKEN_LONGITUD_MAX) throw new NoAutenticadoError();
    const encontrada = await this.sesiones.buscarVigente(this.tokens.huella(token), this.reloj.ahora());
    // Cada peticion comprueba tambien el estado actual de la cuenta.
    if (!encontrada || !esCiudadanoActivo(encontrada.usuario)) throw new NoAutenticadoError();
    return { usuario: aUsuarioPublico(encontrada.usuario), expiresAt: encontrada.sesion.expiresAt };
  }
}
