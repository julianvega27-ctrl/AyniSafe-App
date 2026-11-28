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

// --- Enrutamiento y bandeja (P4.2) ----------------------------------------------------------

export type PapelInstitucion = 'principal' | 'simultanea' | 'condicionada';
export type EstadoIncidente = 'REGISTRADO' | 'EN_REVISION' | 'EN_ATENCION' | 'CERRADO';
export type RespuestaCiudadano = 'si' | 'no' | 'no_se' | null;

export type TerritorioVista =
  | { readonly estado: 'resuelto'; readonly distrito: { readonly id: string; readonly nombre: string | null } }
  | { readonly estado: 'pendiente'; readonly motivo: string };

export interface FilaBandeja {
  readonly id: string;
  readonly referencia: string;
  readonly categoria: { readonly id: string; readonly nombre: string | null };
  readonly distrito: { readonly id: string; readonly nombre: string | null } | null;
  readonly estado: EstadoIncidente;
  readonly registradoEn: string;
  readonly papel: PapelInstitucion;
  readonly condicionMedicaPorConfirmar: boolean;
  /** P6: verificacion separada del estado, resultado de cierre y responsable de tu institucion. */
  readonly verificacion: Verificacion;
  readonly resultado: ResultadoCierre | null;
  readonly responsable: { readonly asignado: boolean; readonly esUsted: boolean };
  /** Duplicado vinculado (P6 grupo B): estado y resultado son los del principal. */
  readonly vinculado: boolean;
  /** Etiqueta vigente (P6 grupo C); no ordena la bandeja. */
  readonly prioridad: Prioridad;
  readonly prioridadOrigen: 'propuesta' | 'revisada' | null;
}

export type Verificacion = 'SIN_VERIFICAR' | 'VERIFICADO' | 'NO_VERIFICADO';
export type Prioridad = 'SIN_EVALUAR' | 'NORMAL' | 'ALTA' | 'URGENTE';
/** Filtro de la bandeja por responsable (P6 grupo D); no cambia el orden FIFO. */
export type FiltroResponsable = 'sin_tomar' | 'mios' | 'todos';
export type ResultadoCierre = 'ATENDIDO' | 'DESCARTADO';
export type AccionAtencion = 'asumir' | 'iniciar_atencion' | 'cerrar_atendido' | 'descartar' | 'verificar' | 'vincular' | 'priorizar';

export type AccionPublicacion = 'publicar' | 'retirar' | 'reservar' | 'quitar_reserva';
export type CausaRetiro = 'DECISION' | 'CIERRE' | 'NO_VERIFICADO' | 'DUPLICADO';
export type CodigoNoPublicable = 'NO_VERIFICADO' | 'FUERA_DE_VIGENCIA' | 'DISTRITO_PENDIENTE' | 'INCIDENTE_CERRADO' | 'INCIDENTE_VINCULADO';

/** Estado de publicacion del resumen (P7). La API decide las acciones permitidas. */
export interface PublicacionOperador {
  readonly estado: 'NO_PUBLICADO' | 'VIGENTE' | 'RETIRADA' | 'VENCIDA';
  readonly reservada: boolean;
  readonly sensible: boolean;
  readonly publicadaEn: string | null;
  readonly venceEn: string | null;
  readonly causaRetiro: CausaRetiro | null;
  readonly noPublicable: CodigoNoPublicable | null;
  readonly accionesPermitidas: readonly AccionPublicacion[];
}

