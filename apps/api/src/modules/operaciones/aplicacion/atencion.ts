import type { ContextoTransaccional, UnidadDeTrabajo } from '../../../compartido/transaccion';
import {
  accionesPermitidas,
  AtencionNoDisponibleError,
  ConflictoAtencionError,
  destinoTransicion,
  esUuid,
  PermisoAtencionError,
  validarMotivoAdmin,
  validarTransicion,
  validarVerificacion,
  type Accion,
  type Resultado,
  type Verificacion,
} from '../dominio/atencion';
import type { EstadoIncidente } from '../dominio/incidente';
import type { InstitucionDestino, Papel } from '../dominio/matriz';

/**
 * Atencion institucional (P6, spec `operaciones/atencion-institucional`). Operaciones es el unico
 * que escribe asignaciones, transiciones e historial. Cada mutacion bloquea la fila del incidente y
 * registra su historial en la misma transaccion (EQ-05); la unicidad de la asignacion activa la
 * garantiza la BD (EQ-20). Los operadores llegan por la fachada de Identidad mediante un puerto.
 */

export interface Asignacion {
  readonly id: string;
  readonly incidenteId: string;
  readonly institucion: InstitucionDestino;
  readonly operadorId: string;
  readonly sedeId: string;
  readonly origen: 'asumida' | 'reasignada';
  readonly asignadaEn: Date;
}

export interface EstadoBloqueado {
  readonly estado: EstadoIncidente;
  readonly verificacion: Verificacion;
  /** Grupo B: incidente principal si esta vinculado como duplicado. */
  readonly principalId?: string | null;
}

export type AccionHistorial = 'asumir' | 'transicion' | 'verificacion' | 'liberar' | 'reasignar' | 'vincular' | 'prioridad';

export interface EntradaHistorial {
  readonly incidenteId: string;
  readonly accion: AccionHistorial;
  readonly actorTipo: 'operador' | 'administrador';
  readonly actorUsuarioId: string;
  readonly institucion: InstitucionDestino;
  readonly valorAnterior?: string | null;
  readonly valorNuevo?: string | null;
  readonly motivo?: string | null;
}

export interface FilaHistorial extends Required<Omit<EntradaHistorial, 'actorUsuarioId'>> {
  readonly creadoEn: Date;
}

export interface Hito {
  readonly tipo: 'EN_REVISION' | 'EN_ATENCION' | 'CERRADO';
  readonly institucion: InstitucionDestino;
  readonly instante: Date;
}

export interface CierreCiudadano {
  readonly estado: EstadoIncidente;
  readonly resultado: Resultado | null;
  readonly resumenCiudadano: string | null;
  readonly hitos: readonly Hito[];
  /** Grupo B: el incidente es un duplicado coordinado con otro. */
  readonly coordinado?: boolean;
}

export interface AsignacionAdmin extends Asignacion {
  readonly referencia: string;
  readonly estado: EstadoIncidente;
}

/** Persistencia de la atencion. Solo Operaciones lee o escribe estas tablas. */
export interface AtencionRepositorio {
  bloquear(tx: ContextoTransaccional, incidenteId: string): Promise<EstadoBloqueado | null>;
  /** Papel vigente de la institucion en el incidente (null si no participa). */
  papel(tx: ContextoTransaccional, incidenteId: string, institucion: InstitucionDestino): Promise<Papel | null>;
  sedesParticipantes(tx: ContextoTransaccional | null, incidenteId: string, institucion: InstitucionDestino): Promise<readonly string[]>;
  activa(tx: ContextoTransaccional, incidenteId: string, institucion: InstitucionDestino): Promise<Asignacion | null>;
  /** Null si ya existe una activa para la institucion (sin abortar la transaccion). */
  insertarAsignacion(tx: ContextoTransaccional, a: Omit<Asignacion, 'id' | 'asignadaEn'>): Promise<Asignacion | null>;
  liberar(tx: ContextoTransaccional, asignacionId: string): Promise<void>;
  asignacionPorId(asignacionId: string): Promise<Asignacion | null>;
  cambiarEstado(
    tx: ContextoTransaccional,
    incidenteId: string,
    estado: EstadoIncidente,
    cierre?: { readonly resultado: Resultado; readonly resumenCiudadano: string },
  ): Promise<void>;
  cambiarVerificacion(tx: ContextoTransaccional, incidenteId: string, valor: Verificacion): Promise<void>;
  registrar(tx: ContextoTransaccional, entrada: EntradaHistorial): Promise<void>;
  asignacionesActivas(incidenteId: string): Promise<readonly Asignacion[]>;
  historial(incidenteId: string): Promise<readonly FilaHistorial[]>;
  /** Asignaciones activas de incidentes abiertos, de la mas antigua a la mas reciente. */
  listarActivas(limite: number): Promise<readonly AsignacionAdmin[]>;
  cierres(ids: readonly string[]): Promise<ReadonlyMap<string, CierreCiudadano>>;
}

