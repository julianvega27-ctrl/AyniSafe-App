import type { PrismaClient } from '../../../generated/prisma/client';
import { clienteDe } from '../../../compartido/prisma-transaccion';
import type { ContextoTransaccional } from '../../../compartido/transaccion';
import type {
  Asignacion,
  AsignacionAdmin,
  AtencionRepositorio,
  CierreCiudadano,
  EntradaHistorial,
  EstadoBloqueado,
  FilaHistorial,
  Hito,
} from '../aplicacion/atencion';
import type { Resultado, Verificacion } from '../dominio/atencion';
import type { EstadoIncidente } from '../dominio/incidente';
import type { InstitucionDestino, Papel } from '../dominio/matriz';

interface FilaAsignacion {
  readonly id: string;
  readonly incidente_id: string;
  readonly institucion: string;
  readonly operador_id: string;
  readonly sede_id: string;
  readonly origen: string;
  readonly asignada_en: Date;
}

const COLUMNAS_ASIGNACION = 'id::text, incidente_id::text, institucion, operador_id::text, sede_id::text, origen, asignada_en';

const aAsignacion = (f: FilaAsignacion): Asignacion => ({
  id: f.id,
  incidenteId: f.incidente_id,
  institucion: f.institucion as InstitucionDestino,
  operadorId: f.operador_id,
  sedeId: f.sede_id,
  origen: f.origen as Asignacion['origen'],
  asignadaEn: f.asignada_en,
});

/** Asignaciones, transiciones e historial del incidente (solo Operaciones accede a estas tablas). */
export class PrismaAtencionAdapter implements AtencionRepositorio {
  constructor(private readonly prisma: PrismaClient) {}

  private cliente(tx: ContextoTransaccional | null) {
    return tx ? clienteDe(tx) : this.prisma;
  }

  async bloquear(tx: ContextoTransaccional, incidenteId: string): Promise<EstadoBloqueado | null> {
    const filas = await clienteDe(tx).$queryRaw<{ estado: string; verificacion: string }[]>`
      SELECT estado, verificacion FROM incidentes WHERE id = ${incidenteId}::uuid FOR UPDATE`;
    const f = filas[0];
    return f ? { estado: f.estado as EstadoIncidente, verificacion: f.verificacion as Verificacion, principalId: null } : null;
  }

  async papel(tx: ContextoTransaccional, incidenteId: string, institucion: InstitucionDestino): Promise<Papel | null> {
    const filas = await clienteDe(tx).$queryRaw<{ papel: string }[]>`
      SELECT papel FROM participaciones_incidente
       WHERE incidente_id = ${incidenteId}::uuid AND institucion = ${institucion} LIMIT 1`;
    return (filas[0]?.papel as Papel | undefined) ?? null;
  }

  async sedesParticipantes(tx: ContextoTransaccional | null, incidenteId: string, institucion: InstitucionDestino): Promise<readonly string[]> {
    const filas = await this.cliente(tx).$queryRaw<{ sede_id: string }[]>`
      SELECT sede_id::text FROM participaciones_incidente
       WHERE incidente_id = ${incidenteId}::uuid AND institucion = ${institucion} ORDER BY sede_id`;
    return filas.map((f) => f.sede_id);
  }

  async activa(tx: ContextoTransaccional, incidenteId: string, institucion: InstitucionDestino): Promise<Asignacion | null> {
    const filas = await clienteDe(tx).$queryRawUnsafe<FilaAsignacion[]>(
      `SELECT ${COLUMNAS_ASIGNACION} FROM asignaciones_incidente
        WHERE incidente_id = $1::uuid AND institucion = $2 AND activa`,
      incidenteId,
      institucion,
    );
    return filas[0] ? aAsignacion(filas[0]) : null;
  }

  async insertarAsignacion(tx: ContextoTransaccional, a: Omit<Asignacion, 'id' | 'asignadaEn'>): Promise<Asignacion | null> {
    // ON CONFLICT sobre el indice unico parcial: una carrera no aborta la transaccion.
    const filas = await clienteDe(tx).$queryRawUnsafe<FilaAsignacion[]>(
      `INSERT INTO asignaciones_incidente (incidente_id, institucion, operador_id, sede_id, origen)
       VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5)
       ON CONFLICT (incidente_id, institucion) WHERE activa DO NOTHING
       RETURNING ${COLUMNAS_ASIGNACION}`,
      a.incidenteId,
      a.institucion,
      a.operadorId,
      a.sedeId,
      a.origen,
    );
    return filas[0] ? aAsignacion(filas[0]) : null;
  }

  async liberar(tx: ContextoTransaccional, asignacionId: string): Promise<void> {
    await clienteDe(tx).$executeRaw`
      UPDATE asignaciones_incidente SET activa = false, liberada_en = clock_timestamp()
       WHERE id = ${asignacionId}::uuid AND activa`;
  }

  async asignacionPorId(asignacionId: string): Promise<Asignacion | null> {
    const filas = await this.prisma.$queryRawUnsafe<FilaAsignacion[]>(
      `SELECT ${COLUMNAS_ASIGNACION} FROM asignaciones_incidente WHERE id = $1::uuid AND activa`,
      asignacionId,
    );
    return filas[0] ? aAsignacion(filas[0]) : null;
  }