/** Mapa operativo del operador (P7 grupo B): punto exacto solo de incidentes de su sede. */
export type PeriodoOperativo = '24h' | '7d' | '30d';
export interface ElementoMapaOperativo {
  readonly id: string;
  readonly referencia: string;
  readonly categoria: { readonly id: string; readonly nombre: string | null };
  readonly distrito: { readonly id: string; readonly nombre: string | null } | null;
  readonly estado: EstadoIncidente;
  readonly prioridad: Prioridad;
  readonly registradoEn: string;
  readonly punto: { readonly lat: number; readonly lon: number };
  readonly publicacion: { readonly vigente: boolean; readonly reservada: boolean };
}
export interface MapaOperativo {
  readonly filtros: { readonly distrito: string | null; readonly categoria: string | null; readonly periodo: PeriodoOperativo };
  readonly truncado: boolean;
  readonly elementos: readonly ElementoMapaOperativo[];
}
/** Limites distritales GeoJSON del catalogo activo. */
export interface LimitesDistritales {
  readonly type: 'FeatureCollection';
  readonly features: readonly {
    readonly type: 'Feature';
    readonly properties: { readonly id: string; readonly nombre: string };
    readonly geometry: { readonly type: string; readonly coordinates: unknown };
  }[];
}

/** Atencion institucional del resumen (P6). La API decide las acciones permitidas. */
export interface AtencionOperador {
  readonly responsable:
    | { readonly asignado: true; readonly esUsted: boolean; readonly automatica: boolean; readonly nombre: string | null; readonly desde: string }
    | { readonly asignado: false };
  readonly institucionesConResponsable: readonly TipoInstitucion[];
  readonly accionesPermitidas: readonly AccionAtencion[];
  readonly historial: readonly {
    readonly accion: string;
    readonly institucion: TipoInstitucion;
    readonly actorTipo: 'operador' | 'administrador' | 'sistema';
    readonly valorAnterior: string | null;
    readonly valorNuevo: string | null;
    readonly motivo: string | null;
    readonly instante: string;
  }[];
  /** P7; null si la API no compone la publicacion. */
  readonly publicacion?: PublicacionOperador | null;
}

export interface AsignacionAdmin {
  readonly id: string;
  readonly referencia: string;
  readonly estado: EstadoIncidente;
  readonly institucion: TipoInstitucion;
  readonly sede: { readonly id: string; readonly nombre: string | null };
  readonly responsable: { readonly id: string; readonly nombre: string | null };
  readonly asignadaEn: string;
  readonly requiereReasignacion: boolean;
}

export interface CandidatoReasignacion {
  readonly id: string;
  readonly nombre: string;
  readonly sede: { readonly id: string; readonly nombre: string };
}

export interface ResumenIncidente extends FilaBandeja {
  readonly descripcion: string;
  readonly ocurrencia: { readonly modo: 'ahora' | 'antes'; readonly instante: string };
  readonly territorio: TerritorioVista;
  readonly respuestasCiudadano: { readonly heridos: RespuestaCiudadano; readonly atencionMedica: RespuestaCiudadano };
  /** Condicion vigente (P5.1, resumen de heridos); null sin evaluacion. */
  readonly condicionMedica: CondicionMedica | null;
  /** La sede del operador es SAMU participante: puede leer la evaluacion completa. */
  readonly accesoSanitario: boolean;
  readonly otrasInstituciones: readonly TipoInstitucion[];
  /** Fotos disponibles (P5.2): solo metadatos; el contenido se pide aparte con la sesion. */
  readonly evidencias: readonly EvidenciaVista[];
  /** Atencion institucional (P6); null si la API no la compone. */
  readonly atencion: AtencionOperador | null;
}

/** Metadatos de una foto (P5.2), sin URL ni identificadores del proveedor. */
export interface EvidenciaVista {
  readonly id: string;
  readonly tipo: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly bytes: number;
  readonly adjuntadaEn: string;
}

// --- Evaluacion rapida (P5.1) ----------------------------------------------------------------

export type CantidadHeridos = number | 'no_se' | null;
export type SignosVida = 'observados' | 'no_observados' | 'no_se' | null;

