import type { PrismaClient } from '../../../generated/prisma/client';
import { clienteDe } from '../../../compartido/prisma-transaccion';
import type { ContextoTransaccional } from '../../../compartido/transaccion';
import type {
  EvaluacionBloqueada,
  EvaluacionesRepositorio,
  EvaluacionVigente,
  NuevaVersion,
  VersionGuardada,
} from '../aplicacion/puertos/evaluacion.port';
import type {
  CampoInstantanea,
  Instantanea,
  OrigenVersion,
  RespuestaSiNo,
  SignosVida,
} from '../dominio/evaluacion';

/** Columnas de una instantanea en SQL. Con heridos 'si', cantidad NULL significa desconocida. */
interface FilaInstantanea {
  readonly heridos: string | null;
  readonly atencion_medica: string | null;
  readonly cantidad_heridos: number | null;
  readonly signos_vida: string | null;
  readonly consciente: string | null;
  readonly sangrado: string | null;
}

function aInstantanea(f: FilaInstantanea): Instantanea {
  const heridos = f.heridos as RespuestaSiNo | null;
  return {
    heridos,
    atencionMedica: f.atencion_medica as RespuestaSiNo | null,
    cantidadHeridos: heridos === 'si' ? (f.cantidad_heridos ?? 'no_se') : null,
    signosVida: f.signos_vida as SignosVida | null,
    consciente: f.consciente as RespuestaSiNo | null,
    sangrado: f.sangrado as RespuestaSiNo | null,
  };
}

/** Valores de columna de una instantanea, en el orden de COLUMNAS_INSTANTANEA. */
function columnas(i: Instantanea): unknown[] {
  return [
    i.heridos,
    i.atencionMedica,
    typeof i.cantidadHeridos === 'number' ? i.cantidadHeridos : null,
    i.signosVida,
    i.consciente,
    i.sangrado,
  ];
}

const COLUMNAS_INSTANTANEA = 'heridos, atencion_medica, cantidad_heridos, signos_vida, consciente, sangrado';

interface FilaVersion extends FilaInstantanea {
  readonly version: number;
  readonly origen: string;
  readonly institucion: string | null;
  readonly campos_modificados: string[];
  readonly motivo: string | null;
  readonly creada_en: Date;
}

const aVersion = (f: FilaVersion): VersionGuardada => ({
  version: f.version,
  instantanea: aInstantanea(f),
  origen: f.origen as OrigenVersion,
  institucion: f.institucion,
  modificados: f.campos_modificados as CampoInstantanea[],
  motivo: f.motivo,
  creadaEn: f.creada_en,
});

