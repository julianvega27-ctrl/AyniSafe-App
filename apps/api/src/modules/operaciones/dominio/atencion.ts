import { ESTADOS_INCIDENTE, type EstadoIncidente } from './incidente';
import type { Papel } from './matriz';

/**
 * Atencion institucional (P6, spec `operaciones/atencion-institucional`). Reglas puras: transiciones
 * permitidas, acciones por papel y asignacion, y validacion de los cuerpos. Documento 11 §2.
 */
export const VERIFICACIONES = ['SIN_VERIFICAR', 'VERIFICADO', 'NO_VERIFICADO'] as const;
export type Verificacion = (typeof VERIFICACIONES)[number];
export const RESULTADOS = ['ATENDIDO', 'DESCARTADO'] as const;
export type Resultado = (typeof RESULTADOS)[number];

export type Accion =
  | 'asumir'
  | 'iniciar_atencion'
  | 'cerrar_atendido'
  | 'descartar'
  | 'verificar'
  | 'vincular'
  | 'priorizar';

export interface ContextoAcciones {
  readonly estado: EstadoIncidente;
  readonly papel: Papel;
  /** La institucion del operador ya tiene un responsable activo. */
  readonly institucionConResponsable: boolean;
  /** El operador es ese responsable. */
  readonly esResponsable: boolean;
  /** Vinculado como duplicado (grupo B): sin acciones propias salvo asumir. */
  readonly vinculado?: boolean;
}

/** Acciones que el operador puede ejecutar ahora. La API autoriza con esta misma regla. */
export function accionesPermitidas(c: ContextoAcciones): readonly Accion[] {
  if (c.estado === 'CERRADO') return [];
  const acciones: Accion[] = [];
  if (!c.institucionConResponsable) acciones.push('asumir');
  if (!c.esResponsable || c.papel !== 'principal' || c.vinculado) return acciones;
  if (c.estado === 'EN_REVISION') acciones.push('iniciar_atencion');
  if (c.estado === 'EN_ATENCION') acciones.push('cerrar_atendido');
  if (c.estado === 'REGISTRADO' || c.estado === 'EN_REVISION') acciones.push('descartar');
  acciones.push('verificar', 'vincular', 'priorizar');
  return acciones;
}

/** Estado destino de una transicion o null si no esta permitida desde `desde`. */
export function destinoTransicion(desde: EstadoIncidente, accion: 'iniciar_atencion' | 'cerrar', resultado?: Resultado): EstadoIncidente | null {
  if (accion === 'iniciar_atencion') return desde === 'EN_REVISION' ? 'EN_ATENCION' : null;
  if (resultado === 'ATENDIDO') return desde === 'EN_ATENCION' ? 'CERRADO' : null;
  if (resultado === 'DESCARTADO') return desde === 'REGISTRADO' || desde === 'EN_REVISION' ? 'CERRADO' : null;
  return null;
}

export class ValidacionAtencionError extends Error {
  constructor(readonly campos: Readonly<Record<string, string>>) {
    super('Datos de atencion invalidos');
    this.name = 'ValidacionAtencionError';
  }
}

export type CodigoConflicto =
  | 'CASO_ASUMIDO'
  | 'ESTADO_CAMBIADO'
  | 'TRANSICION_NO_PERMITIDA'
  | 'INCIDENTE_CERRADO'
  | 'DESTINO_NO_VALIDO'
  | 'ASIGNACION_INACTIVA'
  | 'INCIDENTE_VINCULADO'
  | 'VINCULO_NO_PERMITIDO';

export class ConflictoAtencionError extends Error {
  constructor(
    readonly codigo: CodigoConflicto,
    readonly estadoActual?: EstadoIncidente,
  ) {
    super(`Conflicto de atencion: ${codigo}`);
    this.name = 'ConflictoAtencionError';
  }
}

export class PermisoAtencionError extends Error {
  constructor(readonly codigo: 'ASIGNACION_REQUERIDA' | 'NO_PRINCIPAL') {
    super(`Permiso de atencion: ${codigo}`);
    this.name = 'PermisoAtencionError';
  }
}

