import type { ContextoTransaccional, UnidadDeTrabajo } from '../../../compartido/transaccion';
import { AtencionNoDisponibleError, ConflictoAtencionError, PermisoAtencionError, type Verificacion } from '../dominio/atencion';
import type { EstadoIncidente } from '../dominio/incidente';
import type { InstitucionDestino, Papel } from '../dominio/matriz';
import {
  accionesPublicacion,
  celdaDe,
  esSensible,
  noPublicable,
  validarPublicar,
  validarReserva,
  validarRetiro,
  vencimientoDe,
  type AccionPublicacion,
  type CausaRetiro,
  type CodigoNoPublicable,
} from '../dominio/publicacion';
import type { AtencionRepositorio, ParticipacionOperador } from './atencion';

/**
 * Publicacion controlada (P7, spec `operaciones/publicacion`, documento 11 §5). Operaciones es el
 * unico que escribe `publicaciones_incidente`. Cada mutacion bloquea la fila del incidente y escribe
 * su historial en la misma transaccion. La instantanea guarda solo el centro de la celda de 300 m.
 */

export interface Publicacion {
  readonly incidenteId: string;
  readonly idPublico: string;
  readonly estado: 'VIGENTE' | 'RETIRADA';
  readonly reservada: boolean;
  readonly institucion: string;
  readonly categoriaId: string;
  readonly distritoId: string;
  readonly celdaLat: number;
  readonly celdaLon: number;
  readonly ocurridoEn: Date;
  readonly venceEn: Date;
  readonly publicadaEn: Date;
  readonly retiradaEn: Date | null;
  readonly causaRetiro: CausaRetiro | null;
}

export interface NuevaPublicacion {
  readonly incidenteId: string;
  readonly institucion: InstitucionDestino;
  readonly categoriaId: string;
  readonly distritoId: string;
  readonly celdaLat: number;
  readonly celdaLon: number;
  readonly ocurridoEn: Date;
  readonly venceEn: Date;
  readonly reservada: boolean;
}

/** Persistencia de la publicacion. Solo Operaciones lee o escribe esta tabla. */
export interface PublicacionRepositorio {
  deIncidente(tx: ContextoTransaccional | null, incidenteId: string): Promise<Publicacion | null>;
  /** Inserta o, si ya existe (retirada), la vuelve VIGENTE conservando ocurrencia y vencimiento. */
  guardar(tx: ContextoTransaccional, p: NuevaPublicacion): Promise<Publicacion>;
  retirar(tx: ContextoTransaccional, incidenteId: string, causa: CausaRetiro): Promise<void>;
  reservar(tx: ContextoTransaccional, incidenteId: string, reservada: boolean): Promise<void>;
  /** Estado y verificacion actuales, sin bloquear (vista del operador). */
  incidente(incidenteId: string): Promise<{ readonly estado: EstadoIncidente; readonly verificacion: Verificacion; readonly principalId: string | null } | null>;
}

/** Puerto hacia Reportes: datos originales necesarios para la instantanea (nunca se exponen). */
export interface DatosPublicacionPort {
  de(incidenteId: string): Promise<{
    readonly categoriaId: string;
    readonly distritoId: string | null;
    readonly latitud: number;
    readonly longitud: number;
    readonly ocurridoEn: Date;
  } | null>;
}

export interface DependenciasPublicacion {
  readonly repositorio: PublicacionRepositorio;
  /** Bloqueo, papel, responsable e historial del incidente (mismas tablas que la atencion). */
  readonly atencion: AtencionRepositorio;
  readonly datos: DatosPublicacionPort;
  readonly unidadDeTrabajo: UnidadDeTrabajo;
  readonly ahora?: () => Date;
}

export interface ActorRetiro {
  readonly tipo: 'operador' | 'administrador' | 'sistema';
  readonly usuarioId: string | null;
  readonly institucion: InstitucionDestino;
}

export type EstadoPublicacionVista = 'NO_PUBLICADO' | 'VIGENTE' | 'RETIRADA' | 'VENCIDA';

export interface VistaPublicacion {
  readonly estado: EstadoPublicacionVista;
  readonly reservada: boolean;
  readonly sensible: boolean;
  readonly publicadaEn: string | null;
  readonly venceEn: string | null;
  readonly causaRetiro: CausaRetiro | null;
  /** Codigo por el que no se podria publicar ahora (null si es publicable). */
  readonly noPublicable: CodigoNoPublicable | null;
  readonly accionesPermitidas: readonly AccionPublicacion[];
}