/** Operador visto por la atencion (fachada de Identidad). */
export interface OperadorAtencion {
  readonly usuarioId: string;
  readonly nombre: string;
  readonly sedeId: string;
  readonly sedeNombre: string;
  readonly institucion: InstitucionDestino;
  readonly cuentaActiva: boolean;
  readonly sedeOperativa: boolean;
}

export interface OperadoresPort {
  describir(ids: readonly string[]): Promise<ReadonlyMap<string, OperadorAtencion>>;
  deSedes(sedeIds: readonly string[]): Promise<readonly OperadorAtencion[]>;
}

/** Participacion visible del operador (la resuelve el enrutamiento con su ambito vigente). */
export interface ParticipacionOperador {
  readonly incidenteId: string;
  readonly institucion: InstitucionDestino;
  readonly sedeId: string;
}

export interface DependenciasAtencion {
  readonly repositorio: AtencionRepositorio;
  readonly operadores: OperadoresPort;
  readonly unidadDeTrabajo: UnidadDeTrabajo;
}

export const LIMITE_ASIGNACIONES = 200;

export class ServicioAtencion {
  constructor(private readonly d: DependenciasAtencion) {}

  /** Asumir caso (RF56). La primera asuncion de la principal inicia la revision. */
  async asumir(p: ParticipacionOperador, operadorId: string): Promise<{ readonly asignacion: Asignacion; readonly nueva: boolean; readonly estado: EstadoIncidente }> {
    return this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      const inc = await this.bloquear(tx, p.incidenteId);
      if (inc.estado === 'CERRADO') throw new ConflictoAtencionError('INCIDENTE_CERRADO', inc.estado);
      const actual = await this.d.repositorio.activa(tx, p.incidenteId, p.institucion);
      if (actual) {
        if (actual.operadorId === operadorId) return { asignacion: actual, nueva: false, estado: inc.estado };
        throw new ConflictoAtencionError('CASO_ASUMIDO', inc.estado);
      }
      const asignacion = await this.d.repositorio.insertarAsignacion(tx, {
        incidenteId: p.incidenteId,
        institucion: p.institucion,
        operadorId,
        sedeId: p.sedeId,
        origen: 'asumida',
      });
      if (!asignacion) throw new ConflictoAtencionError('CASO_ASUMIDO', inc.estado);
      await this.d.repositorio.registrar(tx, {
        incidenteId: p.incidenteId,
        accion: 'asumir',
        actorTipo: 'operador',
        actorUsuarioId: operadorId,
        institucion: p.institucion,
        valorNuevo: operadorId,
      });
      let estado = inc.estado;
      const papel = await this.d.repositorio.papel(tx, p.incidenteId, p.institucion);
      if (papel === 'principal' && estado === 'REGISTRADO' && !inc.principalId) {
        estado = 'EN_REVISION';
        await this.d.repositorio.cambiarEstado(tx, p.incidenteId, estado);
        await this.d.repositorio.registrar(tx, {
          incidenteId: p.incidenteId,
          accion: 'transicion',
          actorTipo: 'operador',
          actorUsuarioId: operadorId,
          institucion: p.institucion,
          valorAnterior: 'REGISTRADO',
          valorNuevo: estado,
        });
      }
      return { asignacion, nueva: true, estado };
    });
  }

  /** Iniciar atencion o cerrar (RF45/RF46), solo por el responsable de la principal. */
  async transicion(p: ParticipacionOperador, operadorId: string, entrada: unknown): Promise<{ readonly estado: EstadoIncidente; readonly resultado: Resultado | null }> {
    const s = validarTransicion(entrada);
    return this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      const inc = await this.autorizarPrincipal(tx, p, operadorId, s.estadoEsperado);
      const destino = destinoTransicion(inc.estado, s.accion, s.accion === 'cerrar' ? s.resultado : undefined);
      if (!destino) throw new ConflictoAtencionError('TRANSICION_NO_PERMITIDA', inc.estado);
      await this.d.repositorio.cambiarEstado(
        tx,
        p.incidenteId,
        destino,
        s.accion === 'cerrar' ? { resultado: s.resultado, resumenCiudadano: s.resumenCiudadano } : undefined,
      );
      await this.d.repositorio.registrar(tx, {
        incidenteId: p.incidenteId,
        accion: 'transicion',
        actorTipo: 'operador',
        actorUsuarioId: operadorId,
        institucion: p.institucion,
        valorAnterior: inc.estado,
        valorNuevo: s.accion === 'cerrar' ? `CERRADO:${s.resultado}` : destino,
        motivo: s.accion === 'cerrar' ? s.motivo : null,
      });
      return { estado: destino, resultado: s.accion === 'cerrar' ? s.resultado : null };
    });
  }

  /** Verificacion separada del estado; no cambia el estado ni se exige para cerrar. */
  async verificar(p: ParticipacionOperador, operadorId: string, entrada: unknown): Promise<{ readonly verificacion: Verificacion; readonly estado: EstadoIncidente }> {
    const s = validarVerificacion(entrada);
    return this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      const inc = await this.autorizarPrincipal(tx, p, operadorId, s.estadoEsperado);
      if (inc.verificacion !== s.valor) {
        await this.d.repositorio.cambiarVerificacion(tx, p.incidenteId, s.valor);
      }
      await this.d.repositorio.registrar(tx, {
        incidenteId: p.incidenteId,
        accion: 'verificacion',
        actorTipo: 'operador',
        actorUsuarioId: operadorId,
        institucion: p.institucion,
        valorAnterior: inc.verificacion,
        valorNuevo: s.valor,
        motivo: s.motivo,
      });
      return { verificacion: s.valor, estado: inc.estado };
    });
  }

  /** Vista de atencion para el resumen del operador: responsable, acciones e historial. */
  async vistaOperador(
    p: ParticipacionOperador & { readonly papel: Papel; readonly estado: EstadoIncidente; readonly vinculado?: boolean },
    operadorId: string,
  ) {
    const [activas, historial] = await Promise.all([
      this.d.repositorio.asignacionesActivas(p.incidenteId),
      this.d.repositorio.historial(p.incidenteId),
    ]);
    const propia = activas.find((a) => a.institucion === p.institucion) ?? null;
    const nombres = propia ? await this.d.operadores.describir([propia.operadorId]) : new Map<string, OperadorAtencion>();
    const vinculado = p.vinculado ?? false;
    const acciones: readonly Accion[] = accionesPermitidas({
      estado: p.estado,
      papel: p.papel,
      institucionConResponsable: propia !== null,
      esResponsable: propia?.operadorId === operadorId,
      vinculado,
    });
    return {
      responsable: propia
        ? {
            asignado: true as const,
            esUsted: propia.operadorId === operadorId,
            nombre: nombres.get(propia.operadorId)?.nombre ?? null,
            desde: propia.asignadaEn.toISOString(),
          }
        : { asignado: false as const },
      institucionesConResponsable: [...new Set(activas.map((a) => a.institucion))].sort(),
      accionesPermitidas: acciones,
      historial: historial.map((h) => ({
        accion: h.accion,
        institucion: h.institucion,
        actorTipo: h.actorTipo,
        valorAnterior: h.accion === 'asumir' || h.accion === 'reasignar' || h.accion === 'liberar' ? null : h.valorAnterior,
        valorNuevo: h.accion === 'asumir' || h.accion === 'reasignar' || h.accion === 'liberar' ? null : h.valorNuevo,
        // El motivo solo lo ve la institucion que lo escribio.
        motivo: h.institucion === p.institucion ? h.motivo : null,
        instante: h.creadoEn.toISOString(),
      })),
    };
  }

  /** Lista de asignaciones activas para el administrador, sin datos del caso. */
  async listarAsignaciones() {
    const filas = await this.d.repositorio.listarActivas(LIMITE_ASIGNACIONES);
    const ops = await this.d.operadores.describir([...new Set(filas.map((f) => f.operadorId))]);
    return filas.map((f) => {
      const o = ops.get(f.operadorId);
      return {
        id: f.id,
        referencia: f.referencia,
        estado: f.estado,
        institucion: f.institucion,
        sede: { id: f.sedeId, nombre: o?.sedeId === f.sedeId ? o.sedeNombre : null },
        responsable: { id: f.operadorId, nombre: o?.nombre ?? null },
        asignadaEn: f.asignadaEn.toISOString(),
        requiereReasignacion: !o || !o.cuentaActiva || !o.sedeOperativa || o.sedeId !== f.sedeId,
      };
    });
  }

  /** Operadores elegibles para reasignar: activos, de sedes operativas que participan, otros que el actual. */
  async candidatos(asignacionId: string) {
    const a = esUuid(asignacionId) ? await this.d.repositorio.asignacionPorId(asignacionId) : null;
    if (!a) throw new AtencionNoDisponibleError();
    const sedes = await this.d.repositorio.sedesParticipantes(null, a.incidenteId, a.institucion);
    const ops = await this.d.operadores.deSedes(sedes);
    return ops
      .filter((o) => o.usuarioId !== a.operadorId && o.cuentaActiva && o.sedeOperativa && o.institucion === a.institucion)
      .map((o) => ({ id: o.usuarioId, nombre: o.nombre, sede: { id: o.sedeId, nombre: o.sedeNombre } }));
  }

  async liberar(asignacionId: string, administradorId: string, entrada: unknown) {
    const { motivo } = validarMotivoAdmin(entrada, false);
    return this.cambiarAsignacion(asignacionId, async (tx, a) => {
      await this.d.repositorio.liberar(tx, a.id);
      await this.d.repositorio.registrar(tx, {
        incidenteId: a.incidenteId,
        accion: 'liberar',
        actorTipo: 'administrador',
        actorUsuarioId: administradorId,
        institucion: a.institucion,
        valorAnterior: a.operadorId,
        motivo,
      });
      return { liberada: true as const };
    });
  }

  async reasignar(asignacionId: string, administradorId: string, entrada: unknown) {
    const { motivo, operadorId } = validarMotivoAdmin(entrada, true);
    return this.cambiarAsignacion(asignacionId, async (tx, a) => {
      const destino = (await this.d.operadores.describir([operadorId!])).get(operadorId!);
      const sedes = await this.d.repositorio.sedesParticipantes(tx, a.incidenteId, a.institucion);
      if (
        !destino ||
        destino.usuarioId === a.operadorId ||
        destino.institucion !== a.institucion ||
        !destino.cuentaActiva ||
        !destino.sedeOperativa ||
        !sedes.includes(destino.sedeId)
      ) {
        throw new ConflictoAtencionError('DESTINO_NO_VALIDO');
      }
      await this.d.repositorio.liberar(tx, a.id);
      const nueva = await this.d.repositorio.insertarAsignacion(tx, {
        incidenteId: a.incidenteId,
        institucion: a.institucion,
        operadorId: destino.usuarioId,
        sedeId: destino.sedeId,
        origen: 'reasignada',
      });
      if (!nueva) throw new ConflictoAtencionError('ASIGNACION_INACTIVA');
      await this.d.repositorio.registrar(tx, {
        incidenteId: a.incidenteId,
        accion: 'reasignar',
        actorTipo: 'administrador',
        actorUsuarioId: administradorId,
        institucion: a.institucion,
        valorAnterior: a.operadorId,
        valorNuevo: destino.usuarioId,
        motivo,
      });
      return { asignacion: nueva };
    });
  }

  /** Resultado, resumen e hitos para el seguimiento ciudadano. */
  cierres(ids: readonly string[]): Promise<ReadonlyMap<string, CierreCiudadano>> {
    if (ids.length === 0) return Promise.resolve(new Map());
    return this.d.repositorio.cierres(ids);
  }

  private async cambiarAsignacion<T>(asignacionId: string, fn: (tx: ContextoTransaccional, a: Asignacion) => Promise<T>): Promise<T> {
    const previa = esUuid(asignacionId) ? await this.d.repositorio.asignacionPorId(asignacionId) : null;
    if (!previa) throw new AtencionNoDisponibleError();
    return this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      const inc = await this.bloquear(tx, previa.incidenteId);
      if (inc.estado === 'CERRADO') throw new ConflictoAtencionError('INCIDENTE_CERRADO', inc.estado);
      const actual = await this.d.repositorio.activa(tx, previa.incidenteId, previa.institucion);
      if (!actual || actual.id !== previa.id) throw new ConflictoAtencionError('ASIGNACION_INACTIVA', inc.estado);
      return fn(tx, actual);
    });
  }

  private async bloquear(tx: ContextoTransaccional, incidenteId: string): Promise<EstadoBloqueado> {
    const inc = await this.d.repositorio.bloquear(tx, incidenteId);
    if (!inc) throw new AtencionNoDisponibleError();
    return inc;
  }

  /** Bloquea, compara el estado esperado y exige ser el responsable activo de la principal vigente. */
  private async autorizarPrincipal(tx: ContextoTransaccional, p: ParticipacionOperador, operadorId: string, esperado: EstadoIncidente) {
    const inc = await this.bloquear(tx, p.incidenteId);
    if (inc.principalId) throw new ConflictoAtencionError('INCIDENTE_VINCULADO', inc.estado);
    if (inc.estado === 'CERRADO') throw new ConflictoAtencionError('INCIDENTE_CERRADO', inc.estado);
    if (inc.estado !== esperado) throw new ConflictoAtencionError('ESTADO_CAMBIADO', inc.estado);
    const papel = await this.d.repositorio.papel(tx, p.incidenteId, p.institucion);
    if (papel !== 'principal') throw new PermisoAtencionError('NO_PRINCIPAL');
    const asignacion = await this.d.repositorio.activa(tx, p.incidenteId, p.institucion);
    if (asignacion?.operadorId !== operadorId) throw new PermisoAtencionError('ASIGNACION_REQUERIDA');
    return inc;
  }
}
