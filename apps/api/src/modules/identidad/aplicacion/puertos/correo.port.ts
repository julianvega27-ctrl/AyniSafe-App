export interface MensajeCorreo {
  readonly para: string;
  readonly asunto: string;
  /** Texto plano. No se envia HTML ni se incluye seguimiento. */
  readonly texto: string;
}

/**
 * Entrega de un correo transaccional. Un fallo lanza FalloEnvioCorreoError con un codigo
 * generico; las implementaciones nunca filtran destinatario, cuerpo, enlace ni credenciales.
 */
export interface CorreoPort {
  enviar(mensaje: MensajeCorreo): Promise<void>;
}
