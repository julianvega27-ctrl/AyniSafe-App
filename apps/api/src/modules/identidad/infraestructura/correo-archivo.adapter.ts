import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CorreoPort, MensajeCorreo } from '../aplicacion/puertos/correo.port';
import { FalloEnvioCorreoError } from '../dominio/errores';

/**
 * Solo desarrollo: escribe cada correo como archivo de texto en una carpeta ignorada por Git para
 * probar el flujo a mano sin enviar nada. El archivo contiene el enlace: no usar fuera de local.
 */
export class CorreoArchivoAdapter implements CorreoPort {
  constructor(private readonly directorio: string) {}

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    try {
      await mkdir(this.directorio, { recursive: true });
      const nombre = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}.txt`;
      await writeFile(
        join(this.directorio, nombre),
        `Para: ${mensaje.para}\nAsunto: ${mensaje.asunto}\n\n${mensaje.texto}\n`,
        'utf8',
      );
    } catch {
      throw new FalloEnvioCorreoError('DESCONOCIDO');
    }
  }
}
