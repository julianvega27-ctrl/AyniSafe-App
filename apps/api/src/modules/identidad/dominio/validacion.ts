/**
 * Reglas de validacion y normalizacion de entradas de acceso ciudadano.
 * Puras y sin dependencias: se reutilizan desde casos de uso y presentacion.
 * Las longitudes se cuentan en puntos de codigo Unicode (no UTF-16 ni bytes).
 */

export const NOMBRE_MAX = 100;
export const CORREO_MAX = 254;
export const CORREO_LOCAL_MAX = 64;
export const CONTRASENA_MIN = 15;
export const CONTRASENA_MAX = 128;

export type ErroresPorCampo = Record<string, string>;

export type Resultado<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly campos: ErroresPorCampo };

export interface RegistroValido {
  readonly nombre: string;
  /** Correo recortado y en minusculas: clave de identidad. */
  readonly correoNormalizado: string;
  /** Contrasena exacta, sin recortar ni normalizar. */
  readonly contrasena: string;
}

export interface LoginValido {
  readonly correoNormalizado: string;
  readonly contrasena: string;
}

/** Cuenta puntos de codigo Unicode. */
export function longitudEnPuntosDeCodigo(texto: string): number {
  let n = 0;
  for (const _ of texto) n += 1;
  return n;
}

const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const ETIQUETA = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/** Sintaxis de correo (solo ASCII). No verifica existencia ni propiedad del buzon. */
export function tieneSintaxisDeCorreo(correo: string): boolean {
  if (longitudEnPuntosDeCodigo(correo) > CORREO_MAX) return false;
  const arroba = correo.indexOf('@');
  if (arroba <= 0 || arroba !== correo.lastIndexOf('@')) return false;
  const local = correo.slice(0, arroba);
  const dominio = correo.slice(arroba + 1);
  if (local.length > CORREO_LOCAL_MAX || !LOCAL.test(local)) return false;
  const etiquetas = dominio.split('.');
  return etiquetas.length >= 2 && etiquetas.every((e) => ETIQUETA.test(e));
}

const CUERPO_INVALIDO = 'El cuerpo de la solicitud no es válido.';
const CAMPOS_EXTRA = 'El cuerpo contiene campos no admitidos.';

function comoObjeto(entrada: unknown): Record<string, unknown> | undefined {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) return undefined;
  return entrada as Record<string, unknown>;
}

function hayCamposExtra(objeto: Record<string, unknown>, permitidos: readonly string[]): boolean {
  return Object.keys(objeto).some((k) => !permitidos.includes(k));
}

function validarNombre(valor: unknown, campos: ErroresPorCampo): string | undefined {
  if (valor === undefined) {
    campos.nombre = 'Ingresa tu nombre.';
    return undefined;
  }
  if (typeof valor !== 'string') {
    campos.nombre = 'El nombre debe ser texto.';
    return undefined;
  }
  const nombre = valor.trim();
  const n = longitudEnPuntosDeCodigo(nombre);
  if (n < 1) campos.nombre = 'Ingresa tu nombre.';
  else if (n > NOMBRE_MAX) campos.nombre = `El nombre admite hasta ${NOMBRE_MAX} caracteres.`;
  else return nombre;
  return undefined;
}

function validarCorreo(valor: unknown, campos: ErroresPorCampo): string | undefined {
  if (valor === undefined) {
    campos.correo = 'Ingresa tu correo.';
    return undefined;
  }
  if (typeof valor !== 'string') {
    campos.correo = 'El correo debe ser texto.';
    return undefined;
  }
  const correo = valor.trim();
  if (correo === '' || !tieneSintaxisDeCorreo(correo)) {
    campos.correo = 'Ingresa un correo válido.';
    return undefined;
  }
  return correo.toLowerCase();
}