export interface CondicionMedica {
  readonly heridos: RespuestaCiudadano;
  readonly atencionMedica: RespuestaCiudadano;
  readonly cantidadHeridos: CantidadHeridos;
  readonly revisionPendiente: boolean;
  readonly version: number;
  readonly origen: 'ciudadano' | 'operador';
  readonly institucion: TipoInstitucion | null;
  readonly informadaEn: string;
  readonly observacionesInformadas: boolean;
}

export interface PersonaPrincipal {
  readonly signosVida: SignosVida;
  readonly consciente: RespuestaCiudadano;
  readonly sangrado: RespuestaCiudadano;
}

export interface RespuestasEvaluacion {
  readonly heridos: RespuestaCiudadano;
  readonly atencionMedica: RespuestaCiudadano;
  readonly cantidadHeridos: CantidadHeridos;
  readonly personaPrincipal: PersonaPrincipal;
}

export type CampoEvaluacion = 'heridos' | 'atencionMedica' | 'cantidadHeridos' | 'signosVida' | 'consciente' | 'sangrado';

export interface DetalleSanitario {
  readonly version: number;
  readonly informadaEn: string;
  readonly pendiente: boolean;
  readonly vigente: RespuestasEvaluacion;
  readonly historial: readonly {
    readonly version: number;
    readonly origen: 'ciudadano' | 'operador';
    readonly institucion: TipoInstitucion | null;
    readonly instante: string;
    readonly camposModificados: readonly CampoEvaluacion[];
    readonly motivo: string | null;
  }[];
}

/** Cuerpo de una precision: solo los campos que cambian, mas el motivo. */
export interface PrecisionCondicion {
  readonly heridos?: 'si' | 'no' | 'no_se';
  readonly atencionMedica?: 'si' | 'no' | 'no_se';
  readonly cantidadHeridos?: number | 'no_se';
  readonly personaPrincipal?: Partial<Record<keyof PersonaPrincipal, string>>;
  readonly motivo: string;
}

export interface ResultadoPrecision {
  readonly version: number;
  readonly condicionMedica: { readonly heridos: RespuestaCiudadano; readonly atencionMedica: RespuestaCiudadano; readonly cantidadHeridos: CantidadHeridos };
  readonly samuIncorporado: boolean;
}

export interface Faltante {
  readonly institucion: TipoInstitucion;
  readonly papel: PapelInstitucion;
  readonly motivo: 'sin_distrito' | 'sin_sede_elegible';
}

export interface PendienteEnrutamiento {
  readonly incidenteId: string;
  readonly referencia: string;
  readonly categoria: { readonly id: string; readonly nombre: string | null };
  readonly territorio: TerritorioVista;
  readonly registradoEn: string;
  readonly faltantes: readonly Faltante[];
}

export interface ResultadoEnrutamiento {
  readonly enrutamiento: {
    readonly incidenteId: string;
    readonly resultado: 'ENRUTADO' | 'ENRUTAMIENTO_PENDIENTE';
    readonly faltantes: readonly Faltante[];
  };
}

export interface Pagina<T> {
  readonly elementos: readonly T[];
  readonly siguiente: string | null;
}

const ORG = '/api/v1/administrador/organizacion';
const PEN = '/api/v1/admin/enrutamientos-pendientes';
const ASI = '/api/v1/admin/asignaciones';
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
      /** Requisitos incumplidos de la sede cuando el codigo es SEDE_NO_DESIGNABLE. */
      readonly requisitos?: readonly string[];
      /** Estado vigente del incidente en un conflicto de atencion (P6). */
      readonly estadoActual?: EstadoIncidente;
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
  let requisitos: string[] | undefined;
  let estadoActual: EstadoIncidente | undefined;
  try {
    const json = (await respuesta.json()) as {
      error?: { code?: string; fields?: Record<string, string>; faltantes?: string[]; requisitos?: string[]; estadoActual?: EstadoIncidente };
    };
    codigo = json.error?.code;
    campos = json.error?.fields;
    faltantes = Array.isArray(json.error?.faltantes) ? json.error.faltantes : undefined;
    requisitos = Array.isArray(json.error?.requisitos) ? json.error.requisitos : undefined;
    estadoActual = json.error?.estadoActual;
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
    requisitos,
    ...(estadoActual ? { estadoActual } : {}),
  };
}