const vigente = (p: Publicacion | null, ahora: Date): boolean => p !== null && p.estado === 'VIGENTE' && p.venceEn.getTime() > ahora.getTime();

export class ServicioPublicacion {
  constructor(private readonly d: DependenciasPublicacion) {}

  private ahora(): Date {
    return this.d.ahora ? this.d.ahora() : new Date();
  }

  /** Publicacion expresa por el responsable de la principal (RF49). Repetir devuelve la vigente. */
  async publicar(p: ParticipacionOperador, operadorId: string, entrada: unknown): Promise<{ readonly publicacion: Publicacion; readonly nueva: boolean }> {
    const s = validarPublicar(entrada);
    const datos = await this.d.datos.de(p.incidenteId);
    return this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      const inc = await this.autorizarResponsable(tx, p, operadorId, s.estadoEsperado);
      const ahora = this.ahora();
      const actual = await this.d.repositorio.deIncidente(tx, p.incidenteId);
      if (actual && vigente(actual, ahora)) return { publicacion: actual, nueva: false };
      if (!datos) throw new ConflictoAtencionError('DISTRITO_PENDIENTE', inc.estado);
      const codigo = noPublicable({
        estado: inc.estado,
        verificacion: inc.verificacion,
        vinculado: Boolean(inc.principalId),
        distritoId: datos.distritoId,
        ocurridoEn: datos.ocurridoEn,
        ahora,
      });
      if (codigo) throw new ConflictoAtencionError(codigo, inc.estado);
      const celda = celdaDe(datos.latitud, datos.longitud);
      const publicacion = await this.d.repositorio.guardar(tx, {
        incidenteId: p.incidenteId,
        institucion: p.institucion,
        categoriaId: datos.categoriaId,
        distritoId: datos.distritoId!,
        celdaLat: celda.lat,
        celdaLon: celda.lon,
        ocurridoEn: datos.ocurridoEn,
        venceEn: vencimientoDe(datos.ocurridoEn),
        reservada: s.reservada,
      });
      await this.d.atencion.registrar(tx, {
        incidenteId: p.incidenteId,
        accion: 'publicar',
        actorTipo: 'operador',
        actorUsuarioId: operadorId,
        institucion: p.institucion,
      });
      if (s.reservada) {
        await this.d.atencion.registrar(tx, {
          incidenteId: p.incidenteId,
          accion: 'reservar',
          actorTipo: 'operador',
          actorUsuarioId: operadorId,
          institucion: p.institucion,
          valorNuevo: 'true',
          motivo: s.motivoReserva,
        });
      }
      return { publicacion, nueva: true };
    });
  }

  /** Retiro inmediato con motivo por cualquier operador de la principal que participa. */
  async retirar(p: ParticipacionOperador, operadorId: string, entrada: unknown): Promise<{ readonly retirada: true }> {
    const { motivo } = validarRetiro(entrada);
    return this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      const inc = await this.bloquear(tx, p.incidenteId);
      if ((await this.d.atencion.papel(tx, p.incidenteId, p.institucion)) !== 'principal') throw new PermisoAtencionError('NO_PRINCIPAL');
      const actual = await this.d.repositorio.deIncidente(tx, p.incidenteId);
      if (!actual || !vigente(actual, this.ahora())) throw new ConflictoAtencionError('NO_PUBLICADA', inc.estado);
      await this.d.repositorio.retirar(tx, p.incidenteId, 'DECISION');
      await this.d.atencion.registrar(tx, {
        incidenteId: p.incidenteId,
        accion: 'retirar',
        actorTipo: 'operador',
        actorUsuarioId: operadorId,
        institucion: p.institucion,
        valorNuevo: 'DECISION',
        motivo,
      });
      return { retirada: true as const };
    });
  }

  /** Reserva por caso (grupo C): deja de mostrarse como punto; solo cuenta en los agregados. */
  async reservar(p: ParticipacionOperador, operadorId: string, entrada: unknown): Promise<{ readonly reservada: boolean }> {
    const s = validarReserva(entrada);
    return this.d.unidadDeTrabajo.enTransaccion(async (tx) => {
      const inc = await this.bloquear(tx, p.incidenteId);
      await this.autorizarResponsable(tx, p, operadorId, inc.estado);
      const actual = await this.d.repositorio.deIncidente(tx, p.incidenteId);
      if (!actual || !vigente(actual, this.ahora())) throw new ConflictoAtencionError('NO_PUBLICADA', inc.estado);
      if (actual.reservada !== s.reservada) await this.d.repositorio.reservar(tx, p.incidenteId, s.reservada);
      await this.d.atencion.registrar(tx, {
        incidenteId: p.incidenteId,
        accion: 'reservar',
        actorTipo: 'operador',
        actorUsuarioId: operadorId,
        institucion: p.institucion,
        valorAnterior: String(actual.reservada),
        valorNuevo: String(s.reservada),
        motivo: s.motivo,
      });
      return { reservada: s.reservada };
    });
  }

  /**
   * Retiro automatico en la transaccion del llamador (cierre, NO_VERIFICADO o vinculacion). El
   * llamador ya bloqueo la fila del incidente. Sin publicacion VIGENTE no hace nada.
   */
  async retirarSiVigente(tx: ContextoTransaccional, incidenteId: string, causa: Exclude<CausaRetiro, 'DECISION'>, actor: ActorRetiro): Promise<boolean> {
    const actual = await this.d.repositorio.deIncidente(tx, incidenteId);
    if (!actual || actual.estado !== 'VIGENTE') return false;
    await this.d.repositorio.retirar(tx, incidenteId, causa);
    await this.d.atencion.registrar(tx, {
      incidenteId,
      accion: 'retirar',
      actorTipo: actor.tipo,
      actorUsuarioId: actor.usuarioId,
      institucion: actor.institucion,
      valorNuevo: causa,
    });
    return true;
  }

  /** Estado de publicacion y acciones para el resumen del operador. */
  async vista(c: { readonly incidenteId: string; readonly papel: Papel; readonly esResponsable: boolean }): Promise<VistaPublicacion | null> {
    const [inc, actual, datos] = await Promise.all([
      this.d.repositorio.incidente(c.incidenteId),
      this.d.repositorio.deIncidente(null, c.incidenteId),
      this.d.datos.de(c.incidenteId),
    ]);
    if (!inc) return null;
    const ahora = this.ahora();
    const codigo = datos
      ? noPublicable({
          estado: inc.estado,
          verificacion: inc.verificacion,
          vinculado: Boolean(inc.principalId),
          distritoId: datos.distritoId,
          ocurridoEn: datos.ocurridoEn,
          ahora,
        })
      : 'DISTRITO_PENDIENTE';
    const esVigente = vigente(actual, ahora);
    const estado: EstadoPublicacionVista = !actual ? 'NO_PUBLICADO' : esVigente ? 'VIGENTE' : actual.estado === 'RETIRADA' ? 'RETIRADA' : 'VENCIDA';
    const reservada = actual?.reservada ?? false;
    return {
      estado,
      reservada,
      sensible: datos ? esSensible(datos.categoriaId) : false,
      publicadaEn: actual ? actual.publicadaEn.toISOString() : null,
      venceEn: actual ? actual.venceEn.toISOString() : datos ? vencimientoDe(datos.ocurridoEn).toISOString() : null,
      causaRetiro: actual?.causaRetiro ?? null,
      noPublicable: codigo,
      accionesPermitidas: accionesPublicacion({
        papel: c.papel,
        esResponsable: c.esResponsable,
        publicable: codigo === null,
        vigente: esVigente,
        reservada,
      }),
    };
  }

  private async bloquear(tx: ContextoTransaccional, incidenteId: string) {
    const inc = await this.d.atencion.bloquear(tx, incidenteId);
    if (!inc) throw new AtencionNoDisponibleError();
    return inc;
  }

  /** Responsable activo de la principal con el estado esperado (misma regla que la atencion). */
  private async autorizarResponsable(tx: ContextoTransaccional, p: ParticipacionOperador, operadorId: string, esperado: EstadoIncidente) {
    const inc = await this.bloquear(tx, p.incidenteId);
    if (inc.principalId) throw new ConflictoAtencionError('INCIDENTE_VINCULADO', inc.estado);
    if (inc.estado === 'CERRADO') throw new ConflictoAtencionError('INCIDENTE_CERRADO', inc.estado);
    if (inc.estado !== esperado) throw new ConflictoAtencionError('ESTADO_CAMBIADO', inc.estado);
    if ((await this.d.atencion.papel(tx, p.incidenteId, p.institucion)) !== 'principal') throw new PermisoAtencionError('NO_PRINCIPAL');
    const asignacion = await this.d.atencion.activa(tx, p.incidenteId, p.institucion);
    if (asignacion?.operadorId !== operadorId) throw new PermisoAtencionError('ASIGNACION_REQUERIDA');
    return inc;
  }
}
