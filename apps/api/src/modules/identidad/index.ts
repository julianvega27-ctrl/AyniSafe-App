// Contratos y fachada publicos del modulo Identidad.
export {
  crearModuloIdentidad,
  crearModuloIdentidadConPrisma,
  type CatalogosExternos,
  type DependenciasIdentidad,
  type ModuloIdentidad,
} from './identidad.module';
export type { CatalogoIdsPort } from './aplicacion/puertos/organizacion.port';
export type { ConsultarAmbitoOperadorUseCase } from './aplicacion/organizacion.use-case';
export type { AmbitoOperador } from './dominio/organizacion';
