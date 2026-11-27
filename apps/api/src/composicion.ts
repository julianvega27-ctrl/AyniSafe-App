import { PrismaPublicadorEventos } from './compartido/eventos/prisma-eventos';
import type { Logger } from './compartido/logger';
import { PrismaUnidadDeTrabajo } from './compartido/prisma-transaccion';
import { distritosPiloto, type ModuloConsultas, type OpcionesBandeja, type OpcionesSeguimiento } from './modules/consultas';
import type { ModuloIdentidad } from './modules/identidad';
import {
  crearEnrutamientoConPrisma,
  crearRouterEnrutamiento,
  normalizarReferencia,
  type ModuloOperaciones,
  type ServicioEnrutamiento,
} from './modules/operaciones';
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
  modulos: {
    readonly identidad: ModuloIdentidad;
    readonly operaciones: ModuloOperaciones;
    /** Institucion responsable (P4.2); sin el, se informa pendiente. */
    readonly enrutamiento?: ServicioEnrutamiento;
  },
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
    ...(modulos.enrutamiento ? { responsables: responsablesDe(modulos.enrutamiento, modulos.identidad) } : {}),
    limitador: modulos.identidad.limitador,
    identificar: modulos.identidad.identificarSolicitante,
    logger,
  };
}

function responsablesDe(enrutamiento: ServicioEnrutamiento, identidad: ModuloIdentidad) {
  return {
    async deIncidentes(ids: readonly string[]) {
      const principales = await enrutamiento.principales(ids);
      if (principales.size === 0) return new Map<string, { id: string; nombre: string }>();
      const nombres = await identidad.sedesEnrutamiento.nombresInstituciones();
      return new Map([...principales].map(([id, inst]) => [id, { id: inst, nombre: nombres.get(inst) ?? inst }]));
    },
  };
}

/**
 * Bandeja del operador (P4.2): ambito de Identidad, participaciones de Operaciones y originales de
 * Reportes. Reportes se resuelve al usarse.
 */
export function opcionesBandeja(
  identidad: ModuloIdentidad,
  enrutamiento: ServicioEnrutamiento,
  obtenerReportes: () => ModuloReportes,
  logger: Logger,
): OpcionesBandeja {
  return {
    ambito: {
      async de(usuarioId) {
        const a = await identidad.consultarAmbitoOperador.ejecutar(usuarioId);
        return a
          ? { sedeId: a.sede.id, distritos: a.distritos, categorias: a.categorias, habilitadaAtencion: a.habilitadaAtencion }
          : null;
      },
    },
    participaciones: {
      bandeja: (ambito, despuesDe, limite) => enrutamiento.bandeja(ambito, despuesDe, limite),
      participacionDe: (ambito, id) => enrutamiento.participacionDe(ambito, id),
    },
    originales: {
      async resumenOperativo(ids) {
        const lectura = obtenerReportes().lectura;
        if (!lectura) throw new Error('Reportes sin lectura de envios compuesta');
        return lectura.resumenOperativo(ids);
      },
    },
    categorias: {
      nombres: async () => new Map((await obtenerReportes().categorias.listar()).map((c) => [c.id, c.nombre])),
    },
    identificar: identidad.identificarSolicitante,
    logger,
  };
}

/**
 * Enrutamiento de Operaciones (P4.2): originales por la fachada de Reportes y sedes por la de
 * Identidad. Reportes se compone despues (su registro despierta el procesador), por eso se resuelve
 * al usarse mediante `obtenerReportes`.
 */
export function enrutamientoDe(
  prisma: PrismaClient,
  identidad: ModuloIdentidad,
  obtenerReportes: () => ModuloReportes,
  despertarEntregas: () => void,
): ServicioEnrutamiento {
  return crearEnrutamientoConPrisma(prisma, {
    datos: {
      async de(incidenteId) {
        const lectura = obtenerReportes().lectura;
        if (!lectura) throw new Error('Reportes sin lectura de envios compuesta');
        const d = await lectura.datosEnrutamiento(incidenteId);
        if (!d) return null;
        return {
          categoriaId: d.categoriaId,
          distritoId: d.territorio.estado === 'resuelto' ? d.territorio.distritoId : null,
          heridos: d.heridos,
          atencionMedica: d.atencionMedica,
        };
      },
    },
    sedes: {
      elegibles: (institucion, distritoId, categoriaId) => identidad.sedesEnrutamiento.elegibles(institucion, distritoId, categoriaId),
      designable: (sedeId, institucion) => identidad.sedesEnrutamiento.designable(sedeId, institucion),
    },
    despertarEntregas,
  });
}

/** Rutas de enrutamientos pendientes del administrador (P4.2). */
export function routerOperaciones(
  enrutamiento: ServicioEnrutamiento,
  identidad: ModuloIdentidad,
  obtenerReportes: () => ModuloReportes,
  logger: Logger,
) {
  const distritos = new Map(distritosPiloto().map((d) => [d.id, d.nombre]));
  return crearRouterEnrutamiento(enrutamiento, {
    identificar: identidad.identificarSolicitante,
    origenWebPermitido: identidad.origenWebPermitido,
    vista: {
      nombresCategorias: async () => new Map((await obtenerReportes().categorias.listar()).map((c) => [c.id, c.nombre])),
      nombreDistrito: (id) => distritos.get(id) ?? null,
      async motivoTerritorial(incidenteId) {
        const d = await obtenerReportes().lectura?.datosEnrutamiento(incidenteId);
        return d && d.territorio.estado === 'pendiente' ? d.territorio.motivo : null;
      },
    },
    logger,
  });
}
