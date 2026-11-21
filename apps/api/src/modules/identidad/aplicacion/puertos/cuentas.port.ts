import type { Usuario } from '../../dominio/usuario';

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
}
