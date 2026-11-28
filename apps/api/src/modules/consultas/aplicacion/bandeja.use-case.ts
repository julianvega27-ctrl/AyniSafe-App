import { codificarCursorFifo, decodificarCursorFifo } from '../../../compartido/cursor-fifo';
import { territorioVista, type TerritorioSeguimiento } from '../dominio/seguimiento';
import { DISTRITOS_PILOTO } from '../dominio/territorio';
import { FiltroMapaInvalidoError } from './mapa.use-case';

/**
 * Bandeja institucional del operador (P4.2, spec `consultas/bandeja-institucional`). Compone el
 * ambito de Identidad, las participaciones de Operaciones y los originales de Reportes mediante
 * puertos, sin SQL entre modulos. Las vistas usan listas cerradas de campos: nunca telefono,
 * coordenadas, codigo, autor, otras sedes ni operadores.
 */

export interface AmbitoOperadorBandeja {
  readonly sedeId: string;
  readonly distritos: readonly string[];
  readonly categorias: readonly string[];
  readonly habilitadaAtencion: boolean;
}

export interface FilaOperaciones {
  readonly incidenteId: string;
  readonly referencia: string;
  readonly estado: string;
  readonly registradoEn: Date;
  readonly categoriaId: string;
  readonly distritoId: string | null;
  readonly revisionMedicaPendiente: boolean;
  readonly papel: string;
  /** Institucion de la sede del operador (P5.1). */
  readonly institucion?: string;
  /** P6: verificacion, resultado de cierre y responsable activo de la institucion. */
  readonly verificacion?: string;
  readonly resultadoCierre?: string | null;
  readonly responsableId?: string | null;
  readonly vinculado?: boolean;
  readonly prioridad?: string;
  readonly prioridadOrigen?: string | null;
}

/** Puerto hacia Operaciones: atencion del incidente para el resumen (P6). */
export interface AtencionBandejaPort {
  vista(
    p: { readonly incidenteId: string; readonly institucion: string; readonly sedeId: string; readonly papel: string; readonly estado: string; readonly vinculado: boolean },
    operadorId: string,
  ): Promise<unknown>;
}

/** Condicion medica vigente (resumen de heridos de Reportes, P5.1), sin observaciones ni motivos. */
export interface CondicionBandeja {
  readonly heridos: string | null;
  readonly atencionMedica: string | null;
  readonly cantidadHeridos: number | 'no_se' | null;
  readonly version: number;
  readonly origen: string;
  readonly institucion: string | null;
  readonly informadaEn: Date;
  readonly observacionesInformadas: boolean;
}

/** Puerto hacia Reportes: evaluacion. El detalle registra el acceso; Consultas autoriza antes. */
export interface EvaluacionBandejaPort {
  condiciones(ids: readonly string[]): Promise<ReadonlyMap<string, CondicionBandeja>>;
  detalleSanitario(incidenteId: string, usuarioId: string): Promise<unknown | null>;
}

/** Puerto hacia Identidad: ambito vigente del operador o null si no tiene. */
export interface AmbitoBandejaPort {
  de(usuarioId: string): Promise<AmbitoOperadorBandeja | null>;
}

/** Puerto hacia Operaciones (filtra por ambito en su propia consulta). */
export interface ParticipacionesBandejaPort {
  bandeja(
    ambito: { readonly sedeId: string; readonly distritos: readonly string[]; readonly categorias: readonly string[] },
    despuesDe: { readonly registradoEn: Date; readonly incidenteId: string } | null,
    limite: number,
    filtro?: { readonly tipo: 'sin_tomar' | 'mios'; readonly usuarioId: string } | null,
  ): Promise<readonly FilaOperaciones[]>;
  participacionDe(
    ambito: { readonly sedeId: string; readonly distritos: readonly string[]; readonly categorias: readonly string[] },
    incidenteId: string,
  ): Promise<(FilaOperaciones & { readonly otrasInstituciones: readonly string[] }) | null>;
}

/** Puerto hacia Reportes: originales para el resumen operativo. */
export interface OriginalesBandejaPort {
  resumenOperativo(ids: readonly string[]): Promise<ReadonlyMap<string, {
    readonly descripcion: string;
    readonly ocurrencia: { readonly modo: string; readonly instante: Date };
    readonly territorio: TerritorioSeguimiento;
    readonly heridos: string | null;
    readonly atencionMedica: string | null;
  }>>;
}

