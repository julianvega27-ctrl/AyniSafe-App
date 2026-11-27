import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, jest } from '@jest/globals';
import { cargarConfigEvidencias } from '../../src/config/entorno';
import {
  CloudinaryEvidenciasAdapter,
  type ClienteCloudinary,
} from '../../src/modules/reportes/infraestructura/cloudinary-evidencias.adapter';
import { MemoriaEvidenciasAdapter } from '../../src/modules/reportes/infraestructura/memoria-evidencias.adapter';
import {
  CuotaProveedorError,
  ProveedorNoDisponibleError,
  RespuestaInvalidaError,
} from '../../src/modules/reportes/aplicacion/puertos/evidencias.port';
import { PublicIdInvalidoError } from '../../src/modules/reportes/dominio/evidencia';

const CRED = { cloudName: 'nube-prueba', apiKey: 'KEY-123456-NO-IMPRIMIR', apiSecret: 'SECRET-abcdef-NO-IMPRIMIR' };
const PID = 'aynisafe/3f2b8c1e-5a4d-4e6f-9b7a-0c1d2e3f4a5b';
const AJENO = 'otro-proyecto/3f2b8c1e-5a4d-4e6f-9b7a-0c1d2e3f4a5b';
const URL_FIRMADA = 'https://res.cloudinary.com/nube-prueba/image/authenticated/s--FIRMA123--/v1/aynisafe/x.jpg';

interface ClienteSimulado {
  subirStream: jest.Mock<ClienteCloudinary['subirStream']>;
  destruir: jest.Mock<ClienteCloudinary['destruir']>;
  url: jest.Mock<ClienteCloudinary['url']>;
}

function cliente(sobre: Partial<ClienteSimulado> = {}): ClienteSimulado {
  const c: ClienteSimulado = {
    subirStream: jest.fn<ClienteCloudinary['subirStream']>(async (o) => ({
      public_id: o.public_id,
      type: 'authenticated',
      resource_type: 'image',
      format: 'jpg',
      bytes: 1234,
      secure_url: URL_FIRMADA,
    })),
    destruir: jest.fn<ClienteCloudinary['destruir']>(async () => ({ result: 'ok' })),
    url: jest.fn<ClienteCloudinary['url']>(() => URL_FIRMADA),
    ...sobre,
  };
  return c;
}

function respuesta(cuerpo: Buffer, estado = 200, cabeceras: Record<string, string> = {}): Response {
  return new Response(new Uint8Array(cuerpo), { status: estado, headers: cabeceras });
}

function sinSecretos(texto: string) {
  expect(texto).not.toContain(CRED.apiKey);
  expect(texto).not.toContain(CRED.apiSecret);
  expect(texto).not.toContain('FIRMA123');
}

describe('cargarConfigEvidencias', () => {
  it('por defecto deshabilitado, con cuota inicial', () => {
    expect(cargarConfigEvidencias({}, 'production')).toEqual({ adaptador: 'deshabilitado', cuotaBytes: 524288000, cuotaObjetos: 1000 });
  });
  it('memoria en produccion falla al arrancar', () => {
    expect(() => cargarConfigEvidencias({ EVIDENCIAS_ADAPTADOR: 'memoria' }, 'production')).toThrow(/no se admite en produccion/);
  });
  it('memoria en pruebas y desarrollo se admite', () => {
    expect(cargarConfigEvidencias({ EVIDENCIAS_ADAPTADOR: 'memoria' }, 'test').adaptador).toBe('memoria');
    expect(cargarConfigEvidencias({ EVIDENCIAS_ADAPTADOR: 'memoria' }, 'development').adaptador).toBe('memoria');
  });
  it('valor desconocido falla', () => {
    expect(() => cargarConfigEvidencias({ EVIDENCIAS_ADAPTADOR: 'local' }, 'test')).toThrow(/EVIDENCIAS_ADAPTADOR/);
  });
  it.each(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'])('cloudinary sin %s nombra la variable sin valores', (falta) => {
    const env: Record<string, string> = {
      EVIDENCIAS_ADAPTADOR: 'cloudinary',
      CLOUDINARY_CLOUD_NAME: CRED.cloudName,
      CLOUDINARY_API_KEY: CRED.apiKey,
      CLOUDINARY_API_SECRET: CRED.apiSecret,
    };
    delete env[falta];
    let mensaje = '';
    try {
      cargarConfigEvidencias(env, 'production');
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain(falta);
    sinSecretos(mensaje);
    expect(mensaje).not.toContain(CRED.cloudName);
  });
  it('cloudinary completo', () => {
    const c = cargarConfigEvidencias(
      { EVIDENCIAS_ADAPTADOR: 'cloudinary', CLOUDINARY_CLOUD_NAME: CRED.cloudName, CLOUDINARY_API_KEY: CRED.apiKey, CLOUDINARY_API_SECRET: CRED.apiSecret },
      'production',
    );
    expect(c.cloudinary).toEqual(CRED);
  });
  it('cuota fuera de rango falla', () => {
    expect(() => cargarConfigEvidencias({ EVIDENCIAS_CUOTA_OBJETOS: '0' }, 'test')).toThrow(/EVIDENCIAS_CUOTA_OBJETOS/);
  });
});

