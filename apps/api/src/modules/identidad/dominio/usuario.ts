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

/** Perfil del propio ciudadano. Sin hash ni datos internos: solo sale por `/perfil`. */
export interface PerfilCiudadano {
  readonly id: string;
  readonly nombre: string;
  /** Solo lectura: el correo es la clave de identidad y no se edita desde el perfil. */
  readonly correo: string;
  readonly telefono: string | null;
  /** Autorizacion vigente para compartir el telefono (nada se comparte todavia). */
  readonly compartirTelefono: boolean;
}

/** Cuenta que puede usar el acceso ciudadano: rol ciudadano y estado activo. */
export function esCiudadanoActivo(usuario: Usuario): boolean {
  return usuario.rol === 'ciudadano' && usuario.estado === 'activo';
}

export type RolInstitucional = 'administrador' | 'operador';

/** Roles que pueden usar el acceso institucional (web). El ciudadano usa solo la app. */
export const ROLES_INSTITUCIONALES: readonly Rol[] = ['administrador', 'operador'];

/** Identidad basica de una cuenta institucional. Sin hash ni datos internos. */
export interface UsuarioInstitucional {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: RolInstitucional;
}

/** Cuenta que puede usar el acceso institucional: administrador u operador en estado activo. */
export function esInstitucionalActivo(usuario: Usuario): boolean {
  return (usuario.rol === 'administrador' || usuario.rol === 'operador') && usuario.estado === 'activo';
}

/** Proyeccion segura de una cuenta institucional. Solo debe usarse si `esInstitucionalActivo`. */
export function aUsuarioInstitucional(usuario: Usuario): UsuarioInstitucional {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correoNormalizado,
    rol: usuario.rol === 'administrador' ? 'administrador' : 'operador',
  };
}