/**
 * Contenido de una foto autorizada (P5.2): bytes por la API con la cookie institucional, sin cache.
 * Nunca se guarda en almacenamiento del navegador; la vista crea y revoca su URL de objeto.
 */
async function obtenerImagen(ruta: string, senal?: AbortSignal): Promise<Resultado<Blob>> {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, { credentials: 'same-origin', cache: 'no-store', signal: senal });
  } catch (error) {
    if (senal?.aborted) throw error;
    return { tipo: 'red' };
  }
  if (respuesta.status >= 500) return { tipo: 'servicio' };
  if (!respuesta.ok) return { tipo: 'error', estado: respuesta.status };
  try {
    return { tipo: 'ok', datos: await respuesta.blob() };
  } catch {
    return { tipo: 'servicio' };
  }
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

  // Bandeja del operador y pendientes del administrador (P4.2). Sin consultas periodicas.
  bandeja: (cursor: string | null, senal?: AbortSignal, responsable?: FiltroResponsable) => {
    const q = new URLSearchParams();
    if (responsable && responsable !== 'todos') q.set('responsable', responsable);
    if (cursor) q.set('cursor', cursor);
    const texto = q.toString();
    return llamar<Pagina<FilaBandeja>>(`/api/v1/operador/incidentes${texto ? `?${texto}` : ''}`, { senal });
  },
  resumenIncidente: (id: string, senal?: AbortSignal) => llamar<ResumenIncidente>(`/api/v1/operador/incidentes/${enc(id)}`, { senal }),
  contenidoEvidencia: (id: string, evidenciaId: string, senal?: AbortSignal) =>
    obtenerImagen(`/api/v1/operador/incidentes/${enc(id)}/evidencias/${enc(evidenciaId)}/contenido`, senal),
  // Evaluacion rapida (P5.1): el detalle solo responde al operador SAMU participante.
  evaluacionSanitaria: (id: string, senal?: AbortSignal) =>
    llamar<DetalleSanitario>(`/api/v1/operador/incidentes/${enc(id)}/evaluacion`, { senal }),
  precisarCondicion: (id: string, cuerpo: PrecisionCondicion) =>
    llamar<ResultadoPrecision>(`/api/v1/operador/incidentes/${enc(id)}/evaluacion`, { metodo: 'POST', cuerpo }),
  pendientesEnrutamiento: (cursor: string | null, senal?: AbortSignal) =>
    llamar<Pagina<PendienteEnrutamiento>>(`${PEN}${cursor ? `?cursor=${enc(cursor)}` : ''}`, { senal }),
  designarSede: (incidenteId: string, datos: { institucion: TipoInstitucion; sedeId: string; motivo: string }) =>
    llamar<ResultadoEnrutamiento>(`${PEN}/${enc(incidenteId)}/designaciones`, { metodo: 'POST', cuerpo: datos }),
  // Atencion institucional (P6): la API autoriza cada accion y decide las permitidas.
  asumirCaso: (id: string) =>
    llamar<{ asignacion: { id: string; institucion: TipoInstitucion; desde: string }; estado: EstadoIncidente }>(
      `/api/v1/operador/incidentes/${enc(id)}/asumir`,
      { metodo: 'POST' },
    ),
  transicionar: (
    id: string,
    cuerpo:
      | { accion: 'iniciar_atencion'; estadoEsperado: EstadoIncidente }
      | { accion: 'cerrar'; estadoEsperado: EstadoIncidente; resultado: ResultadoCierre; motivo: string; resumenCiudadano: string },
  ) =>
    llamar<{ estado: EstadoIncidente; resultado: ResultadoCierre | null }>(`/api/v1/operador/incidentes/${enc(id)}/transiciones`, {
      metodo: 'POST',
      cuerpo,
    }),
  verificar: (id: string, cuerpo: { valor: Exclude<Verificacion, 'SIN_VERIFICAR'>; motivo: string; estadoEsperado: EstadoIncidente }) =>
    llamar<{ verificacion: Verificacion; estado: EstadoIncidente }>(`/api/v1/operador/incidentes/${enc(id)}/verificacion`, {
      metodo: 'POST',
      cuerpo,
    }),
  revisarPrioridad: (id: string, valor: Exclude<Prioridad, 'SIN_EVALUAR'>, motivo: string) =>
    llamar<{ prioridad: Prioridad; origen: 'revisada' }>(`/api/v1/operador/incidentes/${enc(id)}/prioridad`, { metodo: 'POST', cuerpo: { valor, motivo } }),
  vincularDuplicado: (id: string, referenciaPrincipal: string, motivo: string) =>
    llamar<{ vinculado: true }>(`/api/v1/operador/incidentes/${enc(id)}/vinculo`, { metodo: 'POST', cuerpo: { referenciaPrincipal, motivo } }),
  // Mapa operativo (P7 grupo B) y limites distritales.
  mapaOperativo: (f: { distrito?: string; categoria?: string; periodo: PeriodoOperativo }, senal?: AbortSignal) => {
    const q = new URLSearchParams({ ...(f.distrito ? { distrito: f.distrito } : {}), ...(f.categoria ? { categoria: f.categoria } : {}), periodo: f.periodo });
    return llamar<MapaOperativo>(`/api/v1/operador/mapa?${q.toString()}`, { senal });
  },
  limites: (senal?: AbortSignal) => llamar<LimitesDistritales>('/api/v1/publico/territorio/limites', { senal }),
  // Publicacion controlada (P7).
  publicarIncidente: (id: string, cuerpo: { estadoEsperado: EstadoIncidente; reservada?: boolean; motivoReserva?: string }) =>
    llamar<{ publicacion: { estado: 'VIGENTE'; reservada: boolean; publicadaEn: string; venceEn: string } }>(
      `/api/v1/operador/incidentes/${enc(id)}/publicacion`,
      { metodo: 'POST', cuerpo },
    ),
  retirarPublicacion: (id: string, motivo: string) =>
    llamar<{ retirada: true }>(`/api/v1/operador/incidentes/${enc(id)}/publicacion/retiro`, { metodo: 'POST', cuerpo: { motivo } }),
  reservarPublicacion: (id: string, reservada: boolean, motivo: string) =>
    llamar<{ reservada: boolean }>(`/api/v1/operador/incidentes/${enc(id)}/publicacion/reserva`, { metodo: 'POST', cuerpo: { reservada, motivo } }),
  asignaciones: (senal?: AbortSignal) => llamar<{ elementos: readonly AsignacionAdmin[] }>(ASI, { senal }),
  candidatosReasignacion: (id: string, senal?: AbortSignal) =>
    llamar<{ elementos: readonly CandidatoReasignacion[] }>(`${ASI}/${enc(id)}/candidatos`, { senal }),
  liberarAsignacion: (id: string, motivo: string) =>
    llamar<{ liberada: true }>(`${ASI}/${enc(id)}/liberar`, { metodo: 'POST', cuerpo: { motivo } }),
  reasignarAsignacion: (id: string, operadorId: string, motivo: string) =>
    llamar<{ asignacion: { id: string } }>(`${ASI}/${enc(id)}/reasignar`, { metodo: 'POST', cuerpo: { operadorId, motivo } }),
  reevaluarEnrutamiento: (incidenteId: string) =>
    llamar<ResultadoEnrutamiento>(`${PEN}/${enc(incidenteId)}/reevaluar`, { metodo: 'POST' }),
};