/** Foto disponible: metadatos sin public_id, URL ni autor (P5.2). */
export interface EvidenciaVista {
  readonly id: string;
  readonly tipo: string;
  readonly bytes: number;
  readonly adjuntadaEn: string;
}

/** Puerto hacia Reportes: fotos. El contenido registra el acceso; Consultas autoriza antes. */
export interface EvidenciasLecturaPort {
  metadatos(ids: readonly string[]): Promise<ReadonlyMap<string, readonly EvidenciaVista[]>>;
  contenido(
    incidenteId: string,
    evidenciaId: string,
    lector: { readonly usuarioId: string; readonly rol: 'operador' | 'ciudadano' },
  ): Promise<{ readonly bytes: Buffer; readonly tipo: string } | null>;
}

/** Puertos del mapa operativo (P7 grupo B): participaciones filtradas, puntos exactos y publicacion. */
export interface MapaOperativoPort {
  participaciones(
    ambito: { readonly sedeId: string; readonly distritos: readonly string[]; readonly categorias: readonly string[] },
    filtro: { readonly desde: Date; readonly distritoId: string | null; readonly categoriaId: string | null },
    limite: number,
  ): Promise<readonly FilaOperaciones[]>;
  /** Puntos exactos de Reportes; solo para participaciones ya autorizadas. */
  puntos(ids: readonly string[]): Promise<ReadonlyMap<string, { readonly latitud: number; readonly longitud: number }>>;
  publicaciones(ids: readonly string[]): Promise<ReadonlyMap<string, { readonly reservada: boolean; readonly venceEn: Date }>>;
}

export interface DependenciasBandeja {
  readonly ambito: AmbitoBandejaPort;
  readonly participaciones: ParticipacionesBandejaPort;
  readonly originales: OriginalesBandejaPort;
  readonly categorias: { nombres(): Promise<ReadonlyMap<string, string>> };
  /** Evaluacion rapida (P5.1). Sin ella, el resumen no informa condicion vigente ni acceso sanitario. */
  readonly evaluacion?: EvaluacionBandejaPort;
  /** Evidencias fotograficas (P5.2). Sin ellas, el resumen informa una lista vacia. */
  readonly evidencias?: EvidenciasLecturaPort;
  /** Atencion institucional (P6). Sin ella, el resumen no informa responsable ni acciones. */
  readonly atencion?: AtencionBandejaPort;
  /** Mapa operativo (P7 grupo B). Sin el, no se expone la ruta. */
  readonly mapaOperativo?: MapaOperativoPort;
  readonly ahora?: () => Date;
}

export const PERIODOS_OPERATIVOS = { '24h': 24, '7d': 168, '30d': 720 } as const;
export const LIMITE_MAPA_OPERATIVO = 500;

export const PAGINA_BANDEJA = 50;
/** Sin propuesta valida ni revision (P6 grupo C), la etiqueta es «Sin evaluar» (RF12). */
export const PRIORIDAD_SIN_EVALUAR = 'SIN_EVALUAR';

export class SinAmbitoError extends Error {
  constructor() {
    super('Operador sin ambito de atencion');
    this.name = 'SinAmbitoError';
  }
}
export class ConsultaBandejaInvalidaError extends Error {
  constructor() {
    super('Consulta de bandeja invalida');
    this.name = 'ConsultaBandejaInvalidaError';
  }
}
/** Mismo error para inexistente, ajeno al ambito o identificador malformado. */
export class IncidenteNoDisponibleError extends Error {
  constructor() {
    super('Incidente no disponible');
    this.name = 'IncidenteNoDisponibleError';
  }
}

const nombreDistrito = (id: string | null) => (id ? DISTRITOS_PILOTO.find((d) => d.id === id)?.nombre ?? null : null);

export class BandejaInstitucional {
  constructor(private readonly d: DependenciasBandeja) {}

  private async ambito(usuarioId: string) {
    const a = await this.d.ambito.de(usuarioId);
    if (!a || !a.habilitadaAtencion) throw new SinAmbitoError();
    return { sedeId: a.sedeId, distritos: a.distritos, categorias: a.categorias };
  }

