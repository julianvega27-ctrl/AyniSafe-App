import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import type { Logger } from '../../../compartido/logger';
import {
  ConsultaBandejaInvalidaError,
  IncidenteNoDisponibleError,
  SinAmbitoError,
  type BandejaInstitucional,
} from '../aplicacion/bandeja.use-case';

/** Quien consulta, segun Identidad (fachada inyectada en la composicion). */
export type IdentificarOperador = (cabeceras: { readonly authorization?: string; readonly cookie?: string }) => Promise<
  | { readonly tipo: 'anonimo' }
  | { readonly tipo: 'ciudadano'; readonly usuarioId: string }
  | { readonly tipo: 'institucional'; readonly usuarioId: string; readonly rol: 'operador' | 'administrador' }
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

/** Entrega de una foto autorizada: tipo real, sin cache ni sniffing, y aislada si se abre directamente. */
export function enviarImagen(res: Response, r: { readonly bytes: Buffer; readonly tipo: string }): void {
  res.set({
    'Content-Type': r.tipo,
    'Content-Length': String(r.bytes.length),
    'Content-Disposition': 'inline',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.status(200).end(r.bytes);
}

function responderError(res: Response, estado: number, code: string, message: string): void {
  res.status(estado).json({ error: { code, message, requestId: requestId(res) } });
}

/**
 * Bandeja del operador (P4.2): lista FIFO y resumen por identificador, solo lectura. Sesion de
 * operador por cookie; el ambito se resuelve en cada consulta. Un incidente fuera del ambito responde
 * el mismo 404 que uno inexistente.
 */
export function crearRouterBandeja(bandeja: BandejaInstitucional, identificar: IdentificarOperador, logger: Logger) {
  const router = express.Router();

  const sinCache = (_req: Request, res: Response, next: NextFunction) => {
    requestId(res);
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  };

  const operador = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const quien = await identificar({
        ...(req.get('authorization') !== undefined ? { authorization: req.get('authorization')! } : {}),
        ...(req.get('cookie') !== undefined ? { cookie: req.get('cookie')! } : {}),
      });
      if (quien.tipo === 'institucional' && quien.rol === 'operador') {
        res.locals.operadorId = quien.usuarioId;
        next();
        return;
      }
      if (quien.tipo === 'anonimo' || quien.tipo === 'invalido') {
        responderError(res, 401, 'UNAUTHENTICATED', 'Tu sesión no es válida. Inicia sesión de nuevo.');
        return;
      }
      responderError(res, 403, 'FORBIDDEN', 'Solo los operadores consultan esta bandeja.');
    } catch (e) {
      next(e);
    }
  };

  const soloLectura = (_req: Request, res: Response) => {
    res.set('Allow', 'GET');
    responderError(res, 405, 'METHOD_NOT_ALLOWED', 'Este recurso solo admite GET.');
  };

  router
    .route('/operador/incidentes')
    .get(sinCache, operador, async (req, res) => {
      if (
        Object.keys(req.query).some((k) => k !== 'cursor' && k !== 'responsable') ||
        Array.isArray(req.query.cursor) ||
        Array.isArray(req.query.responsable)
      ) {
        throw new ConsultaBandejaInvalidaError();
      }
      res.json(await bandeja.listar(res.locals.operadorId as string, req.query.cursor, req.query.responsable));
    })
    .all(sinCache, soloLectura);

  // Solo GET: el POST de la misma ruta pertenece a Operaciones (precision de la condicion medica).
  router.get('/operador/incidentes/:id/evaluacion', sinCache, operador, async (req, res) => {
    if (Object.keys(req.query).length) throw new ConsultaBandejaInvalidaError();
    res.json(await bandeja.evaluacion(res.locals.operadorId as string, String(req.params.id)));
  });

  router
    .route('/operador/incidentes/:id/evidencias/:evidenciaId/contenido')
    .get(sinCache, operador, async (req, res) => {
      if (Object.keys(req.query).length) throw new ConsultaBandejaInvalidaError();
      const r = await bandeja.contenidoEvidencia(res.locals.operadorId as string, String(req.params.id), String(req.params.evidenciaId));
      enviarImagen(res, r);
    })
    .all(sinCache, soloLectura);

  router
    .route('/operador/incidentes/:id')
    .get(sinCache, operador, async (req, res) => {
      if (Object.keys(req.query).length) throw new ConsultaBandejaInvalidaError();
      res.json(await bandeja.resumen(res.locals.operadorId as string, String(req.params.id)));
    })
    .all(sinCache, soloLectura);

  const manejarError: ErrorRequestHandler = (e: unknown, _req, res, _next) => {
    res.set({ 'Cache-Control': 'no-store' });
    if (e instanceof ConsultaBandejaInvalidaError) return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos de la consulta.');
    if (e instanceof SinAmbitoError) return responderError(res, 403, 'FORBIDDEN', 'Tu sede no está habilitada para atención.');
    if (e instanceof IncidenteNoDisponibleError) return responderError(res, 404, 'NOT_FOUND', 'Incidente no disponible.');
    logger.registrar({
      evento: 'error_interno',
      requestId: requestId(res),
      resultado: 'bandeja',
      error: e instanceof Error ? e.name : 'desconocido',
    });
    return responderError(res, 503, 'SERVICE_UNAVAILABLE', 'La bandeja no está disponible por ahora. Inténtalo de nuevo.');
  };
  router.use(manejarError);
  return router;
}
