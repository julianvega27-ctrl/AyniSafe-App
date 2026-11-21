import type { CorreoPort, MensajeCorreo } from '../aplicacion/puertos/correo.port';
import { FalloEnvioCorreoError, type CodigoFalloCorreo } from '../dominio/errores';
import { tieneSintaxisDeCorreo } from '../dominio/validacion';

export interface ConfigGmailApi {
  readonly clienteId: string;
  readonly clienteSecreto: string;
  readonly refreshToken: string;
  /** Nombre visible y direccion del remitente: debe ser la cuenta que autorizo el refresh token. */
  readonly remitenteNombre: string;
  readonly remitenteDireccion: string;
  /** Tiempo maximo por llamada HTTP, en ms (por defecto 15 s). */
  readonly tiempoMaximoMs?: number;
  /** Solo para pruebas con un servidor falso. */
  readonly urlToken?: string;
  readonly urlEnvio?: string;
  readonly fetchFn?: typeof fetch;
  /** Reloj inyectable para probar el vencimiento del token de acceso. */
  readonly ahoraMs?: () => number;
}

const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const URL_ENVIO = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
/** Se renueva el token de acceso un minuto antes de que venza. */
const MARGEN_RENOVACION_MS = 60_000;

const MOTIVOS_DE_CUOTA = new Set([
  'ratelimitexceeded',
  'userratelimitexceeded',
  'dailylimitexceeded',
  'quotaexceeded',
  'resource_exhausted',
]);

/** Quita saltos de linea y caracteres de control: impide inyectar cabeceras. */
function sinControl(texto: string): string {
  // eslint-disable-next-line no-control-regex
  return texto.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim();
}

const base64 = (texto: string): string => Buffer.from(texto, 'utf8').toString('base64');
/** Palabra codificada RFC 2047: segura para nombres y asuntos con tildes o simbolos. */
const palabraCodificada = (texto: string): string => `=?UTF-8?B?${base64(texto)}?=`;

/**
 * Nombre visible del remitente: entre comillas si es ASCII imprimible (como lo escribe un cliente de
 * correo normal) y como palabra codificada solo si lleva caracteres no ASCII. Las comillas y barras se
 * escapan, y los saltos de linea ya fueron eliminados por `sinControl`.
 */
function nombreDeCabecera(nombre: string): string {
  if (/^[\x20-\x7E]*$/.test(nombre)) return `"${nombre.replace(/(["\\])/g, '\\$1')}"`;
  return palabraCodificada(nombre);
}

/** Motivo de rechazo que Google informa en el cuerpo del error (en minusculas), si lo hay. */
function motivoDeGoogle(cuerpo: unknown): string {
  if (typeof cuerpo !== 'object' || cuerpo === null) return '';
  const error = (cuerpo as { error?: unknown }).error;
  if (typeof error === 'string') return error.toLowerCase();
  if (typeof error !== 'object' || error === null) return '';
  const e = error as { status?: unknown; errors?: unknown };
  const razon = Array.isArray(e.errors) ? (e.errors[0] as { reason?: unknown } | undefined)?.reason : undefined;
  if (typeof razon === 'string') return razon.toLowerCase();
  return typeof e.status === 'string' ? e.status.toLowerCase() : '';
}

/** Traduce una respuesta HTTP de error a un codigo generico, sin conservar su contenido. */
export function codigoDeRespuestaGoogle(estado: number, cuerpo: unknown, esToken: boolean): CodigoFalloCorreo {
  const motivo = motivoDeGoogle(cuerpo);
  if (esToken) {
    if (estado === 429) return 'CUOTA';
    if (estado >= 500) return 'CONEXION';
    // invalid_grant (token revocado o caducado), invalid_client, unauthorized_client...
    return 'AUTENTICACION';
  }
  if (estado === 401) return 'AUTENTICACION';
  if (estado === 429 || MOTIVOS_DE_CUOTA.has(motivo)) return 'CUOTA';
  if (estado === 403) return 'AUTENTICACION'; // permisos insuficientes o API no habilitada
  if (estado >= 500) return 'CONEXION';
  if (estado === 400) return 'RECHAZADO';
  return 'DESCONOCIDO';
}

