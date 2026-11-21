import { NoAutenticadoError, ValidacionError } from '../dominio/errores';
import type { PerfilCiudadano } from '../dominio/usuario';
import { validarCambiosPerfil } from '../dominio/validacion';
import type { CuentasPort } from './puertos/cuentas.port';
import type { RelojPort } from './puertos/reloj.port';

/** El perfil siempre es el del titular de la sesion: el identificador no viene del cliente. */
export class ConsultarPerfilUseCase {
  constructor(private readonly cuentas: CuentasPort) {}

  async ejecutar(usuarioId: string): Promise<PerfilCiudadano> {
    const perfil = await this.cuentas.obtenerPerfil(usuarioId);
    if (!perfil) throw new NoAutenticadoError();
    return perfil;
  }
}

export class ActualizarPerfilUseCase {
  constructor(
    private readonly cuentas: CuentasPort,
    private readonly reloj: RelojPort,
  ) {}

  async ejecutar(usuarioId: string, cuerpo: unknown): Promise<PerfilCiudadano> {
    const validado = validarCambiosPerfil(cuerpo);
    if (!validado.ok) throw new ValidacionError(validado.campos);
    const perfil = await this.cuentas.actualizarPerfil(usuarioId, validado.valor, this.reloj.ahora());
    if (!perfil) throw new NoAutenticadoError();
    return perfil;
  }
}
