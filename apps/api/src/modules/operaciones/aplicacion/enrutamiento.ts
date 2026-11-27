import type { ConsumidorEventos, EventoPersistido, PublicadorEventos } from '../../../compartido/eventos/eventos';
import type { ContextoTransaccional, UnidadDeTrabajo } from '../../../compartido/transaccion';
import {
  INSTITUCIONES_DESTINO,
  planificar,
  resolverDestinatarios,
  resultadoDe,
  type Faltante,
  type InstitucionDestino,
  type Papel,
  type ResultadoEnrutamiento,
  type RespuestaMedica,
} from '../dominio/matriz';

/**
 * Enrutamiento del incidente (P4.2, documento 09 §5 pasos 2, 3 y 5). Operaciones es el unico que
 * escribe enrutamientos y participaciones. Los originales llegan por la fachada de Reportes y las
 * sedes por la de Identidad, mediante puertos que cablea la composicion. No crea avisos por
 * usuario (P8) ni cambia el estado del incidente (P6).
 */

/** Originales que condicionan la regla (fachada de Reportes). */
export interface DatosEnrutamientoPort {
  de(incidenteId: string): Promise<{
    readonly categoriaId: string;
    readonly distritoId: string | null;
    readonly heridos: RespuestaMedica;
    readonly atencionMedica: RespuestaMedica;
  } | null>;
}

/** Sedes de Identidad. `designable` devuelve los requisitos incumplidos (vacio si es designable). */
export interface SedesEnrutamientoPort {
  elegibles(institucion: InstitucionDestino, distritoId: string, categoriaId: string): Promise<readonly string[]>;
  designable(sedeId: string, institucion: InstitucionDestino): Promise<readonly string[]>;
}

export type OrigenParticipacion = 'regla' | 'designacion' | 'reevaluacion';

export interface NuevaParticipacion {
  readonly sedeId: string;
  readonly institucion: InstitucionDestino;
  readonly papel: Papel;
  readonly origen: OrigenParticipacion;
  readonly designadoPor?: string;
  readonly motivo?: string;
}

export interface EnrutamientoGuardado {
  readonly incidenteId: string;
  readonly versionRegla: string;
  readonly categoriaId: string;
  readonly distritoId: string | null;
  readonly resultado: ResultadoEnrutamiento;
  readonly revisionMedicaPendiente: boolean;
  readonly faltantes: readonly Faltante[];
  readonly registradoEn: Date;
}

export interface PendienteFila extends EnrutamientoGuardado {
  readonly referencia: string;
}

export interface CursorFifo {
  readonly registradoEn: Date;
  readonly incidenteId: string;
}

/** Ambito vigente de la sede de un operador (lo resuelve Identidad; Consultas lo entrega). */
export interface AmbitoBandeja {
  readonly sedeId: string;
  readonly distritos: readonly string[];
  readonly categorias: readonly string[];
}

/** Fila de la bandeja: participacion de la sede del operador en un incidente. */
export interface FilaBandeja {
  readonly incidenteId: string;
  readonly referencia: string;
  readonly estado: string;
  readonly registradoEn: Date;
  readonly categoriaId: string;
  readonly distritoId: string | null;
  readonly revisionMedicaPendiente: boolean;
  readonly papel: Papel;
  readonly origen: OrigenParticipacion;
}

export interface ParticipacionVisible extends FilaBandeja {
  /** Instituciones de las demas participaciones, sin sedes ni operadores. */
  readonly otrasInstituciones: readonly InstitucionDestino[];
}

/** Persistencia del enrutamiento. Solo Operaciones lee o escribe sus tablas. */
export interface EnrutamientosRepositorio {
  existe(incidenteId: string): Promise<boolean>;
  /**
   * Inserta el enrutamiento copiando el instante de registro del incidente. Falso si ya existia
   * (o si el incidente no existe), sin abortar la transaccion.
   */
  insertar(
    tx: ContextoTransaccional,
    datos: Omit<EnrutamientoGuardado, 'registradoEn'> & { readonly eventoId: string },
  ): Promise<boolean>;
  /** Inserta participaciones ignorando las sedes que ya participan. Devuelve cuantas inserto. */
  insertarParticipaciones(tx: ContextoTransaccional, incidenteId: string, lista: readonly NuevaParticipacion[]): Promise<number>;
  /** Bloquea la fila (FOR UPDATE) y la devuelve; null si no existe. */
  bloquear(tx: ContextoTransaccional, incidenteId: string): Promise<EnrutamientoGuardado | null>;
  actualizarFaltantes(tx: ContextoTransaccional, incidenteId: string, faltantes: readonly Faltante[]): Promise<void>;
  pendientes(despuesDe: CursorFifo | null, limite: number): Promise<readonly PendienteFila[]>;
  /**
   * Participaciones de la sede visibles con su ambito vigente: por regla, el distrito y la categoria
   * del enrutamiento deben estar en el ambito; las designadas son excepcion limitada al caso.
   */
  bandeja(ambito: AmbitoBandeja, despuesDe: CursorFifo | null, limite: number): Promise<readonly FilaBandeja[]>;
  participacionDe(ambito: AmbitoBandeja, incidenteId: string): Promise<ParticipacionVisible | null>;
  /** Institucion principal con participacion de cada incidente (ausente si falta). */
  principales(ids: readonly string[]): Promise<ReadonlyMap<string, InstitucionDestino>>;
}

