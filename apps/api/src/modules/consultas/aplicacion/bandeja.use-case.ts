import { codificarCursorFifo, decodificarCursorFifo } from '../../../compartido/cursor-fifo';
import { territorioVista, type TerritorioSeguimiento } from '../dominio/seguimiento';
import { DISTRITOS_PILOTO } from '../dominio/territorio';

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

export interface DependenciasBandeja {
  readonly ambito: AmbitoBandejaPort;
  readonly participaciones: ParticipacionesBandejaPort;
  readonly originales: OriginalesBandejaPort;
  readonly categorias: { nombres(): Promise<ReadonlyMap<string, string>> };
  /** Evaluacion rapida (P5.1). Sin ella, el resumen no informa condicion vigente ni acceso sanitario. */
  readonly evaluacion?: EvaluacionBandejaPort;
}

export const PAGINA_BANDEJA = 50;
/** Sin evaluacion de prioridad (P6), la etiqueta es «Sin evaluar» (RF48). */
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

  private fila(f: FilaOperaciones, categorias: ReadonlyMap<string, string>) {
    return {
      id: f.incidenteId,
      referencia: f.referencia,
      categoria: { id: f.categoriaId, nombre: categorias.get(f.categoriaId) ?? null },
      distrito: f.distritoId ? { id: f.distritoId, nombre: nombreDistrito(f.distritoId) } : null,
      estado: f.estado,
      registradoEn: f.registradoEn.toISOString(),
      papel: f.papel,
      condicionMedicaPorConfirmar: f.revisionMedicaPendiente,
      prioridad: PRIORIDAD_SIN_EVALUAR,
    };
  }

  async listar(usuarioId: string, cursorCrudo: unknown) {
    const cursor = cursorCrudo === undefined ? null : decodificarCursorFifo(cursorCrudo);
    if (cursorCrudo !== undefined && !cursor) throw new ConsultaBandejaInvalidaError();
    const ambito = await this.ambito(usuarioId);
    const filas = await this.d.participaciones.bandeja(
      ambito,
      cursor ? { registradoEn: cursor.instante, incidenteId: cursor.id } : null,
      PAGINA_BANDEJA + 1,
    );
    const pagina = filas.slice(0, PAGINA_BANDEJA);
    const categorias = await this.d.categorias.nombres();
    const ultima = pagina.at(-1);
    return {
      elementos: pagina.map((f) => this.fila(f, categorias)),
      siguiente: filas.length > PAGINA_BANDEJA && ultima ? codificarCursorFifo({ instante: ultima.registradoEn, id: ultima.incidenteId }) : null,
    };
  }

  async resumen(usuarioId: string, incidenteId: string) {
    const ambito = await this.ambito(usuarioId);
    const p = await this.d.participaciones.participacionDe(ambito, incidenteId);
    if (!p) throw new IncidenteNoDisponibleError();
    const [originales, categorias, condiciones] = await Promise.all([
      this.d.originales.resumenOperativo([p.incidenteId]),
      this.d.categorias.nombres(),
      this.d.evaluacion ? this.d.evaluacion.condiciones([p.incidenteId]) : Promise.resolve(new Map<string, CondicionBandeja>()),
    ]);
    const o = originales.get(p.incidenteId);
    if (!o) throw new IncidenteNoDisponibleError();
    const c = condiciones.get(p.incidenteId);
    return {
      ...this.fila(p, categorias),
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
    };
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
