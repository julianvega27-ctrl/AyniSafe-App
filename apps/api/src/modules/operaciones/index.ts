// Fachada publica del modulo Operaciones: incidente unico (P4.1) y enrutamiento con participaciones
// por sede (P4.2); atencion institucional con asignaciones, transiciones e historial (P6).
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client';
import { ServicioIncidentes, type FuenteAleatoria, type IncidentesRepositorio } from './aplicacion/incidentes';
import { PrismaIncidentesAdapter } from './infraestructura/prisma-incidentes.adapter';
import { PrismaEnrutamientosAdapter } from './infraestructura/prisma-enrutamientos.adapter';
import {
  ServicioEnrutamiento,
  type DatosEnrutamientoPort,
  type SedesEnrutamientoPort,
} from './aplicacion/enrutamiento';
import { PrismaPublicadorEventos } from '../../compartido/eventos/prisma-eventos';
import { PrismaUnidadDeTrabajo } from '../../compartido/prisma-transaccion';
import { ServicioAtencion, type OperadoresPort } from './aplicacion/atencion';
import { PrismaAtencionAdapter } from './infraestructura/prisma-atencion.adapter';

export { ServicioIncidentes, type IncidentesRepositorio, type FuenteAleatoria } from './aplicacion/incidentes';
export {
  ESTADOS_INCIDENTE,
  FORMATO_REFERENCIA,
  normalizarReferencia,
  ReferenciaNoDisponibleError,
  type EstadoIncidente,
  type Incidente,
} from './dominio/incidente';

export {
  CATEGORIAS_CON_REGLA,
  CategoriaSinReglaError,
  INSTITUCIONES_DESTINO,
  PAPELES,
  VERSION_MATRIZ,
  deduplicar,
  faltantesDesdeJson,
  planificar,
  planificarCondicionMedica,
  resolverDestinatarios,
  resultadoDe,
  type Destinatario,
  type Faltante,
  type InstitucionDestino,
  type Papel,
  type PlanCondicionMedica,
  type PlanEnrutamiento,
  type RespuestaMedica,
  type ResultadoEnrutamiento,
} from './dominio/matriz';

export {
  CONSUMIDOR_ENRUTAMIENTO,
  ConflictoEnrutamientoError,
  DesignacionInvalidaError,
  EVENTO_ENRUTAMIENTO_RESUELTO,
  EnrutamientoNoEncontradoError,
  IncidenteSinOriginalesError,
  ServicioEnrutamiento,
  validarDesignacion,
  type AmbitoBandeja,
  type DatosEnrutamientoPort,
  type DependenciasEnrutamiento,
  type FilaBandeja,
  type ParticipacionVisible,
  type EnrutamientoGuardado,
  type EnrutamientosRepositorio,
  type PendienteFila,
  type SedesEnrutamientoPort,
} from './aplicacion/enrutamiento';

export {
  crearRouterEnrutamiento,
  type IdentificarAdministrador,
  type OpcionesRutasEnrutamiento,
  type VistaPendientesPort,
} from './presentacion/enrutamiento.routes';
export {
  crearRouterEvaluacionOperador,
  type OpcionesRutaEvaluacionOperador,
  type ResultadoAclaracionOperador,
} from './presentacion/evaluacion-operador.routes';

export {
  LIMITE_ASIGNACIONES,
  ServicioAtencion,
  type Asignacion,
  type AtencionRepositorio,
  type CierreCiudadano,
  type Hito,
  type OperadorAtencion,
  type OperadoresPort,
} from './aplicacion/atencion';
export {
  accionesPermitidas,
  RESULTADOS,
  VERIFICACIONES,
  type Accion,
  type Resultado,
  type Verificacion,
} from './dominio/atencion';
export { crearRouterAtencion, type OpcionesRutasAtencion } from './presentacion/atencion.routes';

/** Atencion institucional sobre PostgreSQL (P6). Los operadores llegan por la fachada de Identidad. */
export function crearAtencionConPrisma(prisma: PrismaClient, operadores: OperadoresPort): ServicioAtencion {
  return new ServicioAtencion({
    repositorio: new PrismaAtencionAdapter(prisma),
    operadores,
    unidadDeTrabajo: new PrismaUnidadDeTrabajo(prisma),
  });
}

export interface ModuloOperaciones {
  readonly incidentes: ServicioIncidentes;
}

export function crearModuloOperaciones(
  repositorio: IncidentesRepositorio,
  aleatorio: FuenteAleatoria = (n) => randomBytes(n),
): ModuloOperaciones {
  return { incidentes: new ServicioIncidentes(repositorio, aleatorio) };
}

export function crearModuloOperacionesConPrisma(prisma: PrismaClient, aleatorio?: FuenteAleatoria): ModuloOperaciones {
  return crearModuloOperaciones(new PrismaIncidentesAdapter(prisma), aleatorio);
}

/** Enrutamiento sobre PostgreSQL (P4.2). Los puertos los cablea la composicion con las fachadas de Reportes e Identidad. */
export function crearEnrutamientoConPrisma(
  prisma: PrismaClient,
  puertos: {
    readonly datos: DatosEnrutamientoPort;
    readonly sedes: SedesEnrutamientoPort;
    readonly despertarEntregas?: () => void;
  },
): ServicioEnrutamiento {
  return new ServicioEnrutamiento({
    repositorio: new PrismaEnrutamientosAdapter(prisma),
    datos: puertos.datos,
    sedes: puertos.sedes,
    unidadDeTrabajo: new PrismaUnidadDeTrabajo(prisma),
    eventos: new PrismaPublicadorEventos(),
    ...(puertos.despertarEntregas ? { despertarEntregas: puertos.despertarEntregas } : {}),
  });
}