/**
 * Envio por la Gmail API (HTTPS, puerto 443): funciona desde hosts que bloquean el SMTP, como Render
 * Free. Renueva el token de acceso con el refresh token y lo guarda solo en memoria. Nunca registra
 * ni conserva tokens, el secreto del cliente, el destinatario ni el cuerpo del mensaje.
 */
export class GmailApiCorreoAdapter implements CorreoPort {
  private acceso: { token: string; venceMs: number } | null = null;
  private renovacion: Promise<string> | null = null;

  constructor(private readonly config: ConfigGmailApi) {}

  private get fetchFn(): typeof fetch {
    return this.config.fetchFn ?? fetch;
  }

  private get ahora(): number {
    return (this.config.ahoraMs ?? Date.now)();
  }

  private get tiempoMaximo(): number {
    return this.config.tiempoMaximoMs ?? 15_000;
  }

  /** Llamada HTTP con tiempo maximo; los fallos de red o de tiempo se traducen a codigos genericos. */
  private async llamar(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(this.tiempoMaximo) });
    } catch (error) {
      const nombre = error instanceof Error ? error.name : '';
      throw new FalloEnvioCorreoError(nombre === 'TimeoutError' || nombre === 'AbortError' ? 'TIEMPO_AGOTADO' : 'CONEXION');
    }
  }

  private async leerJson(r: Response): Promise<unknown> {
    try {
      return await r.json();
    } catch {
      return undefined;
    }
  }

  private async tokenDeAcceso(): Promise<string> {
    if (this.acceso && this.acceso.venceMs - MARGEN_RENOVACION_MS > this.ahora) return this.acceso.token;
    // Varias llamadas simultaneas comparten una sola renovacion.
    this.renovacion ??= this.renovar().finally(() => {
      this.renovacion = null;
    });
    return this.renovacion;
  }

  private async renovar(): Promise<string> {
    const r = await this.llamar(this.config.urlToken ?? URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clienteId,
        client_secret: this.config.clienteSecreto,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const cuerpo = await this.leerJson(r);
    if (!r.ok) throw new FalloEnvioCorreoError(codigoDeRespuestaGoogle(r.status, cuerpo, true));
    const j = cuerpo as { access_token?: unknown; expires_in?: unknown } | undefined;
    if (typeof j?.access_token !== 'string' || j.access_token === '') throw new FalloEnvioCorreoError('DESCONOCIDO');
    const segundos = typeof j.expires_in === 'number' && j.expires_in > 0 ? j.expires_in : 3600;
    this.acceso = { token: j.access_token, venceMs: this.ahora + segundos * 1000 };
    return j.access_token;
  }

  /** Mensaje RFC 2822 en texto plano, con CRLF, codificado en base64url. */
  private construirRaw(mensaje: MensajeCorreo): string {
    const nombre = sinControl(this.config.remitenteNombre);
    const cuerpo = (base64(mensaje.texto).match(/.{1,76}/g) ?? []).join('\r\n');
    const cabeceras = [
      `From: ${nombreDeCabecera(nombre)} <${this.config.remitenteDireccion}>`,
      `To: ${mensaje.para}`,
      `Subject: ${palabraCodificada(sinControl(mensaje.asunto))}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
    ];
    return Buffer.from(`${cabeceras.join('\r\n')}\r\n\r\n${cuerpo}\r\n`, 'utf8').toString('base64url');
  }

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    // Antes de llamar a Google: una direccion con saltos de linea o sintaxis invalida no se envia.
    if (/[\u0000-\u001F\u007F\s<>,;]/.test(mensaje.para) || !tieneSintaxisDeCorreo(mensaje.para)) {
      throw new FalloEnvioCorreoError('RECHAZADO');
    }
    const raw = this.construirRaw(mensaje);
    for (let intento = 0; ; intento++) {
      const token = await this.tokenDeAcceso();
      const r = await this.llamar(this.config.urlEnvio ?? URL_ENVIO, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
      if (r.ok) return;
      const cuerpo = await this.leerJson(r);
      // Un 401 puede ser solo un token de acceso vencido: se renueva una vez y se reintenta.
      if (r.status === 401 && intento === 0) {
        this.acceso = null;
        continue;
      }
      throw new FalloEnvioCorreoError(codigoDeRespuestaGoogle(r.status, cuerpo, false));
    }
  }
}
