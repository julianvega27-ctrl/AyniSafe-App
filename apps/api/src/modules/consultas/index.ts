// Fachada publica del modulo Consultas (contenido publico). Sin dependencia del modulo Identidad.
import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import fuente from './contenido/contenido-publico.json';
import { exigirContenidoValido, type ContenidoPublico } from './dominio/contenido';
import { DISTRITOS_PILOTO } from './dominio/territorio';
import { ConsultarTerritorio, type TerritorioRepositorio } from './aplicacion/territorio.use-case';
import { PrismaTerritorioAdapter } from './infraestructura/prisma-territorio.adapter';
import type { PrismaClient } from '../../generated/prisma/client';
import { LimitadorTerritorial } from './infraestructura/limitador-territorial';
import { crearRouterTerritorial } from './presentacion/territorio.routes';
import { SeguimientoCiudadano, type DependenciasSeguimiento } from './aplicacion/seguimiento.use-case';
import { crearRouterSeguimiento, type IdentificarConsultante } from './presentacion/seguimiento.routes';
import type { Logger } from '../../compartido/logger';

export type { TerritorioRepositorio } from './aplicacion/territorio.use-case';
export type { SnapshotTerritorial, ResultadoTerritorial, Distrito } from './dominio/territorio';
export { ConsultarTerritorio } from './aplicacion/territorio.use-case';
export {
  SeguimientoCiudadano,
  type CategoriasSeguimientoPort,
  type DependenciasSeguimiento,
  type EnviosSeguimientoPort,
  type IncidentesSeguimientoPort,
  type LimitadorSeguimientoPort,
} from './aplicacion/seguimiento.use-case';
export type { IdentificarConsultante } from './presentacion/seguimiento.routes';

/** Seguimiento ciudadano (P4.1): puertos hacia Reportes, Operaciones e Identidad. */
export interface OpcionesSeguimiento extends DependenciasSeguimiento {
  readonly identificar: IdentificarConsultante;
  readonly logger: Logger;
}

/** Identificadores estables del catalogo distrital (DIS-01..05), con o sin cartografia activa. */
export function idsDistritosPiloto(): ReadonlySet<string> {
  return new Set(DISTRITOS_PILOTO.map((d) => d.id));
}

/** Identificadores y nombres visibles del catalogo distrital (sin geometrias). */
export function distritosPiloto(): readonly { readonly id: string; readonly nombre: string }[] {
  return DISTRITOS_PILOTO;
}

export interface OpcionesTerritorio {
  readonly repositorio: TerritorioRepositorio;
  readonly secretoLimitador: string;
  readonly ahora?: () => number;
  readonly seguimiento?: OpcionesSeguimiento;
}

export type { ContenidoPublico } from './dominio/contenido';

export interface ModuloConsultas {
  readonly router: Router;
  readonly contenido: ContenidoPublico;
  readonly territorio: ConsultarTerritorio;
  readonly seguimiento?: SeguimientoCiudadano;
}

/** Cache publica breve: es contenido sin datos personales y distinto del `no-store` de autenticacion. */
const CACHE_CONTENIDO = 'public, max-age=300';

/**
 * Valida la fuente al componer el modulo: si no cumple el esquema, el arranque falla.
 * La fuente puede inyectarse (pruebas); por defecto es el archivo versionado del repositorio.
 */
export function crearModuloConsultas(entrada: unknown = fuente, opciones?: OpcionesTerritorio): ModuloConsultas {
  const contenido = exigirContenidoValido(entrada);
  const router = Router();
  router
    .route('/publico/contenido')
    .get((_req, res) => {
      res.status(200).set({ 'Cache-Control': CACHE_CONTENIDO, 'X-Content-Type-Options': 'nosniff' }).json(contenido);
    })
    .all((_req, res) => {
      res
        .status(405)
        .set({ Allow: 'GET, HEAD', 'Cache-Control': 'no-store' })
        .json({
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Este recurso solo admite lectura.', requestId: randomUUID() },
        });
    });
  const territorio = new ConsultarTerritorio(opciones?.repositorio ?? { leer: async () => null });
  router.use('/publico/territorio', crearRouterTerritorial(territorio,
    new LimitadorTerritorial(opciones?.secretoLimitador ?? randomBytes(32).toString('hex'), opciones?.ahora)));
  if (!opciones?.seguimiento) return { router, contenido, territorio };
  const seguimiento = new SeguimientoCiudadano(opciones.seguimiento);
  router.use(crearRouterSeguimiento(seguimiento, opciones.seguimiento.identificar, opciones.seguimiento.logger));
  return { router, contenido, territorio, seguimiento };
}

export function crearModuloConsultasConPrisma(
  prisma: PrismaClient,
  secretoLimitador: string,
  seguimiento?: OpcionesSeguimiento,
): ModuloConsultas {
  return crearModuloConsultas(fuente, {
    repositorio: new PrismaTerritorioAdapter(prisma),
    secretoLimitador,
    ...(seguimiento ? { seguimiento } : {}),
  });
}
