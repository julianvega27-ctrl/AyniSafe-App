import type { PrismaClient } from '../../../generated/prisma/client';
import { clienteDe } from '../../../compartido/prisma-transaccion';
import type { ContextoTransaccional } from '../../../compartido/transaccion';
import type { NuevaPublicacion, Publicacion, PublicacionRepositorio } from '../aplicacion/publicacion';
import type { Verificacion } from '../dominio/atencion';
import type { EstadoIncidente } from '../dominio/incidente';
import { CATEGORIAS_SENSIBLES, MINIMO_CONTEO, type CausaRetiro } from '../dominio/publicacion';

interface FilaPublicacion {
  readonly incidente_id: string;
  readonly id_publico: string;
  readonly estado: string;
  readonly reservada: boolean;
  readonly institucion: string;
  readonly categoria_id: string;
  readonly distrito_id: string;
  readonly celda_lat: number;
  readonly celda_lon: number;
  readonly ocurrido_en: Date;
  readonly vence_en: Date;
  readonly publicada_en: Date;
  readonly retirada_en: Date | null;
  readonly causa_retiro: string | null;
}

const COLUMNAS = `incidente_id::text, id_publico::text, estado, reservada, institucion, categoria_id, distrito_id,
  celda_lat, celda_lon, ocurrido_en, vence_en, publicada_en, retirada_en, causa_retiro`;

const aPublicacion = (f: FilaPublicacion): Publicacion => ({
  incidenteId: f.incidente_id,
  idPublico: f.id_publico,
  estado: f.estado as Publicacion['estado'],
  reservada: f.reservada,
  institucion: f.institucion,
  categoriaId: f.categoria_id,
  distritoId: f.distrito_id,
  celdaLat: f.celda_lat,
  celdaLon: f.celda_lon,
  ocurridoEn: f.ocurrido_en,
  venceEn: f.vence_en,
  publicadaEn: f.publicada_en,
  retiradaEn: f.retirada_en,
  causaRetiro: f.causa_retiro as CausaRetiro | null,
});

/** Elemento publico: lista cerrada de campos, sin identificador interno ni referencia del incidente. */
export interface PuntoPublicoFila {
  readonly idPublico: string;
  readonly categoriaId: string;
  readonly distritoId: string;
  readonly celdaLat: number;
  readonly celdaLon: number;
  readonly ocurridoEn: Date;
  readonly estado: EstadoIncidente;
}

export interface ConteoReservadoFila {
  readonly distritoId: string;
  readonly mes: string;
  readonly total: number;
}

export interface FiltroPublico {
  readonly distritoId: string | null;
  readonly categoriaId: string | null;
  readonly desde: Date;
  readonly ahora: Date;
  readonly limite: number;
}

const SENSIBLES = [...CATEGORIAS_SENSIBLES];

/** Publicaciones (solo Operaciones escribe esta tabla). Las lecturas publicas no tocan los originales. */
export class PrismaPublicacionAdapter implements PublicacionRepositorio {
  constructor(private readonly prisma: PrismaClient) {}

  async deIncidente(tx: ContextoTransaccional | null, incidenteId: string): Promise<Publicacion | null> {
    const cliente = tx ? clienteDe(tx) : this.prisma;
    const filas = await cliente.$queryRawUnsafe<FilaPublicacion[]>(
      `SELECT ${COLUMNAS} FROM publicaciones_incidente WHERE incidente_id = $1::uuid`,
      incidenteId,
    );
    return filas[0] ? aPublicacion(filas[0]) : null;
  }

  async guardar(tx: ContextoTransaccional, p: NuevaPublicacion): Promise<Publicacion> {
    const filas = await clienteDe(tx).$queryRawUnsafe<FilaPublicacion[]>(
      `INSERT INTO publicaciones_incidente
         (incidente_id, estado, reservada, institucion, categoria_id, distrito_id, celda_lat, celda_lon, ocurrido_en, vence_en)
       VALUES ($1::uuid, 'VIGENTE', $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (incidente_id) DO UPDATE
          SET estado = 'VIGENTE', reservada = EXCLUDED.reservada, institucion = EXCLUDED.institucion,
              publicada_en = clock_timestamp(), retirada_en = NULL, causa_retiro = NULL
       RETURNING ${COLUMNAS}`,
      p.incidenteId,
      p.reservada,
      p.institucion,
      p.categoriaId,
      p.distritoId,
      p.celdaLat,
      p.celdaLon,
      p.ocurridoEn,
      p.venceEn,
    );
    return aPublicacion(filas[0]!);
  }

  async retirar(tx: ContextoTransaccional, incidenteId: string, causa: CausaRetiro): Promise<void> {
    await clienteDe(tx).$executeRaw`
      UPDATE publicaciones_incidente SET estado = 'RETIRADA', retirada_en = clock_timestamp(), causa_retiro = ${causa}
       WHERE incidente_id = ${incidenteId}::uuid AND estado = 'VIGENTE'`;
  }

