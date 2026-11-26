import type {
  AmbitoOperador,
  EstadoOperador,
  Institucion,
  OperadorSede,
  Sede,
  TipoInstitucion,
} from '../../dominio/organizacion';
import type { CambiosInstitucionValidos, CambiosSedeValidos } from '../../dominio/validacion-organizacion';
import type { ContextoTransaccional } from './envios-correo.port';

export interface DatosSedeNueva {
  readonly institucionId: TipoInstitucion;
  readonly nombre: string;
  readonly nombreNormalizado: string;
  readonly distritoUbicacionId: string | null;
  readonly direccion: string | null;
  readonly contacto: string | null;
  readonly esDemostracion: boolean;
  readonly creadoPor: string;
}

export interface DatosOperadorNuevo {
  readonly nombre: string;
  readonly correoNormalizado: string;
  readonly sedeId: string;
  readonly esDemostracion: boolean;
}

/**
 * Pasos disponibles dentro de una transaccion de organizacion. La aplicacion los orquesta sin
 * conocer la BD; `contexto` es el valor opaco que la invitacion necesita para encolar su envio en
 * la misma transaccion.
 */
export interface TransaccionOrganizacion {
  readonly contexto: ContextoTransaccional;
  /** Bloqueo compartido de la institucion. Falso si no existe o esta inactiva. */
  bloquearInstitucionActiva(id: TipoInstitucion): Promise<boolean>;
  /** Bloqueo compartido de la sede. Falso si no existe. */
  bloquearSede(id: string): Promise<boolean>;
  /** Devuelve el ID de la nueva sede o nulo si el nombre normalizado ya existe en la institucion. */
  insertarSede(datos: DatosSedeNueva): Promise<string | null>;
  /**
   * Crea la cuenta operador `pendiente_activacion` sin contrasena y su pertenencia a la sede.
   * Devuelve su ID o nulo si el correo normalizado ya pertenece a otra cuenta.
   */
  insertarOperadorPendiente(datos: DatosOperadorNuevo): Promise<string | null>;
  /**
   * Bloquea la cuenta de un operador con sede e invalida sus enlaces de activacion sin usar.
   * Devuelve su estado, o nulo si el ID no es un operador con sede.
   */
  prepararReenvio(usuarioId: string): Promise<EstadoOperador | null>;
}

/**
 * Persistencia de la organizacion. Lanza `ServicioNoDisponibleError` ante fallos del
 * almacenamiento y los errores de dominio de `organizacion.ts` cuando una invariante lo impide.
 * Las operaciones que devuelven nulo indican recurso inexistente.
 */
export interface OrganizacionPort {
  /** Ejecuta `fn` en una transaccion: si lanza, nada de lo hecho dentro se confirma. */
  enTransaccion<T>(fn: (tx: TransaccionOrganizacion) => Promise<T>): Promise<T>;
  listarInstituciones(): Promise<Institucion[]>;
  /** Rechaza desactivar una institucion con sedes habilitadas (SEDE_HABILITADA). */
  actualizarInstitucion(id: TipoInstitucion, cambios: CambiosInstitucionValidos): Promise<Institucion | null>;
  listarSedes(): Promise<Sede[]>;
  obtenerSede(id: string): Promise<Sede | null>;
  /**
   * Desactivar la sede tambien la deshabilita para atencion. Quitar la verificacion de una sede
   * habilitada se rechaza (SEDE_HABILITADA). Un nombre repetido lanza `SedeExistenteError`.
   */
  actualizarSede(id: string, cambios: CambiosSedeValidos): Promise<Sede | null>;
  /** Reemplaza el conjunto completo. Dejarlo vacio en una sede habilitada se rechaza. */
  reemplazarCobertura(id: string, distritos: readonly string[]): Promise<Sede | null>;
  reemplazarCompetencias(id: string, categorias: readonly string[]): Promise<Sede | null>;
  /** Bloquea la sede y evalua requisitos; lanza `RequisitosHabilitacionError` si falta alguno. */
  habilitar(id: string): Promise<Sede | null>;
  deshabilitar(id: string): Promise<Sede | null>;
  /** Nulo si la sede no existe. */
  listarOperadores(sedeId: string): Promise<OperadorSede[] | null>;
  /**
   * Suspender revoca las sesiones y los enlaces de activacion sin usar del operador en la misma
   * transaccion (tambien si aun estaba pendiente); dejar sin operador activo
   * una sede habilitada se rechaza (ULTIMO_OPERADOR_ACTIVO). Reactivar devuelve la cuenta a activa
   * o, si nunca se activo, a pendiente de activacion.
   */
  cambiarEstadoOperador(id: string, estado: 'activo' | 'suspendido', ahora: Date): Promise<OperadorSede | null>;
  /** Ambito vigente del operador o nulo (ambito vacio) si la cuenta, sede o institucion no estan activas. */
  ambitoDeOperador(usuarioId: string): Promise<AmbitoOperador | null>;
}

/**
 * Catalogo de identificadores de otro modulo (distritos de Consultas, categorias de Reportes).
 * La composicion lo implementa con la fachada del modulo propietario.
 */
export interface CatalogoIdsPort {
  idsValidos(): Promise<ReadonlySet<string>>;
}
