/**
 * Validacion estricta de las entradas de organizacion: listas cerradas de campos, tipos exactos y
 * longitudes en puntos de codigo. Los mensajes nunca repiten el valor enviado. La existencia de
 * distritos, categorias e instituciones se comprueba despues, contra sus catalogos.
 */
import { TIPOS_INSTITUCION, type TipoInstitucion } from './organizacion';
import {
  longitudEnPuntosDeCodigo,
  NOMBRE_MAX,
  tieneSintaxisDeCorreo,
  type ErroresPorCampo,
  type Resultado,
} from './validacion';

export const SEDE_NOMBRE_MAX = 150;
export const DIRECCION_MAX = 200;
export const CONTACTO_MAX = 40;
export const INSTITUCION_NOMBRE_MAX = 120;
export const FUENTE_MAX = 300;
export const CONJUNTO_MAX = 32;

const CUERPO_INVALIDO = 'El cuerpo de la solicitud no es válido.';
const CAMPOS_EXTRA = 'El cuerpo contiene campos no admitidos.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_DISTRITO = /^[A-Z]{3}-[0-9]{2}$/;
const ID_CATEGORIA = /^[a-z]+(-[a-z]+)*$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface OperadorNuevo {
  readonly nombre: string;
  readonly correoNormalizado: string;
}

export interface AltaSedeValida {
  readonly institucionId: TipoInstitucion;
  readonly nombre: string;
  readonly distritoUbicacionId: string | null;
  readonly direccion: string | null;
  readonly contacto: string | null;
  readonly esDemostracion: boolean;
  readonly operador: OperadorNuevo;
}

export interface AltaOperadorValida extends OperadorNuevo {
  readonly esDemostracion: boolean;
}

export interface CambiosInstitucionValidos {
  readonly nombre?: string;
  readonly contacto?: string | null;
  readonly activa?: boolean;
}

export type CambioVerificacion =
  | { readonly estado: 'sin_verificar' }
  | { readonly estado: 'verificada'; readonly fuente: string; readonly fecha: string };

export interface CambiosSedeValidos {
  readonly nombre?: string;
  readonly distritoUbicacionId?: string | null;
  readonly direccion?: string | null;
  readonly contacto?: string | null;
  readonly activa?: boolean;
  readonly verificacion?: CambioVerificacion;
}

export function esUuid(valor: string): boolean {
  return UUID.test(valor);
}

function comoObjeto(entrada: unknown): Record<string, unknown> | undefined {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) return undefined;
  return entrada as Record<string, unknown>;
}

function camposExtra(objeto: Record<string, unknown>, permitidos: readonly string[]): boolean {
  return Object.keys(objeto).some((k) => !permitidos.includes(k));
}

/** Texto obligatorio recortado, entre 1 y `max` puntos de codigo. */
function texto(valor: unknown, campo: string, max: number, campos: ErroresPorCampo): string | undefined {
  if (typeof valor !== 'string') {
    campos[campo] = valor === undefined ? 'Este campo es obligatorio.' : 'Debe ser texto.';
    return undefined;
  }
  const limpio = valor.trim();
  const n = longitudEnPuntosDeCodigo(limpio);
  if (n < 1) campos[campo] = 'Este campo es obligatorio.';
  else if (n > max) campos[campo] = `Admite hasta ${max} caracteres.`;
  else return limpio;
  return undefined;
}

/** Texto opcional: `null` o vacio lo borra; ausente no cambia (devuelve `undefined` sin error). */
function textoNulable(valor: unknown, campo: string, max: number, campos: ErroresPorCampo): string | null | undefined {
  if (valor === null) return null;
  if (typeof valor === 'string' && valor.trim() === '') return null;
  return texto(valor, campo, max, campos);
}

