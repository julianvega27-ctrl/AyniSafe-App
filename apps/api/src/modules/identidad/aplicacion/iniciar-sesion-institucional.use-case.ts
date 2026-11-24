import { CredencialesInvalidasError, ValidacionError } from '../dominio/errores';
import { DURACION_SESION_MS } from '../dominio/sesion';
import {
  aUsuarioInstitucional,
  esInstitucionalActivo,
  ROLES_INSTITUCIONALES,
  type UsuarioInstitucional,
} from '../dominio/usuario';
import { validarLogin } from '../dominio/validacion';
import { aplicarLimites } from './limitar';
import type { PoliticaLimites } from './politica-limites';
import type { CuentasPort } from './puertos/cuentas.port';
import type { HashContrasenaPort } from './puertos/hash-contrasena.port';
import type { LimitadorPort } from './puertos/limitador.port';
import type { RelojPort } from './puertos/reloj.port';
import type { SesionesPort } from './puertos/sesiones.port';
import type { TokenPort } from './puertos/token.port';

export interface IniciarSesionInstitucionalComando {
  readonly cuerpo: unknown;
  readonly ip: string;
}

export interface SesionInstitucionalIniciada {
  /** Token en claro: solo para la cookie. Nunca se devuelve en el cuerpo. */
  readonly token: string;
  readonly expiresAt: Date;
  readonly usuario: UsuarioInstitucional;
}

/**
 * Inicio de sesion de administradores y operadores. Mismas garantias que el acceso ciudadano:
 * un ciudadano, una cuenta suspendida, pendiente o inexistente y una contrasena incorrecta dan el
 * mismo error y un costo de verificacion comparable. Los contadores de intentos son propios.
 */
export class IniciarSesionInstitucionalUseCase {
  constructor(
    private readonly cuentas: CuentasPort,
    private readonly sesiones: SesionesPort,
    private readonly hash: HashContrasenaPort,
    private readonly tokens: TokenPort,
    private readonly limitador: LimitadorPort,
    private readonly reloj: RelojPort,
    private readonly politica: PoliticaLimites,
  ) {}

  async ejecutar(comando: IniciarSesionInstitucionalComando): Promise<SesionInstitucionalIniciada> {
    const validado = validarLogin(comando.cuerpo);
    if (!validado.ok) throw new ValidacionError(validado.campos);
    const { correoNormalizado, contrasena } = validado.valor;

    await aplicarLimites(
      this.limitador,
      [
        { tipo: 'login_inst_ip', identificador: comando.ip, maximo: this.politica.loginInstPorIp },
        {
          tipo: 'login_inst_correo_ip',
          identificador: `${correoNormalizado}|${comando.ip}`,
          maximo: this.politica.loginInstPorCorreoIp,
        },
      ],
      this.reloj.ahora(),
    );

    const usuario = await this.cuentas.buscarPorCorreo(correoNormalizado);
    // Ciudadanos, cuentas no activas y pendientes (hash nulo) quedan excluidos sin distinguirse.
    const hashDeLaCuenta =
      usuario !== null && esInstitucionalActivo(usuario) ? usuario.passwordHash : null;

    const coincide =
      hashDeLaCuenta !== null
        ? await this.hash.verificar(hashDeLaCuenta, contrasena)
        : await this.hash.verificarFicticio(contrasena);
    if (hashDeLaCuenta === null || !usuario || !coincide) throw new CredencialesInvalidasError();

    const { token, tokenHash } = this.tokens.generar();
    const ahora = this.reloj.ahora();
    const sesion = await this.sesiones.crearSiUsuarioHabilitado(
      {
        usuarioId: usuario.id,
        tokenHash,
        createdAt: ahora,
        expiresAt: new Date(ahora.getTime() + DURACION_SESION_MS),
      },
      ROLES_INSTITUCIONALES,
    );
    // Suspendida entre la verificacion y la emision: mismo error uniforme.
    if (!sesion) throw new CredencialesInvalidasError();

    return { token, expiresAt: sesion.expiresAt, usuario: aUsuarioInstitucional(usuario) };
  }
}
