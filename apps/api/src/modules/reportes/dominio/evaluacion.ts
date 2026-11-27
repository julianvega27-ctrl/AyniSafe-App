/**
 * Evaluacion rapida para SAMU (P5.1, RF41-RF44, documento 09 «Evaluacion rapida»). Reglas puras: una
 * sola persona principal, cantidad total independiente y respuestas desconocidas que nunca se
 * convierten en normales. Reportes es dueno de todas las versiones (design, decision 1).
 */

export type RespuestaSiNo = 'si' | 'no' | 'no_se';
export type SignosVida = 'observados' | 'no_observados' | 'no_se';
/** Entero conocido (1-999) o `no_se`. Solo existe con heridos `si`; en otro caso es null. */
export type CantidadHeridos = number | 'no_se';
export type OrigenVersion = 'ciudadano' | 'operador';

export const RESPUESTAS_SI_NO: readonly RespuestaSiNo[] = ['si', 'no', 'no_se'];
export const RESPUESTAS_SIGNOS_VIDA: readonly SignosVida[] = ['observados', 'no_observados', 'no_se'];
export const CANTIDAD_MIN = 1;
export const CANTIDAD_MAX = 999;

/** Categorias con «¿Hay heridos?»; todas tienen evaluacion versionada. */
export const CATEGORIAS_CON_EVALUACION: ReadonlySet<string> = new Set([
  'accidente-transito',
  'agresion',
  'pelea',
  'violencia',
  'emergencia-medica',
]);
/** Categorias con «¿Se necesita atencion medica?» (RF57). */
export const CATEGORIAS_CON_ATENCION_MEDICA: ReadonlySet<string> = new Set(['accidente-transito']);
const SAMU_SI_HERIDOS: ReadonlySet<string> = new Set(['agresion', 'pelea', 'violencia']);

export interface PersonaPrincipal {
  readonly signosVida: SignosVida | null;
  readonly consciente: RespuestaSiNo | null;
  readonly sangrado: RespuestaSiNo | null;
}

/** Instantanea completa de una version. null = sin respuesta. */
export interface Instantanea extends PersonaPrincipal {
  readonly heridos: RespuestaSiNo | null;
  readonly atencionMedica: RespuestaSiNo | null;
  readonly cantidadHeridos: CantidadHeridos | null;
}

export const CAMPOS_INSTANTANEA = ['heridos', 'atencionMedica', 'cantidadHeridos', 'signosVida', 'consciente', 'sangrado'] as const;
export type CampoInstantanea = (typeof CAMPOS_INSTANTANEA)[number];
const CAMPOS_PERSONA = ['signosVida', 'consciente', 'sangrado'] as const;

export const PERSONA_SIN_RESPUESTA: PersonaPrincipal = { signosVida: null, consciente: null, sangrado: null };

export type ErroresEvaluacion = Record<string, string>;

/** Entrada invalida. `campos` nunca contiene los valores enviados. */
export class ValidacionEvaluacionError extends Error {
  constructor(readonly campos: ErroresEvaluacion) {
    super('Evaluacion invalida');
    this.name = 'ValidacionEvaluacionError';
  }
}

export const MENSAJES_EVALUACION = {
  estructura: 'La evaluación no tiene el formato esperado.',
  camposExtra: 'La evaluación contiene campos no admitidos.',
  noAplica: 'La evaluación para SAMU no corresponde a estas respuestas.',
  cantidad: `Indica una cantidad de ${CANTIDAD_MIN} a ${CANTIDAD_MAX} o «No sé».`,
  cantidadSinHeridos: 'La cantidad solo se informa si hay heridos.',
  respuesta: 'Responde Sí, No o No sé.',
  signosVida: 'Responde «Se observan», «No se han observado» o «No sé».',
  sinCambios: 'Indica al menos una respuesta.',
  noAplicaCategoria: 'Esta pregunta no corresponde a la categoría del incidente.',
  soloSamu: 'Solo el personal SAMU puede informar observaciones de la persona principal.',
  motivo: 'Escribe un motivo de 10 a 500 caracteres.',
} as const;

