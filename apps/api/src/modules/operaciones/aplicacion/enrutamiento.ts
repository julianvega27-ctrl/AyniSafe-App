import type { ConsumidorEventos, EventoPersistido, PublicadorEventos } from '../../../compartido/eventos/eventos';
import type { ContextoTransaccional, UnidadDeTrabajo } from '../../../compartido/transaccion';
import {
  INSTITUCIONES_DESTINO,
  planificar,
  planificarCondicionMedica,
  resolverDestinatarios,
  VERSION_MATRIZ,
  resultadoDe,
  type Faltante,
  type InstitucionDestino,
  type Papel,
  type ResultadoEnrutamiento,
  type RespuestaMedica,
} from '../dominio/matriz';
import { propuestaPrioridad } from '../dominio/prioridad';

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
  /**
   * Condicion medica vigente (evaluacion de Reportes, P5.1) con su cabecera bloqueada en la
   * transaccion del llamador. Null si el incidente no tiene evaluacion. Orden: evaluacion, enrutamiento.
   */
  condicionBloqueada?(tx: ContextoTransaccional, incidenteId: string): Promise<{
    readonly heridos: RespuestaMedica;
    readonly atencionMedica: RespuestaMedica;
  } | null>;
}

/** Sedes de Identidad. `designable` devuelve los requisitos incumplidos (vacio si es designable). */
export interface SedesEnrutamientoPort {
  elegibles(institucion: InstitucionDestino, distritoId: string, categoriaId: string): Promise<readonly string[]>;
  designable(sedeId: string, institucion: InstitucionDestino): Promise<readonly string[]>;
}

export type OrigenParticipacion = 'regla' | 'designacion' | 'reevaluacion' | 'condicion_medica';

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

/** Filtro de la bandeja por responsable activo de la institucion del operador (P6 grupo D). */
export interface FiltroResponsable {
  readonly tipo: 'sin_tomar' | 'mios';
  readonly usuarioId: string;
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
/** Filtros del mapa operativo (P7 grupo B), ya validados por Consultas. */
export interface FiltroMapaOperativo {
  readonly desde: Date;
  readonly distritoId: string | null;
  readonly categoriaId: string | null;
}

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
  /** Institucion de la sede del operador (P5.1: autoriza el detalle sanitario de SAMU). */
  readonly institucion: InstitucionDestino;
  /** P6: verificacion, resultado de cierre y responsable activo de la institucion de la sede. */
  readonly verificacion?: string;
  readonly resultadoCierre?: string | null;
  readonly responsableId?: string | null;
  /** Grupo B: vinculado como duplicado; el estado es el efectivo del principal. */
  readonly vinculado?: boolean;
  /** Grupo C: prioridad vigente y su origen. */
  readonly prioridad?: string;
  readonly prioridadOrigen?: string | null;
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
  /** Grupo C: fija la prioridad propuesta solo si el incidente aun no tiene prioridad (no sobrescribe revisiones). */
  proponerPrioridad(tx: ContextoTransaccional, incidenteId: string, valor: string, version: string): Promise<void>;
  /** Bloquea la fila (FOR UPDATE) y la devuelve; null si no existe. */
  bloquear(tx: ContextoTransaccional, incidenteId: string): Promise<EnrutamientoGuardado | null>;
  actualizarFaltantes(tx: ContextoTransaccional, incidenteId: string, faltantes: readonly Faltante[]): Promise<void>;
  pendientes(despuesDe: CursorFifo | null, limite: number): Promise<readonly PendienteFila[]>;
  /**
   * Participaciones de la sede visibles con su ambito vigente: por regla, el distrito y la categoria
   * del enrutamiento deben estar en el ambito; las designadas son excepcion limitada al caso.
   */
  bandeja(ambito: AmbitoBandeja, despuesDe: CursorFifo | null, limite: number, filtro?: FiltroResponsable | null): Promise<readonly FilaBandeja[]>;
  participacionDe(ambito: AmbitoBandeja, incidenteId: string): Promise<ParticipacionVisible | null>;
  /** Mapa operativo (P7 grupo B). */
  mapa(ambito: AmbitoBandeja, filtro: FiltroMapaOperativo, limite: number): Promise<readonly FilaBandeja[]>;
  /** Institucion principal con participacion de cada incidente (ausente si falta). */
  principales(ids: readonly string[]): Promise<ReadonlyMap<string, InstitucionDestino>>;
  /** Institucion y papel de cada participacion (P5.1). */
  participaciones(tx: ContextoTransaccional, incidenteId: string): Promise<readonly { readonly institucion: InstitucionDestino; readonly papel: Papel }[]>;
  /** Cambia el papel de todas las participaciones de una institucion en el incidente. */
  actualizarPapel(tx: ContextoTransaccional, incidenteId: string, institucion: InstitucionDestino, papel: Papel): Promise<void>;
  actualizarRevisionMedica(tx: ContextoTransaccional, incidenteId: string, pendiente: boolean): Promise<void>;
  registrarCambio(tx: ContextoTransaccional, cambio: CambioEnrutamiento): Promise<void>;
}

