import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from '@jest/globals';
import { FalloEnvioCorreoError } from '../../src/modules/identidad/dominio/errores';
import {
  GmailApiCorreoAdapter,
  type ConfigGmailApi,
} from '../../src/modules/identidad/infraestructura/gmail-api-correo.adapter';

// Servidor HTTP falso de Google. Comprueba el protocolo y el manejo de errores; NO valida el
// proveedor real (eso lo hace el envio real controlado de la tarea 4.7).
const CLIENTE_ID = 'id-cliente-identificable.apps.googleusercontent.com';
const CLIENTE_SECRETO = 'secreto-cliente-identificable-4471';
const REFRESH = 'refresh-token-identificable-98123';
const ACCESO = 'token-de-acceso-identificable-5560';
const DESTINO = 'destinataria-identificable@ejemplo.com';
const CUERPO = 'Hola, Rosa. Código: abc123 — enlace https://x.test/cuenta/restablecer#t=zzz';

interface Registro {
  tokenReqs: URLSearchParams[];
  envios: { autorizacion?: string; raw: string }[];
}

type Respuesta = { estado: number; cuerpo?: unknown; esperaMs?: number };

let servidor: http.Server | undefined;

async function levantar(opciones: {
  token?: () => Respuesta;
  envio?: (n: number) => Respuesta;
} = {}) {
  const registro: Registro = { tokenReqs: [], envios: [] };
  let nEnvio = 0;
  servidor = http.createServer((req, res) => {
    let datos = '';
    req.on('data', (c) => (datos += c));
    req.on('end', () => {
      const responder = (r: Respuesta) => {
        setTimeout(() => {
          res.writeHead(r.estado, { 'Content-Type': 'application/json' });
          res.end(r.cuerpo === undefined ? '' : JSON.stringify(r.cuerpo));
        }, r.esperaMs ?? 0);
      };
      if (req.url === '/token') {
        registro.tokenReqs.push(new URLSearchParams(datos));
        return responder(opciones.token?.() ?? { estado: 200, cuerpo: { access_token: ACCESO, expires_in: 3600 } });
      }
      registro.envios.push({
        autorizacion: req.headers.authorization,
        raw: (JSON.parse(datos) as { raw: string }).raw,
      });
      nEnvio += 1;
      return responder(opciones.envio?.(nEnvio) ?? { estado: 200, cuerpo: { id: 'abc', labelIds: ['SENT'] } });
    });
  });
  await new Promise<void>((ok) => servidor!.listen(0, '127.0.0.1', ok));
  const puerto = (servidor.address() as AddressInfo).port;
  return { registro, base: `http://127.0.0.1:${puerto}` };
}

afterEach(async () => {
  if (servidor) await new Promise<void>((ok) => servidor!.close(() => ok()));
  servidor = undefined;
});

const adaptador = (base: string, extra: Partial<ConfigGmailApi> = {}) =>
  new GmailApiCorreoAdapter({
    clienteId: CLIENTE_ID,
    clienteSecreto: CLIENTE_SECRETO,
    refreshToken: REFRESH,
    remitenteNombre: 'AyniSafe',
    remitenteDireccion: 'cuenta-dedicada@gmail.com',
    urlToken: `${base}/token`,
    urlEnvio: `${base}/send`,
    ...extra,
  });

const mensaje = { para: DESTINO, asunto: 'Restablece tu contraseña de AyniSafe', texto: CUERPO };

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  const e = await promesa.then(
    () => undefined,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(FalloEnvioCorreoError);
  return (e as FalloEnvioCorreoError).codigo;
}

function decodificar(raw: string) {
  const texto = Buffer.from(raw, 'base64url').toString('utf8');
  const [cabeceras = '', ...resto] = texto.split('\r\n\r\n');
  const palabra = (valor: string) =>
    valor.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_m, b64: string) => Buffer.from(b64, 'base64').toString('utf8'));
  const mapa = new Map(cabeceras.split('\r\n').map((l) => [l.slice(0, l.indexOf(':')), palabra(l.slice(l.indexOf(':') + 1).trim())]));
  const cuerpo = Buffer.from(resto.join('\r\n\r\n').replace(/\s+/g, ''), 'base64').toString('utf8');
  return { texto, cabeceras, mapa, cuerpo };
}

