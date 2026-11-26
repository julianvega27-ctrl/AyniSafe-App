import { PrismaPublicadorEventos } from './compartido/eventos/prisma-eventos';
import type { Logger } from './compartido/logger';
import { PrismaUnidadDeTrabajo } from './compartido/prisma-transaccion';
import { distritosPiloto, type ModuloConsultas, type OpcionesSeguimiento } from './modules/consultas';
import type { ModuloIdentidad } from './modules/identidad';
import { normalizarReferencia, type ModuloOperaciones } from './modules/operaciones';
import type { DependenciasRegistroIncidentes, ModuloReportes, TerritorioEnvio, TerritorioPort } from './modules/reportes';
import type { PrismaClient } from './generated/prisma/client';

/**
 * Raiz de composicion entre modulos (P4.1). Conecta las fachadas de Identidad, Consultas y Operaciones
 * con los puertos del registro de Reportes. La usan `main.ts` y el arnes de pruebas; ningun modulo
 * importa internos de otro.
 */
export function puertoTerritorio(consultas: ModuloConsultas): TerritorioPort {
  const nombres = new Map(distritosPiloto().map((d) => [d.id, d.nombre]));
  return {
    async resolver(latitud, longitud): Promise<TerritorioEnvio> {
      const r = await consultas.territorio.resolverParaRegistro(latitud, longitud);
      if (!r) return { estado: 'pendiente', distritoId: null, motivo: 'sin_cartografia', version: null };
      return r.estado === 'resuelto'
        ? { estado: 'resuelto', distritoId: r.distrito.id, motivo: null, version: r.version }
        : { estado: 'pendiente', distritoId: null, motivo: r.motivo, version: r.version };
    },
    nombreDistrito: (id) => nombres.get(id) ?? null,
  };
}

export function dependenciasRegistro(
  prisma: PrismaClient,
  modulos: {
    readonly identidad: ModuloIdentidad;
    readonly consultas: ModuloConsultas;
    readonly operaciones: ModuloOperaciones;
  },
  despertarEntregas: () => void,
  logger: Logger,
): DependenciasRegistroIncidentes {
  return {
    incidentes: modulos.operaciones.incidentes,
    territorio: puertoTerritorio(modulos.consultas),
    limitador: modulos.identidad.limitador,
    identificarSolicitante: modulos.identidad.identificarSolicitante,
    eventos: new PrismaPublicadorEventos(),
    unidadDeTrabajo: new PrismaUnidadDeTrabajo(prisma),
    despertarEntregas,
    logger,
  };
}

/**
 * Puertos del seguimiento ciudadano de Consultas. Reportes se compone despues de Consultas (su registro
 * usa el territorio), por eso sus lecturas se resuelven al usarse mediante `obtenerReportes`.
 */
export function opcionesSeguimiento(
  modulos: { readonly identidad: ModuloIdentidad; readonly operaciones: ModuloOperaciones },
  obtenerReportes: () => ModuloReportes,
  logger: Logger,
): OpcionesSeguimiento {
  const lectura = () => {
    const l = obtenerReportes().lectura;
    if (!l) throw new Error('Reportes sin lectura de envios compuesta');
    return l;
  };
  return {
    envios: {
      listarDeAutor: (usuarioId, despuesDe, limite) => lectura().listarDeAutor(usuarioId, despuesDe, limite),
      detalleDeAutor: (usuarioId, incidenteId) => lectura().detalleDeAutor(usuarioId, incidenteId),
      verificarCodigo: (incidenteId, codigo) => lectura().verificarCodigo(incidenteId, codigo),
    },
    incidentes: {
      normalizarReferencia: (texto) => normalizarReferencia(texto),
      porReferencia: (referencia) => modulos.operaciones.incidentes.porReferencia(referencia),
      estados: (ids) => modulos.operaciones.incidentes.estados(ids),
    },
    categorias: {
      nombres: async () => new Map((await obtenerReportes().categorias.listar()).map((c) => [c.id, c.nombre])),
    },
    limitador: modulos.identidad.limitador,
    identificar: modulos.identidad.identificarSolicitante,
    logger,
  };
}
