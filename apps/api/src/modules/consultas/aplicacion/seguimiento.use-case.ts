import {
  codificarCursor,
  decodificarCursor,
  INSTITUCION_PENDIENTE,
  PAGINA_HISTORIAL,
  territorioVista,
  validarConsultaInvitado,
  type CategoriaVista,
  type CursorSeguimiento,
  type TerritorioSeguimiento,
} from '../dominio/seguimiento';

/** Puerto hacia la fachada de Reportes (originales y verificacion del codigo). */
export interface EnviosSeguimientoPort {
  listarDeAutor(
    usuarioId: string,
    despuesDe: CursorSeguimiento | null,
    limite: number,
  ): Promise<readonly { readonly incidenteId: string; readonly categoriaId: string; readonly recibidoEn: Date; readonly territorio: TerritorioSeguimiento }[]>;
  detalleDeAutor(
    usuarioId: string,
    incidenteId: string,
  ): Promise<{
    readonly categoriaId: string;
    readonly recibidoEn: Date;
    readonly territorio: TerritorioSeguimiento;
    readonly descripcion: string;
    readonly ocurrencia: { readonly modo: string; readonly instante: Date };
    readonly heridos: string | null;
    readonly atencionMedica: string | null;
  } | null>;
  verificarCodigo(incidenteId: string | null, codigo: string): Promise<{ readonly categoriaId: string; readonly recibidoEn: Date } | null>;
}

export interface EstadoIncidenteSeguimiento {
  readonly id: string;
  readonly referencia: string;
  readonly estado: string;
  readonly registradoEn: Date;
}

/** Puerto hacia la fachada de Operaciones (estado e identidad publica del incidente). */
export interface IncidentesSeguimientoPort {
  /** Normaliza la referencia escrita por una persona; null si no tiene formato valido. */
  normalizarReferencia(texto: string): string | null;
  porReferencia(referencia: string): Promise<EstadoIncidenteSeguimiento | null>;
  estados(ids: readonly string[]): Promise<ReadonlyMap<string, Omit<EstadoIncidenteSeguimiento, 'id'>>>;
}

export interface CategoriasSeguimientoPort {
  nombres(): Promise<ReadonlyMap<string, string>>;
}

export interface LimitadorSeguimientoPort {
  consumir(
    consumos: readonly {
      readonly tipo: 'seguimiento_ref' | 'seguimiento_ip';
      readonly identificador: string;
      readonly maximo: number;
      readonly ventanaMs: number;
    }[],
    ahora: Date,
  ): Promise<{ readonly permitido: boolean; readonly reintentarEnSegundos: number }>;
}

export interface DependenciasSeguimiento {
  readonly envios: EnviosSeguimientoPort;
  readonly incidentes: IncidentesSeguimientoPort;
  readonly categorias: CategoriasSeguimientoPort;
  readonly limitador: LimitadorSeguimientoPort;
  readonly ahora?: () => Date;
  readonly limites?: {
    readonly porReferencia: { readonly maximo: number; readonly ventanaMs: number };
    readonly porOrigen: { readonly maximo: number; readonly ventanaMs: number };
  };
}

export class ConsultaSeguimientoInvalidaError extends Error {
  constructor() {
    super('Consulta de seguimiento invalida');
    this.name = 'ConsultaSeguimientoInvalidaError';
  }
}
/** Mismo error para incidente inexistente, ajeno, de otra modalidad o codigo incorrecto. */
export class SeguimientoNoEncontradoError extends Error {
  constructor() {
    super('Seguimiento no encontrado');
    this.name = 'SeguimientoNoEncontradoError';
  }
}
export class LimiteSeguimientoError extends Error {
  constructor(readonly reintentarEnSegundos: number) {
    super('Limite de consultas superado');
    this.name = 'LimiteSeguimientoError';
  }
}
export class SeguimientoNoDisponibleError extends Error {
  constructor(readonly causa?: unknown) {
    super('Seguimiento no disponible');
    this.name = 'SeguimientoNoDisponibleError';
  }
}

const LIMITES_POR_DEFECTO = {
  porReferencia: { maximo: 10, ventanaMs: 15 * 60 * 1000 },
  porOrigen: { maximo: 30, ventanaMs: 60 * 60 * 1000 },
};

/**
 * Seguimiento ciudadano (spec `consultas/seguimiento-ciudadano`). Compone originales de Reportes y estado
 * de Operaciones mediante sus fachadas, sin SQL entre modulos. Institucion responsable y actuaciones se
 * informan como pendientes hasta P4.2/P6.
 */
export class SeguimientoCiudadano {
  private readonly ahora: () => Date;
  private readonly limites: NonNullable<DependenciasSeguimiento['limites']>;

