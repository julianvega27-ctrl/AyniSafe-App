import 'dotenv/config';
import type { PoliticaLimites } from '../modules/identidad/aplicacion/politica-limites';
import { POLITICA_LIMITES_POR_DEFECTO } from '../modules/identidad/aplicacion/politica-limites';
import { tieneSintaxisDeCorreo } from '../modules/identidad/dominio/validacion';

export type AdaptadorCorreo = 'gmail-api' | 'smtp' | 'prueba' | 'archivo';

export interface ConfigCorreo {
  readonly adaptador: AdaptadorCorreo;
  readonly remitenteNombre: string;
  readonly remitenteDireccion: string;
  /** Solo con adaptador smtp. La clave nunca se imprime ni se registra. */
  readonly smtp?: {
    readonly host: string;
    readonly puerto: number;
    readonly usuario: string;
    readonly clave: string;
  };
  /** Solo con adaptador gmail-api. El secreto y el refresh token nunca se imprimen ni se registran. */
  readonly gmail?: {
    readonly clienteId: string;
    readonly clienteSecreto: string;
    readonly refreshToken: string;
  };
  /** Carpeta del adaptador de archivo (solo desarrollo). */
  readonly directorioArchivo: string;
}

export interface Entorno {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly puerto: number;
  readonly saltosProxyConfianza: number;
  readonly urlBaseDeDatos: string;
  /** Secreto para derivar con HMAC las claves del limitador. Nunca se registra. */
  readonly secretoLimitador: string;
  readonly politicaLimites: PoliticaLimites;
  readonly hashMaxConcurrencia: number;
  readonly hashMaxCola: number;
  readonly correo: ConfigCorreo;
  /** Origen publico de la API, sin barra final: base de los enlaces de los correos y de los App Links. */
  readonly urlPublicaApi: string;
  /** Origen publico de la web (sin barra final): Origin permitido, base de los enlaces institucionales y cookie. */
  readonly origenWeb: string;
  /** Origen publico de la web para los enlaces de los correos. Coincide con `origenWeb` en produccion. */
  readonly urlPublicaWeb: string;
  /** Identificador de la app Android para los App Links. */
  readonly androidPaquete: string;
  /** Huellas SHA-256 del certificado de firma (AA:BB:...). Vacio = assetlinks.json no se publica. */
  readonly androidHuellasSha256: readonly string[];
}

const HUELLA_SHA256 = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const PAQUETE_ANDROID = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

export function cargarAndroid(env: NodeJS.ProcessEnv): { paquete: string; huellas: string[] } {
  const paquete = env.ANDROID_PACKAGE?.trim() || 'pe.edu.unsch.ayni_safe';
  if (!PAQUETE_ANDROID.test(paquete)) throw new Error('Configuracion invalida: ANDROID_PACKAGE no es un identificador de paquete valido');
  const huellas = (env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((h) => h.trim().toUpperCase())
    .filter((h) => h !== '');
  if (huellas.some((h) => !HUELLA_SHA256.test(h))) {
    throw new Error('Configuracion invalida: ANDROID_CERT_SHA256 debe contener huellas SHA-256 con formato AA:BB:... separadas por comas');
  }
  return { paquete, huellas };
}

/** En produccion exige https (los App Links de Android lo requieren); en local admite http. */
export function cargarUrlPublica(env: NodeJS.ProcessEnv, nodeEnv: 'development' | 'test' | 'production', puerto: number): string {
  const valor = env.API_PUBLIC_URL?.trim();
  if (!valor) {
    if (nodeEnv === 'production') throw new Error('Configuracion incompleta: falta API_PUBLIC_URL (ver .env.example)');
    return `http://127.0.0.1:${puerto}`;
  }
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error('Configuracion invalida: API_PUBLIC_URL no es una URL valida');
  }
  if (nodeEnv === 'production' && url.protocol !== 'https:') {
    throw new Error('Configuracion invalida: en produccion API_PUBLIC_URL debe usar https');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Configuracion invalida: API_PUBLIC_URL debe usar http o https');
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Configuracion invalida: API_PUBLIC_URL debe ser solo el origen, sin ruta, credenciales ni parametros');
  }
  return url.origin;
}

/**
 * Origen de la web. En produccion exige https; en local admite http. Solo el origen: sin ruta,
 * credenciales ni parametros. Los mensajes nunca incluyen el valor.
 */
