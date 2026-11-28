import type { ContextoTransaccional, UnidadDeTrabajo } from '../../../compartido/transaccion';
import {
  accionesPermitidas,
  AtencionNoDisponibleError,
  ConflictoAtencionError,
  destinoTransicion,
  esUuid,
  PermisoAtencionError,
  validarMotivoAdmin,
  validarPrioridad,
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
  readonly origen: 'asumida' | 'reasignada' | 'automatica';
  readonly asignadaEn: Date;
}

export interface EstadoBloqueado {
  readonly estado: EstadoIncidente;
  readonly verificacion: Verificacion;
  /** Grupo B: incidente principal si esta vinculado como duplicado. */
  readonly principalId?: string | null;
  /** Grupo C: prioridad vigente. */
  readonly prioridad?: string;
}

export type AccionHistorial =
  | 'asumir'
  | 'transicion'
  | 'verificacion'
  | 'liberar'
  | 'reasignar'
  | 'vincular'
  | 'prioridad'
  // P7: publicacion, retiro (valor nuevo = causa) y reserva.
  | 'publicar'
  | 'retirar'
  | 'reservar';

export interface EntradaHistorial {
  readonly incidenteId: string;
  readonly accion: AccionHistorial;
  readonly actorTipo: 'operador' | 'administrador' | 'sistema';
  /** Null solo para el actor «sistema» (asignacion automatica, P6 grupo D). */
  readonly actorUsuarioId: string | null;
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
  /** Institucion principal y sus sedes participantes; null si no hay una unica institucion principal. */
  principalUnica(tx: ContextoTransaccional, incidenteId: string): Promise<{ readonly institucion: InstitucionDestino; readonly sedes: readonly string[] } | null>;
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
  /** Grupo B: el incidente tiene duplicados vinculados. */
  tieneDuplicados(tx: ContextoTransaccional, incidenteId: string): Promise<boolean>;
  vincular(tx: ContextoTransaccional, duplicadoId: string, principalId: string): Promise<void>;
  /** Grupo C: revision humana; el origen pasa a `revisada` sin tocar la version de la propuesta. */
  revisarPrioridad(tx: ContextoTransaccional, incidenteId: string, valor: string): Promise<void>;
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

/**
 * Publicacion (P7) vista desde la atencion: retiro automatico en la misma transaccion al cerrar,
 * corregir a NO_VERIFICADO o vincular, y estado de publicacion para el resumen del operador.
 */
export interface PublicacionAtencionPort {
  retirarSiVigente(
    tx: ContextoTransaccional,
    incidenteId: string,
    causa: 'CIERRE' | 'NO_VERIFICADO' | 'DUPLICADO',
    actor: { readonly tipo: 'operador'; readonly usuarioId: string; readonly institucion: InstitucionDestino },
  ): Promise<boolean>;
  vista(c: { readonly incidenteId: string; readonly papel: Papel; readonly esResponsable: boolean }): Promise<unknown>;
  /** Decision del 27/11/2026: verificar autoriza la publicacion (documento 11 §5). */
  publicarAlVerificar(
    tx: ContextoTransaccional,
    c: { readonly incidenteId: string; readonly estado: EstadoIncidente; readonly institucion: InstitucionDestino; readonly operadorId: string },
  ): Promise<boolean>;
}

export interface DependenciasAtencion {
  readonly repositorio: AtencionRepositorio;
  readonly operadores: OperadoresPort;
  readonly unidadDeTrabajo: UnidadDeTrabajo;
  /** P7. Sin ella no hay publicaciones que retirar ni estado de publicacion en el resumen. */
  readonly publicacion?: PublicacionAtencionPort;
}

export const LIMITE_ASIGNACIONES = 200;
/** Acciones cuyo valor es un identificador interno (operador o incidente): no se muestra. */
const SIN_VALORES: ReadonlySet<string> = new Set(['asumir', 'reasignar', 'liberar', 'vincular']);

export class ServicioAtencion {
  private publicacion: PublicacionAtencionPort | undefined;

  constructor(private readonly d: DependenciasAtencion) {
    this.publicacion = d.publicacion;
  }

