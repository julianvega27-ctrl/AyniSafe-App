import { describe, expect, it } from 'vitest';
import { api } from '../src/api/cliente';
import { instalarApi, json } from './api-falsa';

describe('cliente de la API (mismo origen)', () => {
  it('usa rutas relativas, credenciales same-origin, sin Authorization ni cache', async () => {
    const { llamadas } = instalarApi(() => json(200, { usuario: {}, expiresAt: 'x' }));
    await api.iniciarSesion('a@b.pe', 'clave');
    await api.consultarSesion();
    await api.panel('administrador');
    await api.cerrarSesion();
    for (const l of llamadas) {
      expect(l.ruta.startsWith('/api/v1/')).toBe(true);
      expect(l.init.credentials).toBe('same-origin');
      expect(l.init.cache).toBe('no-store');
      const cabeceras = (l.init.headers ?? {}) as Record<string, string>;
      expect(Object.keys(cabeceras).map((h) => h.toLowerCase())).not.toContain('authorization');
    }
    expect(llamadas.map((l) => `${l.metodo} ${l.ruta}`)).toEqual([
      'POST /api/v1/auth/institucional/sesiones',
      'GET /api/v1/auth/institucional/sesion',
      'GET /api/v1/administrador/panel',
      'DELETE /api/v1/auth/institucional/sesion',
    ]);
  });

  it('mapea 2xx, 204 y los errores del contrato', async () => {
    instalarApi(({ ruta }) => {
      if (ruta.endsWith('/sesion')) return json(204);
      if (ruta.endsWith('/sesiones')) return json(400, { error: { code: 'VALIDATION_ERROR', fields: { correo: 'Ingresa un correo válido.' } } });
      if (ruta.endsWith('/panel')) return json(403, { error: { code: 'FORBIDDEN' } });
      return json(200, { ok: true });
    });
    expect(await api.cerrarSesion()).toEqual({ tipo: 'ok', datos: undefined });
    expect(await api.iniciarSesion('x', 'y')).toEqual({
      tipo: 'error',
      estado: 400,
      codigo: 'VALIDATION_ERROR',
      campos: { correo: 'Ingresa un correo válido.' },
      reintentarEn: undefined,
    });
    expect(await api.panel('operador')).toMatchObject({ tipo: 'error', estado: 403, codigo: 'FORBIDDEN' });
  });

  it('429 conserva Retry-After', async () => {
    instalarApi(() => json(429, { error: { code: 'RATE_LIMITED' } }, { 'Retry-After': '90' }));
    expect(await api.iniciarSesion('a', 'b')).toMatchObject({ tipo: 'error', estado: 429, reintentarEn: 90 });
  });

  it('5xx (incluidos 502 y 504 del proxy durante un arranque en frio) son «servicio»', async () => {
    for (const estado of [500, 502, 503, 504]) {
      instalarApi(() => json(estado, { error: { code: 'X' } }));
      expect(await api.consultarSesion()).toEqual({ tipo: 'servicio' });
    }
  });

  it('sin conexion es «red», nunca un exito', async () => {
    instalarApi(() => 'red');
    expect(await api.iniciarSesion('a', 'b')).toEqual({ tipo: 'red' });
  });

  it('un cuerpo 200 que no es JSON se trata como servicio, no como exito', async () => {
    const { llamadas } = instalarApi(() => ({ estado: 200, cuerpo: undefined }));
    expect(await api.consultarSesion()).toEqual({ tipo: 'servicio' });
    expect(llamadas).toHaveLength(1);
  });

  it('la contrasena y el token viajan solo en el cuerpo JSON, nunca en la URL', async () => {
    const { llamadas } = instalarApi(() => json(204));
    await api.activarCuenta('token-secreto-identificable-123456', 'contraseña-secreta-1234567');
    await api.consultarToken('token-secreto-identificable-123456');
    for (const l of llamadas) {
      expect(l.ruta).not.toContain('token-secreto');
      expect(l.ruta).not.toContain('contraseña');
      expect(l.ruta).not.toContain('?');
    }
  });
});
