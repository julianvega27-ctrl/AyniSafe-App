import { PrismaPublicadorEventos } from './compartido/eventos/prisma-eventos';
import type { Logger } from './compartido/logger';
import { PrismaUnidadDeTrabajo } from './compartido/prisma-transaccion';
import { distritosPiloto, type ModuloConsultas, type OpcionesBandeja, type OpcionesMapaPublico, type OpcionesSeguimiento } from './modules/consultas';
import type { ModuloIdentidad } from './modules/identidad';
import { Router } from 'express';
import {
  crearAtencionConPrisma,
  crearPublicacionConPrisma,
  type PrismaPublicacionAdapter,
  type ServicioPublicacion,
  crearEnrutamientoConPrisma,
  crearRouterAtencion,
  crearRouterEnrutamiento,
  type ServicioAtencion,
  type EstadoIncidente,
  type InstitucionDestino,
  type Papel,
  crearRouterEvaluacionOperador,
  type ResultadoAclaracionOperador,
  normalizarReferencia,
  type ModuloOperaciones,
  type ServicioEnrutamiento,
} from './modules/operaciones';
import {
  EvaluacionCerradaError,
  EvaluacionNoEncontradaError,
  ValidacionEvaluacionError,
  type DependenciasRegistroIncidentes,
  type ModuloReportes,
  type TerritorioEnvio,
  type TerritorioPort,
} from './modules/reportes';
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
    /** Recalculo por la condicion medica (P5.1); sin el, Reportes no ofrece aclaraciones. */
    readonly enrutamiento?: ServicioEnrutamiento;
  },
  despertarEntregas: () => void,
  logger: Logger,
): DependenciasRegistroIncidentes {
  const { enrutamiento } = modulos;
  return {
    incidentes: modulos.operaciones.incidentes,
    ...(enrutamiento ? { condicionMedica: { aplicar: (tx, cambio) => enrutamiento.aplicarCondicionMedica(tx, cambio) } } : {}),
    idPorReferencia: async (texto: string) => {
      const referencia = normalizarReferencia(texto);
      return referencia ? ((await modulos.operaciones.incidentes.porReferencia(referencia))?.id ?? null) : null;
    },
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
    /** Hitos y cierre (P6); sin ella, las actuaciones se informan pendientes. */
    readonly atencion?: ServicioAtencion;
  },
  obtenerReportes: () => ModuloReportes,
  logger: Logger,
): OpcionesSeguimiento {
  const { atencion } = modulos;
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
    ...(atencion
      ? {
          atencion: {
            cierres: (ids: readonly string[]) => atencion.cierres(ids),
            nombresInstituciones: () => modulos.identidad.sedesEnrutamiento.nombresInstituciones(),
          },
        }
      : {}),
    evaluacion: { vistaAutor: (incidenteId, abierto) => lecturaEvaluacion(obtenerReportes).vistaAutor(incidenteId, abierto) },
    evidencias: puertoEvidencias(obtenerReportes),
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
  atencion?: ServicioAtencion,
  /** P7 grupo B: lectura de publicaciones para el mapa operativo. */
  publicaciones?: PrismaPublicacionAdapter,
): OpcionesBandeja {
  return {
    ...(publicaciones
      ? {
          mapaOperativo: {
            participaciones: (ambito, filtro, limite) => enrutamiento.mapa(ambito, filtro, limite),
            async puntos(ids) {
              const lectura = obtenerReportes().lectura;
              if (!lectura) throw new Error('Reportes sin lectura de envios compuesta');
              const u = await lectura.ubicaciones(ids);
              return new Map([...u].map(([id, x]) => [id, { latitud: x.latitud, longitud: x.longitud }]));
            },
            publicaciones: (ids) => publicaciones.vigentesDe(ids, new Date()),
          },
        }
      : {}),
    ...(atencion
      ? {
          atencion: {
            vista: (p, operadorId) =>
              atencion.vistaOperador(
                {
                  incidenteId: p.incidenteId,
                  institucion: p.institucion as InstitucionDestino,
                  sedeId: p.sedeId,
                  papel: p.papel as Papel,
                  estado: p.estado as EstadoIncidente,
                  vinculado: p.vinculado,
                },
                operadorId,
              ),
          },
        }
      : {}),
    ambito: {
      async de(usuarioId) {
        const a = await identidad.consultarAmbitoOperador.ejecutar(usuarioId);
        return a
          ? { sedeId: a.sede.id, distritos: a.distritos, categorias: a.categorias, habilitadaAtencion: a.habilitadaAtencion }
          : null;
      },
    },
    participaciones: {
      bandeja: (ambito, despuesDe, limite, filtro) => enrutamiento.bandeja(ambito, despuesDe, limite, filtro),
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
    evaluacion: {
      condiciones: (ids) => lecturaEvaluacion(obtenerReportes).condicionesVigentes(ids),
      detalleSanitario: (incidenteId, usuarioId) => lecturaEvaluacion(obtenerReportes).detalleSanitario(incidenteId, usuarioId),
    },
    evidencias: puertoEvidencias(obtenerReportes),
    identificar: identidad.identificarSolicitante,
    logger,
  };
}

/** Fotos (P5.2) por la fachada de Reportes; sin lectura compuesta, sin fotos. */
function puertoEvidencias(obtenerReportes: () => ModuloReportes) {
  return {
    metadatos: async (ids: readonly string[]) => obtenerReportes().lecturaEvidencias?.metadatos(ids) ?? new Map(),
    contenido: async (incidenteId: string, evidenciaId: string, lector: { readonly usuarioId: string; readonly rol: 'operador' | 'ciudadano' }) =>
      obtenerReportes().lecturaEvidencias?.contenido(incidenteId, evidenciaId, lector) ?? null,
  };
}

function lecturaEvaluacion(obtenerReportes: () => ModuloReportes) {
  const evaluacion = obtenerReportes().evaluacion;
  if (!evaluacion) throw new Error('Reportes sin evaluacion compuesta');
  return evaluacion.lectura;
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
  /** P6 grupo D: asignacion automatica al operador unico de la principal. */
  atencion?: ServicioAtencion,
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
      async condicionBloqueada(tx, incidenteId) {
        const evaluacion = obtenerReportes().evaluacion;
        if (!evaluacion) throw new Error('Reportes sin evaluacion compuesta');
        return evaluacion.lectura.condicionBloqueada(tx, incidenteId);
      },
    },
    sedes: {
      elegibles: (institucion, distritoId, categoriaId) => identidad.sedesEnrutamiento.elegibles(institucion, distritoId, categoriaId),
      designable: (sedeId, institucion) => identidad.sedesEnrutamiento.designable(sedeId, institucion),
    },
    despertarEntregas,
    ...(atencion ? { alCambiarPrincipal: (tx, incidenteId) => atencion.autoAsignarPrincipal(tx, incidenteId) } : {}),
  });
}

