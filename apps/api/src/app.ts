import express, { type Express, type Router } from 'express';
import type { ModuloConsultas } from './modules/consultas';
import type { ModuloIdentidad } from './modules/identidad';
import type { ModuloReportes } from './modules/reportes';

export interface OpcionesApp {
  /** Saltos de proxy de confianza para obtener la IP real del cliente (0 = sin proxy). */
  readonly saltosProxyConfianza: number;
  readonly identidad: ModuloIdentidad;
  readonly consultas: ModuloConsultas;
  readonly reportes: ModuloReportes;
  /** Rutas de Operaciones (P4.2: enrutamientos pendientes del administrador). */
  readonly operaciones?: Router;
}

/** Composicion general del backend. */
export function crearApp(opciones: OpcionesApp): Express {
  const app = express();
  app.disable('x-powered-by');
  // Se confia solo en el numero de saltos configurado, nunca en un X-Forwarded-For arbitrario.
  app.set('trust proxy', opciones.saltosProxyConfianza);
  app.use('/api/v1', opciones.identidad.router);
  // Contenido publico (sin sesion). Se monta tras Identidad: sus rutas no se solapan.
  app.use('/api/v1', opciones.consultas.router);
  // Catalogo publico de categorias (Reportes).
  app.use('/api/v1', opciones.reportes.router);
  if (opciones.operaciones) app.use('/api/v1', opciones.operaciones);
  // Paginas de respaldo del enlace del correo y assetlinks.json (fuera de /api/v1).
  app.use(opciones.identidad.routerPublico);
  return app;
}