  async cambiarEstado(
    tx: ContextoTransaccional,
    incidenteId: string,
    estado: EstadoIncidente,
    cierre?: { readonly resultado: Resultado; readonly resumenCiudadano: string },
  ): Promise<void> {
    await clienteDe(tx).$executeRaw`
      UPDATE incidentes
         SET estado = ${estado},
             resultado = ${cierre?.resultado ?? null},
             resumen_ciudadano = ${cierre?.resumenCiudadano ?? null},
             cerrado_en = ${cierre ? new Date() : null}::timestamptz
       WHERE id = ${incidenteId}::uuid`;
  }

  async cambiarVerificacion(tx: ContextoTransaccional, incidenteId: string, valor: Verificacion): Promise<void> {
    await clienteDe(tx).$executeRaw`UPDATE incidentes SET verificacion = ${valor} WHERE id = ${incidenteId}::uuid`;
  }

  async registrar(tx: ContextoTransaccional, e: EntradaHistorial): Promise<void> {
    await clienteDe(tx).$executeRaw`
      INSERT INTO historial_incidente (incidente_id, accion, actor_tipo, actor_usuario_id, institucion, valor_anterior, valor_nuevo, motivo)
      VALUES (${e.incidenteId}::uuid, ${e.accion}, ${e.actorTipo}, ${e.actorUsuarioId}::uuid, ${e.institucion},
              ${e.valorAnterior ?? null}, ${e.valorNuevo ?? null}, ${e.motivo ?? null})`;
  }

  async asignacionesActivas(incidenteId: string): Promise<readonly Asignacion[]> {
    const filas = await this.prisma.$queryRawUnsafe<FilaAsignacion[]>(
      `SELECT ${COLUMNAS_ASIGNACION} FROM asignaciones_incidente WHERE incidente_id = $1::uuid AND activa ORDER BY institucion`,
      incidenteId,
    );
    return filas.map(aAsignacion);
  }

  async historial(incidenteId: string): Promise<readonly FilaHistorial[]> {
    const filas = await this.prisma.$queryRaw<{
      incidente_id: string; accion: string; actor_tipo: string; institucion: string;
      valor_anterior: string | null; valor_nuevo: string | null; motivo: string | null; creado_en: Date;
    }[]>`
      SELECT incidente_id::text, accion, actor_tipo, institucion, valor_anterior, valor_nuevo, motivo, creado_en
        FROM historial_incidente WHERE incidente_id = ${incidenteId}::uuid ORDER BY creado_en, id`;
    return filas.map((f) => ({
      incidenteId: f.incidente_id,
      accion: f.accion as FilaHistorial['accion'],
      actorTipo: f.actor_tipo as FilaHistorial['actorTipo'],
      institucion: f.institucion as InstitucionDestino,
      valorAnterior: f.valor_anterior,
      valorNuevo: f.valor_nuevo,
      motivo: f.motivo,
      creadoEn: f.creado_en,
    }));
  }

  async listarActivas(limite: number): Promise<readonly AsignacionAdmin[]> {
    const filas = await this.prisma.$queryRawUnsafe<(FilaAsignacion & { referencia: string; estado: string })[]>(
      `SELECT a.id::text, a.incidente_id::text, a.institucion, a.operador_id::text, a.sede_id::text, a.origen, a.asignada_en,
              i.referencia, i.estado
         FROM asignaciones_incidente a JOIN incidentes i ON i.id = a.incidente_id
        WHERE a.activa AND i.estado <> 'CERRADO'
        ORDER BY a.asignada_en, a.id
        LIMIT $1`,
      limite,
    );
    return filas.map((f) => ({ ...aAsignacion(f), referencia: f.referencia, estado: f.estado as EstadoIncidente }));
  }

  async cierres(ids: readonly string[]): Promise<ReadonlyMap<string, CierreCiudadano>> {
    const base = await this.prisma.$queryRaw<{
      id: string; efectivo_id: string; estado: string; resultado: string | null; resumen_ciudadano: string | null;
    }[]>`
      SELECT id::text, id::text AS efectivo_id, estado, resultado, resumen_ciudadano
        FROM incidentes WHERE id = ANY(${[...ids]}::uuid[])`;
    const efectivos = [...new Set(base.map((b) => b.efectivo_id))];
    const transiciones = await this.prisma.$queryRaw<{ incidente_id: string; institucion: string; valor_nuevo: string; creado_en: Date }[]>`
      SELECT incidente_id::text, institucion, valor_nuevo, creado_en FROM historial_incidente
       WHERE accion = 'transicion' AND incidente_id = ANY(${efectivos}::uuid[])
       ORDER BY creado_en, id`;
    const hitos = new Map<string, Hito[]>();
    for (const t of transiciones) {
      const lista = hitos.get(t.incidente_id) ?? [];
      lista.push({
        tipo: t.valor_nuevo.startsWith('CERRADO') ? 'CERRADO' : (t.valor_nuevo as Hito['tipo']),
        institucion: t.institucion as InstitucionDestino,
        instante: t.creado_en,
      });
      hitos.set(t.incidente_id, lista);
    }
    return new Map(base.map((b) => [b.id, {
      estado: b.estado as EstadoIncidente,
      resultado: b.resultado as Resultado | null,
      resumenCiudadano: b.resumen_ciudadano,
      hitos: hitos.get(b.efectivo_id) ?? [],
      coordinado: b.efectivo_id !== b.id,
    }]));
  }
}
