/**
 * Cliente de la API de AyniSafe. Todas las llamadas usan rutas relativas del mismo origen (en
 * produccion Vercel reescribe /api/* hacia la API; en desarrollo, el proxy de Vite), de modo que la
 * cookie de sesion HttpOnly nunca es de terceros y la API no necesita CORS. El cliente no lee ni
 * escribe cookies ni almacenamiento: la sesion es invisible para JavaScript.
 */

export type Rol = 'administrador' | 'operador';

export interface UsuarioInstitucional {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly rol: Rol;
}

export interface SeccionPanel {
  readonly id: string;
  readonly titulo: string;
  readonly disponible: boolean;
}

export type EstadoAprobacion = 'aprobado' | 'pendiente';

export interface ContenidoPublico {
  readonly version: number;
  readonly app: { readonly estado: EstadoAprobacion; readonly finalidad?: string; readonly funcionamiento?: string };
  readonly piloto: { readonly estado: EstadoAprobacion; readonly texto?: string };
  readonly desarrolladores: {
    readonly estado: EstadoAprobacion;
    readonly personas?: readonly { readonly nombre: string; readonly rol: string }[];
  };
}

/** Resultado tipado de una llamada: nunca lanza y nunca afirma un exito no confirmado. */
export type Resultado<T> =
  | { readonly tipo: 'ok'; readonly datos: T }
  /** La API respondio con un error del contrato (4xx). */
  | {
      readonly tipo: 'error';
      readonly estado: number;
      readonly codigo?: string;
      readonly campos?: Readonly<Record<string, string>>;
      /** Segundos de espera (Retry-After) cuando el estado es 429. */
      readonly reintentarEn?: number;
    }
  /** Sin conexion o la solicitud no llego. */
  | { readonly tipo: 'red' }
  /** El servicio no esta disponible (5xx, incluidos 502/504 del proxy o un arranque en frio) o tardo demasiado. */
  | { readonly tipo: 'servicio' };

/** Margen para el arranque en frio de Render (~1 min): mas alla se informa «servicio no disponible». */
const TIEMPO_MAXIMO_MS = 45_000;

interface Opciones {
  readonly metodo?: 'GET' | 'POST' | 'DELETE';
  readonly cuerpo?: unknown;
  readonly senal?: AbortSignal;
}

async function llamar<T>(ruta: string, opciones: Opciones = {}): Promise<Resultado<T>> {
  const { metodo = 'GET', cuerpo, senal } = opciones;
  // Control propio de cancelacion y de tiempo maximo (sin depender de AbortSignal.timeout/any).
  const controlador = new AbortController();
  let vencido = false;
  const temporizador = setTimeout(() => {
    vencido = true;
    controlador.abort();
  }, TIEMPO_MAXIMO_MS);
  const alCancelar = (): void => controlador.abort();
  senal?.addEventListener('abort', alCancelar, { once: true });
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: cuerpo !== undefined ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: controlador.signal,
    });
  } catch (error) {
    if (senal?.aborted) throw error; // cancelada por la propia pantalla: no es un fallo del servicio
    return vencido ? { tipo: 'servicio' } : { tipo: 'red' };
  } finally {
    clearTimeout(temporizador);
    senal?.removeEventListener('abort', alCancelar);
  }

  if (respuesta.status >= 500) return { tipo: 'servicio' };
  if (respuesta.ok) {
    if (respuesta.status === 204) return { tipo: 'ok', datos: undefined as T };
    try {
      return { tipo: 'ok', datos: (await respuesta.json()) as T };
    } catch {
      return { tipo: 'servicio' };
    }
  }
  let codigo: string | undefined;
  let campos: Record<string, string> | undefined;
  try {
    const json = (await respuesta.json()) as { error?: { code?: string; fields?: Record<string, string> } };
    codigo = json.error?.code;
    campos = json.error?.fields;
  } catch {
    /* cuerpo no JSON */
  }
  const espera = Number(respuesta.headers.get('Retry-After'));
  return {
    tipo: 'error',
    estado: respuesta.status,
    codigo,
    campos,
    reintentarEn: respuesta.status === 429 && Number.isFinite(espera) && espera > 0 ? espera : undefined,
  };
}

export const api = {
  contenidoPublico: (senal?: AbortSignal) => llamar<ContenidoPublico>('/api/v1/publico/contenido', { senal }),

  iniciarSesion: (correo: string, contrasena: string) =>
    llamar<{ usuario: UsuarioInstitucional; expiresAt: string }>('/api/v1/auth/institucional/sesiones', {
      metodo: 'POST',
      cuerpo: { correo, contrasena },
    }),

  consultarSesion: (senal?: AbortSignal) =>
    llamar<{ usuario: UsuarioInstitucional; expiresAt: string }>('/api/v1/auth/institucional/sesion', { senal }),

  cerrarSesion: () => llamar<undefined>('/api/v1/auth/institucional/sesion', { metodo: 'DELETE' }),

  panel: (rol: Rol, senal?: AbortSignal) =>
    llamar<{ usuario: UsuarioInstitucional; secciones: readonly SeccionPanel[] }>(`/api/v1/${rol}/panel`, { senal }),

  consultarToken: (token: string) =>
    llamar<{ proposito: 'recuperacion' | 'activacion'; expiresAt: string }>('/api/v1/auth/tokens/consulta', {
      metodo: 'POST',
      cuerpo: { token },
    }),

  activarCuenta: (token: string, contrasena: string) =>
    llamar<undefined>('/api/v1/auth/activaciones', { metodo: 'POST', cuerpo: { token, contrasena } }),
};
