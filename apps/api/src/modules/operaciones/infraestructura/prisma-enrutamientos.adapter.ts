import type { PrismaClient } from '../../../generated/prisma/client';
import { clienteDe } from '../../../compartido/prisma-transaccion';
import type { ContextoTransaccional } from '../../../compartido/transaccion';
import type {
  AmbitoBandeja,
  CursorFifo,
  FilaBandeja,
  ParticipacionVisible,
  EnrutamientoGuardado,
  EnrutamientosRepositorio,
  NuevaParticipacion,
  PendienteFila,
} from '../aplicacion/enrutamiento';
import { faltantesDesdeJson, type Faltante, type InstitucionDestino, type Papel, type ResultadoEnrutamiento } from '../dominio/matriz';
import type { CambioEnrutamiento, OrigenParticipacion } from '../aplicacion/enrutamiento';

interface FilaBandejaSql {
  readonly incidente_id: string;
  readonly referencia: string;
  readonly estado: string;
  readonly registrado_en: Date;
  readonly categoria_id: string;
  readonly distrito_id: string | null;
  readonly revision_medica_pendiente: boolean;
  readonly papel: string;
  readonly origen: string;
  readonly institucion: string;
}

const aFilaBandeja = (f: FilaBandejaSql): FilaBandeja => ({
  incidenteId: f.incidente_id,
  referencia: f.referencia,
  estado: f.estado,
  registradoEn: f.registrado_en,
  categoriaId: f.categoria_id,
  distritoId: f.distrito_id,
  revisionMedicaPendiente: f.revision_medica_pendiente,
  papel: f.papel as Papel,
  origen: f.origen as OrigenParticipacion,
  institucion: f.institucion as InstitucionDestino,
});

// Visibilidad por ambito vigente: $1 sede, $2 distritos, $3 categorias.
const SELECT_BANDEJA = `
  SELECT p.incidente_id, i.referencia, i.estado, e.registrado_en, e.categoria_id, e.distrito_id,
         e.revision_medica_pendiente, p.papel, p.origen, p.institucion
    FROM participaciones_incidente p
    JOIN enrutamientos_incidente e ON e.incidente_id = p.incidente_id
    JOIN incidentes i ON i.id = p.incidente_id
   WHERE p.sede_id = $1::uuid
     AND (p.origen = 'designacion' OR (e.distrito_id = ANY($2::text[]) AND e.categoria_id = ANY($3::text[])))`;

interface Fila {
  readonly incidente_id: string;
  readonly version_regla: string;
  readonly categoria_id: string;
  readonly distrito_id: string | null;
  readonly resultado: string;
  readonly revision_medica_pendiente: boolean;
  readonly faltantes: unknown;
  readonly registrado_en: Date;
}

const aEnrutamiento = (f: Fila): EnrutamientoGuardado => ({
  incidenteId: f.incidente_id,
  versionRegla: f.version_regla,
  categoriaId: f.categoria_id,
  distritoId: f.distrito_id,
  resultado: f.resultado as ResultadoEnrutamiento,
  revisionMedicaPendiente: f.revision_medica_pendiente,
  faltantes: faltantesDesdeJson(f.faltantes),
  registradoEn: f.registrado_en,
});

const COLUMNAS = 'incidente_id, version_regla, categoria_id, distrito_id, resultado, revision_medica_pendiente, faltantes, registrado_en';

/** Enrutamientos y participaciones (solo Operaciones accede a estas tablas). */
export class PrismaEnrutamientosAdapter implements EnrutamientosRepositorio {
  constructor(private readonly prisma: PrismaClient) {}