  private fila(f: FilaOperaciones, categorias: ReadonlyMap<string, string>, usuarioId: string) {
    return {
      id: f.incidenteId,
      referencia: f.referencia,
      categoria: { id: f.categoriaId, nombre: categorias.get(f.categoriaId) ?? null },
      distrito: f.distritoId ? { id: f.distritoId, nombre: nombreDistrito(f.distritoId) } : null,
      estado: f.estado,
      registradoEn: f.registradoEn.toISOString(),
      papel: f.papel,
      condicionMedicaPorConfirmar: f.revisionMedicaPendiente,
      verificacion: f.verificacion ?? 'SIN_VERIFICAR',
      resultado: f.resultadoCierre ?? null,
      responsable: { asignado: Boolean(f.responsableId), esUsted: f.responsableId === usuarioId },
      vinculado: f.vinculado ?? false,
      prioridad: f.prioridad ?? PRIORIDAD_SIN_EVALUAR,
      prioridadOrigen: f.prioridadOrigen ?? null,
    };
  }

  async listar(usuarioId: string, cursorCrudo: unknown, responsableCrudo?: unknown) {
    const cursor = cursorCrudo === undefined ? null : decodificarCursorFifo(cursorCrudo);
    if (cursorCrudo !== undefined && !cursor) throw new ConsultaBandejaInvalidaError();
    if (responsableCrudo !== undefined && responsableCrudo !== 'sin_tomar' && responsableCrudo !== 'mios') throw new ConsultaBandejaInvalidaError();
    const filtro = responsableCrudo === undefined ? null : { tipo: responsableCrudo as 'sin_tomar' | 'mios', usuarioId };
    const ambito = await this.ambito(usuarioId);
    const filas = await this.d.participaciones.bandeja(
      ambito,
      cursor ? { registradoEn: cursor.instante, incidenteId: cursor.id } : null,
      PAGINA_BANDEJA + 1,
      filtro,
    );
    const pagina = filas.slice(0, PAGINA_BANDEJA);
    const categorias = await this.d.categorias.nombres();
    const ultima = pagina.at(-1);
    return {
      elementos: pagina.map((f) => this.fila(f, categorias, usuarioId)),
      siguiente: filas.length > PAGINA_BANDEJA && ultima ? codificarCursorFifo({ instante: ultima.registradoEn, id: ultima.incidenteId }) : null,
    };
  }

  async resumen(usuarioId: string, incidenteId: string) {
    const ambito = await this.ambito(usuarioId);
    const p = await this.d.participaciones.participacionDe(ambito, incidenteId);
    if (!p) throw new IncidenteNoDisponibleError();
    const [originales, categorias, condiciones, fotos, atencion] = await Promise.all([
      this.d.originales.resumenOperativo([p.incidenteId]),
      this.d.categorias.nombres(),
      this.d.evaluacion ? this.d.evaluacion.condiciones([p.incidenteId]) : Promise.resolve(new Map<string, CondicionBandeja>()),
      this.d.evidencias ? this.d.evidencias.metadatos([p.incidenteId]) : Promise.resolve(new Map<string, readonly EvidenciaVista[]>()),
      this.d.atencion && p.institucion
        ? this.d.atencion.vista({ incidenteId: p.incidenteId, institucion: p.institucion, sedeId: ambito.sedeId, papel: p.papel, estado: p.estado, vinculado: p.vinculado ?? false }, usuarioId)
        : Promise.resolve(null),
    ]);
    const o = originales.get(p.incidenteId);
    if (!o) throw new IncidenteNoDisponibleError();
    const c = condiciones.get(p.incidenteId);
    return {
      ...this.fila(p, categorias, usuarioId),
      descripcion: o.descripcion,
      ocurrencia: { modo: o.ocurrencia.modo, instante: o.ocurrencia.instante.toISOString() },
      territorio: territorioVista(o.territorio),
      respuestasCiudadano: { heridos: o.heridos, atencionMedica: o.atencionMedica },
      condicionMedica: c
        ? {
            heridos: c.heridos,
            atencionMedica: c.atencionMedica,
            cantidadHeridos: c.cantidadHeridos,
            revisionPendiente: p.revisionMedicaPendiente,
            version: c.version,
            origen: c.origen,
            institucion: c.institucion,
            informadaEn: c.informadaEn.toISOString(),
            observacionesInformadas: c.observacionesInformadas,
          }
        : null,
      accesoSanitario: c !== undefined && p.institucion === 'samu',
      otrasInstituciones: [...p.otrasInstituciones],
      evidencias: [...(fotos.get(p.incidenteId) ?? [])],
      atencion,
    };
  }