export const CONSUMIDOR_ENRUTAMIENTO = 'operaciones.enrutamiento';
export const EVENTO_ENRUTAMIENTO_RESUELTO = 'EnrutamientoResuelto';

export class IncidenteSinOriginalesError extends Error {
  constructor() {
    super('El incidente no tiene originales para enrutar');
    this.name = 'IncidenteSinOriginalesError';
  }
}

export class EnrutamientoNoEncontradoError extends Error {
  constructor() {
    super('Enrutamiento no encontrado');
    this.name = 'EnrutamientoNoEncontradoError';
  }
}

export class ConflictoEnrutamientoError extends Error {
  constructor(
    readonly codigo: 'FALTANTE_INEXISTENTE' | 'SEDE_NO_DESIGNABLE' | 'ENRUTAMIENTO_NO_PENDIENTE',
    readonly requisitos: readonly string[] = [],
  ) {
    super(`Conflicto de enrutamiento: ${codigo}`);
    this.name = 'ConflictoEnrutamientoError';
  }
}

export class DesignacionInvalidaError extends Error {
  constructor(readonly campos: Readonly<Record<string, string>>) {
    super('Designacion invalida');
    this.name = 'DesignacionInvalidaError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Valida el cuerpo de una designacion: exactamente institucion, sedeId y motivo (10 a 500). */
export function validarDesignacion(entrada: unknown): { institucion: InstitucionDestino; sedeId: string; motivo: string } {
  const campos: Record<string, string> = {};
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    throw new DesignacionInvalidaError({ cuerpo: 'Envía institución, sede y motivo.' });
  }
  const e = entrada as Record<string, unknown>;
  for (const clave of Object.keys(e)) {
    if (!['institucion', 'sedeId', 'motivo'].includes(clave)) campos[clave] = 'Campo no admitido.';
  }
  if (!(INSTITUCIONES_DESTINO as readonly unknown[]).includes(e.institucion)) campos.institucion = 'Elige una institución válida.';
  if (typeof e.sedeId !== 'string' || !UUID.test(e.sedeId)) campos.sedeId = 'Elige una sede válida.';
  const motivo = typeof e.motivo === 'string' ? e.motivo.trim() : '';
  if ([...motivo].length < 10 || [...motivo].length > 500) campos.motivo = 'Escribe un motivo de 10 a 500 caracteres.';
  if (Object.keys(campos).length) throw new DesignacionInvalidaError(campos);
  return { institucion: e.institucion as InstitucionDestino, sedeId: e.sedeId as string, motivo };
}

export interface DependenciasEnrutamiento {
  readonly repositorio: EnrutamientosRepositorio;
  readonly datos: DatosEnrutamientoPort;
  readonly sedes: SedesEnrutamientoPort;
  readonly unidadDeTrabajo: UnidadDeTrabajo;
  readonly eventos: PublicadorEventos;
  /** Llamar tras confirmar un evento nuevo (despierta el procesador de entregas). */
  readonly despertarEntregas?: () => void;
}

export class ServicioEnrutamiento {
  constructor(private readonly d: DependenciasEnrutamiento) {}

  /** Consumidor de `IncidenteRegistrado`. Idempotente por incidente (y por evento). */
  consumidor(): ConsumidorEventos {
    return {
      nombre: CONSUMIDOR_ENRUTAMIENTO,
      tipos: ['IncidenteRegistrado'],
      manejar: (evento) => this.enrutar(evento),
    };
  }

