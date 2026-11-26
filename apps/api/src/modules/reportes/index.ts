// Fachada publica del modulo Reportes. En P3.2 solo contiene el catalogo cerrado de categorias;
// el ingreso de incidentes se incorpora en P4. Sin dependencia de otros modulos.
import { Router } from 'express';
import type { PrismaClient } from '../../generated/prisma/client';
import { ConsultarCategorias, type CategoriasRepositorio } from './aplicacion/categorias.use-case';
import { PrismaCategoriasAdapter } from './infraestructura/prisma-categorias.adapter';
import { crearRouterCategorias } from './presentacion/categorias.routes';

export { ConsultarCategorias, type CategoriasRepositorio } from './aplicacion/categorias.use-case';
export { CATEGORIAS_PILOTO, type Categoria } from './dominio/categorias';

export interface ModuloReportes {
  readonly router: Router;
  readonly categorias: ConsultarCategorias;
}

export function crearModuloReportes(repositorio: CategoriasRepositorio): ModuloReportes {
  const categorias = new ConsultarCategorias(repositorio);
  const router = Router();
  router.use('/publico/categorias', crearRouterCategorias(categorias));
  return { router, categorias };
}

export function crearModuloReportesConPrisma(prisma: PrismaClient): ModuloReportes {
  return crearModuloReportes(new PrismaCategoriasAdapter(prisma));
}
