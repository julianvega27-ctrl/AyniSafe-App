import { DISTRITOS_PILOTO } from '../dominio/territorio';

/**
 * Mapa publico (P7, spec `consultas/mapa-publico`, documento 11 §5). Lee por un puerto la instantanea
 * de las publicaciones vigentes de Operaciones con su ubicacion exacta (decision del 27/11/2026). Las
 * vistas usan una lista cerrada de campos: nunca referencia, identificador interno, descripcion,
 * institucion ni datos personales.
 */

export interface PuntoPublico {
  readonly idPublico: string;
  readonly categoriaId: string;
  readonly distritoId: string;
  readonly latitud: number;
  readonly longitud: number;
  readonly ocurridoEn: Date;
  readonly estado: string;
}

export interface ConteoReservado {
  readonly distritoId: string;
  readonly mes: string;
  readonly total: number;
}

/** Puerto hacia Operaciones: publicaciones vigentes y conteos ya filtrados por las reglas de reserva. */
export interface PublicacionesPublicasPort {
  puntos(f: { readonly distritoId: string | null; readonly categoriaId: string | null; readonly desde: Date; readonly ahora: Date; readonly limite: number }): Promise<readonly PuntoPublico[]>;
  conteos(f: { readonly distritoId: string | null; readonly desde: Date }): Promise<readonly ConteoReservado[]>;
}

export interface DependenciasMapaPublico {
  readonly publicaciones: PublicacionesPublicasPort;
  readonly categorias: { nombres(): Promise<ReadonlyMap<string, string>> };
  readonly ahora?: () => Date;
}

export const PERIODOS_PUBLICOS = { '24h': 24, '3d': 72, '7d': 168 } as const;
export type PeriodoPublico = keyof typeof PERIODOS_PUBLICOS;
/** Tope defensivo de puntos por respuesta; la vigencia de 7 dias lo mantiene bajo en el piloto. */
export const LIMITE_PUNTOS_PUBLICOS = 500;

export class FiltroMapaInvalidoError extends Error {
  constructor(readonly campos: Readonly<Record<string, string>>) {
    super('Filtro de mapa invalido');
    this.name = 'FiltroMapaInvalidoError';
  }
}

const HORA_MS = 60 * 60 * 1000;
const nombreDistrito = (id: string) => DISTRITOS_PILOTO.find((d) => d.id === id)?.nombre ?? null;

/** Inicio del mes anterior en hora de Peru (UTC-5, sin horario de verano). */
export function inicioMesAnteriorLima(ahora: Date): Date {
  const lima = new Date(ahora.getTime() - 5 * HORA_MS);
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth() - 1, 1, 5));
}

export class MapaPublico {
  constructor(private readonly d: DependenciasMapaPublico) {}

  /** Valida la consulta. Cualquier parametro desconocido o mal formado es 422 sin datos. */
  async filtros(query: Record<string, unknown>) {
    const campos: Record<string, string> = {};
    for (const k of Object.keys(query)) if (!['distrito', 'categoria', 'periodo'].includes(k)) campos[k] = 'Filtro no admitido.';
    const texto = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 60 ? v : undefined);
    const distrito = query.distrito === undefined ? null : texto(query.distrito);
    if (distrito === undefined || (distrito && !nombreDistrito(distrito))) campos.distrito = 'Elige un distrito del catálogo.';
    const categoria = query.categoria === undefined ? null : texto(query.categoria);
    if (categoria === undefined || (categoria && !(await this.d.categorias.nombres()).has(categoria))) campos.categoria = 'Elige una categoría del catálogo.';
    const periodo = query.periodo === undefined ? '7d' : query.periodo;
    if (typeof periodo !== 'string' || !(periodo in PERIODOS_PUBLICOS)) campos.periodo = 'Elige 24h, 3d o 7d.';
    if (Object.keys(campos).length) throw new FiltroMapaInvalidoError(campos);
    return { distritoId: distrito ?? null, categoriaId: categoria ?? null, periodo: periodo as PeriodoPublico };
  }

  async consultar(query: Record<string, unknown>) {
    const f = await this.filtros(query);
    const ahora = this.d.ahora ? this.d.ahora() : new Date();
    const desde = new Date(ahora.getTime() - PERIODOS_PUBLICOS[f.periodo] * HORA_MS);
    const [puntos, conteos, nombres] = await Promise.all([
      this.d.publicaciones.puntos({ distritoId: f.distritoId, categoriaId: f.categoriaId, desde, ahora, limite: LIMITE_PUNTOS_PUBLICOS }),
      this.d.publicaciones.conteos({ distritoId: f.distritoId, desde: inicioMesAnteriorLima(ahora) }),
      this.d.categorias.nombres(),
    ]);
    return {
      filtros: { distrito: f.distritoId, categoria: f.categoriaId, periodo: f.periodo },
      generadoEn: ahora.toISOString(),
      elementos: puntos.map((p) => ({
        id: p.idPublico,
        categoria: { id: p.categoriaId, nombre: nombres.get(p.categoriaId) ?? null },
        distrito: { id: p.distritoId, nombre: nombreDistrito(p.distritoId) },
        ubicacion: { lat: p.latitud, lon: p.longitud },
        estado: p.estado,
        ocurridoEn: p.ocurridoEn.toISOString(),
        antiguedadHoras: Math.max(0, Math.floor((ahora.getTime() - p.ocurridoEn.getTime()) / HORA_MS)),
      })),
      reservados: conteos.map((c) => ({ distrito: { id: c.distritoId, nombre: nombreDistrito(c.distritoId) }, mes: c.mes, total: c.total })),
    };
  }
}
