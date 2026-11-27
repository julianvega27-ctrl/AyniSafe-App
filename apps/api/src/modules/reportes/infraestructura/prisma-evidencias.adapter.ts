import type { PrismaClient } from '../../../generated/prisma/client';
import { clienteDe } from '../../../compartido/prisma-transaccion';
import type { ContextoTransaccional } from '../../../compartido/transaccion';
import type { EstadoEvidencia, MotivoEliminacion, TipoMedio, UsoAlmacen } from '../dominio/evidencia';
import type {
  AutoriaEnvio,
  EvidenciaRegistrada,
  EvidenciasRepositorio,
  NuevaEvidencia,
  PermisoGuardado,
  TareaEliminacion,
} from '../aplicacion/puertos/evidencias.port';

interface FilaEvidencia {
  id: string;
  incidenteId: string;
  ranura: number;
  publicId: string;
  estado: string;
  tipoMedio: string;
  bytes: number;
  huellaCarga: string;
  creadaEn: Date;
  confirmadaEn: Date | null;
}

function aEvidencia(f: FilaEvidencia): EvidenciaRegistrada {
  return {
    id: f.id,
    incidenteId: f.incidenteId,
    ranura: f.ranura,
    publicId: f.publicId,
    estado: f.estado as EstadoEvidencia,
    tipo: f.tipoMedio as TipoMedio,
    bytes: f.bytes,
    huellaCarga: f.huellaCarga,
    creadaEn: f.creadaEn,
    confirmadaEn: f.confirmadaEn,
  };
}

const SELECCION = {
  id: true,
  incidenteId: true,
  ranura: true,
  publicId: true,
  estado: true,
  tipoMedio: true,
  bytes: true,
  huellaCarga: true,
  creadaEn: true,
  confirmadaEn: true,
} as const;

/** Persistencia de evidencias de Reportes (P5.2). Solo este modulo lee o escribe estas tablas. */
export class PrismaEvidenciasAdapter implements EvidenciasRepositorio {
  constructor(private readonly prisma: PrismaClient) {}

  async guardar(tx: ContextoTransaccional | null, incidenteId: string, huella: string, emitidoEn: Date, venceEn: Date): Promise<void> {
    const c = tx ? clienteDe(tx) : this.prisma;
    await c.permisoEvidencia.upsert({
      where: { incidenteId },
      create: { incidenteId, permisoHuella: huella, emitidoEn, venceEn },
      update: { permisoHuella: huella, emitidoEn, venceEn },
    });
  }

  async leer(incidenteId: string): Promise<PermisoGuardado | null> {
    const p = await this.prisma.permisoEvidencia.findUnique({ where: { incidenteId } });
    return p ? { huella: p.permisoHuella, venceEn: p.venceEn } : null;
  }

  async autoria(incidenteId: string): Promise<AutoriaEnvio | null> {
    const e = await this.prisma.envioIncidente.findUnique({ where: { incidenteId }, select: { modalidad: true, autorUsuarioId: true } });
    return e ? { modalidad: e.modalidad as AutoriaEnvio['modalidad'], autorUsuarioId: e.autorUsuarioId } : null;
  }

  async bloquearIncidente(tx: ContextoTransaccional, incidenteId: string): Promise<void> {
    await clienteDe(tx).$queryRawUnsafe(`SELECT 1 FROM envios_incidente WHERE incidente_id = $1::uuid FOR UPDATE`, incidenteId);
  }

  async vigentePorClave(tx: ContextoTransaccional, incidenteId: string, clave: string): Promise<EvidenciaRegistrada | null> {
    const f = await clienteDe(tx).evidenciaIncidente.findFirst({
      where: { incidenteId, claveIdempotencia: clave, estado: { in: ['pendiente', 'disponible'] } },
      select: SELECCION,
    });
    return f ? aEvidencia(f) : null;
  }

  async ranurasOcupadas(tx: ContextoTransaccional, incidenteId: string): Promise<number[]> {
    const filas = await clienteDe(tx).evidenciaIncidente.findMany({
      where: { incidenteId, estado: { not: 'eliminada' } },
      select: { ranura: true },
    });
    return filas.map((f) => f.ranura);
  }

  async uso(tx: ContextoTransaccional): Promise<UsoAlmacen> {
    const r = await clienteDe(tx).evidenciaIncidente.aggregate({
      where: { estado: { not: 'eliminada' } },
      _sum: { bytes: true },
      _count: { _all: true },
    });
    return { bytes: r._sum.bytes ?? 0, objetos: r._count._all };
  }

