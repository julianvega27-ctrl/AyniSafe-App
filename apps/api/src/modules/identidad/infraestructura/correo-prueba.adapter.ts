import type { CorreoPort, MensajeCorreo } from '../aplicacion/puertos/correo.port';
import { FalloEnvioCorreoError, type CodigoFalloCorreo } from '../dominio/errores';

/**
 * Adaptador de pruebas: guarda los mensajes en memoria y permite programar fallos. No envia nada
 * y por tanto NO valida el proveedor real.
 */
export class CorreoPruebaAdapter implements CorreoPort {
  readonly enviados: MensajeCorreo[] = [];
  private fallosPendientes: CodigoFalloCorreo[] = [];

  /** Los proximos `veces` envios fallan con el codigo indicado (los intentos fallidos no se guardan). */
  programarFallos(veces: number, codigo: CodigoFalloCorreo = 'CONEXION'): void {
    this.fallosPendientes = Array.from({ length: veces }, () => codigo);
  }

  enviar(mensaje: MensajeCorreo): Promise<void> {
    const codigo = this.fallosPendientes.shift();
    if (codigo) return Promise.reject(new FalloEnvioCorreoError(codigo));
    this.enviados.push(mensaje);
    return Promise.resolve();
  }
}