/** Estado auditable de los destinatarios, sin datos sanitarios. */
export interface EstadoDestinatarios {
  readonly destinatarios: readonly { readonly institucion: InstitucionDestino; readonly papel: Papel }[];
  readonly revisionMedicaPendiente: boolean;
  readonly resultado: ResultadoEnrutamiento;
}

export interface CambioEnrutamiento {
  readonly incidenteId: string;
  readonly versionEvaluacion: number;
  readonly actorTipo: 'ciudadano' | 'operador';
  readonly actorUsuarioId: string | null;
  readonly antes: EstadoDestinatarios;
  readonly despues: EstadoDestinatarios;
}

/** Condicion medica vigente tras una version nueva de la evaluacion (contrato hacia Reportes). */
export interface CambioCondicionMedica {
  readonly incidenteId: string;
  readonly heridos: RespuestaMedica;
  readonly atencionMedica: RespuestaMedica;
  readonly versionEvaluacion: number;
  readonly actor: { readonly tipo: 'ciudadano' | 'operador'; readonly usuarioId: string | null };
}

/** La version de regla guardada no es la que el servicio sabe aplicar. */
export class VersionReglaDesconocidaError extends Error {
  constructor() {
    super('Version de regla de enrutamiento desconocida');
    this.name = 'VersionReglaDesconocidaError';
  }
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
  /**
   * P6 grupo D: en la misma transaccion, tras incorporar o cambiar participaciones, asigna el caso al
   * operador unico de la principal cuando corresponde (atencion institucional).
   */
  readonly alCambiarPrincipal?: (tx: ContextoTransaccional, incidenteId: string) => Promise<unknown>;
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
    let condicion: { heridos: RespuestaMedica; atencionMedica: RespuestaMedica } = {
      heridos: datos.heridos,
      atencionMedica: datos.atencionMedica,
    };
    let { resolucion, plan } = await this.planear(datos.categoriaId, datos.distritoId, condicion);
    const nuevo = await this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      // Bloquea la evaluacion antes de insertar: una aclaracion concurrente espera o ya esta confirmada.
      const vigente = await this.d.datos.condicionBloqueada?.(tx, incidenteId);
      if (vigente && (vigente.heridos !== condicion.heridos || vigente.atencionMedica !== condicion.atencionMedica)) {
        condicion = vigente;
        ({ resolucion, plan } = await this.planear(datos.categoriaId, datos.distritoId, condicion));
      }
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
      // Prioridad inicial por categoria (RF12); sin configuracion valida queda SIN_EVALUAR.
      const propuesta = propuestaPrioridad(datos.categoriaId);
      if (propuesta) await this.d.repositorio.proponerPrioridad(tx, incidenteId, propuesta.valor, propuesta.version);
      await this.d.alCambiarPrincipal?.(tx, incidenteId);
      await this.publicar(tx, incidenteId, plan.resultado, 'regla');
      return true;
    });
    if (nuevo) this.d.despertarEntregas?.();
  }

  private async planear(categoriaId: string, distritoId: string | null, c: { heridos: RespuestaMedica; atencionMedica: RespuestaMedica }) {
    const resolucion = resolverDestinatarios(categoriaId, c.heridos, c.atencionMedica);
    const sedes = new Map<InstitucionDestino, readonly string[]>();
    if (distritoId !== null) {
      for (const d of resolucion.destinatarios) {
        sedes.set(d.institucion, await this.d.sedes.elegibles(d.institucion, distritoId, categoriaId));
      }
    }
    return { resolucion, plan: planificar(resolucion.destinatarios, distritoId, sedes) };
  }

  /**
   * Recalcula el enrutamiento con la condicion medica vigente en la transaccion de la aclaracion
   * (P5.1, design decision 4). Sin enrutamiento todavia, no hace nada: el consumidor usara la
   * condicion vigente. Solo incorpora o eleva destinatarios; nunca retira participaciones.
   */
  async aplicarCondicionMedica(tx: ContextoTransaccional, cambio: CambioCondicionMedica): Promise<{ readonly samuIncorporado: boolean }> {
    const actual = await this.d.repositorio.bloquear(tx, cambio.incidenteId);
    if (!actual) return { samuIncorporado: false };
    if (actual.versionRegla !== VERSION_MATRIZ) throw new VersionReglaDesconocidaError();
    const objetivo = resolverDestinatarios(actual.categoriaId, cambio.heridos, cambio.atencionMedica);
    const participaciones = await this.d.repositorio.participaciones(tx, cambio.incidenteId);
    const presentes = new Map<InstitucionDestino, Papel>();
    for (const p of participaciones) presentes.set(p.institucion, p.papel);
    for (const f of actual.faltantes) if (!presentes.has(f.institucion)) presentes.set(f.institucion, f.papel);

    const plan = planificarCondicionMedica(presentes, objetivo);
    let faltantes: Faltante[] = actual.faltantes.map((f) => {
      const nuevo = plan.cambiosPapel.find((c) => c.institucion === f.institucion);
      return nuevo ? { ...f, papel: nuevo.papel } : f;
    });
    const nuevas: NuevaParticipacion[] = [];
    for (const d of plan.incorporar) {
      const sedes = actual.distritoId === null
        ? []
        : [...new Set(await this.d.sedes.elegibles(d.institucion, actual.distritoId, actual.categoriaId))];
      if (sedes.length === 0) {
        faltantes = [...faltantes, { ...d, motivo: actual.distritoId === null ? 'sin_distrito' : 'sin_sede_elegible' }];
      }
      for (const sedeId of sedes) nuevas.push({ sedeId, institucion: d.institucion, papel: d.papel, origen: 'condicion_medica' });
    }
    const despuesPresentes = new Map(presentes);
    for (const d of [...plan.cambiosPapel, ...plan.incorporar]) despuesPresentes.set(d.institucion, d.papel);
    const estado = (m: ReadonlyMap<InstitucionDestino, Papel>, revision: boolean, resultado: ResultadoEnrutamiento): EstadoDestinatarios => ({
      destinatarios: [...m.entries()]
        .map(([institucion, papel]) => ({ institucion, papel }))
        .sort((a, b) => a.institucion.localeCompare(b.institucion)),
      revisionMedicaPendiente: revision,
      resultado,
    });
    const antes = estado(presentes, actual.revisionMedicaPendiente, actual.resultado);
    const despues = estado(despuesPresentes, objetivo.revisionMedicaPendiente, resultadoDe(faltantes));
    if (JSON.stringify(antes) === JSON.stringify(despues)) return { samuIncorporado: false };

    await this.d.repositorio.insertarParticipaciones(tx, cambio.incidenteId, nuevas);
    for (const c of plan.cambiosPapel) await this.d.repositorio.actualizarPapel(tx, cambio.incidenteId, c.institucion, c.papel);
    if (JSON.stringify(faltantes) !== JSON.stringify(actual.faltantes)) {
      await this.d.repositorio.actualizarFaltantes(tx, cambio.incidenteId, faltantes);
    }
    if (objetivo.revisionMedicaPendiente !== actual.revisionMedicaPendiente) {
      await this.d.repositorio.actualizarRevisionMedica(tx, cambio.incidenteId, objetivo.revisionMedicaPendiente);
    }
    await this.d.repositorio.registrarCambio(tx, {
      incidenteId: cambio.incidenteId,
      versionEvaluacion: cambio.versionEvaluacion,
      actorTipo: cambio.actor.tipo,
      actorUsuarioId: cambio.actor.usuarioId,
      antes,
      despues,
    });
    await this.d.alCambiarPrincipal?.(tx, cambio.incidenteId);
    await this.publicar(tx, cambio.incidenteId, despues.resultado, 'condicion_medica');
    return { samuIncorporado: plan.incorporar.some((d) => d.institucion === 'samu') };
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
      await this.d.alCambiarPrincipal?.(tx, incidenteId);
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
      await this.d.alCambiarPrincipal?.(tx, incidenteId);
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
  bandeja(ambito: AmbitoBandeja, despuesDe: CursorFifo | null, limite: number, filtro?: FiltroResponsable | null): Promise<readonly FilaBandeja[]> {
    return this.d.repositorio.bandeja(ambito, despuesDe, limite, filtro ?? null);
  }

  /** Mapa operativo (P7 grupo B): participaciones de la sede en su ambito, con filtros. */
  mapa(ambito: AmbitoBandeja, filtro: FiltroMapaOperativo, limite: number): Promise<readonly FilaBandeja[]> {
    return this.d.repositorio.mapa(ambito, filtro, limite);
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
