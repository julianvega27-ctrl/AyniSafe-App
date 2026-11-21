import { CorreoEnUsoError, ValidacionError } from '../dominio/errores';
import { aUsuarioPublico, type UsuarioPublico } from '../dominio/usuario';
import { validarRegistro } from '../dominio/validacion';
import { aplicarLimites } from './limitar';
import type { PoliticaLimites } from './politica-limites';
import type { CuentasPort } from './puertos/cuentas.port';
import type { HashContrasenaPort } from './puertos/hash-contrasena.port';
import type { LimitadorPort } from './puertos/limitador.port';
import type { RelojPort } from './puertos/reloj.port';

export interface RegistrarCiudadanoComando {
  /** Cuerpo sin validar: la validacion es responsabilidad de este caso de uso. */
  readonly cuerpo: unknown;
  readonly ip: string;
}

export class RegistrarCiudadanoUseCase {
  constructor(
    private readonly cuentas: CuentasPort,
    private readonly hash: HashContrasenaPort,
    private readonly limitador: LimitadorPort,
    private readonly reloj: RelojPort,
    private readonly politica: PoliticaLimites,
  ) {}

  async ejecutar(comando: RegistrarCiudadanoComando): Promise<UsuarioPublico> {
    const validado = validarRegistro(comando.cuerpo);
    if (!validado.ok) throw new ValidacionError(validado.campos);
    const { nombre, correoNormalizado, contrasena } = validado.valor;

    // Se cuentan las solicitudes validas sintacticamente antes de calcular el hash.
    await aplicarLimites(
      this.limitador,
      [{ tipo: 'registro_ip', identificador: comando.ip, maximo: this.politica.registroPorIp }],
      this.reloj.ahora(),
    );

    // Comprobacion previa solo para ahorrar el hash; la restriccion UNIQUE es la autoridad.
    if (await this.cuentas.buscarPorCorreo(correoNormalizado)) throw new CorreoEnUsoError();

    // El hash se calcula fuera de la transaccion de alta.
    const passwordHash = await this.hash.hash(contrasena);
    const usuario = await this.cuentas.crearCiudadano({ nombre, correoNormalizado, passwordHash });
    return aUsuarioPublico(usuario);
  }
}
