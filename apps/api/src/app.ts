import express, { type Express } from 'express';
import type { ModuloIdentidad } from './modules/identidad';

export interface OpcionesApp {
  /** Saltos de proxy de confianza para obtener la IP real del cliente (0 = sin proxy). */
  readonly saltosProxyConfianza: number;
  readonly identidad: ModuloIdentidad;
}

/** Composicion general del backend. */
export function crearApp(opciones: OpcionesApp): Express {
  const app = express();
  app.disable('x-powered-by');
  // Se confia solo en el numero de saltos configurado, nunca en un X-Forwarded-For arbitrario.
  app.set('trust proxy', opciones.saltosProxyConfianza);
  app.use('/api/v1', opciones.identidad.router);
  return app;
}