  async existe(incidenteId: string): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<unknown[]>`
      SELECT 1 FROM enrutamientos_incidente WHERE incidente_id = ${incidenteId}::uuid`;
    return filas.length > 0;
  }

  async insertar(
    tx: ContextoTransaccional,
    d: Omit<EnrutamientoGuardado, 'registradoEn'> & { readonly eventoId: string },
  ): Promise<boolean> {
    // ON CONFLICT no aborta la transaccion: una entrega repetida simplemente no inserta.
    const filas = await clienteDe(tx).$queryRaw<{ incidente_id: string }[]>`
      INSERT INTO enrutamientos_incidente
        (incidente_id, evento_id, version_regla, categoria_id, distrito_id, resultado,
         revision_medica_pendiente, faltantes, registrado_en)
      SELECT i.id, ${d.eventoId}::uuid, ${d.versionRegla}, ${d.categoriaId}, ${d.distritoId}, ${d.resultado},
             ${d.revisionMedicaPendiente}, ${JSON.stringify(d.faltantes)}::jsonb, i.registrado_en
        FROM incidentes i WHERE i.id = ${d.incidenteId}::uuid
      ON CONFLICT DO NOTHING
      RETURNING incidente_id`;
    return filas.length > 0;
  }

  async insertarParticipaciones(tx: ContextoTransaccional, incidenteId: string, lista: readonly NuevaParticipacion[]): Promise<number> {
    let total = 0;
    for (const p of lista) {
      total += await clienteDe(tx).$executeRaw`
        INSERT INTO participaciones_incidente (incidente_id, sede_id, institucion, papel, origen, designado_por, motivo)
        VALUES (${incidenteId}::uuid, ${p.sedeId}::uuid, ${p.institucion}, ${p.papel}, ${p.origen},
                ${p.designadoPor ?? null}::uuid, ${p.motivo ?? null})
        ON CONFLICT (incidente_id, sede_id) DO NOTHING`;
    }
    return total;
  }

  async bloquear(tx: ContextoTransaccional, incidenteId: string): Promise<EnrutamientoGuardado | null> {
    const filas = await clienteDe(tx).$queryRawUnsafe<Fila[]>(
      `SELECT ${COLUMNAS} FROM enrutamientos_incidente WHERE incidente_id = $1::uuid FOR UPDATE`,
      incidenteId,
    );
    return filas[0] ? aEnrutamiento(filas[0]) : null;
  }

  async actualizarFaltantes(tx: ContextoTransaccional, incidenteId: string, faltantes: readonly Faltante[]): Promise<void> {
    const resultado = faltantes.length === 0 ? 'ENRUTADO' : 'ENRUTAMIENTO_PENDIENTE';
    await clienteDe(tx).$executeRaw`
      UPDATE enrutamientos_incidente
         SET faltantes = ${JSON.stringify(faltantes)}::jsonb, resultado = ${resultado}, actualizado_en = CURRENT_TIMESTAMP
       WHERE incidente_id = ${incidenteId}::uuid`;
  }

  async pendientes(despuesDe: CursorFifo | null, limite: number): Promise<readonly PendienteFila[]> {
    const filas = await this.prisma.$queryRawUnsafe<(Fila & { referencia: string })[]>(
      `SELECT e.incidente_id, e.version_regla, e.categoria_id, e.distrito_id, e.resultado, e.revision_medica_pendiente,
              e.faltantes, e.registrado_en, i.referencia
         FROM enrutamientos_incidente e JOIN incidentes i ON i.id = e.incidente_id
        WHERE e.resultado = 'ENRUTAMIENTO_PENDIENTE'
          AND ($1::timestamptz IS NULL OR (e.registrado_en, e.incidente_id) > ($1::timestamptz, $2::uuid))
        ORDER BY e.registrado_en, e.incidente_id
        LIMIT $3`,
      despuesDe?.registradoEn ?? null,
      despuesDe?.incidenteId ?? null,
      limite,
    );
    return filas.map((f) => ({ ...aEnrutamiento(f), referencia: f.referencia }));
  }

  async bandeja(ambito: AmbitoBandeja, despuesDe: CursorFifo | null, limite: number): Promise<readonly FilaBandeja[]> {
    const filas = await this.prisma.$queryRawUnsafe<FilaBandejaSql[]>(
      `${SELECT_BANDEJA}
         AND ($4::timestamptz IS NULL OR (e.registrado_en, e.incidente_id) > ($4::timestamptz, $5::uuid))
       ORDER BY e.registrado_en, e.incidente_id
       LIMIT $6`,
      ambito.sedeId,
      [...ambito.distritos],
      [...ambito.categorias],
      despuesDe?.registradoEn ?? null,
      despuesDe?.incidenteId ?? null,
      limite,
    );
    return filas.map(aFilaBandeja);
  }

  async participacionDe(ambito: AmbitoBandeja, incidenteId: string): Promise<ParticipacionVisible | null> {
    const filas = await this.prisma.$queryRawUnsafe<FilaBandejaSql[]>(
      `${SELECT_BANDEJA} AND p.incidente_id = $4::uuid`,
      ambito.sedeId,
      [...ambito.distritos],
      [...ambito.categorias],
      incidenteId,
    );
    if (!filas[0]) return null;
    const otras = await this.prisma.$queryRaw<{ institucion: string }[]>`
      SELECT DISTINCT institucion FROM participaciones_incidente
       WHERE incidente_id = ${incidenteId}::uuid AND sede_id <> ${ambito.sedeId}::uuid
       ORDER BY institucion`;
    return { ...aFilaBandeja(filas[0]), otrasInstituciones: otras.map((o) => o.institucion as InstitucionDestino) };
  }

  async participaciones(tx: ContextoTransaccional, incidenteId: string) {
    const filas = await clienteDe(tx).$queryRaw<{ institucion: string; papel: string }[]>`
      SELECT institucion, papel FROM participaciones_incidente WHERE incidente_id = ${incidenteId}::uuid ORDER BY creado_en, id`;
    return filas.map((f) => ({ institucion: f.institucion as InstitucionDestino, papel: f.papel as Papel }));
  }

  async actualizarPapel(tx: ContextoTransaccional, incidenteId: string, institucion: InstitucionDestino, papel: Papel): Promise<void> {
    await clienteDe(tx).$executeRaw`
      UPDATE participaciones_incidente SET papel = ${papel}, actualizado_en = CURRENT_TIMESTAMP
       WHERE incidente_id = ${incidenteId}::uuid AND institucion = ${institucion}`;
  }

  async actualizarRevisionMedica(tx: ContextoTransaccional, incidenteId: string, pendiente: boolean): Promise<void> {
    await clienteDe(tx).$executeRaw`
      UPDATE enrutamientos_incidente SET revision_medica_pendiente = ${pendiente}, actualizado_en = CURRENT_TIMESTAMP
       WHERE incidente_id = ${incidenteId}::uuid`;
  }

  async registrarCambio(tx: ContextoTransaccional, c: CambioEnrutamiento): Promise<void> {
    await clienteDe(tx).$executeRaw`
      INSERT INTO cambios_enrutamiento (incidente_id, version_evaluacion, origen, actor_tipo, actor_usuario_id, antes, despues)
      VALUES (${c.incidenteId}::uuid, ${c.versionEvaluacion}, 'condicion_medica', ${c.actorTipo}, ${c.actorUsuarioId}::uuid,
              ${JSON.stringify(c.antes)}::jsonb, ${JSON.stringify(c.despues)}::jsonb)`;
  }

  async principales(ids: readonly string[]): Promise<ReadonlyMap<string, InstitucionDestino>> {
    const filas = await this.prisma.$queryRaw<{ incidente_id: string; institucion: string }[]>`
      SELECT DISTINCT incidente_id, institucion FROM participaciones_incidente
       WHERE incidente_id = ANY(${[...ids]}::uuid[]) AND papel = 'principal'`;
    return new Map(filas.map((f) => [f.incidente_id, f.institucion as InstitucionDestino]));
  }
}