const comoObjeto = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

const esRespuesta = (v: unknown): v is RespuestaSiNo => typeof v === 'string' && (RESPUESTAS_SI_NO as readonly string[]).includes(v);
const esSignos = (v: unknown): v is SignosVida => typeof v === 'string' && (RESPUESTAS_SIGNOS_VIDA as readonly string[]).includes(v);

/**
 * SAMU interviene segun la condicion: emergencia medica siempre; accidente con heridos o atencion
 * `si`; agresion, pelea o violencia con heridos `si`. Coincide con la matriz `matriz-09-v1`.
 */
export function samuRequerido(categoriaId: string, heridos: RespuestaSiNo | null, atencionMedica: RespuestaSiNo | null): boolean {
  if (categoriaId === 'emergencia-medica') return true;
  if (categoriaId === 'accidente-transito') return heridos === 'si' || atencionMedica === 'si';
  return SAMU_SI_HERIDOS.has(categoriaId) && heridos === 'si';
}

function validarCantidad(v: unknown): CantidadHeridos | undefined {
  if (v === 'no_se') return 'no_se';
  if (typeof v === 'number' && Number.isInteger(v) && v >= CANTIDAD_MIN && v <= CANTIDAD_MAX) return v;
  return undefined;
}

/** Valida la persona principal parcial; los campos ausentes o null quedan sin respuesta. */
function validarPersona(
  valor: unknown,
  prefijo: string,
  campos: ErroresEvaluacion,
  admitirNull: boolean,
): Partial<Record<(typeof CAMPOS_PERSONA)[number], RespuestaSiNo | SignosVida>> | undefined {
  const p = comoObjeto(valor);
  if (!p) {
    campos[prefijo] = MENSAJES_EVALUACION.estructura;
    return undefined;
  }
  if (Object.keys(p).some((k) => !(CAMPOS_PERSONA as readonly string[]).includes(k))) {
    campos[prefijo] = MENSAJES_EVALUACION.camposExtra;
    return undefined;
  }
  const r: Partial<Record<(typeof CAMPOS_PERSONA)[number], RespuestaSiNo | SignosVida>> = {};
  for (const c of CAMPOS_PERSONA) {
    if (!(c in p)) continue;
    const v = p[c];
    if (v === null && admitirNull) continue;
    if (c === 'signosVida' ? esSignos(v) : esRespuesta(v)) r[c] = v as RespuestaSiNo | SignosVida;
    else campos[`${prefijo}.${c}`] = c === 'signosVida' ? MENSAJES_EVALUACION.signosVida : MENSAJES_EVALUACION.respuesta;
  }
  return r;
}

export interface EvaluacionEnvio {
  readonly cantidadHeridos: CantidadHeridos | null;
  readonly personaPrincipal: PersonaPrincipal;
}

/**
 * Valida el objeto opcional `evaluacion` del envio. Devuelve null si no viene. Los errores se
 * acumulan en `campos` con claves `evaluacion...`. Las respuestas de heridos y atencion ya validadas
 * deciden si SAMU interviene.
 */
export function validarEvaluacionEnvio(
  entrada: unknown,
  categoriaId: string | undefined,
  heridos: RespuestaSiNo | null,
  atencionMedica: RespuestaSiNo | null,
  campos: ErroresEvaluacion,
): EvaluacionEnvio | null {
  if (entrada === undefined || entrada === null) return null;
  const e = comoObjeto(entrada);
  if (!e) {
    campos.evaluacion = MENSAJES_EVALUACION.estructura;
    return null;
  }
  if (Object.keys(e).some((k) => k !== 'cantidadHeridos' && k !== 'personaPrincipal')) {
    campos.evaluacion = MENSAJES_EVALUACION.camposExtra;
    return null;
  }
  // Sin categoria valida no se puede decidir si aplica: se informa solo la categoria.
  if (categoriaId === undefined) return null;
  if (!samuRequerido(categoriaId, heridos, atencionMedica)) {
    campos.evaluacion = MENSAJES_EVALUACION.noAplica;
    return null;
  }
  let cantidadHeridos: CantidadHeridos | null = heridos === 'si' ? 'no_se' : null;
  if ('cantidadHeridos' in e && e.cantidadHeridos !== null) {
    if (heridos !== 'si') campos['evaluacion.cantidadHeridos'] = MENSAJES_EVALUACION.cantidadSinHeridos;
    else {
      const c = validarCantidad(e.cantidadHeridos);
      if (c === undefined) campos['evaluacion.cantidadHeridos'] = MENSAJES_EVALUACION.cantidad;
      else cantidadHeridos = c;
    }
  }
  let personaPrincipal: PersonaPrincipal = PERSONA_SIN_RESPUESTA;
  if ('personaPrincipal' in e && e.personaPrincipal !== null) {
    const p = validarPersona(e.personaPrincipal, 'evaluacion.personaPrincipal', campos, true);
    if (p) personaPrincipal = { ...PERSONA_SIN_RESPUESTA, ...p } as PersonaPrincipal;
  }
  return { cantidadHeridos, personaPrincipal };
}

