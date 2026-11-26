import { aCrockford, normalizarCrockford } from '../../../compartido/crockford';

/**
 * Envio ciudadano de un incidente (P4.1): reglas puras de validacion de los datos originales.
 * Reportes es dueno de los originales; el estado operativo pertenece a Operaciones.
 * Documentos 09 §1 y 11 §1; spec `reportes/registro-incidentes`.
 */
export type Modalidad = 'invitado' | 'cuenta';
export type RespuestaSamu = 'si' | 'no' | 'no_se';
export type OrigenPunto = 'gps' | 'manual';
export type ModoOcurrencia = 'ahora' | 'antes';

/** Categorias que preguntan «¿Hay heridos?» y «¿Se necesita atención médica?» (RF57, doc. 09 §5). */
export const CATEGORIAS_HERIDOS: ReadonlySet<string> = new Set(['accidente-transito', 'agresion', 'pelea', 'violencia']);
export const CATEGORIAS_ATENCION_MEDICA: ReadonlySet<string> = new Set(['accidente-transito']);

export const DESCRIPCION_MIN = 5;
export const DESCRIPCION_MAX = 1000;

export interface PoliticaOcurrencia {
  /** Tolerancia hacia el futuro por desfase de reloj del dispositivo. */
  readonly toleranciaFuturoMs: number;
  /** Antiguedad maxima admitida (supuesto tecnico configurable del piloto, design §7). */
  readonly antiguedadMaxMs: number;
}

export const POLITICA_OCURRENCIA_POR_DEFECTO: PoliticaOcurrencia = {
  toleranciaFuturoMs: 5 * 60 * 1000,
  antiguedadMaxMs: 30 * 24 * 60 * 60 * 1000,
};

export interface PuntoEnvio {
  readonly latitud: number;
  readonly longitud: number;
  readonly origen: OrigenPunto;
  readonly precisionM: number | null;
}

export interface EnvioValido {
  readonly categoriaId: string;
  readonly descripcion: string;
  readonly ocurrencia: { readonly modo: ModoOcurrencia; readonly instante: Date };
  readonly punto: PuntoEnvio;
  /** null = sin respuesta (distinto de 'no'). Solo en categorias aplicables. */
  readonly heridos: RespuestaSamu | null;
  readonly atencionMedica: RespuestaSamu | null;
  /** Solo en modalidad invitado; normalizado. */
  readonly telefonoContacto: string | null;
}

export type ErroresPorCampo = Record<string, string>;

/** Entrada invalida. `campos` nunca contiene los valores enviados. */
export class ValidacionEnvioError extends Error {
  constructor(readonly campos: ErroresPorCampo) {
    super('Datos invalidos');
    this.name = 'ValidacionEnvioError';
  }
}

const CAMPOS = ['categoriaId', 'descripcion', 'ocurrencia', 'punto', 'heridos', 'atencionMedica', 'telefonoContacto'] as const;
const RESPUESTAS: readonly RespuestaSamu[] = ['si', 'no', 'no_se'];
/** ISO 8601 con zona; hasta 9 decimales de segundo (Dart emite microsegundos). */
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const TELEFONO_VALIDO = /^\+?[0-9]{7,15}$/;
const TELEFONO_ENTRADA_MAX = 40;
const MENSAJES = {
  cuerpo: 'El cuerpo de la solicitud no es válido.',
  camposExtra: 'El cuerpo contiene campos no admitidos.',
  categoria: 'Elige una categoría del catálogo.',
  descripcion: `Describe el hecho en ${DESCRIPCION_MIN} a ${DESCRIPCION_MAX} caracteres.`,
  ocurrencia: 'Indica cuándo ocurrió: ahora o una fecha y hora de los últimos 30 días.',
  punto: 'Confirma el punto del incidente con tu ubicación o eligiéndolo en el mapa.',
  respuesta: 'Responde Sí, No o No sé.',
  noAplica: 'Esta pregunta no corresponde a la categoría elegida.',
  telefono: 'Ingresa un teléfono de contacto de 7 a 15 dígitos.',
  telefonoCuenta: 'Con cuenta no se envía teléfono: se usa el de tu perfil si autorizaste compartirlo.',
} as const;