  /** Cableado tardio de la publicacion (P7), que comparte el repositorio de la atencion. */
  conPublicacion(publicacion: PublicacionAtencionPort): this {
    this.publicacion = publicacion;
    return this;
  }

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
      if (destino === 'CERRADO') {
        await this.publicacion?.retirarSiVigente(tx, p.incidenteId, 'CIERRE', { tipo: 'operador', usuarioId: operadorId, institucion: p.institucion });
      }
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
      // Verificar autoriza la publicacion (decision del 27/11/2026); repetir VERIFICADO no republica.
      if (s.valor === 'VERIFICADO' && inc.verificacion !== 'VERIFICADO') {
        await this.publicacion?.publicarAlVerificar(tx, { incidenteId: p.incidenteId, estado: inc.estado, institucion: p.institucion, operadorId });
      }
      if (s.valor === 'NO_VERIFICADO') {
        await this.publicacion?.retirarSiVigente(tx, p.incidenteId, 'NO_VERIFICADO', { tipo: 'operador', usuarioId: operadorId, institucion: p.institucion });
      }
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
    const [nombres, publicacion] = await Promise.all([
      propia ? this.d.operadores.describir([propia.operadorId]) : Promise.resolve(new Map<string, OperadorAtencion>()),
      this.publicacion
        ? this.publicacion.vista({ incidenteId: p.incidenteId, papel: p.papel, esResponsable: propia?.operadorId === operadorId })
        : Promise.resolve(null),
    ]);
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
            automatica: propia.origen === 'automatica',
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
        valorAnterior: SIN_VALORES.has(h.accion) ? null : h.valorAnterior,
        valorNuevo: SIN_VALORES.has(h.accion) ? null : h.valorNuevo,
        // El motivo solo lo ve la institucion que lo escribio.
        motivo: h.institucion === p.institucion ? h.motivo : null,
        instante: h.creadoEn.toISOString(),
      })),
      publicacion,
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

  /**
   * Vincula el incidente como duplicado de un principal abierto que la sede tambien ve (RF15). Bloquea
   * ambos por orden de identificador: dos vinculaciones cruzadas simultaneas no dejan ciclos.
   */
  async vincular(p: ParticipacionOperador, principalId: string, operadorId: string, motivo: string): Promise<{ readonly vinculado: true }> {
    if (principalId === p.incidenteId) throw new ConflictoAtencionError('VINCULO_NO_PERMITIDO');
    return this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      const [primero, segundo] = [p.incidenteId, principalId].sort();
      const bloqueados = new Map<string, EstadoBloqueado>();
      for (const id of [primero!, segundo!]) bloqueados.set(id, await this.bloquear(tx, id));
      const dup = bloqueados.get(p.incidenteId)!;
      const principal = bloqueados.get(principalId)!;
      await this.autorizarPrincipal(tx, p, operadorId, dup.estado);
      if (principal.estado === 'CERRADO' || principal.principalId || (await this.d.repositorio.tieneDuplicados(tx, p.incidenteId))) {
        throw new ConflictoAtencionError('VINCULO_NO_PERMITIDO', dup.estado);
      }
      await this.d.repositorio.vincular(tx, p.incidenteId, principalId);
      await this.d.repositorio.registrar(tx, {
        incidenteId: p.incidenteId,
        accion: 'vincular',
        actorTipo: 'operador',
        actorUsuarioId: operadorId,
        institucion: p.institucion,
        valorNuevo: principalId,
        motivo,
      });
      await this.publicacion?.retirarSiVigente(tx, p.incidenteId, 'DUPLICADO', { tipo: 'operador', usuarioId: operadorId, institucion: p.institucion });
      return { vinculado: true as const };
    });
  }

  /**
   * Revision de la prioridad (RF12): el responsable de la principal confirma, eleva o reduce con motivo.
   * No modifica la tabla por categoria ni el orden FIFO de la bandeja.
   */
  async revisarPrioridad(p: ParticipacionOperador, operadorId: string, entrada: unknown): Promise<{ readonly prioridad: string; readonly origen: 'revisada' }> {
    const { valor, motivo } = validarPrioridad(entrada);
    return this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      const inc = await this.bloquear(tx, p.incidenteId);
      await this.autorizarPrincipal(tx, p, operadorId, inc.estado);
      await this.d.repositorio.revisarPrioridad(tx, p.incidenteId, valor);
      await this.d.repositorio.registrar(tx, {
        incidenteId: p.incidenteId,
        accion: 'prioridad',
        actorTipo: 'operador',
        actorUsuarioId: operadorId,
        institucion: p.institucion,
        valorAnterior: inc.prioridad ?? 'SIN_EVALUAR',
        valorNuevo: valor,
        motivo,
      });
      return { prioridad: valor, origen: 'revisada' as const };
    });
  }

  /**
   * Asignacion automatica al operador unico (decision del 27/11/2026, documento 11 §2). Corre en la
   * transaccion del enrutamiento cuando una institucion queda como principal: si participa con una
   * sola sede y esa sede tiene exactamente un operador activo, se le asigna el caso y, si estaba
   * REGISTRADO, pasa a EN_REVISION. Con varias sedes u operadores no hace nada (toma manual).
   */
  async autoAsignarPrincipal(tx: ContextoTransaccional, incidenteId: string): Promise<boolean> {
    const inc = await this.d.repositorio.bloquear(tx, incidenteId);
    if (!inc || inc.estado === 'CERRADO' || inc.principalId) return false;
    const principal = await this.d.repositorio.principalUnica(tx, incidenteId);
    if (!principal || principal.sedes.length !== 1) return false;
    const sedeId = principal.sedes[0]!;
    if (await this.d.repositorio.activa(tx, incidenteId, principal.institucion)) return false;
    const operadores = (await this.d.operadores.deSedes([sedeId])).filter(
      (o) => o.sedeId === sedeId && o.institucion === principal.institucion && o.cuentaActiva && o.sedeOperativa,
    );
    if (operadores.length !== 1) return false;
    const operador = operadores[0]!;
    const asignacion = await this.d.repositorio.insertarAsignacion(tx, {
      incidenteId,
      institucion: principal.institucion,
      operadorId: operador.usuarioId,
      sedeId,
      origen: 'automatica',
    });
    if (!asignacion) return false;
    await this.d.repositorio.registrar(tx, {
      incidenteId,
      accion: 'asumir',
      actorTipo: 'sistema',
      actorUsuarioId: null,
      institucion: principal.institucion,
      valorNuevo: operador.usuarioId,
    });
    if (inc.estado === 'REGISTRADO') {
      await this.d.repositorio.cambiarEstado(tx, incidenteId, 'EN_REVISION');
      await this.d.repositorio.registrar(tx, {
        incidenteId,
        accion: 'transicion',
        actorTipo: 'sistema',
        actorUsuarioId: null,
        institucion: principal.institucion,
        valorAnterior: 'REGISTRADO',
        valorNuevo: 'EN_REVISION',
      });
    }
    return true;
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
