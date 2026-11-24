import { describe, expect, it } from '@jest/globals';
import { cargarEntorno } from '../../src/config/entorno';
import { CorreoArchivoAdapter } from '../../src/modules/identidad/infraestructura/correo-archivo.adapter';
import { CorreoPruebaAdapter } from '../../src/modules/identidad/infraestructura/correo-prueba.adapter';
import { crearCorreo } from '../../src/modules/identidad/infraestructura/crear-correo';
import { GmailApiCorreoAdapter } from '../../src/modules/identidad/infraestructura/gmail-api-correo.adapter';
import { SmtpCorreoAdapter } from '../../src/modules/identidad/infraestructura/smtp-correo.adapter';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5433/x',
  RATE_LIMIT_HMAC_SECRET: 'x'.repeat(40),
  API_PUBLIC_URL: 'https://api.ayinisafe.test',
  WEB_ORIGIN: 'https://web.ayinisafe.test',
  WEB_PUBLIC_URL: 'https://web.ayinisafe.test',
};
const CLAVE_SMTP = 'clave-smtp-identificable-9f3a';
const SMTP = { SMTP_USUARIO: 'cuenta@gmail.com', SMTP_CLAVE: CLAVE_SMTP };
const SECRETO_GMAIL = 'secreto-gmail-identificable-5512';
const REFRESH_GMAIL = 'refresh-gmail-identificable-7730';
const GMAIL = {
  EMAIL_ADAPTER: 'gmail-api',
  GMAIL_CLIENT_ID: 'id.apps.googleusercontent.com',
  GMAIL_CLIENT_SECRET: SECRETO_GMAIL,
  GMAIL_REFRESH_TOKEN: REFRESH_GMAIL,
  MAIL_REMITENTE_DIRECCION: 'cuenta@gmail.com',
};

const cargar = (env: Record<string, string>) => cargarEntorno({ ...BASE, ...env } as NodeJS.ProcessEnv);