  async insertarPendiente(tx: ContextoTransaccional, n: NuevaEvidencia): Promise<void> {
    await clienteDe(tx).evidenciaIncidente.create({
      data: {
        id: n.id,
        incidenteId: n.incidenteId,
        ranura: n.ranura,
        publicId: n.publicId,
        proveedor: n.proveedor,
        estado: 'pendiente',
        tipoMedio: n.tipo,
        bytes: n.bytes,
        ancho: n.ancho,
        alto: n.alto,
        sha256: n.sha256,
        huellaCarga: n.huellaCarga,
        claveIdempotencia: n.clave,
        modalidad: n.modalidad,
        autorUsuarioId: n.autorUsuarioId,
        creadaEn: n.creadaEn,
      },
    });
  }

  async confirmar(id: string, ahora: Date): Promise<boolean> {
    const r = await this.prisma.evidenciaIncidente.updateMany({ where: { id, estado: 'pendiente' }, data: { estado: 'disponible', confirmadaEn: ahora } });
    return r.count === 1;
  }

  async marcarEliminacion(id: string, motivo: MotivoEliminacion, ahora: Date): Promise<void> {
    await this.prisma.evidenciaIncidente.updateMany({
      where: { id, estado: { in: ['pendiente', 'disponible'] } },
      data: { estado: 'eliminacion_pendiente', motivoEliminacion: motivo, proximoIntentoEn: ahora },
    });
  }

  async tomarTareas(ahora: Date, huerfanaAntesDe: Date, limite: number, arriendoHasta: Date): Promise<TareaEliminacion[]> {
    return this.prisma.$transaction(async (c) => {
    await c.$executeRawUnsafe(
      `UPDATE evidencias_incidente SET estado = 'eliminacion_pendiente', motivo_eliminacion = 'huerfana', proximo_intento_en = $1
       WHERE id IN (SELECT id FROM evidencias_incidente WHERE estado = 'pendiente' AND creada_en < $2
                    ORDER BY creada_en LIMIT $3 FOR UPDATE SKIP LOCKED)`,
      ahora,
      huerfanaAntesDe,
      limite,
    );
    const filas = await c.$queryRawUnsafe<{ id: string; public_id: string; intentos_eliminacion: number }[]>(
      `UPDATE evidencias_incidente SET proximo_intento_en = $3
       WHERE id IN (SELECT id FROM evidencias_incidente
                    WHERE estado = 'eliminacion_pendiente' AND (proximo_intento_en IS NULL OR proximo_intento_en <= $1)
                    ORDER BY proximo_intento_en NULLS FIRST, creada_en LIMIT $2 FOR UPDATE SKIP LOCKED)
       RETURNING id, public_id, intentos_eliminacion`,
      ahora,
      limite,
      arriendoHasta,
    );
    return filas.map((f) => ({ id: f.id, publicId: f.public_id, intentos: f.intentos_eliminacion }));
    });
  }

  async marcarEliminada(id: string, ahora: Date): Promise<void> {
    await this.prisma.evidenciaIncidente.updateMany({
      where: { id, estado: 'eliminacion_pendiente' },
      data: { estado: 'eliminada', eliminadaEn: ahora, sha256: null, ancho: null, alto: null, proximoIntentoEn: null },
    });
  }

  async reprogramar(id: string, intentos: number, proximo: Date): Promise<void> {
    await this.prisma.evidenciaIncidente.updateMany({
      where: { id, estado: 'eliminacion_pendiente' },
      data: { intentosEliminacion: intentos, proximoIntentoEn: proximo },
    });
  }

  async disponibles(incidenteIds: readonly string[]): Promise<EvidenciaRegistrada[]> {
    if (incidenteIds.length === 0) return [];
    const filas = await this.prisma.evidenciaIncidente.findMany({
      where: { incidenteId: { in: [...incidenteIds] }, estado: 'disponible' },
      select: SELECCION,
      orderBy: [{ incidenteId: 'asc' }, { ranura: 'asc' }],
    });
    return filas.map(aEvidencia);
  }

  async disponible(incidenteId: string, evidenciaId: string): Promise<EvidenciaRegistrada | null> {
    const f = await this.prisma.evidenciaIncidente.findFirst({ where: { id: evidenciaId, incidenteId, estado: 'disponible' }, select: SELECCION });
    return f ? aEvidencia(f) : null;
  }

  async registrarAcceso(evidenciaId: string, usuarioId: string, rol: 'operador' | 'ciudadano', ahora: Date): Promise<void> {
    await this.prisma.accesoEvidencia.create({ data: { evidenciaId, usuarioId, rol, accedidoEn: ahora } });
  }
}
