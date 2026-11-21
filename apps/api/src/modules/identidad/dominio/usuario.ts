export type Rol = 'ciudadano' | 'operador' | 'administrador';
export type EstadoUsuario = 'activo' | 'suspendido' | 'pendiente_activacion';

/** Cuenta persistida. Contiene el hash: nunca se expone fuera del modulo. */
export interface Usuario {
  readonly id: string;
  readonly nombre: string;
  readonly correoNormalizado: string;
  /** Nulo solo si la cuenta esta pendiente de activacion: nadie puede autenticar con ella. */
  readonly passwordHash: string | null;
  readonly rol: Rol;
  readonly estado: EstadoUsuario;
  readonly createdAt: Date;
}

/** Identidad basica que puede salir en respuestas de acceso. Sin hash ni datos internos. */
export interface UsuarioPublico {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: 'ciudadano';
}

/** Proyeccion segura de una cuenta ciudadana para respuestas de acceso. */
export function aUsuarioPublico(usuario: Usuario): UsuarioPublico {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correoNormalizado,
    rol: 'ciudadano',
  };
}

/** Cuenta que puede usar el acceso ciudadano: rol ciudadano y estado activo. */
export function esCiudadanoActivo(usuario: Usuario): boolean {
  return usuario.rol === 'ciudadano' && usuario.estado === 'activo';
}
