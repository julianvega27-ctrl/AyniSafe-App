import { randomUUID } from 'node:crypto';
import { Router, type ErrorRequestHandler, type Response } from 'express';
import type { ConsultarCategorias } from '../aplicacion/categorias.use-case';

function error(res: Response, estado: number, code: string, message: string): void {
  res.status(estado).json({ error: { code, message, requestId: randomUUID() } });
}

/**
 * Catalogo publico de categorias: mismo cuerpo con o sin sesion, sin reglas de enrutamiento ni
 * prioridades. `no-store` para que una desactivacion futura no quede en caches intermedias.
 */
export function crearRouterCategorias(consultar: ConsultarCategorias): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });
  router
    .route('/')
    .get(async (req, res) => {
      if (Object.keys(req.query).length > 0) {
        error(res, 400, 'VALIDATION_ERROR', 'Este recurso no admite parámetros.');
        return;
      }
      res.status(200).json({ categorias: await consultar.listar() });
    })
    .all((_req, res) => {
      res.set('Allow', 'GET, HEAD');
      error(res, 405, 'METHOD_NOT_ALLOWED', 'Este recurso solo admite lectura.');
    });
  const manejarError: ErrorRequestHandler = (_e: unknown, _req, res, _next) => {
    error(res, 503, 'SERVICE_UNAVAILABLE', 'El catálogo de categorías no está disponible.');
  };
  router.use(manejarError);
  return router;
}