/** Ambito vigente del operador para Operaciones (sede habilitada), o null. */
function ambitoOperador(identidad: ModuloIdentidad) {
  return async (usuarioId: string) => {
    const a = await identidad.consultarAmbitoOperador.ejecutar(usuarioId);
    return a && a.habilitadaAtencion ? { sedeId: a.sede.id, distritos: a.distritos, categorias: a.categorias } : null;
  };
}

/**
 * Aclaracion del operador por la fachada de Reportes (P5.1). Traduce sus errores a un resultado para
 * que Operaciones no importe Reportes. La respuesta solo lleva el resumen de heridos.
 */
function aclararComoOperador(obtenerReportes: () => ModuloReportes) {
  return async (
    incidenteId: string,
    autor: { readonly usuarioId: string; readonly institucion: string },
    entrada: unknown,
  ): Promise<ResultadoAclaracionOperador> => {
    const aclarar = obtenerReportes().evaluacion?.aclarar;
    if (!aclarar) throw new Error('Reportes sin aclaraciones compuestas');
    try {
      const r = await aclarar.ejecutar(incidenteId, { origen: 'operador', ...autor }, entrada);
      const i = r.instantanea;
      return {
        tipo: 'ok',
        version: r.version,
        nueva: r.nueva,
        samuIncorporado: r.samuIncorporado,
        condicionMedica: { heridos: i.heridos, atencionMedica: i.atencionMedica, cantidadHeridos: i.cantidadHeridos },
      };
    } catch (e) {
      if (e instanceof ValidacionEvaluacionError) return { tipo: 'validacion', campos: e.campos };
      if (e instanceof EvaluacionNoEncontradaError) return { tipo: 'no_encontrado' };
      if (e instanceof EvaluacionCerradaError) return { tipo: 'cerrado' };
      throw e;
    }
  };
}

