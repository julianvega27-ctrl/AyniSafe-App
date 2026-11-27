import type { ContextoTransaccional, UnidadDeTrabajo } from '../../../compartido/transaccion';
import { tieneObservaciones, type Instantanea, type OrigenVersion, type RespuestaSiNo } from '../dominio/evaluacion';
import type { EvaluacionesRepositorio } from './puertos/evaluacion.port';

/** Respuestas en la forma de la API (persona principal agrupada). */
export interface RespuestasEvaluacion {
  readonly heridos: string | null;
  readonly atencionMedica: string | null;
  readonly cantidadHeridos: number | 'no_se' | null;
  readonly personaPrincipal: { readonly signosVida: string | null; readonly consciente: string | null; readonly sangrado: string | null };
}

export const respuestasDe = (i: Instantanea): RespuestasEvaluacion => ({
  heridos: i.heridos,
  atencionMedica: i.atencionMedica,
  cantidadHeridos: i.cantidadHeridos,
  personaPrincipal: { signosVida: i.signosVida, consciente: i.consciente, sangrado: i.sangrado },
});

/** Vista del autor: sus propias respuestas, sin cambios ni motivos de operadores. */
export interface VistaEvaluacionAutor {
  readonly version: number;
  readonly respuestas: RespuestasEvaluacion;
  readonly informadaEn: string;
  readonly puedeAclarar: boolean;
  /** SAMU interviene y nadie informo observaciones de la persona principal. */
  readonly solicitudCompletar: boolean;
}

/** Resumen de heridos para las instituciones que no son SAMU (sin observaciones ni motivos). */
export interface CondicionMedicaVigente {
  readonly heridos: RespuestaSiNo | null;
  readonly atencionMedica: RespuestaSiNo | null;
  readonly cantidadHeridos: number | 'no_se' | null;
  readonly version: number;
  readonly origen: OrigenVersion;
  readonly institucion: string | null;
  readonly informadaEn: Date;
  readonly observacionesInformadas: boolean;
}

export interface DetalleSanitario {
  readonly version: number;
  readonly informadaEn: string;
  readonly pendiente: boolean;
  readonly vigente: RespuestasEvaluacion;
  readonly historial: readonly {
    readonly version: number;
    readonly origen: OrigenVersion;
    readonly institucion: string | null;
    readonly instante: string;
    readonly camposModificados: readonly string[];
    readonly motivo: string | null;
  }[];
}

/** Lecturas de la evaluacion (Reportes). Consultas las compone tras autorizar al solicitante. */
export class LecturaEvaluacion {
  constructor(
    private readonly repositorio: EvaluacionesRepositorio,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
  ) {}

  /** Null si el incidente no tiene evaluacion. `abierto` decide si puede aclararse. */
  async vistaAutor(incidenteId: string, abierto: boolean): Promise<VistaEvaluacionAutor | null> {
    const [vigente, propia] = await Promise.all([
      this.repositorio.vigentes([incidenteId]).then((m) => m.get(incidenteId)),
      this.repositorio.ultimaDelCiudadano(incidenteId),
    ]);
    if (!vigente || !propia) return null;
    return {
      version: propia.version,
      respuestas: respuestasDe(propia.instantanea),
      informadaEn: propia.creadaEn.toISOString(),
      puedeAclarar: abierto,
      solicitudCompletar: abierto && vigente.samuRequerido && !tieneObservaciones(vigente.instantanea),
    };
  }

  async condicionesVigentes(ids: readonly string[]): Promise<ReadonlyMap<string, CondicionMedicaVigente>> {
    const vigentes = await this.repositorio.vigentes(ids);
    return new Map(
      [...vigentes].map(([id, v]) => [
        id,
        {
          heridos: v.instantanea.heridos,
          atencionMedica: v.instantanea.atencionMedica,
          cantidadHeridos: v.instantanea.cantidadHeridos,
          version: v.versionVigente,
          origen: v.origen,
          institucion: v.institucion,
          informadaEn: v.informadaEn,
          observacionesInformadas: tieneObservaciones(v.instantanea),
        },
      ]),
    );
  }

  /**
   * Detalle completo para un operador ya autorizado por Consultas (SAMU participante). Registra el
   * acceso sin contenido en la misma transaccion que la lectura de la cabecera. Null sin evaluacion.
   */
  async detalleSanitario(incidenteId: string, usuarioId: string): Promise<DetalleSanitario | null> {
    const vigente = (await this.repositorio.vigentes([incidenteId])).get(incidenteId);
    if (!vigente) return null;
    const historial = await this.repositorio.historial(incidenteId);
    await this.unidadDeTrabajo.enTransaccion((tx) => this.repositorio.registrarAcceso(tx, incidenteId, usuarioId, vigente.versionVigente));
    return {
      version: vigente.versionVigente,
      informadaEn: vigente.informadaEn.toISOString(),
      pendiente: vigente.samuRequerido && !tieneObservaciones(vigente.instantanea),
      vigente: respuestasDe(vigente.instantanea),
      historial: historial.map((v) => ({
        version: v.version,
        origen: v.origen,
        institucion: v.institucion,
        instante: v.creadaEn.toISOString(),
        camposModificados: [...v.modificados],
        motivo: v.motivo,
      })),
    };
  }

  /** Condicion vigente bloqueada para el enrutamiento inicial (contrato hacia Operaciones). */
  condicionBloqueada(tx: ContextoTransaccional, incidenteId: string) {
    return this.repositorio.condicionBloqueada(tx, incidenteId);
  }
}
