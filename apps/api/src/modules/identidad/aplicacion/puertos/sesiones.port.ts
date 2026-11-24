import type { Sesion } from '../../dominio/sesion';
import type { Rol, Usuario } from '../../dominio/usuario';

export interface NuevaSesion {
  readonly usuarioId: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface SesionConUsuario {
  readonly sesion: Sesion;
  readonly usuario: Usuario;
}

export interface SesionesPort {
  /**
   * Persiste la sesion solo si el usuario sigue activo y su rol esta entre los `roles` admitidos
   * (ciudadano para la app; administrador y operador para la web), bloqueando su fila durante la
   * transaccion para no emitir sobre una suspension concurrente. Devuelve null si el usuario ya
   * no esta habilitado. Un fallo lanza ServicioNoDisponibleError sin dejar sesion.
   */
  crearSiUsuarioHabilitado(nueva: NuevaSesion, roles: readonly Rol[]): Promise<Sesion | null>;
  /**
   * Sesion vigente (no revocada y con expiresAt posterior a `ahora`) de un usuario activo cuyo
   * rol esta entre los `roles` admitidos. null en cualquier otro caso: una sesion de un rol no
   * valida nunca para otro canal.
   */
  buscarVigente(tokenHash: string, ahora: Date, roles: readonly Rol[]): Promise<SesionConUsuario | null>;
  /** Revoca solo la sesion indicada. Idempotente: inexistente o ya revocada no es un error. */
  revocar(tokenHash: string, ahora: Date): Promise<void>;
  /**
   * Revoca todas las sesiones aun no revocadas del usuario y devuelve cuantas. Las de otros
   * usuarios no se tocan. Idempotente. Un fallo lanza ServicioNoDisponibleError.
   */
  revocarTodasDe(usuarioId: string, ahora: Date): Promise<number>;
}