describe('GmailApiCorreoAdapter: protocolo', () => {
  it('renueva el token de acceso con el refresh token y envia el mensaje RFC 2822', async () => {
    const { registro, base } = await levantar();
    await adaptador(base).enviar(mensaje);

    expect(registro.tokenReqs).toHaveLength(1);
    const t = registro.tokenReqs[0]!;
    expect(t.get('grant_type')).toBe('refresh_token');
    expect(t.get('refresh_token')).toBe(REFRESH);
    expect(t.get('client_id')).toBe(CLIENTE_ID);
    expect(t.get('client_secret')).toBe(CLIENTE_SECRETO);

    expect(registro.envios).toHaveLength(1);
    expect(registro.envios[0]!.autorizacion).toBe(`Bearer ${ACCESO}`);
    const m = decodificar(registro.envios[0]!.raw);
    expect(m.mapa.get('From')).toBe('"AyniSafe" <cuenta-dedicada@gmail.com>');
    // El nombre ASCII va entre comillas, como lo escribe un cliente de correo normal (no codificado).
    expect(Buffer.from(registro.envios[0]!.raw, 'base64url').toString('utf8')).toContain('From: "AyniSafe" <cuenta-dedicada@gmail.com>');
    expect(m.mapa.get('To')).toBe(DESTINO);
    expect(m.mapa.get('Subject')).toBe('Restablece tu contraseña de AyniSafe');
    expect(m.mapa.get('MIME-Version')).toBe('1.0');
    expect(m.mapa.get('Content-Type')).toBe('text/plain; charset=UTF-8');
    expect(m.cuerpo).toBe(CUERPO);
    expect(m.texto).not.toMatch(/text\/html/i);
  });

  it('guarda el token de acceso en memoria hasta poco antes de vencer y lo renueva despues', async () => {
    const { registro, base } = await levantar({ token: () => ({ estado: 200, cuerpo: { access_token: ACCESO, expires_in: 3600 } }) });
    let ahora = 1_000_000;
    const a = adaptador(base, { ahoraMs: () => ahora });
    await a.enviar(mensaje);
    await a.enviar(mensaje);
    expect(registro.tokenReqs).toHaveLength(1);
    ahora += 3600 * 1000 - 30_000; // faltan 30 s: dentro del margen de renovacion de 60 s
    await a.enviar(mensaje);
    expect(registro.tokenReqs).toHaveLength(2);
  });

  it('envios simultaneos comparten una sola renovacion del token', async () => {
    const { registro, base } = await levantar({ token: () => ({ estado: 200, cuerpo: { access_token: ACCESO, expires_in: 3600 }, esperaMs: 50 }) });
    const a = adaptador(base);
    await Promise.all([a.enviar(mensaje), a.enviar(mensaje), a.enviar(mensaje)]);
    expect(registro.tokenReqs).toHaveLength(1);
    expect(registro.envios).toHaveLength(3);
  });

  it('un 401 por token de acceso vencido se resuelve renovando una vez y reintentando', async () => {
    const { registro, base } = await levantar({ envio: (n) => (n === 1 ? { estado: 401, cuerpo: { error: { code: 401 } } } : { estado: 200, cuerpo: {} }) });
    await adaptador(base).enviar(mensaje);
    expect(registro.tokenReqs).toHaveLength(2);
    expect(registro.envios).toHaveLength(2);
  });

  it('un 401 persistente es AUTENTICACION y no se reintenta en bucle', async () => {
    const { registro, base } = await levantar({ envio: () => ({ estado: 401, cuerpo: { error: { code: 401 } } }) });
    expect(await codigoDe(adaptador(base).enviar(mensaje))).toBe('AUTENTICACION');
    expect(registro.envios).toHaveLength(2);
  });
});

describe('GmailApiCorreoAdapter: nombre del remitente', () => {
  it('con tildes se codifica (RFC 2047) y se decodifica a lo configurado; con comillas se escapan', async () => {
    const { registro, base } = await levantar();
    await adaptador(base, { remitenteNombre: 'Alerta Cívica' }).enviar(mensaje);
    await adaptador(base, { remitenteNombre: 'Ayni "Safe" \\ app' }).enviar(mensaje);
    const crudo = (i: number) => Buffer.from(registro.envios[i]!.raw, 'base64url').toString('utf8');
    expect(crudo(0)).toMatch(/From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <cuenta-dedicada@gmail\.com>/);
    expect(decodificar(registro.envios[0]!.raw).mapa.get('From')).toBe('Alerta Cívica <cuenta-dedicada@gmail.com>');
    expect(crudo(1)).toContain('From: "Ayni \\"Safe\\" \\\\ app" <cuenta-dedicada@gmail.com>');
  });
});