export function cargarOrigenWeb(nombre: string, valorCrudo: string | undefined, nodeEnv: Entorno['nodeEnv']): string {
  const valor = valorCrudo?.trim();
  if (!valor) {
    if (nodeEnv === 'production') throw new Error(`Configuracion incompleta: falta ${nombre} (ver .env.example)`);
    return 'http://localhost:5173';
  }
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`Configuracion invalida: ${nombre} no es una URL valida`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Configuracion invalida: ${nombre} debe usar http o https`);
  }
  if (nodeEnv === 'production' && url.protocol !== 'https:') {
    throw new Error(`Configuracion invalida: en produccion ${nombre} debe usar https`);
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error(`Configuracion invalida: ${nombre} debe ser solo el origen, sin ruta, credenciales ni parametros`);
  }
  return url.origin;
}

/** `WEB_ORIGIN` y `WEB_PUBLIC_URL` designan el mismo origen; en produccion no pueden diferir. */
export function cargarOrigenesWeb(
  env: NodeJS.ProcessEnv,
  nodeEnv: Entorno['nodeEnv'],
): { origenWeb: string; urlPublicaWeb: string } {
  const origenWeb = cargarOrigenWeb('WEB_ORIGIN', env.WEB_ORIGIN, nodeEnv);
  // En desarrollo, si no se declara, toma el valor de WEB_ORIGIN.
  const urlPublicaWeb = env.WEB_PUBLIC_URL?.trim()
    ? cargarOrigenWeb('WEB_PUBLIC_URL', env.WEB_PUBLIC_URL, nodeEnv)
    : nodeEnv === 'production'
      ? cargarOrigenWeb('WEB_PUBLIC_URL', undefined, nodeEnv)
      : origenWeb;
  if (nodeEnv === 'production' && origenWeb !== urlPublicaWeb) {
    throw new Error('Configuracion invalida: WEB_ORIGIN y WEB_PUBLIC_URL deben ser el mismo origen');
  }
  return { origenWeb, urlPublicaWeb };
}

const SECRETO_MIN = 32;

function entero(nombre: string, valor: string | undefined, defecto: number, min: number, max: number): number {
  if (valor === undefined || valor === '') return defecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Configuracion invalida: ${nombre} debe ser un entero entre ${min} y ${max}`);
  }
  return n;
}

function obligatoria(nombre: string, valor: string | undefined): string {
  if (valor === undefined || valor === '') {
    throw new Error(`Configuracion incompleta: falta ${nombre} (ver .env.example)`);
  }
  return valor;
}

function textoSinSaltos(nombre: string, valor: string): string {
  // Un salto de linea en un nombre o direccion permitiria inyectar cabeceras en el correo.
  if (/[\r\n\0]/.test(valor)) {
    throw new Error(`Configuracion invalida: ${nombre} contiene caracteres no admitidos`);
  }
  return valor;
}

/** Valida la configuracion de correo sin incluir nunca valores sensibles en los errores. */
export function cargarConfigCorreo(env: NodeJS.ProcessEnv, nodeEnv: Entorno['nodeEnv']): ConfigCorreo {
  const porDefecto: AdaptadorCorreo = nodeEnv === 'production' ? 'gmail-api' : nodeEnv === 'test' ? 'prueba' : 'archivo';
  const pedido = env.EMAIL_ADAPTER === undefined || env.EMAIL_ADAPTER === '' ? porDefecto : env.EMAIL_ADAPTER;
  if (pedido !== 'gmail-api' && pedido !== 'smtp' && pedido !== 'prueba' && pedido !== 'archivo') {
    throw new Error('Configuracion invalida: EMAIL_ADAPTER debe ser gmail-api, smtp, prueba o archivo');
  }
  if (nodeEnv === 'production' && pedido !== 'gmail-api' && pedido !== 'smtp') {
    throw new Error('Configuracion invalida: en produccion EMAIL_ADAPTER debe ser gmail-api o smtp');
  }
  const remitenteNombre = textoSinSaltos('MAIL_REMITENTE_NOMBRE', env.MAIL_REMITENTE_NOMBRE?.trim() || 'AyniSafe');
  const directorioArchivo = env.EMAIL_ARCHIVO_DIR?.trim() || '.correos-dev';
  if (pedido === 'prueba' || pedido === 'archivo') {
    return { adaptador: pedido, remitenteNombre, remitenteDireccion: 'no-reply@ayinisafe.invalid', directorioArchivo };
  }
  if (pedido === 'gmail-api') {
    // El remitente debe ser la cuenta que autorizo el refresh token: se exige de forma explicita.
    const direccion = textoSinSaltos('MAIL_REMITENTE_DIRECCION', obligatoria('MAIL_REMITENTE_DIRECCION', env.MAIL_REMITENTE_DIRECCION?.trim()));
    if (!tieneSintaxisDeCorreo(direccion)) {
      throw new Error('Configuracion invalida: MAIL_REMITENTE_DIRECCION no es una direccion de correo valida');
    }
    return {
      adaptador: 'gmail-api',
      remitenteNombre,
      remitenteDireccion: direccion,
      gmail: {
        clienteId: textoSinSaltos('GMAIL_CLIENT_ID', obligatoria('GMAIL_CLIENT_ID', env.GMAIL_CLIENT_ID?.trim())),
        clienteSecreto: textoSinSaltos('GMAIL_CLIENT_SECRET', obligatoria('GMAIL_CLIENT_SECRET', env.GMAIL_CLIENT_SECRET?.trim())),
        refreshToken: textoSinSaltos('GMAIL_REFRESH_TOKEN', obligatoria('GMAIL_REFRESH_TOKEN', env.GMAIL_REFRESH_TOKEN?.trim())),
      },
      directorioArchivo,
    };
  }
  const usuario = obligatoria('SMTP_USUARIO', env.SMTP_USUARIO);
  const clave = obligatoria('SMTP_CLAVE', env.SMTP_CLAVE);
  const remitenteDireccion = textoSinSaltos(
    'MAIL_REMITENTE_DIRECCION',
    env.MAIL_REMITENTE_DIRECCION?.trim() || usuario,
  );
  if (!tieneSintaxisDeCorreo(remitenteDireccion)) {
    throw new Error('Configuracion invalida: MAIL_REMITENTE_DIRECCION no es una direccion de correo valida');
  }
  return {
    adaptador: 'smtp',
    remitenteNombre,
    remitenteDireccion,
    smtp: {
      host: textoSinSaltos('SMTP_HOST', env.SMTP_HOST?.trim() || 'smtp.gmail.com'),
      puerto: entero('SMTP_PORT', env.SMTP_PORT, 465, 1, 65535),
      usuario,
      clave,
    },
    directorioArchivo,
  };
}