/** Instantanea de la version 1 a partir de las respuestas del envio. */
export function instantaneaInicial(
  heridos: RespuestaSiNo | null,
  atencionMedica: RespuestaSiNo | null,
  evaluacion: EvaluacionEnvio | null,
): Instantanea {
  return {
    heridos,
    atencionMedica,
    cantidadHeridos: heridos === 'si' ? (evaluacion?.cantidadHeridos ?? 'no_se') : null,
    ...(evaluacion?.personaPrincipal ?? PERSONA_SIN_RESPUESTA),
  };
}

/** Cambios parciales de una aclaracion. Ausente = sin cambio; null no se admite. */
export interface CambiosEvaluacion {
  readonly heridos?: RespuestaSiNo;
  readonly atencionMedica?: RespuestaSiNo;
  readonly cantidadHeridos?: CantidadHeridos;
  readonly signosVida?: SignosVida;
  readonly consciente?: RespuestaSiNo;
  readonly sangrado?: RespuestaSiNo;
}

export interface AutorAclaracion {
  readonly origen: OrigenVersion;
  /** Institucion del operador; null para el ciudadano. */
  readonly institucion: string | null;
}

export const MOTIVO_MIN = 10;
export const MOTIVO_MAX = 500;

/**
 * Valida el cuerpo de una aclaracion: `heridos`, `atencionMedica`, `cantidadHeridos`,
 * `personaPrincipal` y, solo para el operador, `motivo`. Un operador que no es SAMU no puede
 * enviar observaciones de la persona principal.
 */
export function validarAclaracion(
  entrada: unknown,
  categoriaId: string,
  autor: AutorAclaracion,
): { cambios: CambiosEvaluacion; motivo: string | null } {
  const e = comoObjeto(entrada);
  if (!e) throw new ValidacionEvaluacionError({ cuerpo: MENSAJES_EVALUACION.estructura });
  const campos: ErroresEvaluacion = {};
  const admitidos = ['heridos', 'atencionMedica', 'cantidadHeridos', 'personaPrincipal', ...(autor.origen === 'operador' ? ['motivo'] : [])];
  if (Object.keys(e).some((k) => !admitidos.includes(k))) campos.cuerpo = MENSAJES_EVALUACION.camposExtra;

  const cambios: { -readonly [K in keyof CambiosEvaluacion]: CambiosEvaluacion[K] } = {};
  if ('heridos' in e) {
    if (esRespuesta(e.heridos)) cambios.heridos = e.heridos;
    else campos.heridos = MENSAJES_EVALUACION.respuesta;
  }
  if ('atencionMedica' in e) {
    if (!CATEGORIAS_CON_ATENCION_MEDICA.has(categoriaId)) campos.atencionMedica = MENSAJES_EVALUACION.noAplicaCategoria;
    else if (esRespuesta(e.atencionMedica)) cambios.atencionMedica = e.atencionMedica;
    else campos.atencionMedica = MENSAJES_EVALUACION.respuesta;
  }
  if ('cantidadHeridos' in e) {
    const c = validarCantidad(e.cantidadHeridos);
    if (c === undefined) campos.cantidadHeridos = MENSAJES_EVALUACION.cantidad;
    else cambios.cantidadHeridos = c;
  }
  if ('personaPrincipal' in e) {
    if (autor.origen === 'operador' && autor.institucion !== 'samu') campos.personaPrincipal = MENSAJES_EVALUACION.soloSamu;
    else {
      const p = validarPersona(e.personaPrincipal, 'personaPrincipal', campos, false);
      if (p) Object.assign(cambios, p);
    }
  }
  let motivo: string | null = null;
  if (autor.origen === 'operador') {
    const m = typeof e.motivo === 'string' ? e.motivo.trim() : '';
    const largo = [...m].length;
    if (largo < MOTIVO_MIN || largo > MOTIVO_MAX) campos.motivo = MENSAJES_EVALUACION.motivo;
    else motivo = m;
  }
  if (Object.keys(campos).length === 0 && Object.keys(cambios).length === 0) campos.cuerpo = MENSAJES_EVALUACION.sinCambios;
  if (Object.keys(campos).length > 0) throw new ValidacionEvaluacionError(campos);
  return { cambios, motivo };
}