/** Evaluacion rapida y sus versiones (solo Reportes accede a estas tablas). */
export class PrismaEvaluacionesAdapter implements EvaluacionesRepositorio {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(
    tx: ContextoTransaccional,
    d: { readonly incidenteId: string; readonly instantanea: Instantanea; readonly samuRequerido: boolean; readonly actorUsuarioId: string | null; readonly creadaEn: Date },
  ): Promise<void> {
    const c = clienteDe(tx);
    await c.$executeRawUnsafe(
      `INSERT INTO evaluaciones_incidente (incidente_id, version_vigente, ${COLUMNAS_INSTANTANEA}, samu_requerido, actualizada_en)
       VALUES ($1::uuid, 1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      d.incidenteId,
      ...columnas(d.instantanea),
      d.samuRequerido,
      d.creadaEn,
    );
    await c.$executeRawUnsafe(
      `INSERT INTO versiones_evaluacion (incidente_id, version, ${COLUMNAS_INSTANTANEA}, origen, actor_usuario_id, creada_en)
       VALUES ($1::uuid, 1, $2, $3, $4, $5, $6, $7, 'ciudadano', $8::uuid, $9)`,
      d.incidenteId,
      ...columnas(d.instantanea),
      d.actorUsuarioId,
      d.creadaEn,
    );
  }

  async bloquear(tx: ContextoTransaccional, incidenteId: string): Promise<EvaluacionBloqueada | null> {
    const filas = await clienteDe(tx).$queryRawUnsafe<(FilaInstantanea & { version_vigente: number; samu_requerido: boolean; categoria_id: string })[]>(
      `SELECT ev.version_vigente, ev.samu_requerido, ${COLUMNAS_INSTANTANEA.split(', ').map((c) => `ev.${c}`).join(', ')}, en.categoria_id
         FROM evaluaciones_incidente ev JOIN envios_incidente en ON en.incidente_id = ev.incidente_id
        WHERE ev.incidente_id = $1::uuid
        FOR UPDATE OF ev`,
      incidenteId,
    );
    const f = filas[0];
    if (!f) return null;
    return {
      incidenteId,
      categoriaId: f.categoria_id,
      versionVigente: f.version_vigente,
      instantanea: aInstantanea(f),
      samuRequerido: f.samu_requerido,
    };
  }

  async agregarVersion(tx: ContextoTransaccional, v: NuevaVersion): Promise<Date> {
    const c = clienteDe(tx);
    const filas = await c.$queryRawUnsafe<{ creada_en: Date }[]>(
      `INSERT INTO versiones_evaluacion
         (incidente_id, version, ${COLUMNAS_INSTANTANEA}, origen, actor_usuario_id, institucion, campos_modificados, motivo)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid, $11, $12::text[], $13)
       RETURNING creada_en`,
      v.incidenteId,
      v.version,
      ...columnas(v.instantanea),
      v.origen,
      v.actorUsuarioId,
      v.institucion,
      [...v.modificados],
      v.motivo,
    );
    const creadaEn = filas[0]!.creada_en;
    await c.$executeRawUnsafe(
      `UPDATE evaluaciones_incidente
          SET version_vigente = $2, heridos = $3, atencion_medica = $4, cantidad_heridos = $5, signos_vida = $6,
              consciente = $7, sangrado = $8, samu_requerido = $9, actualizada_en = $10
        WHERE incidente_id = $1::uuid`,
      v.incidenteId,
      v.version,
      ...columnas(v.instantanea),
      v.samuRequerido,
      creadaEn,
    );
    return creadaEn;
  }

  async condicionBloqueada(tx: ContextoTransaccional, incidenteId: string) {
    const filas = await clienteDe(tx).$queryRawUnsafe<{ heridos: string | null; atencion_medica: string | null }[]>(
      `SELECT heridos, atencion_medica FROM evaluaciones_incidente WHERE incidente_id = $1::uuid FOR UPDATE`,
      incidenteId,
    );
    const f = filas[0];
    return f ? { heridos: f.heridos as RespuestaSiNo | null, atencionMedica: f.atencion_medica as RespuestaSiNo | null } : null;
  }

  async vigentes(ids: readonly string[]): Promise<ReadonlyMap<string, EvaluacionVigente>> {
    if (ids.length === 0) return new Map();
    const filas = await this.prisma.$queryRawUnsafe<
      (FilaInstantanea & {
        incidente_id: string;
        categoria_id: string;
        version_vigente: number;
        samu_requerido: boolean;
        origen: string;
        institucion: string | null;
        creada_en: Date;
      })[]
    >(
      `SELECT ev.incidente_id, en.categoria_id, ev.version_vigente, ev.samu_requerido,
              ${COLUMNAS_INSTANTANEA.split(', ').map((c) => `ev.${c}`).join(', ')},
              v.origen, v.institucion, v.creada_en
         FROM evaluaciones_incidente ev
         JOIN envios_incidente en ON en.incidente_id = ev.incidente_id
         JOIN versiones_evaluacion v ON v.incidente_id = ev.incidente_id AND v.version = ev.version_vigente
        WHERE ev.incidente_id = ANY($1::uuid[])`,
      [...ids],
    );
    return new Map(
      filas.map((f) => [
        f.incidente_id,
        {
          incidenteId: f.incidente_id,
          categoriaId: f.categoria_id,
          versionVigente: f.version_vigente,
          instantanea: aInstantanea(f),
          samuRequerido: f.samu_requerido,
          origen: f.origen as OrigenVersion,
          institucion: f.institucion,
          informadaEn: f.creada_en,
        },
      ]),
    );
  }

  async historial(incidenteId: string): Promise<readonly VersionGuardada[]> {
    const filas = await this.prisma.$queryRawUnsafe<FilaVersion[]>(
      `SELECT version, ${COLUMNAS_INSTANTANEA}, origen, institucion, campos_modificados, motivo, creada_en
         FROM versiones_evaluacion WHERE incidente_id = $1::uuid ORDER BY version`,
      incidenteId,
    );
    return filas.map(aVersion);
  }

  async ultimaDelCiudadano(incidenteId: string): Promise<VersionGuardada | null> {
    const filas = await this.prisma.$queryRawUnsafe<FilaVersion[]>(
      `SELECT version, ${COLUMNAS_INSTANTANEA}, origen, institucion, campos_modificados, motivo, creada_en
         FROM versiones_evaluacion WHERE incidente_id = $1::uuid AND origen = 'ciudadano'
        ORDER BY version DESC LIMIT 1`,
      incidenteId,
    );
    return filas[0] ? aVersion(filas[0]) : null;
  }

  async registrarAcceso(tx: ContextoTransaccional, incidenteId: string, usuarioId: string, version: number): Promise<void> {
    await clienteDe(tx).$executeRaw`
      INSERT INTO accesos_evaluacion (incidente_id, usuario_id, version) VALUES (${incidenteId}::uuid, ${usuarioId}::uuid, ${version})`;
  }
}