function correo(valor: unknown, campo: string, campos: ErroresPorCampo): string | undefined {
  if (typeof valor !== 'string') {
    campos[campo] = valor === undefined ? 'Ingresa el correo.' : 'El correo debe ser texto.';
    return undefined;
  }
  const limpio = valor.trim();
  if (limpio === '' || !tieneSintaxisDeCorreo(limpio)) {
    campos[campo] = 'Ingresa un correo válido.';
    return undefined;
  }
  return limpio.toLowerCase();
}

function booleano(valor: unknown, campo: string, campos: ErroresPorCampo): boolean | undefined {
  if (typeof valor === 'boolean') return valor;
  campos[campo] = 'Debe ser verdadero o falso.';
  return undefined;
}

function idDistrito(valor: unknown, campo: string, campos: ErroresPorCampo): string | null | undefined {
  if (valor === null) return null;
  if (typeof valor === 'string' && ID_DISTRITO.test(valor)) return valor;
  campos[campo] = 'Indica un distrito del catálogo.';
  return undefined;
}

function institucion(valor: unknown, campos: ErroresPorCampo): TipoInstitucion | undefined {
  if (typeof valor === 'string' && (TIPOS_INSTITUCION as readonly string[]).includes(valor)) {
    return valor as TipoInstitucion;
  }
  campos.institucionId = 'Elige PNP, Bomberos, SAMU o Serenazgo.';
  return undefined;
}

function fechaValida(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const m = FECHA.exec(valor);
  if (!m) return undefined;
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) return undefined;
  return valor;
}

function operadorNuevo(entrada: unknown, prefijo: string, campos: ErroresPorCampo): OperadorNuevo | undefined {
  const objeto = comoObjeto(entrada);
  if (!objeto) {
    campos[prefijo || 'cuerpo'] = prefijo ? 'Indica nombre y correo del operador inicial.' : CUERPO_INVALIDO;
    return undefined;
  }
  const p = (c: string) => (prefijo ? `${prefijo}.${c}` : c);
  if (camposExtra(objeto, prefijo ? ['nombre', 'correo'] : ['nombre', 'correo', 'esDemostracion'])) {
    campos[prefijo || 'cuerpo'] = CAMPOS_EXTRA;
  }
  const nombre = texto(objeto.nombre, p('nombre'), NOMBRE_MAX, campos);
  const correoNormalizado = correo(objeto.correo, p('correo'), campos);
  if (nombre === undefined || correoNormalizado === undefined) return undefined;
  return { nombre, correoNormalizado };
}

function resultado<T>(campos: ErroresPorCampo, valor: T): Resultado<T> {
  return Object.keys(campos).length > 0 ? { ok: false, campos } : { ok: true, valor };
}

/** `POST /administrador/organizacion/sedes`: la sede siempre viaja con su operador inicial. */
export function validarAltaSede(entrada: unknown): Resultado<AltaSedeValida> {
  const objeto = comoObjeto(entrada);
  if (!objeto) return { ok: false, campos: { cuerpo: CUERPO_INVALIDO } };
  const campos: ErroresPorCampo = {};
  if (camposExtra(objeto, ['institucionId', 'nombre', 'distritoUbicacionId', 'direccion', 'contacto', 'esDemostracion', 'operador'])) {
    campos.cuerpo = CAMPOS_EXTRA;
  }
  const institucionId = institucion(objeto.institucionId, campos);
  const nombre = texto(objeto.nombre, 'nombre', SEDE_NOMBRE_MAX, campos);
  const distritoUbicacionId = 'distritoUbicacionId' in objeto ? idDistrito(objeto.distritoUbicacionId, 'distritoUbicacionId', campos) : null;
  const direccion = 'direccion' in objeto ? textoNulable(objeto.direccion, 'direccion', DIRECCION_MAX, campos) : null;
  const contacto = 'contacto' in objeto ? textoNulable(objeto.contacto, 'contacto', CONTACTO_MAX, campos) : null;
  const esDemostracion = 'esDemostracion' in objeto ? booleano(objeto.esDemostracion, 'esDemostracion', campos) : false;
  const operador = operadorNuevo(objeto.operador, 'operador', campos);
  if (
    institucionId === undefined || nombre === undefined || distritoUbicacionId === undefined ||
    direccion === undefined || contacto === undefined || esDemostracion === undefined || operador === undefined
  ) {
    return { ok: false, campos };
  }
  return resultado(campos, { institucionId, nombre, distritoUbicacionId, direccion, contacto, esDemostracion, operador });
}

