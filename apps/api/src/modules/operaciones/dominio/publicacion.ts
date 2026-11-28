import { ESTADOS_INCIDENTE, type EstadoIncidente } from './incidente';
import type { Papel } from './matriz';
import { ValidacionAtencionError, type Verificacion } from './atencion';

/**
 * Publicacion controlada (P7, spec `operaciones/publicacion`, documento 11 §5). Reglas puras:
 * vigencia de 7 dias desde la ocurrencia, elegibilidad, acciones permitidas y validacion de los
 * cuerpos. Desde el 27/11/2026 se publica la ubicacion exacta y todas las categorias.
 */

/** Vigencia maxima de una publicacion desde la ocurrencia. */
export const VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimo de elementos para informar un conteo agregado de casos reservados. */
export const MINIMO_CONTEO = 5;

export const CAUSAS_RETIRO = ['DECISION', 'CIERRE', 'NO_VERIFICADO', 'DUPLICADO'] as const;
export type CausaRetiro = (typeof CAUSAS_RETIRO)[number];

export function vencimientoDe(ocurridoEn: Date): Date {
  return new Date(ocurridoEn.getTime() + VIGENCIA_MS);
}

export type CodigoNoPublicable = 'NO_VERIFICADO' | 'FUERA_DE_VIGENCIA' | 'DISTRITO_PENDIENTE' | 'INCIDENTE_CERRADO' | 'INCIDENTE_VINCULADO';

/** Motivo por el que no se puede publicar, o null si es publicable. */
export function noPublicable(c: {
  readonly estado: EstadoIncidente;
  readonly verificacion: Verificacion;
  readonly vinculado: boolean;
  readonly distritoId: string | null;
  readonly ocurridoEn: Date;
  readonly ahora: Date;
}): CodigoNoPublicable | null {
  if (c.estado === 'CERRADO') return 'INCIDENTE_CERRADO';
  if (c.vinculado) return 'INCIDENTE_VINCULADO';
  if (c.verificacion !== 'VERIFICADO') return 'NO_VERIFICADO';
  if (!c.distritoId) return 'DISTRITO_PENDIENTE';
  if (vencimientoDe(c.ocurridoEn).getTime() <= c.ahora.getTime()) return 'FUERA_DE_VIGENCIA';
  return null;
}

export type AccionPublicacion = 'publicar' | 'retirar' | 'reservar' | 'quitar_reserva';

/** Acciones de publicacion que el operador puede ejecutar ahora. La API autoriza con esta misma regla. */
export function accionesPublicacion(c: {
  readonly papel: Papel;
  readonly esResponsable: boolean;
  /** Publicable segun `noPublicable` (sin contar la publicacion actual). */
  readonly publicable: boolean;
  readonly vigente: boolean;
  readonly reservada: boolean;
}): readonly AccionPublicacion[] {
  if (c.papel !== 'principal') return [];
  const acciones: AccionPublicacion[] = [];
  if (!c.vigente && c.esResponsable && c.publicable) acciones.push('publicar');
  if (c.vigente) acciones.push('retirar');
  if (c.vigente && c.esResponsable) acciones.push(c.reservada ? 'quitar_reserva' : 'reservar');
  return acciones;
}

function objeto(entrada: unknown, permitidos: readonly string[], campos: Record<string, string>): Record<string, unknown> {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    throw new ValidacionAtencionError({ cuerpo: 'Envía un objeto JSON.' });
  }
  const e = entrada as Record<string, unknown>;
  for (const clave of Object.keys(e)) if (!permitidos.includes(clave)) campos[clave] = 'Campo no admitido.';
  return e;
}

function motivo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  const n = [...t].length;
  return n >= 10 && n <= 500 ? t : null;
}

const MOTIVO = 'Escribe un motivo de 10 a 500 caracteres.';

export interface SolicitudPublicar {
  readonly estadoEsperado: EstadoIncidente;
  readonly reservada: boolean;
  readonly motivoReserva: string | null;
}

export function validarPublicar(entrada: unknown): SolicitudPublicar {
  const campos: Record<string, string> = {};
  const e = objeto(entrada, ['estadoEsperado', 'reservada', 'motivoReserva'], campos);
  if (!(ESTADOS_INCIDENTE as readonly unknown[]).includes(e.estadoEsperado)) campos.estadoEsperado = 'Indica el estado actual del incidente.';
  if (e.reservada !== undefined && typeof e.reservada !== 'boolean') campos.reservada = 'Indica si el caso es reservado.';
  const reservada = e.reservada === true;
  const m = motivo(e.motivoReserva);
  if (reservada && !m) campos.motivoReserva = MOTIVO;
  if (!reservada && e.motivoReserva !== undefined) campos.motivoReserva = 'Solo se indica al reservar.';
  if (Object.keys(campos).length) throw new ValidacionAtencionError(campos);
  return { estadoEsperado: e.estadoEsperado as EstadoIncidente, reservada, motivoReserva: reservada ? m : null };
}

export function validarRetiro(entrada: unknown): { readonly motivo: string } {
  const campos: Record<string, string> = {};
  const e = objeto(entrada, ['motivo'], campos);
  const m = motivo(e.motivo);
  if (!m) campos.motivo = MOTIVO;
  if (Object.keys(campos).length) throw new ValidacionAtencionError(campos);
  return { motivo: m! };
}

export function validarReserva(entrada: unknown): { readonly reservada: boolean; readonly motivo: string } {
  const campos: Record<string, string> = {};
  const e = objeto(entrada, ['reservada', 'motivo'], campos);
  if (typeof e.reservada !== 'boolean') campos.reservada = 'Indica si el caso es reservado.';
  const m = motivo(e.motivo);
  if (!m) campos.motivo = MOTIVO;
  if (Object.keys(campos).length) throw new ValidacionAtencionError(campos);
  return { reservada: e.reservada as boolean, motivo: m! };
}