/** Mismo error para inexistente, fuera de ambito o identificador malformado. */
export class AtencionNoDisponibleError extends Error {
  constructor() {
    super('Incidente no disponible');
    this.name = 'AtencionNoDisponibleError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

function objeto(entrada: unknown, permitidos: readonly string[], campos: Record<string, string>): Record<string, unknown> {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    throw new ValidacionAtencionError({ cuerpo: 'Envía un objeto JSON.' });
  }
  const e = entrada as Record<string, unknown>;
  for (const clave of Object.keys(e)) if (!permitidos.includes(clave)) campos[clave] = 'Campo no admitido.';
  return e;
}

function texto(valor: unknown, min: number, max: number): string | null {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  const n = [...t].length;
  return n >= min && n <= max ? t : null;
}

const MOTIVO = 'Escribe un motivo de 10 a 500 caracteres.';

function estadoEsperado(e: Record<string, unknown>, campos: Record<string, string>): EstadoIncidente {
  if (!(ESTADOS_INCIDENTE as readonly unknown[]).includes(e.estadoEsperado)) campos.estadoEsperado = 'Indica el estado actual del incidente.';
  return e.estadoEsperado as EstadoIncidente;
}

export type SolicitudTransicion =
  | { readonly accion: 'iniciar_atencion'; readonly estadoEsperado: EstadoIncidente }
  | {
      readonly accion: 'cerrar';
      readonly estadoEsperado: EstadoIncidente;
      readonly resultado: Resultado;
      readonly motivo: string;
      readonly resumenCiudadano: string;
    };

export function validarTransicion(entrada: unknown): SolicitudTransicion {
  const campos: Record<string, string> = {};
  const e = objeto(entrada, ['accion', 'estadoEsperado', 'resultado', 'motivo', 'resumenCiudadano'], campos);
  const esperado = estadoEsperado(e, campos);
  if (e.accion === 'iniciar_atencion') {
    for (const c of ['resultado', 'motivo', 'resumenCiudadano']) if (c in e) campos[c] = 'Campo no admitido para iniciar atención.';
    if (Object.keys(campos).length) throw new ValidacionAtencionError(campos);
    return { accion: 'iniciar_atencion', estadoEsperado: esperado };
  }
  if (e.accion !== 'cerrar') {
    campos.accion = 'Elige iniciar atención o cerrar.';
    throw new ValidacionAtencionError(campos);
  }
  if (!(RESULTADOS as readonly unknown[]).includes(e.resultado)) campos.resultado = 'Elige atendido o descartado.';
  const motivo = texto(e.motivo, 10, 500);
  if (!motivo) campos.motivo = MOTIVO;
  const resumen = texto(e.resumenCiudadano, 10, 300);
  if (!resumen) campos.resumenCiudadano = 'Escribe un resumen para el ciudadano de 10 a 300 caracteres.';
  if (Object.keys(campos).length) throw new ValidacionAtencionError(campos);
  return { accion: 'cerrar', estadoEsperado: esperado, resultado: e.resultado as Resultado, motivo: motivo!, resumenCiudadano: resumen! };
}

export function validarVerificacion(entrada: unknown): { readonly valor: Exclude<Verificacion, 'SIN_VERIFICAR'>; readonly motivo: string; readonly estadoEsperado: EstadoIncidente } {
  const campos: Record<string, string> = {};
  const e = objeto(entrada, ['valor', 'motivo', 'estadoEsperado'], campos);
  const esperado = estadoEsperado(e, campos);
  if (e.valor !== 'VERIFICADO' && e.valor !== 'NO_VERIFICADO') campos.valor = 'Elige verificado o no verificado.';
  const motivo = texto(e.motivo, 10, 500);
  if (!motivo) campos.motivo = MOTIVO;
  if (Object.keys(campos).length) throw new ValidacionAtencionError(campos);
  return { valor: e.valor as 'VERIFICADO' | 'NO_VERIFICADO', motivo: motivo!, estadoEsperado: esperado };
}

export function validarVinculo(entrada: unknown): { readonly referenciaPrincipal: string; readonly motivo: string } {
  const campos: Record<string, string> = {};
  const e = objeto(entrada, ['referenciaPrincipal', 'motivo'], campos);
  if (typeof e.referenciaPrincipal !== 'string' || e.referenciaPrincipal.length > 40 || !e.referenciaPrincipal.trim()) {
    campos.referenciaPrincipal = 'Escribe la referencia del incidente principal.';
  }
  const motivo = texto(e.motivo, 10, 500);
  if (!motivo) campos.motivo = MOTIVO;
  if (Object.keys(campos).length) throw new ValidacionAtencionError(campos);
  return { referenciaPrincipal: (e.referenciaPrincipal as string).trim(), motivo: motivo! };
}

export function validarPrioridad(entrada: unknown): { readonly valor: 'NORMAL' | 'ALTA' | 'URGENTE'; readonly motivo: string } {
  const campos: Record<string, string> = {};
  const e = objeto(entrada, ['valor', 'motivo'], campos);
  if (!['NORMAL', 'ALTA', 'URGENTE'].includes(e.valor as string)) campos.valor = 'Elige Normal, Alta o Urgente.';
  const motivo = texto(e.motivo, 10, 500);
  if (!motivo) campos.motivo = MOTIVO;
  if (Object.keys(campos).length) throw new ValidacionAtencionError(campos);
  return { valor: e.valor as 'NORMAL' | 'ALTA' | 'URGENTE', motivo: motivo! };
}

export function validarMotivoAdmin(entrada: unknown, conOperador: boolean): { readonly motivo: string; readonly operadorId?: string } {
  const campos: Record<string, string> = {};
  const e = objeto(entrada, conOperador ? ['motivo', 'operadorId'] : ['motivo'], campos);
  const motivo = texto(e.motivo, 10, 500);
  if (!motivo) campos.motivo = MOTIVO;
  if (conOperador && !esUuid(e.operadorId)) campos.operadorId = 'Elige un operador válido.';
  if (Object.keys(campos).length) throw new ValidacionAtencionError(campos);
  return conOperador ? { motivo: motivo!, operadorId: e.operadorId as string } : { motivo: motivo! };
}