/**
 * Secreto HMAC del registro de incidentes (P4): huella del codigo secreto del invitado y del contenido
 * de cada envio. Obligatorio para el servidor HTTP en todos los entornos; las pruebas generan uno
 * propio. Se carga aparte de `cargarEntorno` porque las CLI de aprovisionamiento no lo necesitan.
 * Cambiarlo invalida los codigos ya emitidos.
 */
export function cargarSecretoSeguimiento(env: NodeJS.ProcessEnv = process.env): string {
  const valor = obligatoria('TRACKING_CODE_HMAC_SECRET', env.TRACKING_CODE_HMAC_SECRET);
  if (valor.length < SECRETO_MIN) {
    throw new Error(`Configuracion invalida: TRACKING_CODE_HMAC_SECRET debe tener al menos ${SECRETO_MIN} caracteres`);
  }
  return valor;
}

/** Lee y valida la configuracion. Los mensajes de error nunca incluyen valores. */
export function cargarEntorno(env: NodeJS.ProcessEnv = process.env): Entorno {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('Configuracion invalida: NODE_ENV debe ser development, test o production');
  }
  const secretoLimitador = obligatoria('RATE_LIMIT_HMAC_SECRET', env.RATE_LIMIT_HMAC_SECRET);
  if (secretoLimitador.length < SECRETO_MIN) {
    throw new Error(`Configuracion invalida: RATE_LIMIT_HMAC_SECRET debe tener al menos ${SECRETO_MIN} caracteres`);
  }
  return {
    nodeEnv,
    puerto: entero('PORT', env.PORT, 3000, 1, 65535),
    saltosProxyConfianza: entero('TRUST_PROXY_HOPS', env.TRUST_PROXY_HOPS, 0, 0, 5),
    urlBaseDeDatos: obligatoria('DATABASE_URL', env.DATABASE_URL),
    secretoLimitador,
    politicaLimites: {
      registroPorIp: entero('RL_REGISTRO_IP_MAX', env.RL_REGISTRO_IP_MAX, POLITICA_LIMITES_POR_DEFECTO.registroPorIp, 1, 100000),
      loginPorIp: entero('RL_LOGIN_IP_MAX', env.RL_LOGIN_IP_MAX, POLITICA_LIMITES_POR_DEFECTO.loginPorIp, 1, 100000),
      loginPorCorreoIp: entero('RL_LOGIN_CORREO_IP_MAX', env.RL_LOGIN_CORREO_IP_MAX, POLITICA_LIMITES_POR_DEFECTO.loginPorCorreoIp, 1, 100000),
      loginInstPorIp: entero('RL_LOGIN_INST_IP_MAX', env.RL_LOGIN_INST_IP_MAX, POLITICA_LIMITES_POR_DEFECTO.loginInstPorIp, 1, 100000),
      loginInstPorCorreoIp: entero('RL_LOGIN_INST_CORREO_IP_MAX', env.RL_LOGIN_INST_CORREO_IP_MAX, POLITICA_LIMITES_POR_DEFECTO.loginInstPorCorreoIp, 1, 100000),
      recuperacionPorIp: entero('RL_RECUP_IP_MAX', env.RL_RECUP_IP_MAX, POLITICA_LIMITES_POR_DEFECTO.recuperacionPorIp, 1, 100000),
      recuperacionPorCorreoIp: entero('RL_RECUP_CORREO_IP_MAX', env.RL_RECUP_CORREO_IP_MAX, POLITICA_LIMITES_POR_DEFECTO.recuperacionPorCorreoIp, 1, 100000),
      recuperacionPorCorreo: entero('RL_RECUP_CORREO_MAX', env.RL_RECUP_CORREO_MAX, POLITICA_LIMITES_POR_DEFECTO.recuperacionPorCorreo, 1, 100000),
      tokenPorIp: entero('RL_TOKEN_IP_MAX', env.RL_TOKEN_IP_MAX, POLITICA_LIMITES_POR_DEFECTO.tokenPorIp, 1, 100000),
      correoDiarioMax: entero('EMAIL_DIARIO_MAX', env.EMAIL_DIARIO_MAX, POLITICA_LIMITES_POR_DEFECTO.correoDiarioMax, 1, 100000),
    },
    hashMaxConcurrencia: entero('HASH_MAX_CONCURRENCIA', env.HASH_MAX_CONCURRENCIA, 4, 1, 64),
    hashMaxCola: entero('HASH_MAX_COLA', env.HASH_MAX_COLA, 16, 0, 1000),
    correo: cargarConfigCorreo(env, nodeEnv),
    urlPublicaApi: cargarUrlPublica(env, nodeEnv, entero('PORT', env.PORT, 3000, 1, 65535)),
    ...cargarOrigenesWeb(env, nodeEnv),
    androidPaquete: cargarAndroid(env).paquete,
    androidHuellasSha256: cargarAndroid(env).huellas,
  };
}