  async enrutar(evento: EventoPersistido): Promise<void> {
    const incidenteId = evento.agregadoId;
    if (await this.d.repositorio.existe(incidenteId)) return;
    const datos = await this.d.datos.de(incidenteId);
    if (!datos) throw new IncidenteSinOriginalesError();
    const resolucion = resolverDestinatarios(datos.categoriaId, datos.heridos, datos.atencionMedica);
    const sedes = new Map<InstitucionDestino, readonly string[]>();
    if (datos.distritoId !== null) {
      for (const d of resolucion.destinatarios) {
        sedes.set(d.institucion, await this.d.sedes.elegibles(d.institucion, datos.distritoId, datos.categoriaId));
      }
    }
    const plan = planificar(resolucion.destinatarios, datos.distritoId, sedes);
    const nuevo = await this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      const insertado = await this.d.repositorio.insertar(tx, {
        incidenteId,
        eventoId: evento.id,
        versionRegla: resolucion.version,
        categoriaId: datos.categoriaId,
        distritoId: datos.distritoId,
        resultado: plan.resultado,
        revisionMedicaPendiente: resolucion.revisionMedicaPendiente,
        faltantes: plan.faltantes,
      });
      if (!insertado) return false;
      await this.d.repositorio.insertarParticipaciones(
        tx,
        incidenteId,
        plan.participaciones.map((p) => ({ ...p, origen: 'regla' as const })),
      );
      await this.publicar(tx, incidenteId, plan.resultado, 'regla');
      return true;
    });
    if (nuevo) this.d.despertarEntregas?.();
  }

  /** Designacion administrativa de una sede para un faltante (RF35). */
  async designar(incidenteId: string, entrada: unknown, administradorId: string): Promise<EnrutamientoGuardado> {
    const { institucion, sedeId, motivo } = validarDesignacion(entrada);
    if (!UUID.test(incidenteId)) throw new EnrutamientoNoEncontradoError();
    const r = await this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      const actual = await this.d.repositorio.bloquear(tx, incidenteId);
      if (!actual) throw new EnrutamientoNoEncontradoError();
      const faltante = actual.faltantes.find((f) => f.institucion === institucion);
      if (!faltante) throw new ConflictoEnrutamientoError('FALTANTE_INEXISTENTE');
      const requisitos = await this.d.sedes.designable(sedeId, institucion);
      if (requisitos.length) throw new ConflictoEnrutamientoError('SEDE_NO_DESIGNABLE', requisitos);
      const insertadas = await this.d.repositorio.insertarParticipaciones(tx, incidenteId, [
        { sedeId, institucion, papel: faltante.papel, origen: 'designacion', designadoPor: administradorId, motivo },
      ]);
      if (insertadas === 0) throw new ConflictoEnrutamientoError('FALTANTE_INEXISTENTE');
      const faltantes = actual.faltantes.filter((f) => f !== faltante);
      await this.d.repositorio.actualizarFaltantes(tx, incidenteId, faltantes);
      await this.publicar(tx, incidenteId, resultadoDe(faltantes), 'designacion');
      return { ...actual, faltantes, resultado: resultadoDe(faltantes) };
    });
    this.d.despertarEntregas?.();
    return r;
  }

  /**
   * Reevalua los faltantes `sin_sede_elegible` con la configuracion vigente y la misma version de la
   * regla. Los faltantes `sin_distrito` solo se resuelven por designacion.
   */
  async reevaluar(incidenteId: string): Promise<EnrutamientoGuardado> {
    if (!UUID.test(incidenteId)) throw new EnrutamientoNoEncontradoError();
    const r = await this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      const actual = await this.d.repositorio.bloquear(tx, incidenteId);
      if (!actual) throw new EnrutamientoNoEncontradoError();
      if (actual.resultado !== 'ENRUTAMIENTO_PENDIENTE') throw new ConflictoEnrutamientoError('ENRUTAMIENTO_NO_PENDIENTE');
      const faltantes: Faltante[] = [];
      const nuevas: NuevaParticipacion[] = [];
      for (const f of actual.faltantes) {
        const sedes = f.motivo === 'sin_sede_elegible' && actual.distritoId !== null
          ? [...new Set(await this.d.sedes.elegibles(f.institucion, actual.distritoId, actual.categoriaId))]
          : [];
        if (sedes.length === 0) faltantes.push(f);
        for (const sedeId of sedes) nuevas.push({ sedeId, institucion: f.institucion, papel: f.papel, origen: 'reevaluacion' });
      }
      await this.d.repositorio.insertarParticipaciones(tx, incidenteId, nuevas);
      await this.d.repositorio.actualizarFaltantes(tx, incidenteId, faltantes);
      await this.publicar(tx, incidenteId, resultadoDe(faltantes), 'reevaluacion');
      return { ...actual, faltantes, resultado: resultadoDe(faltantes) };
    });
    this.d.despertarEntregas?.();
    return r;
  }

  pendientes(despuesDe: CursorFifo | null, limite: number): Promise<readonly PendienteFila[]> {
    return this.d.repositorio.pendientes(despuesDe, limite);
  }

  /** Bandeja FIFO de la sede dentro de su ambito vigente (la consulta Consultas). */
  bandeja(ambito: AmbitoBandeja, despuesDe: CursorFifo | null, limite: number): Promise<readonly FilaBandeja[]> {
    return this.d.repositorio.bandeja(ambito, despuesDe, limite);
  }

  /** Null si el identificador no es valido o el incidente no es visible para la sede. */
  participacionDe(ambito: AmbitoBandeja, incidenteId: string): Promise<ParticipacionVisible | null> {
    if (!UUID.test(incidenteId)) return Promise.resolve(null);
    return this.d.repositorio.participacionDe(ambito, incidenteId);
  }

  /** Institucion responsable para el seguimiento ciudadano: la principal con participacion. */
  principales(ids: readonly string[]): Promise<ReadonlyMap<string, InstitucionDestino>> {
    if (ids.length === 0) return Promise.resolve(new Map());
    return this.d.repositorio.principales(ids);
  }

  private publicar(tx: ContextoTransaccional, incidenteId: string, resultado: ResultadoEnrutamiento, origen: OrigenParticipacion) {
    return this.d.eventos.publicar(tx, {
      tipo: EVENTO_ENRUTAMIENTO_RESUELTO,
      version: 1,
      agregadoId: incidenteId,
      carga: { incidenteId, resultado, origen },
    });
  }
}
