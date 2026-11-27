import type { ContextoTransaccional } from '../../../../compartido/transaccion';
import type { CampoInstantanea, Instantanea, OrigenVersion, RespuestaSiNo } from '../../dominio/evaluacion';

/** Cabecera bloqueada (FOR UPDATE) con lo necesario para aplicar una aclaracion. */
export interface EvaluacionBloqueada {
  readonly incidenteId: string;
  readonly categoriaId: string;
  readonly versionVigente: number;
  readonly instantanea: Instantanea;
  readonly samuRequerido: boolean;
}

export interface NuevaVersion {
  readonly incidenteId: string;
  readonly version: number;
  readonly instantanea: Instantanea;
  readonly samuRequerido: boolean;
  readonly origen: OrigenVersion;
  readonly actorUsuarioId: string | null;
  /** Solo origen operador. */
  readonly institucion: string | null;
  readonly modificados: readonly CampoInstantanea[];
  /** Solo origen operador; puede contener informacion clinica: nunca a logs ni eventos. */
  readonly motivo: string | null;
}

export interface VersionGuardada {
  readonly version: number;
  readonly instantanea: Instantanea;
  readonly origen: OrigenVersion;
  readonly institucion: string | null;
  readonly modificados: readonly CampoInstantanea[];
  readonly motivo: string | null;
  readonly creadaEn: Date;
}

/** Evaluacion vigente con el origen e instante de su ultima version. */
export interface EvaluacionVigente {
  readonly incidenteId: string;
  readonly categoriaId: string;
  readonly versionVigente: number;
  readonly instantanea: Instantanea;
  readonly samuRequerido: boolean;
  readonly origen: OrigenVersion;
  readonly institucion: string | null;
  readonly informadaEn: Date;
}

/** Persistencia de la evaluacion. Solo Reportes escribe o lee estas tablas. */
export interface EvaluacionesRepositorio {
  /** Cabecera y version 1 en la transaccion del registro. */
  crear(
    tx: ContextoTransaccional,
    datos: { readonly incidenteId: string; readonly instantanea: Instantanea; readonly samuRequerido: boolean; readonly actorUsuarioId: string | null; readonly creadaEn: Date },
  ): Promise<void>;
  /** Bloquea la cabecera; null si el incidente no tiene evaluacion. */
  bloquear(tx: ContextoTransaccional, incidenteId: string): Promise<EvaluacionBloqueada | null>;
  /** Inserta la version y actualiza la cabecera vigente. Devuelve el instante de la version. */
  agregarVersion(tx: ContextoTransaccional, v: NuevaVersion): Promise<Date>;
  /** Heridos y atencion vigentes, leidos con la cabecera bloqueada (enrutamiento inicial). */
  condicionBloqueada(
    tx: ContextoTransaccional,
    incidenteId: string,
  ): Promise<{ readonly heridos: RespuestaSiNo | null; readonly atencionMedica: RespuestaSiNo | null } | null>;
  vigentes(ids: readonly string[]): Promise<ReadonlyMap<string, EvaluacionVigente>>;
  historial(incidenteId: string): Promise<readonly VersionGuardada[]>;
  /** Ultima version de origen ciudadano (vista del autor). */
  ultimaDelCiudadano(incidenteId: string): Promise<VersionGuardada | null>;
  registrarAcceso(tx: ContextoTransaccional, incidenteId: string, usuarioId: string, version: number): Promise<void>;
}

/** Puerto hacia Operaciones: recalcula el enrutamiento con la condicion vigente (design, decision 4). */
export interface CondicionMedicaPort {
  aplicar(
    tx: ContextoTransaccional,
    cambio: {
      readonly incidenteId: string;
      readonly heridos: RespuestaSiNo | null;
      readonly atencionMedica: RespuestaSiNo | null;
      readonly versionEvaluacion: number;
      readonly actor: { readonly tipo: OrigenVersion; readonly usuarioId: string | null };
    },
  ): Promise<{ readonly samuIncorporado: boolean }>;
}