export type AdaptadorEvidencias = 'cloudinary' | 'deshabilitado' | 'memoria';

export interface ConfigEvidencias {
  readonly adaptador: AdaptadorEvidencias;
  /** Solo con adaptador cloudinary. La key y el secret nunca se imprimen ni se registran. */
  readonly cloudinary?: { readonly cloudName: string; readonly apiKey: string; readonly apiSecret: string };
  /** Cuota local que protege la cuenta compartida (design, decision 3). */
  readonly cuotaBytes: number;
  readonly cuotaObjetos: number;
}

/**
 * Almacen de evidencias (P5.2, ADR-006). Por defecto `deshabilitado`: la carga responde 503 y el
 * registro funciona igual. `memoria` es un doble: nunca en produccion. Los errores nombran la
 * variable, nunca su valor.
 */
export function cargarConfigEvidencias(env: NodeJS.ProcessEnv, nodeEnv: Entorno['nodeEnv']): ConfigEvidencias {
  const pedido = env.EVIDENCIAS_ADAPTADOR?.trim() || 'deshabilitado';
  if (pedido !== 'cloudinary' && pedido !== 'deshabilitado' && pedido !== 'memoria') {
    throw new Error('Configuracion invalida: EVIDENCIAS_ADAPTADOR debe ser cloudinary, deshabilitado o memoria');
  }
  if (pedido === 'memoria' && nodeEnv === 'production') {
    throw new Error('Configuracion invalida: EVIDENCIAS_ADAPTADOR=memoria es un doble de pruebas y no se admite en produccion');
  }
  const cuotaBytes = entero('EVIDENCIAS_CUOTA_BYTES', env.EVIDENCIAS_CUOTA_BYTES, 500 * 1024 * 1024, 5 * 1024 * 1024, 20 * 1024 * 1024 * 1024);
  const cuotaObjetos = entero('EVIDENCIAS_CUOTA_OBJETOS', env.EVIDENCIAS_CUOTA_OBJETOS, 1000, 1, 1_000_000);
  if (pedido !== 'cloudinary') return { adaptador: pedido, cuotaBytes, cuotaObjetos };
  const cloudName = obligatoria('CLOUDINARY_CLOUD_NAME', env.CLOUDINARY_CLOUD_NAME?.trim());
  const apiKey = obligatoria('CLOUDINARY_API_KEY', env.CLOUDINARY_API_KEY?.trim());
  const apiSecret = obligatoria('CLOUDINARY_API_SECRET', env.CLOUDINARY_API_SECRET?.trim());
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(cloudName)) {
    throw new Error('Configuracion invalida: CLOUDINARY_CLOUD_NAME tiene un formato no valido');
  }
  return { adaptador: 'cloudinary', cloudinary: { cloudName, apiKey, apiSecret }, cuotaBytes, cuotaObjetos };
}
