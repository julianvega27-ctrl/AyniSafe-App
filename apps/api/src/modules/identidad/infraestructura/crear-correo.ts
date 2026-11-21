import type { ConfigCorreo } from '../../../config/entorno';
import type { CorreoPort } from '../aplicacion/puertos/correo.port';
import { CorreoArchivoAdapter } from './correo-archivo.adapter';
import { CorreoPruebaAdapter } from './correo-prueba.adapter';
import { GmailApiCorreoAdapter } from './gmail-api-correo.adapter';
import { SmtpCorreoAdapter } from './smtp-correo.adapter';

/** Elige el adaptador segun la configuracion ya validada (en produccion solo gmail-api o smtp). */
export function crearCorreo(config: ConfigCorreo): CorreoPort {
  switch (config.adaptador) {
    case 'gmail-api': {
      if (!config.gmail) throw new Error('Configuracion invalida: falta la configuracion de la Gmail API');
      return new GmailApiCorreoAdapter({
        clienteId: config.gmail.clienteId,
        clienteSecreto: config.gmail.clienteSecreto,
        refreshToken: config.gmail.refreshToken,
        remitenteNombre: config.remitenteNombre,
        remitenteDireccion: config.remitenteDireccion,
      });
    }
    case 'smtp': {
      if (!config.smtp) throw new Error('Configuracion invalida: falta la configuracion SMTP');
      return new SmtpCorreoAdapter({
        host: config.smtp.host,
        puerto: config.smtp.puerto,
        usuario: config.smtp.usuario,
        clave: config.smtp.clave,
        remitenteNombre: config.remitenteNombre,
        remitenteDireccion: config.remitenteDireccion,
      });
    }
    case 'archivo':
      return new CorreoArchivoAdapter(config.directorioArchivo);
    default:
      return new CorreoPruebaAdapter();
  }
}