export interface ResultadoCambios {
  readonly instantanea: Instantanea;
  readonly modificados: readonly CampoInstantanea[];
  readonly samuRequerido: boolean;
}

/**
 * Aplica cambios parciales a la instantanea vigente. Si heridos deja de ser `si`, la cantidad
 * anterior se elimina y figura como modificada; una cantidad enviada con heridos distinto de `si`
 * se rechaza. Las observaciones se admiten si SAMU interviene con el resultado o ya intervino
 * (`samuRequeridoPrevio`, monotono). Sin modificados, la aclaracion no crea version.
 */
export function aplicarCambios(
  vigente: Instantanea,
  cambios: CambiosEvaluacion,
  categoriaId: string,
  samuRequeridoPrevio: boolean,
): ResultadoCambios {
  const campos: ErroresEvaluacion = {};
  const heridos = cambios.heridos ?? vigente.heridos;
  const atencionMedica = cambios.atencionMedica ?? vigente.atencionMedica;
  let cantidadHeridos: CantidadHeridos | null;
  if (heridos === 'si') {
    cantidadHeridos = cambios.cantidadHeridos ?? (vigente.heridos === 'si' ? (vigente.cantidadHeridos ?? 'no_se') : 'no_se');
  } else {
    if (cambios.cantidadHeridos !== undefined) campos.cantidadHeridos = MENSAJES_EVALUACION.cantidadSinHeridos;
    cantidadHeridos = null;
  }
  const requerido = samuRequeridoPrevio || samuRequerido(categoriaId, heridos, atencionMedica);
  const traePersona = CAMPOS_PERSONA.some((c) => cambios[c] !== undefined);
  if (traePersona && !requerido) campos.personaPrincipal = MENSAJES_EVALUACION.noAplica;
  if (Object.keys(campos).length > 0) throw new ValidacionEvaluacionError(campos);

  const instantanea: Instantanea = {
    heridos,
    atencionMedica,
    cantidadHeridos,
    signosVida: cambios.signosVida ?? vigente.signosVida,
    consciente: cambios.consciente ?? vigente.consciente,
    sangrado: cambios.sangrado ?? vigente.sangrado,
  };
  const modificados = CAMPOS_INSTANTANEA.filter((c) => instantanea[c] !== vigente[c]);
  return { instantanea, modificados, samuRequerido: requerido };
}

/** Hay observaciones de la persona principal si alguna respuesta fue informada. */
export function tieneObservaciones(i: PersonaPrincipal): boolean {
  return i.signosVida !== null || i.consciente !== null || i.sangrado !== null;
}

/** Campos de la condicion que pueden ver las demas instituciones (resumen de heridos). */
export function resumenHeridos(i: Instantanea): Pick<Instantanea, 'heridos' | 'atencionMedica' | 'cantidadHeridos'> {
  return { heridos: i.heridos, atencionMedica: i.atencionMedica, cantidadHeridos: i.cantidadHeridos };
}
