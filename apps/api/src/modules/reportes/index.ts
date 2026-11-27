// Fachada publica del modulo Reportes: catalogo cerrado de categorias (P3.2) e ingreso de incidentes
// como invitado o con cuenta (P4.1). Los demas modulos llegan solo como puertos inyectados.
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
import { crearRouterCategorias } from './presentacion/categorias.routes';
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
}

export interface ModuloReportes {
  readonly router: Router;
  readonly categorias: ConsultarCategorias;
  /** Presente cuando se compone el registro de incidentes. */
  readonly registrar?: RegistrarIncidenteUseCase;
  /** Lecturas para el seguimiento ciudadano (Consultas), presentes con el registro. */
  readonly lectura?: LecturaEnvios;
}

export function crearModuloReportes(
  repositorio: CategoriasRepositorio,
  registro?: DependenciasRegistroIncidentes & {
    readonly envios: EnviosRepositorio & EnviosLecturaRepositorio;
    readonly secretos: SecretosPort;
  },
): ModuloReportes {
  const categorias = new ConsultarCategorias(repositorio);
  const router = Router();
  router.use('/publico/categorias', crearRouterCategorias(categorias));
  if (!registro) return { router, categorias };
  const registrar = new RegistrarIncidenteUseCase({
    categorias,
    envios: registro.envios,
    incidentes: registro.incidentes,
    territorio: registro.territorio,
    limitador: registro.limitador,
    secretos: registro.secretos,
    eventos: registro.eventos,
    unidadDeTrabajo: registro.unidadDeTrabajo,
    ahora: registro.ahora ?? (() => new Date()),
    despertarEntregas: registro.despertarEntregas,
    ...(registro.limiteInvitado ? { limiteInvitado: registro.limiteInvitado } : {}),
  });
  router.use(crearRouterIncidentes(registrar, registro.identificarSolicitante, registro.logger));
  return { router, categorias, registrar, lectura: new LecturaEnvios(registro.envios, registro.secretos) };
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
    secretos: new HmacSecretosAdapter(registro.secretoSeguimiento),
  });
}