/** `POST /administrador/organizacion/sedes/{id}/operadores`. */
export function validarAltaOperador(entrada: unknown): Resultado<AltaOperadorValida> {
  const objeto = comoObjeto(entrada);
  if (!objeto) return { ok: false, campos: { cuerpo: CUERPO_INVALIDO } };
  const campos: ErroresPorCampo = {};
  const operador = operadorNuevo(objeto, '', campos);
  const esDemostracion = 'esDemostracion' in objeto ? booleano(objeto.esDemostracion, 'esDemostracion', campos) : false;
  if (!operador || esDemostracion === undefined) return { ok: false, campos };
  return resultado(campos, { ...operador, esDemostracion });
}

function alMenosUno<T extends object>(campos: ErroresPorCampo, cambios: T): void {
  if (Object.keys(campos).length === 0 && Object.keys(cambios).length === 0) {
    campos.cuerpo = 'Envía al menos un campo para actualizar.';
  }
}

/** `PATCH /administrador/organizacion/instituciones/{id}`: nunca el tipo ni el identificador. */
export function validarCambiosInstitucion(entrada: unknown): Resultado<CambiosInstitucionValidos> {
  const objeto = comoObjeto(entrada);
  if (!objeto) return { ok: false, campos: { cuerpo: CUERPO_INVALIDO } };
  const campos: ErroresPorCampo = {};
  if (camposExtra(objeto, ['nombre', 'contacto', 'activa'])) campos.cuerpo = CAMPOS_EXTRA;
  const cambios: { nombre?: string; contacto?: string | null; activa?: boolean } = {};
  if ('nombre' in objeto) {
    const v = texto(objeto.nombre, 'nombre', INSTITUCION_NOMBRE_MAX, campos);
    if (v !== undefined) cambios.nombre = v;
  }
  if ('contacto' in objeto) {
    const v = textoNulable(objeto.contacto, 'contacto', CONTACTO_MAX, campos);
    if (v !== undefined) cambios.contacto = v;
  }
  if ('activa' in objeto) {
    const v = booleano(objeto.activa, 'activa', campos);
    if (v !== undefined) cambios.activa = v;
  }
  alMenosUno(campos, cambios);
  return resultado(campos, cambios);
}

function verificacion(valor: unknown, campos: ErroresPorCampo): CambioVerificacion | undefined {
  const objeto = comoObjeto(valor);
  if (!objeto) {
    campos.verificacion = 'Indica el estado de verificación.';
    return undefined;
  }
  if (objeto.estado === 'sin_verificar') {
    if (camposExtra(objeto, ['estado'])) campos.verificacion = CAMPOS_EXTRA;
    return { estado: 'sin_verificar' };
  }
  if (objeto.estado !== 'verificada') {
    campos.verificacion = 'El estado debe ser verificada o sin_verificar.';
    return undefined;
  }
  if (camposExtra(objeto, ['estado', 'fuente', 'fecha'])) campos.verificacion = CAMPOS_EXTRA;
  const fuente = texto(objeto.fuente, 'verificacion.fuente', FUENTE_MAX, campos);
  const fecha = fechaValida(objeto.fecha);
  if (fecha === undefined) campos['verificacion.fecha'] = 'Indica la fecha de contraste (AAAA-MM-DD).';
  if (fuente === undefined || fecha === undefined) return undefined;
  return { estado: 'verificada', fuente, fecha };
}

