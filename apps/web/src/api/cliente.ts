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

// --- Organizacion institucional (P3.2) -----------------------------------------------------

export type TipoInstitucion = 'pnp' | 'bomberos' | 'samu' | 'serenazgo';

export interface Institucion {
  readonly id: TipoInstitucion;
  readonly tipo: TipoInstitucion;
  readonly nombre: string;
  readonly contacto: string | null;
  readonly activa: boolean;
}

export interface Sede {
  readonly id: string;
  readonly institucionId: TipoInstitucion;
  readonly nombre: string;
  readonly distritoUbicacionId: string | null;
  readonly direccion: string | null;
  readonly contacto: string | null;
  readonly verificacion: { readonly estado: 'sin_verificar' | 'verificada'; readonly fuente: string | null; readonly fecha: string | null };
  readonly habilitadaAtencion: boolean;
  readonly activa: boolean;
  readonly esDemostracion: boolean;
  readonly distritos: readonly string[];
  readonly categorias: readonly string[];
}

export type EstadoOperador = 'pendiente_activacion' | 'activo' | 'suspendido';

export interface OperadorSede {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly estado: EstadoOperador;
  readonly sedeId: string;
  readonly esDemostracion: boolean;
}

export interface AltaSede {
  readonly institucionId: TipoInstitucion;
  readonly nombre: string;
  readonly distritoUbicacionId?: string;
  readonly esDemostracion?: boolean;
  readonly operador: { readonly nombre: string; readonly correo: string };
}

export interface CambiosSede {
  readonly nombre?: string;
  readonly activa?: boolean;
  readonly verificacion?: { readonly estado: 'sin_verificar' } | { readonly estado: 'verificada'; readonly fuente: string; readonly fecha: string };
}

export interface DistritoCatalogo {
  readonly id: string;
  readonly nombre: string;
}

export interface CategoriaCatalogo {
  readonly id: string;
  readonly nombre: string;
  readonly orden: number;
  readonly activa: boolean;
}

const ORG = '/api/v1/administrador/organizacion';
const enc = encodeURIComponent;

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
      /** Requisitos incumplidos cuando el codigo es REQUISITOS_HABILITACION. */
      readonly faltantes?: readonly string[];
    }
  /** Sin conexion o la solicitud no llego. */
  | { readonly tipo: 'red' }
  /** El servicio no esta disponible (5xx, incluidos 502/504 del proxy o un arranque en frio) o tardo demasiado. */
  | { readonly tipo: 'servicio' };

/** Margen para el arranque en frio de Render (~1 min): mas alla se informa «servicio no disponible». */
const TIEMPO_MAXIMO_MS = 45_000;

interface Opciones {
  readonly metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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
  let faltantes: string[] | undefined;
  try {
    const json = (await respuesta.json()) as { error?: { code?: string; fields?: Record<string, string>; faltantes?: string[] } };
    codigo = json.error?.code;
    campos = json.error?.fields;
    faltantes = Array.isArray(json.error?.faltantes) ? json.error.faltantes : undefined;
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
    faltantes,
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

  // Organizacion: la API decide la autorizacion; el cliente solo traduce resultados.
  instituciones: (senal?: AbortSignal) => llamar<{ instituciones: readonly Institucion[] }>(`${ORG}/instituciones`, { senal }),
  actualizarInstitucion: (id: TipoInstitucion, cambios: { nombre?: string; contacto?: string | null }) =>
    llamar<{ institucion: Institucion }>(`${ORG}/instituciones/${enc(id)}`, { metodo: 'PATCH', cuerpo: cambios }),
  sedes: (senal?: AbortSignal) => llamar<{ sedes: readonly Sede[] }>(`${ORG}/sedes`, { senal }),
  crearSede: (alta: AltaSede) => llamar<{ sede: Sede; operador: OperadorSede }>(`${ORG}/sedes`, { metodo: 'POST', cuerpo: alta }),
  actualizarSede: (id: string, cambios: CambiosSede) =>
    llamar<{ sede: Sede }>(`${ORG}/sedes/${enc(id)}`, { metodo: 'PATCH', cuerpo: cambios }),
  guardarCobertura: (id: string, distritos: readonly string[]) =>
    llamar<{ sede: Sede }>(`${ORG}/sedes/${enc(id)}/cobertura`, { metodo: 'PUT', cuerpo: { distritos } }),
  guardarCompetencias: (id: string, categorias: readonly string[]) =>
    llamar<{ sede: Sede }>(`${ORG}/sedes/${enc(id)}/competencias`, { metodo: 'PUT', cuerpo: { categorias } }),
  habilitarSede: (id: string) => llamar<{ sede: Sede }>(`${ORG}/sedes/${enc(id)}/habilitacion`, { metodo: 'POST' }),
  deshabilitarSede: (id: string) => llamar<{ sede: Sede }>(`${ORG}/sedes/${enc(id)}/habilitacion`, { metodo: 'DELETE' }),
  operadores: (sedeId: string, senal?: AbortSignal) =>
    llamar<{ operadores: readonly OperadorSede[] }>(`${ORG}/sedes/${enc(sedeId)}/operadores`, { senal }),
  agregarOperador: (sedeId: string, datos: { nombre: string; correo: string }) =>
    llamar<{ operador: OperadorSede }>(`${ORG}/sedes/${enc(sedeId)}/operadores`, { metodo: 'POST', cuerpo: datos }),
  cambiarEstadoOperador: (id: string, estado: 'activo' | 'suspendido') =>
    llamar<{ operador: OperadorSede }>(`${ORG}/operadores/${enc(id)}`, { metodo: 'PATCH', cuerpo: { estado } }),
  reenviarInvitacion: (id: string) => llamar<{ estado: 'invitacion_encolada' }>(`${ORG}/operadores/${enc(id)}/invitacion`, { metodo: 'POST' }),
  distritos: (senal?: AbortSignal) =>
    llamar<{ distritos: readonly DistritoCatalogo[] }>('/api/v1/publico/territorio/distritos', { senal }),
  categorias: (senal?: AbortSignal) => llamar<{ categorias: readonly CategoriaCatalogo[] }>('/api/v1/publico/categorias', { senal }),
};
