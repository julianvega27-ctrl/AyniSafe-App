import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Response } from 'express';
import type { ConsultarTerritorio } from '../aplicacion/territorio.use-case';
import { ErrorTerritorial } from '../dominio/territorio';
import type { LimitadorTerritorial } from '../infraestructura/limitador-territorial';

function error(res: Response, estado: number, code: string, message: string): void {
  res.status(estado).json({ error: { code, message, requestId: randomUUID() } });
}
export function crearRouterTerritorial(consultar: ConsultarTerritorio, limitador: LimitadorTerritorial) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); next(); });
  router.route('/distritos').get(async (req, res) => {
    if (Object.keys(req.query).length) throw new ErrorTerritorial('VALIDATION_ERROR');
    res.json(await consultar.catalogo());
  }).all((_req, res) => { res.set('Allow', 'GET, HEAD'); error(res, 405, 'METHOD_NOT_ALLOWED', 'Este recurso solo admite lectura.'); });
  router.route('/limites').get(async (req, res) => {
    if (Object.keys(req.query).some(k => k !== 'version')) throw new ErrorTerritorial('VALIDATION_ERROR');
    res.json(await consultar.limites(req.query.version));
  }).all((_req, res) => { res.set('Allow', 'GET, HEAD'); error(res, 405, 'METHOD_NOT_ALLOWED', 'Este recurso solo admite lectura.'); });
  router.route('/resolver').post((req, res, next) => {
    const segundos = limitador.consumir(req.ip ?? 'sin-ip');
    if (segundos !== null) { res.set('Retry-After', String(segundos)); error(res, 429, 'RATE_LIMITED', 'Espera antes de volver a consultar.'); return; }
    if (Object.keys(req.query).length) { next(new ErrorTerritorial('VALIDATION_ERROR')); return; }
    if (!req.is('application/json')) { error(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Envía un cuerpo JSON.'); return; }
    next();
  }, express.json({ limit: 4096, strict: false }), async (req, res) => {
    res.json(await consultar.resolver(req.body));
  }).all((_req, res) => { res.set('Allow', 'POST'); error(res, 405, 'METHOD_NOT_ALLOWED', 'Este recurso solo admite POST.'); });
  const manejarError: ErrorRequestHandler = (e: unknown, _req, res, _next) => {
    if (e instanceof ErrorTerritorial) {
      const estado = e.codigo === 'VALIDATION_ERROR' ? 422 : e.codigo === 'TERRITORY_VERSION_NOT_FOUND' ? 404 : 503;
      error(res, estado, e.codigo, estado === 422 ? 'La consulta territorial no es válida.' : estado === 404 ? 'La versión territorial no existe.' : 'La cartografía no está disponible.');
    } else if (typeof e === 'object' && e !== null && 'type' in e && e.type === 'entity.too.large') {
      error(res, 413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera 4 KiB.');
    } else if (typeof e === 'object' && e !== null && 'type' in e && e.type === 'entity.parse.failed') {
      error(res, 400, 'INVALID_JSON', 'El cuerpo JSON no es válido.');
    } else if (typeof e === 'object' && e !== null && 'status' in e && e.status === 415) {
      error(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'El formato del cuerpo no está admitido.');
    } else error(res, 503, 'TERRITORY_UNAVAILABLE', 'La cartografía no está disponible.');
  };
  router.use(manejarError);
  return router;
}
