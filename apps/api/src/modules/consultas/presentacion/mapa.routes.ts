import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Response } from 'express';
import type { Logger } from '../../../compartido/logger';
import { FiltroMapaInvalidoError, type MapaPublico } from '../aplicacion/mapa.use-case';

/** Vigencia de cache publica breve: un retiro puede verse hasta 30 s en un navegador (design.md, decision 7). */
const CACHE_MAPA = 'public, max-age=30';

function error(res: Response, estado: number, code: string, message: string, extra: Record<string, unknown> = {}): void {
  res.status(estado).set('Cache-Control', 'no-store').json({ error: { code, message, ...extra, requestId: randomUUID() } });
}

/** Mapa publico sin sesion (P7): solo lectura, filtros validados y 503 sin datos parciales. */
export function crearRouterMapaPublico(mapa: MapaPublico, logger: Logger) {
  const router = express.Router();
  router
    .route('/publico/mapa')
    .get(async (req, res) => {
      const r = await mapa.consultar(req.query as Record<string, unknown>);
      res.status(200).set({ 'Cache-Control': CACHE_MAPA, 'X-Content-Type-Options': 'nosniff' }).json(r);
    })
    .all((_req, res) => {
      res.set('Allow', 'GET, HEAD');
      error(res, 405, 'METHOD_NOT_ALLOWED', 'Este recurso solo admite lectura.');
    });
  const manejarError: ErrorRequestHandler = (e: unknown, _req, res, next) => {
    if (res.headersSent) return next(e);
    if (e instanceof FiltroMapaInvalidoError) return error(res, 422, 'VALIDATION_ERROR', 'Revisa los filtros del mapa.', { fields: e.campos });
    logger.registrar({ evento: 'error_interno', resultado: 'mapa_publico', error: e instanceof Error ? e.name : 'desconocido' });
    return error(res, 503, 'MAPA_NO_DISPONIBLE', 'El mapa no está disponible. Inténtalo de nuevo.');
  };
  router.use('/publico/mapa', manejarError);
  return router;
}