function comoObjeto(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/**
 * Copia el teléfono de perfil de Identidad (`normalizarTelefono`): quita espacios, guiones, puntos y
 * paréntesis y exige 7 a 15 dígitos con '+' opcional. Se duplica porque el dominio no importa otros módulos.
 */
export function normalizarTelefono(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const crudo = valor.trim();
  if (crudo === '' || crudo.length > TELEFONO_ENTRADA_MAX) return undefined;
  const limpio = crudo.replace(/[\s\-.()]/g, '');
  return TELEFONO_VALIDO.test(limpio) ? limpio : undefined;
}

function validarOcurrencia(valor: unknown, ahora: Date, politica: PoliticaOcurrencia): EnvioValido['ocurrencia'] | undefined {
  const o = comoObjeto(valor);
  if (!o || Object.keys(o).some((k) => k !== 'modo' && k !== 'instante')) return undefined;
  if (o.modo !== 'ahora' && o.modo !== 'antes') return undefined;
  if (typeof o.instante !== 'string' || !INSTANTE.test(o.instante)) return undefined;
  const instante = new Date(o.instante);
  const t = instante.getTime();
  if (Number.isNaN(t)) return undefined;
  if (t > ahora.getTime() + politica.toleranciaFuturoMs || t < ahora.getTime() - politica.antiguedadMaxMs) return undefined;
  return { modo: o.modo, instante };
}

function validarPunto(valor: unknown): PuntoEnvio | undefined {
  const p = comoObjeto(valor);
  if (!p || Object.keys(p).some((k) => !['latitud', 'longitud', 'origen', 'precisionM'].includes(k))) return undefined;
  const { latitud, longitud, origen, precisionM } = p;
  const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (!finito(latitud) || !finito(longitud) || latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) return undefined;
  if (origen !== 'gps' && origen !== 'manual') return undefined;
  if (precisionM !== undefined && precisionM !== null && (!finito(precisionM) || precisionM < 0 || precisionM > 100_000)) return undefined;
  return { latitud, longitud, origen, precisionM: finito(precisionM) ? precisionM : null };
}

function validarRespuesta(
  objeto: Record<string, unknown>,
  campo: 'heridos' | 'atencionMedica',
  aplica: boolean,
  campos: ErroresPorCampo,
): RespuestaSamu | null {
  if (!(campo in objeto) || objeto[campo] === null) return null;
  if (!aplica) {
    campos[campo] = MENSAJES.noAplica;
    return null;
  }
  const v = objeto[campo];
  if (typeof v === 'string' && (RESPUESTAS as readonly string[]).includes(v)) return v as RespuestaSamu;
  campos[campo] = MENSAJES.respuesta;
  return null;
}

/**
 * Valida el cuerpo del envio. Lista cerrada de campos: nunca institucion, sede, prioridad, estado,
 * distrito, autor ni referencia. `categoriasActivas` viene del catalogo de Reportes.
 */
export function validarEnvio(
  entrada: unknown,
  modalidad: Modalidad,
  categoriasActivas: ReadonlySet<string>,
  ahora: Date,
  politica: PoliticaOcurrencia = POLITICA_OCURRENCIA_POR_DEFECTO,
): EnvioValido {
  const objeto = comoObjeto(entrada);
  if (!objeto) throw new ValidacionEnvioError({ cuerpo: MENSAJES.cuerpo });
  const campos: ErroresPorCampo = {};
  if (Object.keys(objeto).some((k) => !(CAMPOS as readonly string[]).includes(k))) campos.cuerpo = MENSAJES.camposExtra;

  const categoriaId = typeof objeto.categoriaId === 'string' && categoriasActivas.has(objeto.categoriaId) ? objeto.categoriaId : undefined;
  if (!categoriaId) campos.categoriaId = MENSAJES.categoria;

  const descripcionCruda = typeof objeto.descripcion === 'string' ? objeto.descripcion.trim() : undefined;
  const largo = descripcionCruda === undefined ? 0 : [...descripcionCruda].length;
  const descripcion = descripcionCruda !== undefined && largo >= DESCRIPCION_MIN && largo <= DESCRIPCION_MAX ? descripcionCruda : undefined;
  if (!descripcion) campos.descripcion = MENSAJES.descripcion;

  const ocurrencia = validarOcurrencia(objeto.ocurrencia, ahora, politica);
  if (!ocurrencia) campos.ocurrencia = MENSAJES.ocurrencia;

  const punto = validarPunto(objeto.punto);
  if (!punto) campos.punto = MENSAJES.punto;

  // Con categoria invalida no se puede decidir si la pregunta aplica: se informa solo la categoria.
  const heridos = validarRespuesta(objeto, 'heridos', !categoriaId || CATEGORIAS_HERIDOS.has(categoriaId), campos);
  const atencionMedica = validarRespuesta(objeto, 'atencionMedica', !categoriaId || CATEGORIAS_ATENCION_MEDICA.has(categoriaId), campos);

  let telefonoContacto: string | null = null;
  if (modalidad === 'cuenta') {
    if ('telefonoContacto' in objeto) campos.telefonoContacto = MENSAJES.telefonoCuenta;
  } else {
    const t = normalizarTelefono(objeto.telefonoContacto);
    if (t === undefined) campos.telefonoContacto = MENSAJES.telefono;
    else telefonoContacto = t;
  }

  if (Object.keys(campos).length > 0 || !categoriaId || !descripcion || !ocurrencia || !punto) {
    throw new ValidacionEnvioError(campos);
  }
  return { categoriaId, descripcion, ocurrencia, punto, heridos, atencionMedica, telefonoContacto };
}

/**
 * Representacion canonica del contenido para la huella de idempotencia: claves en orden fijo e
 * instante en UTC. Dos cuerpos equivalentes (orden de claves, espacios de la descripcion, formato
 * del telefono o zona horaria) producen el mismo texto.
 */
export function contenidoCanonico(modalidad: Modalidad, e: EnvioValido): string {
  return JSON.stringify([
    modalidad,
    e.categoriaId,
    e.descripcion,
    e.ocurrencia.modo,
    e.ocurrencia.instante.toISOString(),
    e.punto.latitud,
    e.punto.longitud,
    e.punto.origen,
    e.punto.precisionM,
    e.heridos,
    e.atencionMedica,
    e.telefonoContacto,
  ]);
}

/** Idempotency-Key: un UUID (cualquier version) en minusculas. Null si falta o no tiene formato. */
export function validarClaveIdempotencia(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const clave = valor.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(clave) ? clave : null;
}

/** Codigo secreto del invitado: 16 simbolos Crockford (80 bits) en cuatro grupos. */
export const BYTES_CODIGO = 10;
export const FORMATO_CODIGO = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

export function codigoDesdeBytes(bytes: Uint8Array): string {
  const s = aCrockford(bytes, 16);
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12)}`;
}

/** Normaliza el codigo escrito por una persona a sus 16 simbolos. Null si no es valido. */
export function normalizarCodigo(texto: unknown): string | null {
  if (typeof texto !== 'string' || texto.length > 40) return null;
  const s = normalizarCrockford(texto);
  return s !== null && s.length === 16 ? s : null;
}