function mensajeDeError(env: Record<string, string>): string {
  try {
    cargar(env);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('se esperaba un error de configuracion');
}

describe('seleccion del adaptador de correo por entorno', () => {
  it('por defecto: archivo en desarrollo y prueba en test (nunca envia correo real sin pedirlo)', () => {
    expect(cargar({ NODE_ENV: 'development' }).correo.adaptador).toBe('archivo');
    expect(cargar({ NODE_ENV: 'test' }).correo.adaptador).toBe('prueba');
    expect(cargar({ NODE_ENV: 'development', ...SMTP }).correo.adaptador).toBe('archivo');
  });

  it('en produccion solo se admiten gmail-api y smtp: prueba y archivo hacen fallar el arranque sin mostrar valores', () => {
    for (const adaptador of ['prueba', 'archivo']) {
      const msg = mensajeDeError({ NODE_ENV: 'production', ...SMTP, ...GMAIL, EMAIL_ADAPTER: adaptador });
      expect(msg).toBe('Configuracion invalida: en produccion EMAIL_ADAPTER debe ser gmail-api o smtp');
      expect(msg).not.toContain(CLAVE_SMTP);
      expect(msg).not.toContain(SECRETO_GMAIL);
    }
  });

  it('en produccion sin adaptador pedido usa gmail-api y nombra solo la variable que falta', () => {
    expect(mensajeDeError({ NODE_ENV: 'production' })).toContain('MAIL_REMITENTE_DIRECCION');
    const sinCliente = { NODE_ENV: 'production', MAIL_REMITENTE_DIRECCION: 'a@gmail.com' };
    expect(mensajeDeError(sinCliente)).toContain('GMAIL_CLIENT_ID');
    expect(mensajeDeError({ ...sinCliente, GMAIL_CLIENT_ID: 'x' })).toContain('GMAIL_CLIENT_SECRET');
    expect(mensajeDeError({ ...sinCliente, GMAIL_CLIENT_ID: 'x', GMAIL_CLIENT_SECRET: 'y' })).toContain('GMAIL_REFRESH_TOKEN');
    expect(() => cargar({ NODE_ENV: 'production', EMAIL_ADAPTER: 'smtp', SMTP_USUARIO: 'a@gmail.com' })).toThrow(/SMTP_CLAVE/);
  });

  it('gmail-api: lee las credenciales y exige remitente explicito y valido; nunca las muestra en errores', () => {
    const c = cargar({ NODE_ENV: 'production', ...GMAIL }).correo;
    expect(c.adaptador).toBe('gmail-api');
    expect(c.gmail).toEqual({ clienteId: 'id.apps.googleusercontent.com', clienteSecreto: SECRETO_GMAIL, refreshToken: REFRESH_GMAIL });
    expect(c.remitenteDireccion).toBe('cuenta@gmail.com');
    const msg = mensajeDeError({ NODE_ENV: 'production', ...GMAIL, MAIL_REMITENTE_DIRECCION: 'no-es-correo' });
    expect(msg).toContain('MAIL_REMITENTE_DIRECCION');
    expect(msg).not.toContain(SECRETO_GMAIL);
    expect(msg).not.toContain(REFRESH_GMAIL);
    expect(mensajeDeError({ NODE_ENV: 'production', ...GMAIL, GMAIL_REFRESH_TOKEN: `${REFRESH_GMAIL}\r\nX: 1` })).not.toContain(REFRESH_GMAIL);
    // En desarrollo no se envia correo real salvo que se pida: sin EMAIL_ADAPTER sigue siendo archivo.
    expect(cargar({ NODE_ENV: 'development', GMAIL_CLIENT_ID: 'x' }).correo.adaptador).toBe('archivo');
  });

  it('smtp: valores por defecto de Gmail, remitente igual a la cuenta y nombre AyniSafe', () => {
    const c = cargar({ NODE_ENV: 'production', EMAIL_ADAPTER: 'smtp', ...SMTP }).correo;
    expect(c.adaptador).toBe('smtp');
    expect(c.smtp).toMatchObject({ host: 'smtp.gmail.com', puerto: 465, usuario: 'cuenta@gmail.com' });
    expect(c.remitenteDireccion).toBe('cuenta@gmail.com');
    expect(c.remitenteNombre).toBe('AyniSafe');
  });

  it('rechaza valores invalidos sin incluir los valores en el mensaje', () => {
    expect(mensajeDeError({ EMAIL_ADAPTER: 'otro' })).toBe('Configuracion invalida: EMAIL_ADAPTER debe ser gmail-api, smtp, prueba o archivo');
    expect(mensajeDeError({ EMAIL_ADAPTER: 'smtp', ...SMTP, SMTP_PORT: '99999' })).toContain('SMTP_PORT');
    expect(mensajeDeError({ EMAIL_ADAPTER: 'smtp', ...SMTP, MAIL_REMITENTE_DIRECCION: 'no-es-correo' })).toContain(
      'MAIL_REMITENTE_DIRECCION',
    );
  });

  it('rechaza saltos de linea en nombre o direccion del remitente (inyeccion de cabeceras)', () => {
    expect(mensajeDeError({ EMAIL_ADAPTER: 'smtp', ...SMTP, MAIL_REMITENTE_NOMBRE: 'AyniSafe\r\nBcc: x@y.com' })).toContain(
      'MAIL_REMITENTE_NOMBRE',
    );
  });

  it('crearCorreo devuelve el adaptador que corresponde', () => {
    expect(crearCorreo(cargar({ NODE_ENV: 'test' }).correo)).toBeInstanceOf(CorreoPruebaAdapter);
    expect(crearCorreo(cargar({ NODE_ENV: 'development' }).correo)).toBeInstanceOf(CorreoArchivoAdapter);
    expect(crearCorreo(cargar({ NODE_ENV: 'production', EMAIL_ADAPTER: 'smtp', ...SMTP }).correo)).toBeInstanceOf(SmtpCorreoAdapter);
    expect(crearCorreo(cargar({ NODE_ENV: 'production', ...GMAIL }).correo)).toBeInstanceOf(GmailApiCorreoAdapter);
  });
});

describe('URL publica de la API (base de los enlaces del correo)', () => {
  it('se normaliza al origen y por defecto apunta al servidor local en desarrollo', () => {
    expect(cargar({ NODE_ENV: 'development', API_PUBLIC_URL: '' }).urlPublicaApi).toBe('http://127.0.0.1:3000');
    expect(cargar({ NODE_ENV: 'development', API_PUBLIC_URL: '', PORT: '4000' }).urlPublicaApi).toBe('http://127.0.0.1:4000');
    expect(cargar({ NODE_ENV: 'production', ...GMAIL, API_PUBLIC_URL: 'https://api.ayinisafe.test/' }).urlPublicaApi).toBe(
      'https://api.ayinisafe.test',
    );
  });

  it('en produccion es obligatoria y debe ser https', () => {
    expect(mensajeDeError({ NODE_ENV: 'production', ...GMAIL, API_PUBLIC_URL: '' })).toContain('API_PUBLIC_URL');
    expect(mensajeDeError({ NODE_ENV: 'production', ...GMAIL, API_PUBLIC_URL: 'http://api.ayinisafe.test' })).toBe(
      'Configuracion invalida: en produccion API_PUBLIC_URL debe usar https',
    );
  });

  it('rechaza rutas, parametros, fragmentos y credenciales sin repetir el valor', () => {
    for (const valor of [
      'https://api.test/ruta',
      'https://api.test/?a=1',
      'https://api.test/#x',
      'https://usuario:clave-secreta@api.test',
      'no es una url',
      'ftp://api.test',
    ]) {
      const msg = mensajeDeError({ NODE_ENV: 'development', API_PUBLIC_URL: valor });
      expect(msg).toContain('API_PUBLIC_URL');
      expect(msg).not.toContain('clave-secreta');
    }
  });
});