function validarContrasena(valor: unknown, campos: ErroresPorCampo): string | undefined {
  if (valor === undefined) {
    campos.contrasena = 'Ingresa tu contraseña.';
    return undefined;
  }
  if (typeof valor !== 'string') {
    campos.contrasena = 'La contraseña debe ser texto.';
    return undefined;
  }
  const n = longitudEnPuntosDeCodigo(valor);
  if (n < CONTRASENA_MIN || n > CONTRASENA_MAX) {
    campos.contrasena = `La contraseña debe tener entre ${CONTRASENA_MIN} y ${CONTRASENA_MAX} caracteres.`;
    return undefined;
  }
  return valor;
}

export function validarRegistro(entrada: unknown): Resultado<RegistroValido> {
  const objeto = comoObjeto(entrada);
  if (!objeto) return { ok: false, campos: { cuerpo: CUERPO_INVALIDO } };
  const campos: ErroresPorCampo = {};
  if (hayCamposExtra(objeto, ['nombre', 'correo', 'contrasena'])) campos.cuerpo = CAMPOS_EXTRA;
  const nombre = validarNombre(objeto.nombre, campos);
  const correoNormalizado = validarCorreo(objeto.correo, campos);
  const contrasena = validarContrasena(objeto.contrasena, campos);
  if (
    Object.keys(campos).length > 0 ||
    nombre === undefined ||
    correoNormalizado === undefined ||
    contrasena === undefined
  ) {
    return { ok: false, campos };
  }
  return { ok: true, valor: { nombre, correoNormalizado, contrasena } };
}

export function validarLogin(entrada: unknown): Resultado<LoginValido> {
  const objeto = comoObjeto(entrada);
  if (!objeto) return { ok: false, campos: { cuerpo: CUERPO_INVALIDO } };
  const campos: ErroresPorCampo = {};
  if (hayCamposExtra(objeto, ['correo', 'contrasena'])) campos.cuerpo = CAMPOS_EXTRA;
  const correoNormalizado = validarCorreo(objeto.correo, campos);
  const contrasena = validarContrasena(objeto.contrasena, campos);
  if (Object.keys(campos).length > 0 || correoNormalizado === undefined || contrasena === undefined) {
    return { ok: false, campos };
  }
  return { ok: true, valor: { correoNormalizado, contrasena } };
}

/** Longitud maxima que se procesa de un token: el real mide 43 (32 bytes en base64url). */
export const TOKEN_MAX = 200;

export interface ConsultaTokenValida {
  readonly token: string;
}

export interface ConsumoTokenValido {
  readonly token: string;
  /** Contrasena exacta, sin recortar ni normalizar. */
  readonly contrasena: string;
}

export interface SolicitudRecuperacionValida {
  readonly correoNormalizado: string;
}

function validarToken(valor: unknown, campos: ErroresPorCampo): string | undefined {
  if (valor === undefined || (typeof valor === 'string' && valor === '')) {
    campos.token = 'Falta el código del enlace.';
    return undefined;
  }
  if (typeof valor !== 'string') {
    campos.token = 'El código debe ser texto.';
    return undefined;
  }
  // Un valor demasiado largo o con caracteres ajenos al formato simplemente no existira: se
  // procesa como token desconocido (404), sin consultar la base con basura arbitraria.
  return valor;
}

export function validarConsultaToken(entrada: unknown): Resultado<ConsultaTokenValida> {
  const objeto = comoObjeto(entrada);
  if (!objeto) return { ok: false, campos: { cuerpo: CUERPO_INVALIDO } };
  const campos: ErroresPorCampo = {};
  if (hayCamposExtra(objeto, ['token'])) campos.cuerpo = CAMPOS_EXTRA;
  const token = validarToken(objeto.token, campos);
  if (Object.keys(campos).length > 0 || token === undefined) return { ok: false, campos };
  return { ok: true, valor: { token } };
}