describe('GmailApiCorreoAdapter: errores a codigos genericos', () => {
  const casosToken: [string, Respuesta, string][] = [
    ['invalid_grant (token revocado o caducado)', { estado: 400, cuerpo: { error: 'invalid_grant' } }, 'AUTENTICACION'],
    ['invalid_client', { estado: 401, cuerpo: { error: 'invalid_client' } }, 'AUTENTICACION'],
    ['5xx al renovar', { estado: 503, cuerpo: {} }, 'CONEXION'],
    ['429 al renovar', { estado: 429, cuerpo: {} }, 'CUOTA'],
  ];
  it.each(casosToken)('renovacion: %s', async (_n, respuesta, esperado) => {
    const { base } = await levantar({ token: () => respuesta });
    expect(await codigoDe(adaptador(base).enviar(mensaje))).toBe(esperado);
  });

  const casosEnvio: [string, Respuesta, string][] = [
    ['429', { estado: 429, cuerpo: { error: { status: 'RESOURCE_EXHAUSTED' } } }, 'CUOTA'],
    ['403 rateLimitExceeded', { estado: 403, cuerpo: { error: { errors: [{ reason: 'rateLimitExceeded' }] } } }, 'CUOTA'],
    ['403 dailyLimitExceeded', { estado: 403, cuerpo: { error: { errors: [{ reason: 'dailyLimitExceeded' }] } } }, 'CUOTA'],
    ['403 permisos insuficientes', { estado: 403, cuerpo: { error: { errors: [{ reason: 'insufficientPermissions' }] } } }, 'AUTENTICACION'],
    ['400', { estado: 400, cuerpo: { error: { message: 'Invalid To header' } } }, 'RECHAZADO'],
    ['500', { estado: 500, cuerpo: {} }, 'CONEXION'],
    ['502 sin cuerpo JSON', { estado: 502 }, 'CONEXION'],
    ['404', { estado: 404, cuerpo: {} }, 'DESCONOCIDO'],
  ];
  it.each(casosEnvio)('envio: %s', async (_n, respuesta, esperado) => {
    const { base } = await levantar({ envio: () => respuesta });
    expect(await codigoDe(adaptador(base).enviar(mensaje))).toBe(esperado);
  });

  it('una respuesta 200 del token sin access_token es DESCONOCIDO', async () => {
    const { base } = await levantar({ token: () => ({ estado: 200, cuerpo: { otra: 1 } }) });
    expect(await codigoDe(adaptador(base).enviar(mensaje))).toBe('DESCONOCIDO');
  });

  it('tiempo agotado: TIEMPO_AGOTADO; servidor caido: CONEXION', async () => {
    const lento = await levantar({ token: () => ({ estado: 200, cuerpo: { access_token: ACCESO }, esperaMs: 400 }) });
    expect(await codigoDe(adaptador(lento.base, { tiempoMaximoMs: 100 }).enviar(mensaje))).toBe('TIEMPO_AGOTADO');
    await new Promise<void>((ok) => servidor!.close(() => ok()));
    servidor = undefined;
    expect(await codigoDe(adaptador(lento.base, { tiempoMaximoMs: 500 }).enviar(mensaje))).toBe('CONEXION');
  });
});

describe('GmailApiCorreoAdapter: seguridad', () => {
  it('no permite inyectar cabeceras por el asunto ni por el nombre del remitente', async () => {
    const { registro, base } = await levantar();
    const a = adaptador(base, { remitenteNombre: 'AyniSafe\r\nBcc: victima@ejemplo.com' });
    await a.enviar({ ...mensaje, asunto: 'Hola\r\nBcc: otra@ejemplo.com\r\nX-Falso: 1' });
    const m = decodificar(registro.envios[0]!.raw);
    // Las lineas de cabecera no contienen Bcc ni cabeceras adicionales inyectadas.
    const lineas = Buffer.from(registro.envios[0]!.raw, 'base64url').toString('utf8').split('\r\n\r\n')[0]!.split('\r\n');
    expect(lineas.some((l) => /^Bcc:/i.test(l) || /^X-Falso:/i.test(l))).toBe(false);
    expect(lineas.map((l) => l.slice(0, l.indexOf(':'))).sort()).toEqual(
      ['Content-Transfer-Encoding', 'Content-Type', 'From', 'MIME-Version', 'Subject', 'To'].sort(),
    );
    expect(m.mapa.get('Subject')).toContain('Bcc: otra@ejemplo.com');
  });

  it.each([
    'a@ejemplo.com\r\nBcc: b@ejemplo.com',
    'a@ejemplo.com, b@ejemplo.com',
    'a@ejemplo.com;b@ejemplo.com',
    '<a@ejemplo.com>',
    'no-es-correo',
    'a b@ejemplo.com',
  ])('un destinatario invalido (%j) se rechaza sin llamar a Google', async (para) => {
    const { registro, base } = await levantar();
    expect(await codigoDe(adaptador(base).enviar({ ...mensaje, para }))).toBe('RECHAZADO');
    expect(registro.tokenReqs).toHaveLength(0);
    expect(registro.envios).toHaveLength(0);
  });

  it('ni los errores ni su serializacion contienen tokens, secreto, destinatario ni cuerpo', async () => {
    // Google devuelve en su cuerpo de error justo los valores sensibles: no deben conservarse.
    const eco = { error: { message: `${CLIENTE_SECRETO} ${REFRESH} ${ACCESO} ${DESTINO} ${CUERPO}` } };
    for (const escenario of [
      { token: () => ({ estado: 400, cuerpo: { error: 'invalid_grant', error_description: eco.error.message } }) },
      { envio: () => ({ estado: 400, cuerpo: eco }) },
      { envio: () => ({ estado: 500, cuerpo: eco }) },
    ]) {
      const { base } = await levantar(escenario);
      const e = await adaptador(base).enviar(mensaje).then(() => undefined, (x: unknown) => x as Error);
      expect(e).toBeInstanceOf(FalloEnvioCorreoError);
      const volcado = `${e!.message} ${JSON.stringify(e)} ${e!.stack} ${String(e)}`;
      for (const secreto of [CLIENTE_SECRETO, REFRESH, ACCESO, DESTINO, 'Código', 'abc123', CLIENTE_ID]) {
        expect(volcado).not.toContain(secreto);
      }
      await new Promise<void>((ok) => servidor!.close(() => ok()));
      servidor = undefined;
    }
  });
});
