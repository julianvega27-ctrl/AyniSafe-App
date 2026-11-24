/**
 * Cookie de sesion institucional. El valor es el token opaco existente (base64url): nunca se
 * devuelve en el cuerpo ni es legible por scripts. El nombre y `Secure` dependen del origen web:
 * con https se usa el prefijo `__Host-` (exige Secure, Path=/ y ausencia de Domain); con http
 * (solo desarrollo local) un nombre sin prefijo y sin Secure.
 */
export interface ConfigCookie {
  readonly nombre: string;
  readonly segura: boolean;
}

export function configurarCookie(origenWeb: string): ConfigCookie {
  const https = origenWeb.startsWith('https://');
  return https ? { nombre: '__Host-ayni_inst', segura: true } : { nombre: 'ayni_inst', segura: false };
}

const VALOR_VALIDO = /^[A-Za-z0-9_-]{1,512}$/;

/**
 * Lee el valor de la cookie `nombre` de la cabecera `Cookie`. Devuelve undefined si no existe,
 * si aparece mas de una vez (ambiguo) o si el valor no tiene la forma esperada.
 */
export function leerCookie(cabecera: string | undefined, nombre: string): string | undefined {
  if (!cabecera || cabecera.length > 8192) return undefined;
  const valores: string[] = [];
  for (const par of cabecera.split(';')) {
    const i = par.indexOf('=');
    if (i < 0) continue;
    if (par.slice(0, i).trim() === nombre) valores.push(par.slice(i + 1).trim());
  }
  if (valores.length !== 1) return undefined;
  return VALOR_VALIDO.test(valores[0] as string) ? valores[0] : undefined;
}

function atributos(config: ConfigCookie): string[] {
  return ['Path=/', 'HttpOnly', 'SameSite=Strict', ...(config.segura ? ['Secure'] : [])];
}

/** `Set-Cookie` de la sesion; `Max-Age` no excede el tiempo restante hasta el vencimiento absoluto. */
export function cookieDeSesion(config: ConfigCookie, token: string, segundosRestantes: number): string {
  const max = Math.max(0, Math.floor(segundosRestantes));
  return [`${config.nombre}=${token}`, ...atributos(config), `Max-Age=${max}`].join('; ');
}

/** `Set-Cookie` que borra la cookie en el navegador. */
export function cookieBorrada(config: ConfigCookie): string {
  return [`${config.nombre}=`, ...atributos(config), 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'].join('; ');
}
