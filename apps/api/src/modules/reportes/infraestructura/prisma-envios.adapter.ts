import type { PrismaClient } from '../../../generated/prisma/client';
import { clienteDe } from '../../../compartido/prisma-transaccion';
import type { ContextoTransaccional } from '../../../compartido/transaccion';
import {
  ClaveDuplicadaError,
  type EnvioGuardado,
  type EnviosRepositorio,
  type NuevoEnvio,
  type SolicitudPrevia,
  type TerritorioEnvio,
} from '../aplicacion/puertos/registro.port';
import type { CursorHistorial, EnviosLecturaRepositorio, EnvioDetalleAutor, EnvioInvitadoVerificado, EnvioResumen } from '../aplicacion/lectura-envios';
import type { Modalidad, ModoOcurrencia, RespuestaSamu } from '../dominio/envio';

function esUnicidad(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

function aTerritorio(f: {
  estadoTerritorial: string;
  distritoId: string | null;
  motivoTerritorial: string | null;
  versionTerritorial: string | null;
}): TerritorioEnvio {
  if (f.estadoTerritorial === 'resuelto') {
    return { estado: 'resuelto', distritoId: f.distritoId!, motivo: null, version: f.versionTerritorial! };
  }
  return {
    estado: 'pendiente',
    distritoId: null,
    motivo: f.motivoTerritorial as Exclude<TerritorioEnvio['motivo'], null>,
    version: f.versionTerritorial,
  };
}

/** Originales del envio y claves de idempotencia (solo Reportes accede a estas tablas). */
export class PrismaEnviosAdapter implements EnviosRepositorio, EnviosLecturaRepositorio {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarSolicitud(ambito: string, clave: string): Promise<SolicitudPrevia | null> {
    const fila = await this.prisma.solicitudEnvio.findUnique({
      where: { ambito_clave: { ambito, clave } },
      select: { huellaContenido: true, incidenteId: true },
    });
    return fila;
  }

  async insertarSolicitud(tx: ContextoTransaccional, ambito: string, clave: string, huella: string, incidenteId: string): Promise<void> {
    try {
      await clienteDe(tx).solicitudEnvio.create({ data: { ambito, clave, huellaContenido: huella, incidenteId } });
    } catch (e) {
      // La transaccion queda abortada: el llamador la revierte y resuelve la repeticion.
      if (esUnicidad(e)) throw new ClaveDuplicadaError();
      throw e;
    }
  }

  async insertarEnvio(tx: ContextoTransaccional, n: NuevoEnvio): Promise<void> {
    const e = n.envio;
    await clienteDe(tx).envioIncidente.create({
      data: {
        incidenteId: n.incidenteId,
        modalidad: n.modalidad,
        autorUsuarioId: n.autorUsuarioId,
        telefonoContacto: e.telefonoContacto,
        codigoHuella: n.codigoHuella,
        codigoEmitidoEn: n.codigoHuella ? n.recibidoEn : null,
        categoriaId: e.categoriaId,
        descripcion: e.descripcion,
        ocurrenciaModo: e.ocurrencia.modo,
        ocurridoEn: e.ocurrencia.instante,
        latitud: e.punto.latitud,
        longitud: e.punto.longitud,
        origenPunto: e.punto.origen,
        precisionM: e.punto.precisionM,
        distritoId: n.territorio.distritoId,
        estadoTerritorial: n.territorio.estado,
        motivoTerritorial: n.territorio.motivo,
        versionTerritorial: n.territorio.version,
        heridos: e.heridos,
        atencionMedica: e.atencionMedica,
        recibidoEn: n.recibidoEn,
      },
    });
  }

  async leerEnvio(incidenteId: string): Promise<EnvioGuardado | null> {
    const f = await this.prisma.envioIncidente.findUnique({
      where: { incidenteId },
      select: { incidenteId: true, modalidad: true, estadoTerritorial: true, distritoId: true, motivoTerritorial: true, versionTerritorial: true },
    });
    return f ? { incidenteId: f.incidenteId, modalidad: f.modalidad as Modalidad, territorio: aTerritorio(f) } : null;
  }

  async listarDeAutor(usuarioId: string, despuesDe: CursorHistorial | null, limite: number): Promise<readonly EnvioResumen[]> {
    const filas = await this.prisma.envioIncidente.findMany({
      where: {
        autorUsuarioId: usuarioId,
        modalidad: 'cuenta',
        ...(despuesDe
          ? {
              OR: [
                { recibidoEn: { lt: despuesDe.recibidoEn } },
                { recibidoEn: despuesDe.recibidoEn, incidenteId: { lt: despuesDe.incidenteId } },
              ],
            }
          : {}),
      },
      orderBy: [{ recibidoEn: 'desc' }, { incidenteId: 'desc' }],
      take: limite,
      select: {
        incidenteId: true, categoriaId: true, recibidoEn: true,
        estadoTerritorial: true, distritoId: true, motivoTerritorial: true, versionTerritorial: true,
      },
    });
    return filas.map((f) => ({ incidenteId: f.incidenteId, categoriaId: f.categoriaId, recibidoEn: f.recibidoEn, territorio: aTerritorio(f) }));
  }

  async detalleDeAutor(usuarioId: string, incidenteId: string): Promise<EnvioDetalleAutor | null> {
    const f = await this.prisma.envioIncidente.findFirst({
      where: { incidenteId, autorUsuarioId: usuarioId, modalidad: 'cuenta' },
      select: {
        incidenteId: true, categoriaId: true, recibidoEn: true, descripcion: true, ocurrenciaModo: true, ocurridoEn: true,
        heridos: true, atencionMedica: true,
        estadoTerritorial: true, distritoId: true, motivoTerritorial: true, versionTerritorial: true,
      },
    });
    if (!f) return null;
    return {
      incidenteId: f.incidenteId,
      categoriaId: f.categoriaId,
      recibidoEn: f.recibidoEn,
      territorio: aTerritorio(f),
      descripcion: f.descripcion,
      ocurrencia: { modo: f.ocurrenciaModo as ModoOcurrencia, instante: f.ocurridoEn },
      heridos: f.heridos as RespuestaSamu | null,
      atencionMedica: f.atencionMedica as RespuestaSamu | null,
    };
  }

  async huellaCodigoDe(incidenteId: string): Promise<(EnvioInvitadoVerificado & { readonly codigoHuella: string }) | null> {
    const f = await this.prisma.envioIncidente.findFirst({
      where: { incidenteId, modalidad: 'invitado' },
      select: { categoriaId: true, recibidoEn: true, codigoHuella: true },
    });
    return f?.codigoHuella ? { categoriaId: f.categoriaId, recibidoEn: f.recibidoEn, codigoHuella: f.codigoHuella } : null;
  }

  async rotarCodigo(incidenteId: string, codigoHuella: string, emitidoEn: Date): Promise<void> {
    // Solo envios de invitado: el CHECK impide una huella en un envio de cuenta.
    await this.prisma.envioIncidente.updateMany({
      where: { incidenteId, modalidad: 'invitado' },
      data: { codigoHuella, codigoEmitidoEn: emitidoEn },
    });
  }
}
