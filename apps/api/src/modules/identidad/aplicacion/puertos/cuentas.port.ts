import type { PerfilCiudadano, Usuario } from '../../dominio/usuario';
import type { CambiosPerfilValidos } from '../../dominio/validacion';

export interface NuevaCuentaCiudadano {
  readonly nombre: string;
  readonly correoNormalizado: string;
  readonly passwordHash: string;
}

/**
 * Persistencia de cuentas. El rol (ciudadano) y el estado (activo) del alta publica los fija
 * la implementacion: el llamador no puede elegirlos.
 */
export interface CuentasPort {
  /**
   * Alta atomica. Lanza CorreoEnUsoError si el correo normalizado ya existe y
   * ServicioNoDisponibleError ante cualquier otro fallo de almacenamiento; en ambos casos no
   * queda un registro parcial.
   */
  crearCiudadano(datos: NuevaCuentaCiudadano): Promise<Usuario>;
  buscarPorCorreo(correoNormalizado: string): Promise<Usuario | null>;
  buscarPorId(id: string): Promise<Usuario | null>;
  /** Perfil del propio ciudadano (sin hash). Nulo si la cuenta no existe. */
  obtenerPerfil(id: string): Promise<PerfilCiudadano | null>;
  /**
   * Aplica los cambios en una transaccion que bloquea la fila, con las reglas de `resolverPerfil`.
   * Lanza ValidacionError si la autorizacion no es coherente y ServicioNoDisponibleError ante un
   * fallo de almacenamiento, sin cambios parciales. Nulo si la cuenta no existe.
   */
  actualizarPerfil(id: string, cambios: CambiosPerfilValidos, ahora: Date): Promise<PerfilCiudadano | null>;
}
