// Fachada publica del modulo Reportes: catalogo cerrado de categorias (P3.2), ingreso de incidentes
// como invitado o con cuenta (P4.1) y evaluacion rapida para SAMU (P5.1). Los demas modulos llegan
// solo como puertos inyectados.
import { Router } from 'express';
import type { PrismaClient } from '../../generated/prisma/client';
import type { PublicadorEventos } from '../../compartido/eventos/eventos';
import type { Logger } from '../../compartido/logger';
import type { UnidadDeTrabajo } from '../../compartido/transaccion';
import { ConsultarCategorias, type CategoriasRepositorio } from './aplicacion/categorias.use-case';
import type {
  EnviosRepositorio,
  IncidentesPort,
  LimitadorEnviosPort,
  TerritorioPort,
} from './aplicacion/puertos/registro.port';
import type { SecretosPort } from './aplicacion/puertos/secretos.port';
import { RegistrarIncidenteUseCase } from './aplicacion/registrar-incidente.use-case';
import { LecturaEnvios, type EnviosLecturaRepositorio } from './aplicacion/lectura-envios';
import { HmacSecretosAdapter } from './infraestructura/hmac-secretos.adapter';
import { PrismaCategoriasAdapter } from './infraestructura/prisma-categorias.adapter';
import { PrismaEnviosAdapter } from './infraestructura/prisma-envios.adapter';
import { PrismaEvaluacionesAdapter } from './infraestructura/prisma-evaluaciones.adapter';
import { PrismaEvidenciasAdapter } from './infraestructura/prisma-evidencias.adapter';
import type { AlmacenEvidenciasPort, EvidenciasRepositorio, ProcesadorImagenPort } from './aplicacion/puertos/evidencias.port';
import { AdjuntarEvidenciaUseCase } from './aplicacion/adjuntar-evidencia.use-case';
import { crearRouterEvidencias } from './presentacion/evidencias.routes';
import { LimpiezaEvidencias } from './aplicacion/limpieza-evidencias';
import { LecturaEvidencias } from './aplicacion/lectura-evidencias';
export {
  EntregaEvidenciaNoDisponibleError,
  LecturaEvidencias,
  type MetadatosEvidencia,
} from './aplicacion/lectura-evidencias';
export { LimpiezaEvidencias, programarLimpieza, type ResultadoLimpieza } from './aplicacion/limpieza-evidencias';
import { SharpProcesadorAdapter } from './infraestructura/sharp-procesador.adapter';
import { CloudinaryEvidenciasAdapter } from './infraestructura/cloudinary-evidencias.adapter';
import { MemoriaEvidenciasAdapter } from './infraestructura/memoria-evidencias.adapter';
import type { CuotaLocal } from './dominio/evidencia';
import { createHash, randomUUID } from 'node:crypto';
import type { CondicionMedicaPort, EvaluacionesRepositorio } from './aplicacion/puertos/evaluacion.port';
import { AclararEvaluacion } from './aplicacion/aclarar-evaluacion.use-case';
import { LecturaEvaluacion } from './aplicacion/lectura-evaluacion';
import { crearRouterCategorias } from './presentacion/categorias.routes';
import { crearRouterEvaluacionCiudadana } from './presentacion/evaluacion.routes';
import { crearRouterIncidentes, type IdentificarSolicitante } from './presentacion/incidentes.routes';

export { ConsultarCategorias, type CategoriasRepositorio } from './aplicacion/categorias.use-case';
export { CATEGORIAS_PILOTO, type Categoria } from './dominio/categorias';
export type {
  EnviosRepositorio,
  IncidentesPort,
  LimitadorEnviosPort,
  TerritorioEnvio,
  TerritorioPort,
} from './aplicacion/puertos/registro.port';
export type { SecretosPort } from './aplicacion/puertos/secretos.port';
export type {
  CursorHistorial,
  DatosEnrutamientoEnvio,
  EnvioDetalleAutor,
  EnvioResumenOperativo,
  EnvioInvitadoVerificado,
  EnvioResumen,
  LecturaEnvios,
} from './aplicacion/lectura-envios';
export type { IdentificarSolicitante, SolicitanteHttp } from './presentacion/incidentes.routes';
export {
  AclaracionNoDisponibleError,
  AclararEvaluacion,
  EvaluacionCerradaError,
  EvaluacionNoEncontradaError,
  type AutorAclaracionCompleto,
  type ResultadoAclaracion,
} from './aplicacion/aclarar-evaluacion.use-case';
export {
  LecturaEvaluacion,
  type CondicionMedicaVigente,
  type DetalleSanitario,
  type RespuestasEvaluacion,
  type VistaEvaluacionAutor,
} from './aplicacion/lectura-evaluacion';
export type { CondicionMedicaPort } from './aplicacion/puertos/evaluacion.port';
export { ValidacionEvaluacionError } from './dominio/evaluacion';

