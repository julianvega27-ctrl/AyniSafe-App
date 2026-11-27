import { NoAutenticadoError } from '../dominio/errores';
import type { ConsultarSesionInstitucionalUseCase } from './consultar-sesion-institucional.use-case';
import type { ConsultarSesionUseCase } from './consultar-sesion.use-case';

/**
 * Quien hace una solicitud, para capacidades de otros modulos que admiten envio anonimo (P4.1):
 * - `anonimo`: sin Authorization ni sesion institucional vigente;
 * - `ciudadano`: Bearer de un ciudadano activo; la identidad sale del servidor;
 * - `institucional`: cookie de una sesion vigente de operador o administrador, con su id y rol (P4.2);
 * - `invalido`: hay Authorization pero no corresponde a un ciudadano activo (no se degrada a anonimo).
 */
export type Solicitante =
  | { readonly tipo: 'anonimo' }
  | { readonly tipo: 'ciudadano'; readonly usuarioId: string }
  | { readonly tipo: 'institucional'; readonly usuarioId: string; readonly rol: 'operador' | 'administrador' }
  | { readonly tipo: 'invalido' };

export interface CredencialesSolicitud {
  /** Valor crudo de la cabecera Authorization, si existe. */
  readonly authorization?: string;
  /** Valor de la cookie de sesion institucional, si existe. */
  readonly cookieInstitucional?: string;
}

export class IdentificarSolicitanteUseCase {
  constructor(
    private readonly ciudadano: ConsultarSesionUseCase,
    private readonly institucional: ConsultarSesionInstitucionalUseCase,
  ) {}

  /** Fallos de almacenamiento se propagan: el llamador responde 503 sin registrar nada. */
  async ejecutar(credenciales: CredencialesSolicitud): Promise<Solicitante> {
    if (credenciales.authorization !== undefined) {
      const token = /^Bearer ([^\s]+)$/i.exec(credenciales.authorization)?.[1];
      try {
        const sesion = await this.ciudadano.ejecutar(token);
        return { tipo: 'ciudadano', usuarioId: sesion.usuario.id };
      } catch (e) {
        if (e instanceof NoAutenticadoError) return { tipo: 'invalido' };
        throw e;
      }
    }
    if (credenciales.cookieInstitucional !== undefined) {
      try {
        const sesion = await this.institucional.ejecutar(credenciales.cookieInstitucional);
        return { tipo: 'institucional', usuarioId: sesion.usuario.id, rol: sesion.usuario.rol };
      } catch (e) {
        if (!(e instanceof NoAutenticadoError)) throw e;
      }
    }
    return { tipo: 'anonimo' };
  }
}