  async reservar(tx: ContextoTransaccional, incidenteId: string, reservada: boolean): Promise<void> {
    await clienteDe(tx).$executeRaw`
      UPDATE publicaciones_incidente SET reservada = ${reservada} WHERE incidente_id = ${incidenteId}::uuid`;
  }

  async incidente(incidenteId: string) {
    const filas = await this.prisma.$queryRaw<{ estado: string; verificacion: string; principal_id: string | null }[]>`
      SELECT estado, verificacion, principal_id::text FROM incidentes WHERE id = ${incidenteId}::uuid`;
    const f = filas[0];
    return f ? { estado: f.estado as EstadoIncidente, verificacion: f.verificacion as Verificacion, principalId: f.principal_id } : null;
  }

  /**
   * Puntos publicos vigentes: sin sensibles ni reservados y solo de incidentes abiertos (defensa
   * adicional al retiro automatico). Lee unicamente la instantanea y el estado del incidente.
   */
  async puntosPublicos(f: FiltroPublico): Promise<readonly PuntoPublicoFila[]> {
    const filas = await this.prisma.$queryRaw<
      { id_publico: string; categoria_id: string; distrito_id: string; celda_lat: number; celda_lon: number; ocurrido_en: Date; estado: string }[]
    >`
      SELECT p.id_publico::text, p.categoria_id, p.distrito_id, p.celda_lat, p.celda_lon, p.ocurrido_en, i.estado
        FROM publicaciones_incidente p
        JOIN incidentes i ON i.id = p.incidente_id
       WHERE p.estado = 'VIGENTE' AND p.vence_en > ${f.ahora}
         AND NOT p.reservada AND NOT (p.categoria_id = ANY(${SENSIBLES}::text[]))
         AND i.estado IN ('EN_REVISION', 'EN_ATENCION') AND i.principal_id IS NULL
         AND p.ocurrido_en >= ${f.desde}
         AND (${f.distritoId}::text IS NULL OR p.distrito_id = ${f.distritoId})
         AND (${f.categoriaId}::text IS NULL OR p.categoria_id = ${f.categoriaId})
       ORDER BY p.ocurrido_en DESC, p.id_publico
       LIMIT ${f.limite}`;
    return filas.map((r) => ({
      idPublico: r.id_publico,
      categoriaId: r.categoria_id,
      distritoId: r.distrito_id,
      celdaLat: r.celda_lat,
      celdaLon: r.celda_lon,
      ocurridoEn: r.ocurrido_en,
      estado: r.estado as EstadoIncidente,
    }));
  }

  /**
   * Conteos de sensibles y reservados por distrito y mes de ocurrencia (hora de Peru), desde `desde`.
   * Excluye retiradas por decision o NO_VERIFICADO; suprime grupos menores que el minimo.
   */
  async conteosReservados(f: { readonly distritoId: string | null; readonly desde: Date }): Promise<readonly ConteoReservadoFila[]> {
    const filas = await this.prisma.$queryRaw<{ distrito_id: string; mes: string; total: bigint }[]>`
      SELECT distrito_id, to_char(ocurrido_en AT TIME ZONE 'America/Lima', 'YYYY-MM') AS mes, count(*) AS total
        FROM publicaciones_incidente
       WHERE (reservada OR categoria_id = ANY(${SENSIBLES}::text[]))
         AND (causa_retiro IS NULL OR causa_retiro NOT IN ('DECISION', 'NO_VERIFICADO'))
         AND ocurrido_en >= ${f.desde}
         AND (${f.distritoId}::text IS NULL OR distrito_id = ${f.distritoId})
       GROUP BY 1, 2
      HAVING count(*) >= ${MINIMO_CONTEO}
       ORDER BY 2 DESC, 1`;
    return filas.map((r) => ({ distritoId: r.distrito_id, mes: r.mes, total: Number(r.total) }));
  }

  /** Publicaciones vigentes de un conjunto de incidentes (mapa operativo, grupo B). */
  async vigentesDe(ids: readonly string[], ahora: Date): Promise<ReadonlyMap<string, { readonly reservada: boolean; readonly venceEn: Date }>> {
    if (ids.length === 0) return new Map();
    const filas = await this.prisma.$queryRaw<{ incidente_id: string; reservada: boolean; vence_en: Date }[]>`
      SELECT incidente_id::text, reservada, vence_en FROM publicaciones_incidente
       WHERE incidente_id = ANY(${[...ids]}::uuid[]) AND estado = 'VIGENTE' AND vence_en > ${ahora}`;
    return new Map(filas.map((f) => [f.incidente_id, { reservada: f.reservada, venceEn: f.vence_en }]));
  }
}