  constructor(private readonly d: DependenciasSeguimiento) {
    this.ahora = d.ahora ?? (() => new Date());
    this.limites = d.limites ?? LIMITES_POR_DEFECTO;
  }

  private async categoria(id: string, nombres?: ReadonlyMap<string, string>): Promise<CategoriaVista> {
    const mapa = nombres ?? (await this.d.categorias.nombres());
    return { id, nombre: mapa.get(id) ?? null };
  }

  async historial(usuarioId: string, cursorCrudo: unknown) {
    const despuesDe = cursorCrudo === undefined ? null : decodificarCursor(cursorCrudo);
    if (cursorCrudo !== undefined && !despuesDe) throw new ConsultaSeguimientoInvalidaError();
    return this.protegido(async () => {
      const filas = await this.d.envios.listarDeAutor(usuarioId, despuesDe, PAGINA_HISTORIAL + 1);
      const pagina = filas.slice(0, PAGINA_HISTORIAL);
      const [estados, nombres] = await Promise.all([this.d.incidentes.estados(pagina.map((f) => f.incidenteId)), this.d.categorias.nombres()]);
      const elementos = [];
      for (const f of pagina) {
        const e = estados.get(f.incidenteId);
        if (!e) continue;
        elementos.push({
          referencia: e.referencia,
          categoria: await this.categoria(f.categoriaId, nombres),
          estado: e.estado,
          recibidoEn: e.registradoEn.toISOString(),
          territorio: territorioVista(f.territorio),
        });
      }
      const ultima = pagina.at(-1);
      return {
        elementos,
        siguiente: filas.length > PAGINA_HISTORIAL && ultima ? codificarCursor({ recibidoEn: ultima.recibidoEn, incidenteId: ultima.incidenteId }) : null,
      };
    });
  }

  async detalleDeAutor(usuarioId: string, referenciaCruda: string) {
    const referencia = this.d.incidentes.normalizarReferencia(referenciaCruda);
    if (!referencia) throw new SeguimientoNoEncontradoError();
    const [incidente, detalle] = await this.protegido(async () => {
      const inc = await this.d.incidentes.porReferencia(referencia);
      return [inc, inc ? await this.d.envios.detalleDeAutor(usuarioId, inc.id) : null] as const;
    });
    if (!incidente || !detalle) throw new SeguimientoNoEncontradoError();
    return {
      referencia: incidente.referencia,
      categoria: await this.protegido(() => this.categoria(detalle.categoriaId)),
      estado: incidente.estado,
      recibidoEn: incidente.registradoEn.toISOString(),
      territorio: territorioVista(detalle.territorio),
      descripcion: detalle.descripcion,
      ocurrencia: { modo: detalle.ocurrencia.modo, instante: detalle.ocurrencia.instante.toISOString() },
      respuestas: { heridos: detalle.heridos, atencionMedica: detalle.atencionMedica },
      institucionResponsable: INSTITUCION_PENDIENTE,
      actuaciones: [] as const,
    };
  }

  /** Vista limitada del invitado: solo estado y resumen ciudadano, tras consumir los limites. */
  async vistaInvitado(cuerpo: unknown, origenRed: string) {
    const consulta = validarConsultaInvitado(cuerpo);
    if (!consulta) throw new ConsultaSeguimientoInvalidaError();
    const referencia = this.d.incidentes.normalizarReferencia(consulta.referencia);
    const r = await this.protegido(() =>
      this.d.limitador.consumir(
        [
          { tipo: 'seguimiento_ip', identificador: origenRed, ...this.limites.porOrigen },
          // Una referencia sin formato valido no puede existir: solo cuenta el limite por origen.
          ...(referencia ? [{ tipo: 'seguimiento_ref' as const, identificador: referencia, ...this.limites.porReferencia }] : []),
        ],
        this.ahora(),
      ),
    );
    if (!r.permitido) throw new LimiteSeguimientoError(r.reintentarEnSegundos);
    const incidente = referencia ? await this.protegido(() => this.d.incidentes.porReferencia(referencia)) : null;
    // Siempre se verifica (tambien sin incidente) para igualar el trabajo de ambos casos.
    const verificado = await this.protegido(() => this.d.envios.verificarCodigo(incidente?.id ?? null, consulta.codigo));
    if (!incidente || !verificado) throw new SeguimientoNoEncontradoError();
    return {
      referencia: incidente.referencia,
      categoria: await this.protegido(() => this.categoria(verificado.categoriaId)),
      estado: incidente.estado,
      recibidoEn: incidente.registradoEn.toISOString(),
      institucionResponsable: INSTITUCION_PENDIENTE,
      actuaciones: [] as const,
    };
  }

  private async protegido<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw new SeguimientoNoDisponibleError(e);
    }
  }
}
