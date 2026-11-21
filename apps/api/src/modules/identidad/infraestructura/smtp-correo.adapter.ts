import nodemailer, { type Transporter } from 'nodemailer';
import type { CorreoPort, MensajeCorreo } from '../aplicacion/puertos/correo.port';
import { FalloEnvioCorreoError, type CodigoFalloCorreo } from '../dominio/errores';

export interface ConfigSmtp {
  readonly host: string;
  readonly puerto: number;
  readonly usuario: string;
  readonly clave: string;
  readonly remitenteNombre: string;
  readonly remitenteDireccion: string;
  /** Tiempos maximos en ms; por defecto 10 s de conexion y 20 s de silencio. */
  readonly tiempoConexionMs?: number;
  readonly tiempoSocketMs?: number;
  /** Solo para pruebas con un servidor local sin TLS. */
  readonly sinTls?: boolean;
}

/** Traduce un error de nodemailer a un codigo generico, sin conservar su mensaje. */
export function codigoDeFalloSmtp(error: unknown): CodigoFalloCorreo {
  const e = (typeof error === 'object' && error !== null ? error : {}) as {
    code?: unknown;
    responseCode?: unknown;
    response?: unknown;
  };
  const codigo = typeof e.code === 'string' ? e.code : '';
  const respuesta = typeof e.responseCode === 'number' ? e.responseCode : 0;
  if (codigo === 'EAUTH' || respuesta === 535 || respuesta === 534) return 'AUTENTICACION';
  if (codigo === 'ETIMEDOUT' || codigo === 'ESOCKET_TIMEOUT' || codigo === 'ECONNECTION_TIMEOUT') {
    return 'TIEMPO_AGOTADO';
  }
  if (respuesta === 550 && /5\.4\.5/.test(typeof e.response === 'string' ? e.response : '')) return 'CUOTA';
  if (respuesta === 550 || respuesta === 552 || respuesta === 554 || codigo === 'EENVELOPE') return 'RECHAZADO';
  // nodemailer usa ESOCKET (conexion rechazada o cortada) y EDNS (nombre no resuelto).
  if (
    codigo === 'ESOCKET' ||
    codigo === 'EDNS' ||
    codigo === 'ECONNECTION' ||
    codigo === 'ECONNREFUSED' ||
    codigo === 'ENOTFOUND' ||
    codigo === 'ECONNRESET'
  ) {
    return 'CONEXION';
  }
  return 'DESCONOCIDO';
}

/** Envio por SMTP (Gmail con contrasena de aplicacion en el piloto). */
export class SmtpCorreoAdapter implements CorreoPort {
  private readonly transporte: Transporter;

  constructor(private readonly config: ConfigSmtp) {
    this.transporte = nodemailer.createTransport({
      host: config.host,
      port: config.puerto,
      secure: config.puerto === 465,
      ...(config.sinTls ? { secure: false, ignoreTLS: true } : {}),
      auth: { user: config.usuario, pass: config.clave },
      connectionTimeout: config.tiempoConexionMs ?? 10_000,
      greetingTimeout: config.tiempoConexionMs ?? 10_000,
      socketTimeout: config.tiempoSocketMs ?? 20_000,
      // Sin registro propio de nodemailer: su salida puede incluir direcciones y cabeceras.
      logger: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    try {
      await this.transporte.sendMail({
        from: { name: this.config.remitenteNombre, address: this.config.remitenteDireccion },
        to: mensaje.para,
        subject: mensaje.asunto,
        text: mensaje.texto,
      });
    } catch (error) {
      throw new FalloEnvioCorreoError(codigoDeFalloSmtp(error));
    }
  }
}
