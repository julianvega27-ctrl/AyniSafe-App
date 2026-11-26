import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import type { Logger } from '../../../compartido/logger';
import {
  ConsultaSeguimientoInvalidaError,
  LimiteSeguimientoError,
  SeguimientoNoDisponibleError,
  SeguimientoNoEncontradoError,
  type SeguimientoCiudadano,
} from '../aplicacion/seguimiento.use-case';

/** Quien consulta, segun Identidad (fachada inyectada en la composicion). */
export type IdentificarConsultante = (cabeceras: { readonly authorization?: string; readonly cookie?: string }) => Promise<
  | { readonly tipo: 'anonimo' }
  | { readonly tipo: 'ciudadano'; readonly usuarioId: string }
  | { readonly tipo: 'institucional' }
  | { readonly tipo: 'invalido' }
>;

function requestId(res: Response): string {
  const actual = res.locals.requestId;
  if (typeof actual === 'string') return actual;
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  return id;
}

function responderError(res: Response, estado: number, code: string, message: string, fields?: Record<string, string>): void {
  res.status(estado).json({ error: { code, message, ...(fields ? { fields } : {}), requestId: requestId(res) } });
}

const SOLO_LECTURA = (allow: string) => (_req: Request, res: Response) => {
  res.set('Allow', allow);
  responderError(res, 405, 'METHOD_NOT_ALLOWED', `Este recurso solo admite ${allow}.`);
};

/**
 * Seguimiento ciudadano: historial y detalle del autor con Bearer, y vista limitada del invitado con
 * referencia y codigo en el cuerpo. Todas las respuestas no-store; nunca se registran codigos ni cuerpos.
 */
export function crearRouterSeguimiento(seguimiento: SeguimientoCiudadano, identificar: IdentificarConsultante, logger: Logger) {
  const router = express.Router();

  const autor = async (req: Request, res: Response): Promise<string | null> => {
    const quien = await identificar({
      ...(req.get('authorization') !== undefined ? { authorization: req.get('authorization')! } : {}),
      ...(req.get('cookie') !== undefined ? { cookie: req.get('cookie')! } : {}),
    });
    if (quien.tipo === 'ciudadano') return quien.usuarioId;
    if (quien.tipo === 'institucional') responderError(res, 403, 'FORBIDDEN', 'Solo el ciudadano autor consulta su historial.');
    else responderError(res, 401, 'UNAUTHENTICATED', 'Tu sesión no es válida. Inicia sesión de nuevo.');
    return null;
  };

  const sinCache = (_req: Request, res: Response, next: () => void) => {
    requestId(res);
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  };

  router
    .route('/ciudadano/incidentes')
    .get(sinCache, async (req, res) => {
      if (Object.keys(req.query).some((k) => k !== 'cursor') || Array.isArray(req.query.cursor)) throw new ConsultaSeguimientoInvalidaError();
      const usuarioId = await autor(req, res);
      if (!usuarioId) return;
      res.json(await seguimiento.historial(usuarioId, req.query.cursor));
    })
    .all(sinCache, SOLO_LECTURA('GET'));

  router
    .route('/ciudadano/incidentes/:referencia')
    .get(sinCache, async (req, res) => {
      if (Object.keys(req.query).length) throw new ConsultaSeguimientoInvalidaError();
      const usuarioId = await autor(req, res);
      if (!usuarioId) return;
      res.json(await seguimiento.detalleDeAutor(usuarioId, String(req.params.referencia)));
    })
    .all(sinCache, SOLO_LECTURA('GET'));

  router
    .route('/publico/seguimiento')
    .post(
      sinCache,
      (req, res, next) => {
        // La referencia y el codigo nunca viajan en la URL: con query se rechaza sin consultar.
        if (Object.keys(req.query).length) {
          responderError(res, 400, 'VALIDATION_ERROR', 'Envía la referencia y el código en el cuerpo, no en la dirección.');
          return;
        }
        const charset = /charset=("?)([^";\s]+)\1/i.exec(req.get('content-type') ?? '')?.[2]?.toLowerCase();
        if (!req.is('application/json') || (charset !== undefined && charset !== 'utf-8')) {
          responderError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'El contenido debe enviarse como application/json en UTF-8.');
          return;
        }
        next();
      },
      express.json({ limit: '2kb', type: 'application/json', strict: false }),
      async (req, res) => {
        res.json(await seguimiento.vistaInvitado(req.body, req.ip ?? 'sin-ip'));
      },
    )
    .all(sinCache, SOLO_LECTURA('POST'));

  const manejarError: ErrorRequestHandler = (e: unknown, _req, res, _next) => {
    res.set({ 'Cache-Control': 'no-store' });
    if (e instanceof ConsultaSeguimientoInvalidaError) return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos de la consulta.');
    if (e instanceof SeguimientoNoEncontradoError) return responderError(res, 404, 'TRACKING_NOT_FOUND', 'Referencia o código incorrectos.');
    if (e instanceof LimiteSeguimientoError) {
      res.set('Retry-After', String(e.reintentarEnSegundos));
      return responderError(res, 429, 'RATE_LIMITED', 'Demasiadas consultas. Espera antes de volver a intentar.');
    }
    const lectura = e as { type?: string } | null;
    if (lectura?.type === 'entity.too.large') return responderError(res, 413, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande.');
    if (lectura?.type === 'entity.parse.failed' || lectura?.type === 'request.aborted') {
      return responderError(res, 400, 'VALIDATION_ERROR', 'El cuerpo de la solicitud no es un JSON válido.');
    }
    const causa = e instanceof SeguimientoNoDisponibleError ? e.causa : e;
    logger.registrar({
      evento: 'error_interno',
      requestId: requestId(res),
      resultado: 'seguimiento',
      error: causa instanceof Error ? causa.name : 'desconocido',
    });
    return responderError(res, 503, 'SERVICE_UNAVAILABLE', 'El seguimiento no está disponible por ahora. Inténtalo de nuevo.');
  };
  router.use(manejarError);
  return router;
}
