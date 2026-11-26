import { CorreoEnUsoError } from './errores';

/**
 * Organizacion institucional (P3.2): instituciones cerradas, sedes, operadores, coberturas por
 * distrito y competencias por categoria. Reglas puras, sin persistencia ni HTTP.
 */

export const TIPOS_INSTITUCION = ['pnp', 'bomberos', 'samu', 'serenazgo'] as const;
export type TipoInstitucion = (typeof TIPOS_INSTITUCION)[number];

export interface Institucion {
  readonly id: TipoInstitucion;
  readonly tipo: TipoInstitucion;
  readonly nombre: string;
  readonly contacto: string | null;
  readonly activa: boolean;
}

export type EstadoVerificacion = 'sin_verificar' | 'verificada';

export interface Sede {
  readonly id: string;
  readonly institucionId: TipoInstitucion;
  readonly nombre: string;
  readonly distritoUbicacionId: string | null;
  readonly direccion: string | null;
  readonly contacto: string | null;
  readonly verificacion: {
    readonly estado: EstadoVerificacion;
    readonly fuente: string | null;
    /** Fecha de contraste en formato AAAA-MM-DD. */
    readonly fecha: string | null;
  };
  readonly habilitadaAtencion: boolean;
  readonly activa: boolean;
  readonly esDemostracion: boolean;
  /** Distritos de cobertura, ordenados. La ubicacion no implica cobertura. */
  readonly distritos: readonly string[];
  /** Categorias de competencia, ordenadas. */
  readonly categorias: readonly string[];
}

export type EstadoOperador = 'activo' | 'suspendido' | 'pendiente_activacion';

export interface OperadorSede {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly estado: EstadoOperador;
  readonly sedeId: string;
  readonly esDemostracion: boolean;
}

/** Datos que determinan si una sede puede habilitarse para atencion. */
export interface EstadoParaHabilitar {
  readonly institucionActiva: boolean;
  readonly sedeActiva: boolean;
  readonly verificada: boolean;
  readonly distritos: number;
  readonly categorias: number;
  readonly operadoresActivos: number;
}

export type RequisitoHabilitacion =
  | 'institucion_activa'
  | 'sede_activa'
  | 'sede_verificada'
  | 'cobertura'
  | 'competencias'
  | 'operador_activo';

/** Requisitos incumplidos, en orden estable. Vacio significa que puede habilitarse. */
export function requisitosFaltantes(estado: EstadoParaHabilitar): RequisitoHabilitacion[] {
  const faltantes: RequisitoHabilitacion[] = [];
  if (!estado.institucionActiva) faltantes.push('institucion_activa');
  if (!estado.sedeActiva) faltantes.push('sede_activa');
  if (!estado.verificada) faltantes.push('sede_verificada');
  if (estado.distritos < 1) faltantes.push('cobertura');
  if (estado.categorias < 1) faltantes.push('competencias');
  if (estado.operadoresActivos < 1) faltantes.push('operador_activo');
  return faltantes;
}

/** Ambito resuelto de un operador. Nulo (ambito vacio) si la cuenta, sede o institucion no estan activas. */
export interface AmbitoOperador {
  readonly institucion: { readonly id: TipoInstitucion; readonly nombre: string };
  readonly sede: { readonly id: string; readonly nombre: string };
  readonly distritos: readonly string[];
  readonly categorias: readonly string[];
  readonly habilitadaAtencion: boolean;
}

/** Normaliza un nombre de sede para la unicidad por institucion: recorta, colapsa espacios y minusculas. */
export function normalizarNombreSede(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

// --- Errores de dominio -------------------------------------------------------------------

/** El correo del operador ya pertenece a otra cuenta: mismo codigo HTTP que el registro, otro mensaje. */
export class CorreoOperadorEnUsoError extends CorreoEnUsoError {
  constructor() {
    super();
    this.name = 'CorreoOperadorEnUsoError';
  }
}

/** Ya existe una sede con ese nombre normalizado en la institucion. */
export class SedeExistenteError extends Error {
  constructor() {
    super('Sede existente');
    this.name = 'SedeExistenteError';
  }
}

/** La sede no cumple los requisitos para habilitarse; `faltantes` no contiene datos personales. */
export class RequisitosHabilitacionError extends Error {
  constructor(readonly faltantes: readonly RequisitoHabilitacion[]) {
    super('Requisitos de habilitacion incumplidos');
    this.name = 'RequisitosHabilitacionError';
  }
}

export type CodigoConflictoOrganizacion =
  | 'ULTIMO_OPERADOR_ACTIVO'
  | 'SEDE_HABILITADA'
  | 'INVITACION_NO_APLICABLE';

/** Operacion que romperia una invariante de la organizacion. */
export class ConflictoOrganizacionError extends Error {
  constructor(readonly codigo: CodigoConflictoOrganizacion) {
    super('Conflicto de organizacion');
    this.name = 'ConflictoOrganizacionError';
  }
}

/** Recurso de organizacion inexistente (o que no es un operador con sede). */
export class RecursoNoEncontradoError extends Error {
  constructor() {
    super('Recurso no encontrado');
    this.name = 'RecursoNoEncontradoError';
  }
}