export function validarConsumoToken(entrada: unknown): Resultado<ConsumoTokenValido> {
  const objeto = comoObjeto(entrada);
  if (!objeto) return { ok: false, campos: { cuerpo: CUERPO_INVALIDO } };
  const campos: ErroresPorCampo = {};
  if (hayCamposExtra(objeto, ['token', 'contrasena'])) campos.cuerpo = CAMPOS_EXTRA;
  const token = validarToken(objeto.token, campos);
  const contrasena = validarContrasena(objeto.contrasena, campos);
  if (Object.keys(campos).length > 0 || token === undefined || contrasena === undefined) {
    return { ok: false, campos };
  }
  return { ok: true, valor: { token, contrasena } };
}

export function validarSolicitudRecuperacion(entrada: unknown): Resultado<SolicitudRecuperacionValida> {
  const objeto = comoObjeto(entrada);
  if (!objeto) return { ok: false, campos: { cuerpo: CUERPO_INVALIDO } };
  const campos: ErroresPorCampo = {};
  if (hayCamposExtra(objeto, ['correo'])) campos.cuerpo = CAMPOS_EXTRA;
  const correoNormalizado = validarCorreo(objeto.correo, campos);
  if (Object.keys(campos).length > 0 || correoNormalizado === undefined) return { ok: false, campos };
  return { ok: true, valor: { correoNormalizado } };
}

/** Cambios admitidos en el perfil: solo los campos presentes se aplican. */
export interface CambiosPerfilValidos {
  readonly nombre?: string;
  /** Telefono normalizado, o `null` para borrarlo. Ausente = sin cambio. */
  readonly telefono?: string | null;
  readonly compartirTelefono?: boolean;
}

const TELEFONO_VALIDO = /^\+?[0-9]{7,15}$/;
const TELEFONO_ENTRADA_MAX = 40;

/**
 * Normaliza un telefono: quita espacios, guiones, puntos y parentesis. `null` o texto vacio lo
 * borra. Devuelve `undefined` si no es valido (7 a 15 digitos con un '+' inicial opcional).
 */
export function normalizarTelefono(valor: unknown): string | null | undefined {
  if (valor === null) return null;
  if (typeof valor !== 'string') return undefined;
  const crudo = valor.trim();
  if (crudo === '') return null;
  if (crudo.length > TELEFONO_ENTRADA_MAX) return undefined;
  const limpio = crudo.replace(/[\s\-.()]/g, '');
  return TELEFONO_VALIDO.test(limpio) ? limpio : undefined;
}

/** Valida `PATCH /perfil`: lista cerrada de campos (nunca correo, id, rol ni estado) y al menos uno. */
export function validarCambiosPerfil(entrada: unknown): Resultado<CambiosPerfilValidos> {
  const objeto = comoObjeto(entrada);
  if (!objeto) return { ok: false, campos: { cuerpo: CUERPO_INVALIDO } };
  const campos: ErroresPorCampo = {};
  if (hayCamposExtra(objeto, ['nombre', 'telefono', 'compartirTelefono'])) campos.cuerpo = CAMPOS_EXTRA;
  const cambios: { nombre?: string; telefono?: string | null; compartirTelefono?: boolean } = {};

  if ('nombre' in objeto) {
    const nombre = validarNombre(objeto.nombre, campos);
    if (nombre !== undefined) cambios.nombre = nombre;
  }
  if ('telefono' in objeto) {
    const telefono = normalizarTelefono(objeto.telefono);
    if (telefono === undefined) campos.telefono = 'Ingresa un teléfono de 7 a 15 dígitos o déjalo vacío.';
    else cambios.telefono = telefono;
  }
  if ('compartirTelefono' in objeto) {
    if (typeof objeto.compartirTelefono === 'boolean') cambios.compartirTelefono = objeto.compartirTelefono;
    else campos.compartirTelefono = 'Indica si autorizas compartir tu teléfono (sí o no).';
  }
  if (Object.keys(campos).length === 0 && Object.keys(cambios).length === 0) {
    campos.cuerpo = 'Envía al menos un campo para actualizar.';
  }
  if (Object.keys(campos).length > 0) return { ok: false, campos };
  return { ok: true, valor: cambios };
}
