import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';
import { afterEach, describe, expect, it } from 'vitest';
import { FalloEnvioCorreoError } from '../../src/modules/identidad/dominio/errores';
import { SmtpCorreoAdapter } from '../../src/modules/identidad/infraestructura/smtp-correo.adapter';

// Servidor SMTP local sin TLS. Valida composicion del mensaje y manejo de errores; NO valida el
// proveedor real (eso lo cubre el envio real controlado de la tarea 11.2).
const USUARIO = 'cuenta-dedicada@gmail.com';
const CLAVE = 'clave-de-aplicacion-identificable-77';

interface Capturado {
  usuario?: string;
  crudo: string;
}

let servidor: SMTPServer | undefined;

async function levantar(opciones: { rechazarAuth?: boolean; rechazarDestino?: boolean } = {}) {
  const capturados: Capturado[] = [];
  servidor = new SMTPServer({
    authOptional: false,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    logger: false,
    onAuth(auth, _sesion, cb) {
      if (opciones.rechazarAuth || auth.username !== USUARIO || auth.password !== CLAVE) {
        cb(new Error('Credenciales rechazadas'));
        return;
      }
      cb(null, { user: auth.username });
    },
    onRcptTo(_dir, _sesion, cb) {
      if (opciones.rechazarDestino) {
        const e = new Error('Destinatario rechazado') as Error & { responseCode: number };
        e.responseCode = 550;
        cb(e);
        return;
      }
      cb();
    },
    onData(stream, sesion, cb) {
      let crudo = '';
      stream.on('data', (c: Buffer) => (crudo += c.toString('utf8')));
      stream.on('end', () => {
        capturados.push({ usuario: sesion.user as string | undefined, crudo });
        cb();
      });
    },
  });
  await new Promise<void>((ok) => servidor!.listen(0, '127.0.0.1', ok));
  const puerto = (servidor.server.address() as AddressInfo).port;
  return { puerto, capturados };
}

afterEach(async () => {
  if (servidor) await new Promise<void>((ok) => servidor!.close(ok));
  servidor = undefined;
});

const adaptador = (puerto: number, clave = CLAVE, extra: object = {}) =>
  new SmtpCorreoAdapter({
    host: '127.0.0.1',
    puerto,
    usuario: USUARIO,
    clave,
    remitenteNombre: 'AyniSafe',
    remitenteDireccion: USUARIO,
    sinTls: true,
    ...extra,
  });

describe('SmtpCorreoAdapter con servidor SMTP local', () => {
  it('compone remitente con nombre visible AyniSafe, destinatario, asunto y texto plano', async () => {
    const { puerto, capturados } = await levantar();
    await adaptador(puerto).enviar({ para: 'vecina@ejemplo.com', asunto: 'Restablece tu contraseña', texto: 'Hola\nEnlace: https://x/y#t=abc' });
    expect(capturados).toHaveLength(1);
    const { crudo, usuario } = capturados[0]!;
    expect(usuario).toBe(USUARIO);
    expect(crudo).toMatch(/^From: "?AyniSafe"? <cuenta-dedicada@gmail\.com>/m);
    expect(crudo).toMatch(/^To: vecina@ejemplo\.com/m);
    expect(crudo).toMatch(/^Subject: =\?UTF-8\?|^Subject: Restablece/m);
    expect(crudo).toMatch(/Content-Type: text\/plain/);
    expect(crudo).not.toMatch(/Content-Type: text\/html/);
    expect(crudo).toContain('Enlace: https://x/y#t=abc');
  });

  it('autenticacion rechazada: codigo AUTENTICACION sin la clave ni el mensaje del servidor', async () => {
    const { puerto } = await levantar();
    const error = await adaptador(puerto, 'clave-equivocada').enviar({ para: 'a@b.com', asunto: 's', texto: 't' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FalloEnvioCorreoError);
    expect((error as FalloEnvioCorreoError).codigo).toBe('AUTENTICACION');
    const texto = `${(error as Error).message} ${JSON.stringify(error)} ${(error as Error).stack}`;
    expect(texto).not.toContain('clave-equivocada');
    expect(texto).not.toContain(CLAVE);
    expect(texto).not.toContain('Credenciales rechazadas');
  });

  it('destinatario rechazado: codigo RECHAZADO sin exponer el destinatario ni el texto', async () => {
    const { puerto } = await levantar({ rechazarDestino: true });
    const error = await adaptador(puerto).enviar({ para: 'secreto@ejemplo.com', asunto: 's', texto: 'cuerpo-secreto' }).catch((e: unknown) => e);
    expect((error as FalloEnvioCorreoError).codigo).toBe('RECHAZADO');
    const volcado = `${(error as Error).message} ${JSON.stringify(error)} ${(error as Error).stack}`;
    expect(volcado).not.toContain('secreto@ejemplo.com');
    expect(volcado).not.toContain('cuerpo-secreto');
  });

  it('servidor inalcanzable: codigo CONEXION', async () => {
    const { puerto } = await levantar();
    await new Promise<void>((ok) => servidor!.close(ok));
    servidor = undefined;
    const error = await adaptador(puerto, CLAVE, { tiempoConexionMs: 2000 }).enviar({ para: 'a@b.com', asunto: 's', texto: 't' }).catch((e: unknown) => e);
    expect((error as FalloEnvioCorreoError).codigo).toBe('CONEXION');
  });

  it('un salto de linea en el asunto no inyecta cabeceras', async () => {
    const { puerto, capturados } = await levantar();
    await adaptador(puerto).enviar({ para: 'a@b.com', asunto: 'Hola\r\nBcc: victima@ejemplo.com', texto: 't' });
    expect(capturados[0]!.crudo).not.toMatch(/^Bcc:/m);
  });
});
