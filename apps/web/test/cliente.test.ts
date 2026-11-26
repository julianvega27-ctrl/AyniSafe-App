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

describe('cliente de organizacion (P3.2)', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  it('metodos y rutas del contrato, mismo origen, cuerpos JSON y sin Authorization', async () => {
    const { llamadas } = instalarApi(() => json(200, {}));
    await api.instituciones();
    await api.actualizarInstitucion('samu', { contacto: null });
    await api.sedes();
    await api.crearSede({ institucionId: 'pnp', nombre: 'S', operador: { nombre: 'O', correo: 'o@e.pe' } });
    await api.actualizarSede(ID, { activa: false });
    await api.guardarCobertura(ID, ['DIS-01']);
    await api.guardarCompetencias(ID, ['robo']);
    await api.habilitarSede(ID);
    await api.deshabilitarSede(ID);
    await api.operadores(ID);
    await api.agregarOperador(ID, { nombre: 'A', correo: 'a@e.pe' });
    await api.cambiarEstadoOperador(ID, 'suspendido');
    await api.reenviarInvitacion(ID);
    await api.distritos();
    await api.categorias();
    const O = '/api/v1/administrador/organizacion';
    expect(llamadas.map((l) => `${l.metodo} ${l.ruta}`)).toEqual([
      `GET ${O}/instituciones`, `PATCH ${O}/instituciones/samu`, `GET ${O}/sedes`, `POST ${O}/sedes`, `PATCH ${O}/sedes/${ID}`,
      `PUT ${O}/sedes/${ID}/cobertura`, `PUT ${O}/sedes/${ID}/competencias`, `POST ${O}/sedes/${ID}/habilitacion`,
      `DELETE ${O}/sedes/${ID}/habilitacion`, `GET ${O}/sedes/${ID}/operadores`, `POST ${O}/sedes/${ID}/operadores`,
      `PATCH ${O}/operadores/${ID}`, `POST ${O}/operadores/${ID}/invitacion`,
      'GET /api/v1/publico/territorio/distritos', 'GET /api/v1/publico/categorias',
    ]);
    expect(llamadas[5]?.cuerpo).toEqual({ distritos: ['DIS-01'] });
    expect(llamadas[11]?.cuerpo).toEqual({ estado: 'suspendido' });
    for (const l of llamadas) {
      expect(l.init.credentials).toBe('same-origin');
      expect(Object.keys((l.init.headers ?? {}) as Record<string, string>).map((h) => h.toLowerCase())).not.toContain('authorization');
    }
  });

  it('traduce 401, 403, 409 con faltantes, 5xx y red sin afirmar exito', async () => {
    let respuesta: ReturnType<typeof json> | 'red' = json(401, { error: { code: 'UNAUTHENTICATED' } });
    instalarApi(() => respuesta);
    expect(await api.sedes()).toMatchObject({ tipo: 'error', estado: 401 });
    respuesta = json(403, { error: { code: 'FORBIDDEN' } });
    expect(await api.sedes()).toMatchObject({ tipo: 'error', estado: 403, codigo: 'FORBIDDEN' });
    respuesta = json(409, { error: { code: 'REQUISITOS_HABILITACION', faltantes: ['cobertura', 'operador_activo'] } });
    expect(await api.habilitarSede(ID)).toMatchObject({ tipo: 'error', estado: 409, codigo: 'REQUISITOS_HABILITACION', faltantes: ['cobertura', 'operador_activo'] });
    respuesta = json(503, { error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(await api.crearSede({ institucionId: 'pnp', nombre: 'S', operador: { nombre: 'O', correo: 'o@e.pe' } })).toEqual({ tipo: 'servicio' });
    respuesta = 'red';
    expect(await api.crearSede({ institucionId: 'pnp', nombre: 'S', operador: { nombre: 'O', correo: 'o@e.pe' } })).toEqual({ tipo: 'red' });
  });
});