describe('MemoriaEvidenciasAdapter', () => {
  it('sube, obtiene y elimina; rechaza ids ajenos', async () => {
    const m = new MemoriaEvidenciasAdapter();
    await m.subir(PID, Buffer.from('x'), 'image/jpeg');
    expect((await m.obtener(PID)).toString()).toBe('x');
    expect(await m.eliminar(PID)).toBe('eliminado');
    expect(await m.eliminar(PID)).toBe('no_existe');
    await expect(m.subir(AJENO, Buffer.from('x'), 'image/jpeg')).rejects.toBeInstanceOf(PublicIdInvalidoError);
  });
  it('respuesta perdida deja el objeto creado', async () => {
    const m = new MemoriaEvidenciasAdapter();
    m.fallarSubida = 'despues';
    await expect(m.subir(PID, Buffer.from('x'), 'image/jpeg')).rejects.toBeInstanceOf(ProveedorNoDisponibleError);
    expect(m.existe(PID)).toBe(true);
  });
});

describe('CloudinaryEvidenciasAdapter', () => {
  it('sube con las opciones exactas de aislamiento y privacidad', async () => {
    const c = cliente();
    const a = new CloudinaryEvidenciasAdapter(CRED, c);
    const r = await a.subir(PID, Buffer.from('img'), 'image/jpeg');
    expect(r).toEqual({ publicId: PID, tipo: 'image/jpeg', bytes: 1234 });
    const opciones = c.subirStream.mock.calls[0]![0];
    expect(opciones).toMatchObject({
      type: 'authenticated',
      resource_type: 'image',
      public_id: PID,
      asset_folder: 'aynisafe',
      tags: ['aynisafe'],
      overwrite: false,
      unique_filename: false,
    });
    expect(opciones).not.toHaveProperty('eager');
    expect(opciones).not.toHaveProperty('transformation');
    expect(opciones).not.toHaveProperty('upload_preset');
    expect(JSON.stringify(r)).not.toContain('https://');
  });

  it.each([
    ['subir', (a: CloudinaryEvidenciasAdapter) => a.subir(AJENO, Buffer.from('x'), 'image/jpeg')],
    ['obtener', (a: CloudinaryEvidenciasAdapter) => a.obtener(AJENO, 'image/jpeg')],
    ['eliminar', (a: CloudinaryEvidenciasAdapter) => a.eliminar(AJENO)],
  ])('%s rechaza un public_id ajeno sin llamar al cliente', async (_n, op) => {
    const c = cliente();
    const f = jest.fn<typeof fetch>();
    await expect(op(new CloudinaryEvidenciasAdapter(CRED, c, f))).rejects.toBeInstanceOf(PublicIdInvalidoError);
    expect(c.subirStream).not.toHaveBeenCalled();
    expect(c.destruir).not.toHaveBeenCalled();
    expect(c.url).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    ['otro public_id', { public_id: 'aynisafe/otro' }, 'public_id'],
    ['tipo upload', { type: 'upload' }, 'tipo'],
    ['otro formato', { format: 'png' }, 'formato'],
    ['bytes ausentes', { bytes: undefined }, 'bytes'],
  ])('respuesta con %s es invalida', async (_n, cambio, motivo) => {
    const c = cliente({
      subirStream: jest.fn<ClienteCloudinary['subirStream']>(async (o) => ({
        public_id: o.public_id,
        type: 'authenticated',
        format: 'jpg',
        bytes: 10,
        ...cambio,
      })),
    });
    await expect(new CloudinaryEvidenciasAdapter(CRED, c).subir(PID, Buffer.from('x'), 'image/jpeg')).rejects.toMatchObject({
      name: 'RespuestaInvalidaError',
      motivo,
    });
  });

  it('error del SDK se traduce sin mensaje ni secretos', async () => {
    const c = cliente({
      subirStream: jest.fn<ClienteCloudinary['subirStream']>(async () => {
        throw { http_code: 500, message: `fallo en ${URL_FIRMADA} con ${CRED.apiKey}` };
      }),
    });
    let error: unknown;
    try {
      await new CloudinaryEvidenciasAdapter(CRED, c).subir(PID, Buffer.from('x'), 'image/jpeg');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ProveedorNoDisponibleError);
    expect((error as ProveedorNoDisponibleError).causa).toBe('http_500');
    sinSecretos(JSON.stringify(error) + String(error) + (error as Error).stack);
  });

  it('cuota del proveedor se identifica', async () => {
    const c = cliente({
      subirStream: jest.fn<ClienteCloudinary['subirStream']>(async () => {
        throw { http_code: 420, message: 'Rate Limit Exceeded' };
      }),
    });
    await expect(new CloudinaryEvidenciasAdapter(CRED, c).subir(PID, Buffer.from('x'), 'image/jpeg')).rejects.toBeInstanceOf(CuotaProveedorError);
  });

  it('obtener firma la URL en el servidor, sin redirecciones, y devuelve solo bytes', async () => {
    const c = cliente();
    const f = jest.fn<typeof fetch>(async () => respuesta(Buffer.from('imagen')));
    const bytes = await new CloudinaryEvidenciasAdapter(CRED, c, f).obtener(PID, 'image/webp');
    expect(bytes.toString()).toBe('imagen');
    expect(c.url.mock.calls[0]![1]).toMatchObject({ type: 'authenticated', sign_url: true, format: 'webp' });
    expect(f.mock.calls[0]![1]).toMatchObject({ redirect: 'error' });
  });

  it.each([
    ['404 del proveedor', () => respuesta(Buffer.from(''), 404)],
    ['content-length mayor de 5 MB', () => respuesta(Buffer.from('x'), 200, { 'content-length': String(5 * 1024 * 1024 + 1) })],
    ['cuerpo mayor de 5 MB', () => respuesta(Buffer.alloc(5 * 1024 * 1024 + 1))],
  ])('obtener con %s da no disponible', async (_n, r) => {
    const f = jest.fn<typeof fetch>(async () => r());
    await expect(new CloudinaryEvidenciasAdapter(CRED, cliente(), f).obtener(PID, 'image/jpeg')).rejects.toBeInstanceOf(ProveedorNoDisponibleError);
  });

  it('fallo de red al obtener no filtra la URL firmada', async () => {
    const f = jest.fn<typeof fetch>(async () => {
      throw new TypeError(`fetch failed ${URL_FIRMADA}`);
    });
    let error: unknown;
    try {
      await new CloudinaryEvidenciasAdapter(CRED, cliente(), f).obtener(PID, 'image/jpeg');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ProveedorNoDisponibleError);
    sinSecretos(JSON.stringify(error) + String(error) + (error as Error).stack);
  });

  it('eliminar usa destroy con invalidate y tipo authenticated', async () => {
    const c = cliente();
    expect(await new CloudinaryEvidenciasAdapter(CRED, c).eliminar(PID)).toBe('eliminado');
    expect(c.destruir).toHaveBeenCalledWith(PID, expect.objectContaining({ invalidate: true, type: 'authenticated', resource_type: 'image' }));
  });

  it('not found se informa como no_existe; otro resultado es invalido', async () => {
    const nf = cliente({ destruir: jest.fn<ClienteCloudinary['destruir']>(async () => ({ result: 'not found' })) });
    expect(await new CloudinaryEvidenciasAdapter(CRED, nf).eliminar(PID)).toBe('no_existe');
    const raro = cliente({ destruir: jest.fn<ClienteCloudinary['destruir']>(async () => ({ result: 'error' })) });
    await expect(new CloudinaryEvidenciasAdapter(CRED, raro).eliminar(PID)).rejects.toBeInstanceOf(RespuestaInvalidaError);
  });

  it('el modulo no usa borrado masivo del proveedor', () => {
    const fuente = readFileSync(resolve(__dirname, '../../src/modules/reportes/infraestructura/cloudinary-evidencias.adapter.ts'), 'utf8');
    for (const prohibido of ['delete_resources_by_prefix', 'delete_resources_by_tag', 'delete_folder', 'delete_all_resources', 'delete_resources', 'delete_derived'])
      expect(fuente).not.toContain(prohibido);
  });
});