/** `PATCH /administrador/organizacion/sedes/{id}`: datos, verificacion documental y estado activo. */
export function validarCambiosSede(entrada: unknown): Resultado<CambiosSedeValidos> {
  const objeto = comoObjeto(entrada);
  if (!objeto) return { ok: false, campos: { cuerpo: CUERPO_INVALIDO } };
  const campos: ErroresPorCampo = {};
  if (camposExtra(objeto, ['nombre', 'distritoUbicacionId', 'direccion', 'contacto', 'activa', 'verificacion'])) {
    campos.cuerpo = CAMPOS_EXTRA;
  }
  const cambios: {
    nombre?: string; distritoUbicacionId?: string | null; direccion?: string | null;
    contacto?: string | null; activa?: boolean; verificacion?: CambioVerificacion;
  } = {};
  if ('nombre' in objeto) {
    const v = texto(objeto.nombre, 'nombre', SEDE_NOMBRE_MAX, campos);
    if (v !== undefined) cambios.nombre = v;
  }
  if ('distritoUbicacionId' in objeto) {
    const v = idDistrito(objeto.distritoUbicacionId, 'distritoUbicacionId', campos);
    if (v !== undefined) cambios.distritoUbicacionId = v;
  }
  if ('direccion' in objeto) {
    const v = textoNulable(objeto.direccion, 'direccion', DIRECCION_MAX, campos);
    if (v !== undefined) cambios.direccion = v;
  }
  if ('contacto' in objeto) {
    const v = textoNulable(objeto.contacto, 'contacto', CONTACTO_MAX, campos);
    if (v !== undefined) cambios.contacto = v;
  }
  if ('activa' in objeto) {
    const v = booleano(objeto.activa, 'activa', campos);
    if (v !== undefined) cambios.activa = v;
  }
  if ('verificacion' in objeto) {
    const v = verificacion(objeto.verificacion, campos);
    if (v !== undefined) cambios.verificacion = v;
  }
  alMenosUno(campos, cambios);
  return resultado(campos, cambios);
}

/** `PUT .../cobertura` o `PUT .../competencias`: conjunto completo, sin duplicados. */
export function validarConjunto(entrada: unknown, campo: 'distritos' | 'categorias'): Resultado<string[]> {
  const objeto = comoObjeto(entrada);
  if (!objeto) return { ok: false, campos: { cuerpo: CUERPO_INVALIDO } };
  const campos: ErroresPorCampo = {};
  if (camposExtra(objeto, [campo])) campos.cuerpo = CAMPOS_EXTRA;
  const lista = objeto[campo];
  const patron = campo === 'distritos' ? ID_DISTRITO : ID_CATEGORIA;
  if (!Array.isArray(lista)) {
    campos[campo] = 'Envía una lista de identificadores.';
    return { ok: false, campos };
  }
  if (lista.length > CONJUNTO_MAX) campos[campo] = `Admite hasta ${CONJUNTO_MAX} elementos.`;
  else if (!lista.every((v): v is string => typeof v === 'string' && v.length <= 40 && patron.test(v))) {
    campos[campo] = 'Contiene identificadores no válidos.';
  } else if (new Set(lista).size !== lista.length) campos[campo] = 'Contiene identificadores repetidos.';
  return resultado(campos, [...(lista as string[])].sort());
}

/** `PATCH /administrador/organizacion/operadores/{id}`: solo suspender o reactivar. */
export function validarCambioOperador(entrada: unknown): Resultado<{ readonly estado: 'activo' | 'suspendido' }> {
  const objeto = comoObjeto(entrada);
  if (!objeto) return { ok: false, campos: { cuerpo: CUERPO_INVALIDO } };
  const campos: ErroresPorCampo = {};
  if (camposExtra(objeto, ['estado'])) campos.cuerpo = CAMPOS_EXTRA;
  if (objeto.estado !== 'activo' && objeto.estado !== 'suspendido') {
    campos.estado = 'El estado debe ser activo o suspendido.';
    return { ok: false, campos };
  }
  return resultado(campos, { estado: objeto.estado });
}
