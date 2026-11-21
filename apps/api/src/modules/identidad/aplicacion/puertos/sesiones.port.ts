import type { Sesion } from '../../dominio/sesion';
import type { Usuario } from '../../dominio/usuario';

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
   * Persiste la sesion solo si el usuario sigue siendo un ciudadano activo, bloqueando su fila
   * durante la transaccion para no emitir sobre una suspension concurrente. Devuelve null si el
   * usuario ya no esta habilitado. Un fallo lanza ServicioNoDisponibleError sin dejar sesion.
   */
  crearSiUsuarioHabilitado(nueva: NuevaSesion): Promise<Sesion | null>;
  /**
   * Sesion vigente (no revocada y con expiresAt posterior a `ahora`) de un ciudadano activo.
   * null en cualquier otro caso.
   */
  buscarVigente(tokenHash: string, ahora: Date): Promise<SesionConUsuario | null>;
  /** Revoca solo la sesion indicada. Idempotente: inexistente o ya revocada no es un error. */
  revocar(tokenHash: string, ahora: Date): Promise<void>;
}