/**
 * Publicacion controlada (P7): la instantanea toma categoria, distrito, punto y ocurrencia por la
 * fachada de Reportes; Operaciones guarda solo el centro de la celda. Reportes se resuelve al usarse.
 */
export function publicacionDe(prisma: PrismaClient, obtenerReportes: () => ModuloReportes, ahora?: () => Date) {
  return crearPublicacionConPrisma(
    prisma,
    {
      async de(incidenteId) {
        const lectura = obtenerReportes().lectura;
        if (!lectura) throw new Error('Reportes sin lectura de envios compuesta');
        return (await lectura.ubicaciones([incidenteId])).get(incidenteId) ?? null;
      },
    },
    ahora,
  );
}

/** Mapa publico (P7): instantaneas vigentes de Operaciones y nombres de categorias de Reportes. */
export function opcionesMapaPublico(
  lectura: PrismaPublicacionAdapter,
  obtenerReportes: () => ModuloReportes,
  logger: Logger,
  ahora?: () => Date,
): OpcionesMapaPublico {
  return {
    publicaciones: {
      puntos: (f) => lectura.puntosPublicos(f),
      conteos: (f) => lectura.conteosReservados(f),
    },
    categorias: {
      nombres: async () => new Map((await obtenerReportes().categorias.listar()).map((c) => [c.id, c.nombre])),
    },
    logger,
    ...(ahora ? { ahora } : {}),
  };
}

/** Atencion institucional (P6) con los operadores de la fachada de Identidad. */
export function atencionDe(prisma: PrismaClient, identidad: ModuloIdentidad): ServicioAtencion {
  return crearAtencionConPrisma(prisma, {
    describir: (ids) => identidad.operadoresAtencion.describir(ids),
    deSedes: (sedeIds) => identidad.operadoresAtencion.deSedes(sedeIds),
  });
}

/**
 * Rutas de Operaciones: pendientes del administrador (P4.2), precision de la condicion medica (P5.1)
 * y atencion institucional (P6).
 */
export function routerOperaciones(
  enrutamiento: ServicioEnrutamiento,
  identidad: ModuloIdentidad,
  obtenerReportes: () => ModuloReportes,
  logger: Logger,
  atencion?: ServicioAtencion,
  operacionesIncidentes?: ModuloOperaciones['incidentes'],
  publicacion?: ServicioPublicacion,
) {
  const distritos = new Map(distritosPiloto().map((d) => [d.id, d.nombre]));
  const router = Router();
  if (atencion) {
    router.use(crearRouterAtencion(atencion, enrutamiento, {
      identificar: identidad.identificarSolicitante,
      origenWebPermitido: identidad.origenWebPermitido,
      ambito: ambitoOperador(identidad),
      idPorReferencia: async (texto) => {
        const referencia = normalizarReferencia(texto);
        return referencia ? ((await operacionesIncidentes?.porReferencia(referencia))?.id ?? null) : null;
      },
      ...(publicacion ? { publicacion } : {}),
      logger,
    }));
  }
  router.use(
    crearRouterEvaluacionOperador(enrutamiento, {
      identificar: identidad.identificarSolicitante,
      origenWebPermitido: identidad.origenWebPermitido,
      ambito: ambitoOperador(identidad),
      aclarar: aclararComoOperador(obtenerReportes),
      logger,
    }),
  );
  router.use(crearRouterEnrutamiento(enrutamiento, {
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
  }));
  return router;
}