  /**
   * Mapa operativo (P7 grupo B, spec `consultas/mapa-operativo`): punto exacto solo de los incidentes
   * en que participa la sede del operador dentro de su ambito vigente. Sin descripcion, telefono,
   * autor, codigo, fotos ni datos sanitarios. Filtro invalido: 422.
   */
  async mapa(usuarioId: string, query: Record<string, unknown>) {
    const m = this.d.mapaOperativo;
    if (!m) throw new IncidenteNoDisponibleError();
    const campos: Record<string, string> = {};
    for (const k of Object.keys(query)) if (!['distrito', 'categoria', 'periodo'].includes(k)) campos[k] = 'Filtro no admitido.';
    const texto = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 60 ? v : undefined);
    const distrito = query.distrito === undefined ? null : texto(query.distrito);
    if (distrito === undefined || (distrito && !nombreDistrito(distrito))) campos.distrito = 'Elige un distrito del catálogo.';
    const categorias = await this.d.categorias.nombres();
    const categoria = query.categoria === undefined ? null : texto(query.categoria);
    if (categoria === undefined || (categoria && !categorias.has(categoria))) campos.categoria = 'Elige una categoría del catálogo.';
    const periodo = query.periodo === undefined ? '7d' : query.periodo;
    if (typeof periodo !== 'string' || !(periodo in PERIODOS_OPERATIVOS)) campos.periodo = 'Elige 24h, 7d o 30d.';
    if (Object.keys(campos).length) throw new FiltroMapaInvalidoError(campos);
    const ambito = await this.ambito(usuarioId);
    const ahora = this.d.ahora ? this.d.ahora() : new Date();
    const horas = PERIODOS_OPERATIVOS[periodo as keyof typeof PERIODOS_OPERATIVOS];
    const filas = await m.participaciones(
      ambito,
      { desde: new Date(ahora.getTime() - horas * 3_600_000), distritoId: distrito ?? null, categoriaId: categoria ?? null },
      LIMITE_MAPA_OPERATIVO + 1,
    );
    const pagina = filas.slice(0, LIMITE_MAPA_OPERATIVO);
    const ids = pagina.map((f) => f.incidenteId);
    const [puntos, publicaciones] = await Promise.all([m.puntos(ids), m.publicaciones(ids)]);
    return {
      filtros: { distrito: distrito ?? null, categoria: categoria ?? null, periodo },
      truncado: filas.length > LIMITE_MAPA_OPERATIVO,
      elementos: pagina.flatMap((f) => {
        const p = puntos.get(f.incidenteId);
        if (!p) return [];
        const pub = publicaciones.get(f.incidenteId);
        return [{
          id: f.incidenteId,
          referencia: f.referencia,
          categoria: { id: f.categoriaId, nombre: categorias.get(f.categoriaId) ?? null },
          distrito: f.distritoId ? { id: f.distritoId, nombre: nombreDistrito(f.distritoId) } : null,
          estado: f.estado,
          prioridad: f.prioridad ?? PRIORIDAD_SIN_EVALUAR,
          registradoEn: f.registradoEn.toISOString(),
          punto: { lat: p.latitud, lon: p.longitud },
          publicacion: pub ? { vigente: true, reservada: pub.reservada } : { vigente: false, reservada: false },
        }];
      }),
    };
  }

  /**
   * Contenido de una foto (P5.2, spec `consultas/acceso-evidencias`): cualquier operador cuya sede
   * participa dentro de su ambito vigente. Lo ajeno, inexistente o no disponible es el mismo 404.
   */
  async contenidoEvidencia(usuarioId: string, incidenteId: string, evidenciaId: string) {
    const ambito = await this.ambito(usuarioId);
    const p = await this.d.participaciones.participacionDe(ambito, incidenteId);
    if (!p || !this.d.evidencias) throw new IncidenteNoDisponibleError();
    const r = await this.d.evidencias.contenido(p.incidenteId, evidenciaId, { usuarioId, rol: 'operador' });
    if (!r) throw new IncidenteNoDisponibleError();
    return r;
  }

  /**
   * Detalle sanitario (P5.1, spec `consultas/detalle-sanitario`): solo un operador de una sede SAMU
   * que participa dentro de su ambito vigente. Cualquier otro caso es el mismo 404.
   */
  async evaluacion(usuarioId: string, incidenteId: string): Promise<unknown> {
    const ambito = await this.ambito(usuarioId);
    const p = await this.d.participaciones.participacionDe(ambito, incidenteId);
    if (!p || p.institucion !== 'samu' || !this.d.evaluacion) throw new IncidenteNoDisponibleError();
    const detalle = await this.d.evaluacion.detalleSanitario(p.incidenteId, usuarioId);
    if (!detalle) throw new IncidenteNoDisponibleError();
    return detalle;
  }
}
