// Fachada publica del modulo Operaciones. En P4.1 solo contiene el incidente unico y su estado
// inicial; las transiciones, la participacion institucional y la asignacion llegan en P4.2/P6.
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client';
import { ServicioIncidentes, type FuenteAleatoria, type IncidentesRepositorio } from './aplicacion/incidentes';
import { PrismaIncidentesAdapter } from './infraestructura/prisma-incidentes.adapter';

export { ServicioIncidentes, type IncidentesRepositorio, type FuenteAleatoria } from './aplicacion/incidentes';
export {
  ESTADOS_INCIDENTE,
  FORMATO_REFERENCIA,
  normalizarReferencia,
  ReferenciaNoDisponibleError,
  type EstadoIncidente,
  type Incidente,
} from './dominio/incidente';

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