/** Dependencias externas del registro: fachadas de otros modulos y componentes compartidos. */
export interface DependenciasRegistroIncidentes {
  readonly incidentes: IncidentesPort;
  readonly territorio: TerritorioPort;
  readonly limitador: LimitadorEnviosPort;
  readonly identificarSolicitante: IdentificarSolicitante;
  readonly eventos: PublicadorEventos;
  readonly unidadDeTrabajo: UnidadDeTrabajo;
  readonly despertarEntregas: () => void;
  readonly logger: Logger;
  readonly ahora?: () => Date;
  readonly limiteInvitado?: { readonly maximo: number; readonly ventanaMs: number };
  /** Recalculo del enrutamiento por la condicion medica (Operaciones, P5.1). Sin el, no hay aclaraciones. */
  readonly condicionMedica?: CondicionMedicaPort;
  /** Identificador del incidente por su referencia escrita (Operaciones, P5.1). */
  readonly idPorReferencia?: (texto: string) => Promise<string | null>;
  /** Evidencias fotograficas (P5.2). Sin esto no hay ruta de carga. `almacen` null = deshabilitado. */
  readonly evidencias?: {
    readonly almacen: AlmacenEvidenciasPort | null;
    readonly cuota: CuotaLocal;
    readonly procesador?: ProcesadorImagenPort;
    readonly limiteInvitado?: { readonly maximo: number; readonly ventanaMs: number };
  };
}

/** Almacen segun la configuracion (P5.2). Las credenciales solo pasan al adaptador. */
export function crearAlmacenEvidencias(config: {
  readonly adaptador: 'cloudinary' | 'deshabilitado' | 'memoria';
  readonly cloudinary?: { readonly cloudName: string; readonly apiKey: string; readonly apiSecret: string };
}): AlmacenEvidenciasPort | null {
  if (config.adaptador === 'memoria') return new MemoriaEvidenciasAdapter();
  if (config.adaptador === 'cloudinary' && config.cloudinary) return new CloudinaryEvidenciasAdapter(config.cloudinary);
  return null;
}

export interface ModuloReportes {
  readonly router: Router;
  readonly categorias: ConsultarCategorias;
  /** Presente cuando se compone el registro de incidentes. */
  readonly registrar?: RegistrarIncidenteUseCase;
  /** Lecturas para el seguimiento ciudadano (Consultas), presentes con el registro. */
  readonly lectura?: LecturaEnvios;
  /** Evaluacion rapida (P5.1): aclaraciones y lecturas autorizadas por quien las compone. */
  readonly evaluacion?: { readonly aclarar: AclararEvaluacion | null; readonly lectura: LecturaEvaluacion };
  /** Limpieza persistente de evidencias (P5.2); quien compone decide cuando ejecutarla. */
  readonly limpiezaEvidencias?: LimpiezaEvidencias;
  /** Lecturas de fotos para Consultas, que autoriza antes de llamar (P5.2). */
  readonly lecturaEvidencias?: LecturaEvidencias;
}

