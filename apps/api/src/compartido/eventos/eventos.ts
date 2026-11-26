import type { ContextoTransaccional } from '../transaccion';

/**
 * Contratos puros de eventos de negocio (ADR-004, P4.1). Un evento se guarda en la misma transaccion
 * que el hecho y cada consumidor registrado recibe una entrega persistida con reintentos.
 *
 * La carga es un objeto plano de identificadores y valores cortos. No admite telefonos, codigos
 * secretos, descripciones ni coordenadas: `validarCarga` rechaza texto libre, objetos anidados y
 * numeros no enteros (las coordenadas lo son).
 */
export type ValorCarga = string | number | boolean | null;
export type CargaEvento = Readonly<Record<string, ValorCarga>>;

export interface NuevoEvento {
  readonly tipo: string;
  readonly version: number;
  readonly agregadoId: string;
  readonly carga: CargaEvento;
}

export interface EventoPersistido extends NuevoEvento {
  readonly id: string;
  readonly ocurridoEn: Date;
}

export interface PublicadorEventos {
  /** Inserta el evento dentro de la transaccion del llamador y devuelve su identificador. */
  publicar(tx: ContextoTransaccional, evento: NuevoEvento): Promise<string>;
}

/**
 * Consumidor de eventos. `manejar` MUST ser idempotente por `evento.id`: una entrega puede repetirse
 * si el proceso cae despues de terminar y antes de marcarla procesada.
 */
export interface ConsumidorEventos {
  /** Nombre estable en minusculas (`modulo.funcion`); identifica sus entregas. */
  readonly nombre: string;
  readonly tipos: readonly string[];
  manejar(evento: EventoPersistido): Promise<void>;
}

export class CargaEventoInvalidaError extends Error {
  constructor(motivo: string) {
    super(`Carga de evento invalida: ${motivo}`);
    this.name = 'CargaEventoInvalidaError';
  }
}

const TIPO = /^[A-Z][A-Za-z]+$/;
const CLAVE = /^[a-z][A-Za-z0-9]*$/;
/** Identificadores (UUID), codigos de enumeracion y nombres estables; sin espacios ni signos. */
const TEXTO = /^[A-Za-z0-9_.:-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_CLAVES = 16;

export function validarNuevoEvento(evento: NuevoEvento): void {
  if (!TIPO.test(evento.tipo) || evento.tipo.length > 60) throw new CargaEventoInvalidaError('tipo');
  if (!Number.isInteger(evento.version) || evento.version < 1) throw new CargaEventoInvalidaError('version');
  if (!UUID.test(evento.agregadoId)) throw new CargaEventoInvalidaError('agregado');
  const carga: unknown = evento.carga;
  if (typeof carga !== 'object' || carga === null || Array.isArray(carga)) throw new CargaEventoInvalidaError('carga');
  const entradas = Object.entries(carga as Record<string, unknown>);
  if (entradas.length > MAX_CLAVES) throw new CargaEventoInvalidaError('demasiadas claves');
  for (const [clave, valor] of entradas) {
    if (!CLAVE.test(clave)) throw new CargaEventoInvalidaError('clave');
    if (valor === null || typeof valor === 'boolean') continue;
    if (typeof valor === 'number' && Number.isSafeInteger(valor)) continue;
    if (typeof valor === 'string' && TEXTO.test(valor)) continue;
    throw new CargaEventoInvalidaError(`valor de ${clave}`);
  }
}
