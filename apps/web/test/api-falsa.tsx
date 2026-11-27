import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { App } from '../src/App';
import type { ContenidoPublico, UsuarioInstitucional } from '../src/api/cliente';
import { ProveedorSesion } from '../src/sesion/SesionContexto';

export interface Llamada {
  readonly metodo: string;
  readonly ruta: string;
  readonly cuerpo: unknown;
  readonly init: RequestInit;
}

/** Respuesta falsa: un objeto con estado, cuerpo y cabeceras, o `'red'` para simular que no hay conexion. */
export type Falsa = { estado: number; cuerpo?: unknown; cabeceras?: Record<string, string> } | 'red';
export type Manejador = (llamada: Llamada) => Falsa | Promise<Falsa>;

export const json = (estado: number, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Falsa => ({ estado, cuerpo, cabeceras });

/** Sustituye `fetch` por un manejador; registra cada llamada para poder comprobar lo que se envio. */
export function instalarApi(manejador: Manejador): { llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: RequestInfo | URL, init: RequestInit = {}) => {
      const llamada: Llamada = {
        metodo: (init.method ?? 'GET').toUpperCase(),
        ruta: String(entrada),
        cuerpo: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
        init,
      };
      llamadas.push(llamada);
      const f = await manejador(llamada);
      if (f === 'red') throw new TypeError('Failed to fetch');
      const sinCuerpo = f.estado === 204 || f.cuerpo === undefined;
      return new Response(sinCuerpo ? null : JSON.stringify(f.cuerpo), {
        status: f.estado,
        headers: { 'Content-Type': 'application/json', ...f.cabeceras },
      });
    }),
  );
  return { llamadas };
}

export const admin: UsuarioInstitucional = { id: '5482bbd9-ef53-4049-a095-19a9d0144eeb', nombre: 'Ana Torres', correo: 'ana@ejemplo.com', rol: 'administrador' };
export const operador: UsuarioInstitucional = { id: '6e7a1d55-1c61-4d3a-9d2a-0f4b5d1c2a11', nombre: 'Omar Quispe', correo: 'omar@ejemplo.com', rol: 'operador' };

export const contenido = (extra: Partial<ContenidoPublico> = {}): ContenidoPublico => ({
  version: 2,
  app: { estado: 'aprobado', finalidad: 'Finalidad de prueba de AyniSafe.', funcionamiento: 'Funcionamiento de prueba de AyniSafe.' },
  piloto: { estado: 'pendiente' },
  desarrolladores: { estado: 'aprobado', personas: [{ nombre: 'Dev de Prueba', rol: 'Desarrollador' }] },
  ...extra,
});

export const SECCIONES_ADMIN = [
  { id: 'inicio', titulo: 'Inicio', disponible: true },
  { id: 'instituciones-sedes', titulo: 'Instituciones y sedes', disponible: true },
  { id: 'operadores', titulo: 'Operadores', disponible: true },
  { id: 'coberturas', titulo: 'Coberturas', disponible: true },
  { id: 'categorias', titulo: 'Categorías', disponible: false },
  { id: 'reglas', titulo: 'Reglas', disponible: false },
  { id: 'contenido-contactos', titulo: 'Contenido y contactos', disponible: false },
  { id: 'historial', titulo: 'Historial', disponible: false },
];
export const SECCIONES_OPERADOR = [
  { id: 'inicio', titulo: 'Inicio', disponible: false },
  { id: 'incidentes', titulo: 'Incidentes', disponible: true },
  { id: 'mapa', titulo: 'Mapa', disponible: false },
  { id: 'indicadores', titulo: 'Indicadores', disponible: false },
  { id: 'historial', titulo: 'Historial', disponible: false },
];

/** API de un servidor ficticio con estado de sesion: simula la cookie sin que la web la toque. */
export function servidorFalso(opciones: { sesion?: UsuarioInstitucional | null; contenido?: ContenidoPublico } = {}) {
  const estado = { sesion: opciones.sesion ?? null as UsuarioInstitucional | null };
  const manejador: Manejador = ({ metodo, ruta, cuerpo }) => {
    if (ruta === '/api/v1/publico/contenido') return json(200, opciones.contenido ?? contenido());
    if (ruta === '/api/v1/auth/institucional/sesion' && metodo === 'GET') {
      return estado.sesion ? json(200, { usuario: estado.sesion, expiresAt: '2026-11-22T00:00:00.000Z' }) : json(401, { error: { code: 'UNAUTHENTICATED' } });
    }
    if (ruta === '/api/v1/auth/institucional/sesion' && metodo === 'DELETE') {
      estado.sesion = null;
      return json(204);
    }
    if (ruta === '/api/v1/auth/institucional/sesiones') {
      const c = cuerpo as { correo: string; contrasena: string };
      if (c.correo === admin.correo && c.contrasena === 'contraseña-correcta-123') {
        estado.sesion = admin;
        return json(200, { usuario: admin, expiresAt: '2026-11-22T00:00:00.000Z' });
      }
      if (c.correo === operador.correo && c.contrasena === 'contraseña-correcta-123') {
        estado.sesion = operador;
        return json(200, { usuario: operador, expiresAt: '2026-11-22T00:00:00.000Z' });
      }
      return json(401, { error: { code: 'INVALID_CREDENTIALS' } });
    }
    const panel = /^\/api\/v1\/(administrador|operador)\/panel$/.exec(ruta);
    if (panel) {
      if (!estado.sesion) return json(401, { error: { code: 'UNAUTHENTICATED' } });
      if (estado.sesion.rol !== panel[1]) return json(403, { error: { code: 'FORBIDDEN' } });
      return json(200, { usuario: estado.sesion, secciones: panel[1] === 'administrador' ? SECCIONES_ADMIN : SECCIONES_OPERADOR });
    }
    // P4.2: sin casos por defecto (las pruebas de bandeja y pendientes instalan los suyos).
    if (ruta.startsWith('/api/v1/admin/enrutamientos-pendientes') && metodo === 'GET') {
      if (estado.sesion?.rol !== 'administrador') return json(estado.sesion ? 403 : 401, { error: { code: estado.sesion ? 'FORBIDDEN' : 'UNAUTHENTICATED' } });
      return json(200, { elementos: [], siguiente: null });
    }
    if (ruta.startsWith('/api/v1/operador/incidentes') && metodo === 'GET') {
      if (estado.sesion?.rol !== 'operador') return json(estado.sesion ? 403 : 401, { error: { code: estado.sesion ? 'FORBIDDEN' : 'UNAUTHENTICATED' } });
      return ruta === '/api/v1/operador/incidentes' ? json(200, { elementos: [], siguiente: null }) : json(404, { error: { code: 'NOT_FOUND' } });
    }
    return json(404, { error: { code: 'NOT_FOUND' } });
  };
  return { estado, manejador };
}

export function renderizarApp(ruta = '/') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  );
}