export function crearModuloReportes(
  repositorio: CategoriasRepositorio,
  registro?: DependenciasRegistroIncidentes & {
    readonly envios: EnviosRepositorio & EnviosLecturaRepositorio;
    readonly evaluaciones: EvaluacionesRepositorio;
    readonly secretos: SecretosPort;
    readonly permisos: EvidenciasRepositorio;
  },
): ModuloReportes {
  const categorias = new ConsultarCategorias(repositorio);
  const router = Router();
  router.use('/publico/categorias', crearRouterCategorias(categorias));
  if (!registro) return { router, categorias };
  const registrar = new RegistrarIncidenteUseCase({
    categorias,
    envios: registro.envios,
    evaluaciones: registro.evaluaciones,
    incidentes: registro.incidentes,
    territorio: registro.territorio,
    limitador: registro.limitador,
    secretos: registro.secretos,
    permisos: registro.permisos,
    eventos: registro.eventos,
    unidadDeTrabajo: registro.unidadDeTrabajo,
    ahora: registro.ahora ?? (() => new Date()),
    despertarEntregas: registro.despertarEntregas,
    ...(registro.limiteInvitado ? { limiteInvitado: registro.limiteInvitado } : {}),
  });
  router.use(crearRouterIncidentes(registrar, registro.identificarSolicitante, registro.logger));
  let limpiezaEvidencias: LimpiezaEvidencias | undefined;
  let lecturaEvidencias: LecturaEvidencias | undefined;
  if (registro.evidencias && registro.idPorReferencia) {
    const adjuntar = new AdjuntarEvidenciaUseCase({
      evidencias: registro.permisos,
      almacen: registro.evidencias.almacen,
      procesador: registro.evidencias.procesador ?? new SharpProcesadorAdapter(),
      incidentes: registro.incidentes,
      idPorReferencia: registro.idPorReferencia,
      secretos: registro.secretos,
      limitador: registro.limitador,
      unidadDeTrabajo: registro.unidadDeTrabajo,
      cuota: registro.evidencias.cuota,
      ahora: registro.ahora ?? (() => new Date()),
      nuevoId: () => randomUUID(),
      sha256: (b) => createHash('sha256').update(b).digest('hex'),
      ...(registro.evidencias.limiteInvitado ? { limiteInvitado: registro.evidencias.limiteInvitado } : {}),
    });
    router.use(crearRouterEvidencias(adjuntar, registro.identificarSolicitante, registro.logger));
    lecturaEvidencias = new LecturaEvidencias(registro.permisos, registro.evidencias.almacen, registro.ahora ?? (() => new Date()));
    limpiezaEvidencias = new LimpiezaEvidencias({
      evidencias: registro.permisos,
      almacen: registro.evidencias.almacen,
      ahora: registro.ahora ?? (() => new Date()),
    });
  }
  const lecturaEnvios = new LecturaEnvios(registro.envios, registro.secretos);
  const lecturaEvaluacion = new LecturaEvaluacion(registro.evaluaciones, registro.unidadDeTrabajo);
  const aclarar = registro.condicionMedica
    ? new AclararEvaluacion({
        evaluaciones: registro.evaluaciones,
        incidentes: registro.incidentes,
        condicion: registro.condicionMedica,
        eventos: registro.eventos,
        unidadDeTrabajo: registro.unidadDeTrabajo,
        despertarEntregas: registro.despertarEntregas,
      })
    : null;
  if (aclarar && registro.idPorReferencia) {
    router.use(
      crearRouterEvaluacionCiudadana({
        aclarar,
        lectura: lecturaEvaluacion,
        identificar: registro.identificarSolicitante,
        idPorReferencia: registro.idPorReferencia,
        esDelAutor: async (usuarioId, incidenteId) => (await lecturaEnvios.detalleDeAutor(usuarioId, incidenteId)) !== null,
        logger: registro.logger,
      }),
    );
  }
  return {
    router,
    categorias,
    registrar,
    lectura: lecturaEnvios,
    evaluacion: { aclarar, lectura: lecturaEvaluacion },
    ...(limpiezaEvidencias ? { limpiezaEvidencias } : {}),
    ...(lecturaEvidencias ? { lecturaEvidencias } : {}),
  };
}

/**
 * Composicion con Prisma. Sin `registro` solo expone el catalogo (CLI y pruebas de P3.2).
 * `secretoSeguimiento` es TRACKING_CODE_HMAC_SECRET.
 */
export function crearModuloReportesConPrisma(
  prisma: PrismaClient,
  registro?: DependenciasRegistroIncidentes & { readonly secretoSeguimiento: string },
): ModuloReportes {
  const repositorio = new PrismaCategoriasAdapter(prisma);
  if (!registro) return crearModuloReportes(repositorio);
  return crearModuloReportes(repositorio, {
    ...registro,
    envios: new PrismaEnviosAdapter(prisma),
    evaluaciones: new PrismaEvaluacionesAdapter(prisma),
    secretos: new HmacSecretosAdapter(registro.secretoSeguimiento),
    permisos: new PrismaEvidenciasAdapter(prisma),
  });
}
