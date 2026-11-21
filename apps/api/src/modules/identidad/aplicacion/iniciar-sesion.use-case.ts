import { CredencialesInvalidasError, ValidacionError } from '../dominio/errores';
import { DURACION_SESION_MS } from '../dominio/sesion';
import { aUsuarioPublico, esCiudadanoActivo, type UsuarioPublico } from '../dominio/usuario';
import { validarLogin } from '../dominio/validacion';
import { aplicarLimites } from './limitar';
import type { PoliticaLimites } from './politica-limites';
import type { CuentasPort } from './puertos/cuentas.port';
import type { HashContrasenaPort } from './puertos/hash-contrasena.port';
import type { LimitadorPort } from './puertos/limitador.port';
import type { RelojPort } from './puertos/reloj.port';
import type { SesionesPort } from './puertos/sesiones.port';
import type { TokenPort } from './puertos/token.port';

export interface IniciarSesionComando {
  readonly cuerpo: unknown;
  readonly ip: string;
}

export interface SesionIniciada {
  readonly token: string;
  readonly expiresAt: Date;
  readonly usuario: UsuarioPublico;
}

export class IniciarSesionUseCase {
  constructor(
    private readonly cuentas: CuentasPort,
    private readonly sesiones: SesionesPort,
    private readonly hash: HashContrasenaPort,
    private readonly tokens: TokenPort,
    private readonly limitador: LimitadorPort,
    private readonly reloj: RelojPort,
    private readonly politica: PoliticaLimites,
  ) {}

  async ejecutar(comando: IniciarSesionComando): Promise<SesionIniciada> {
    const validado = validarLogin(comando.cuerpo);
    if (!validado.ok) throw new ValidacionError(validado.campos);
    const { correoNormalizado, contrasena } = validado.valor;

    await aplicarLimites(
      this.limitador,
      [
        { tipo: 'login_ip', identificador: comando.ip, maximo: this.politica.loginPorIp },
        {
          tipo: 'login_correo_ip',
          identificador: `${correoNormalizado}|${comando.ip}`,
          maximo: this.politica.loginPorCorreoIp,
        },
      ],
      this.reloj.ahora(),
    );

    const usuario = await this.cuentas.buscarPorCorreo(correoNormalizado);
    const habilitado = usuario !== null && esCiudadanoActivo(usuario);

    // Cuentas inexistentes o no admitidas ejecutan una verificacion de costo comparable.
    const coincide =
      habilitado && usuario
        ? await this.hash.verificar(usuario.passwordHash, contrasena)
        : await this.hash.verificarFicticio(contrasena);
    if (!habilitado || !usuario || !coincide) throw new CredencialesInvalidasError();

    const { token, tokenHash } = this.tokens.generar();
    const ahora = this.reloj.ahora();
    const sesion = await this.sesiones.crearSiUsuarioHabilitado({
      usuarioId: usuario.id,
      tokenHash,
      createdAt: ahora,
      expiresAt: new Date(ahora.getTime() + DURACION_SESION_MS),
    });
    // La cuenta fue suspendida entre la verificacion y la emision: mismo error uniforme.
    if (!sesion) throw new CredencialesInvalidasError();

    return { token, expiresAt: sesion.expiresAt, usuario: aUsuarioPublico(usuario) };
  }
}
