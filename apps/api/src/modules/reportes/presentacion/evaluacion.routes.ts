import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import type { Logger } from '../../../compartido/logger';
import {
  EvaluacionCerradaError,
  EvaluacionNoEncontradaError,
  type AclararEvaluacion,
} from '../aplicacion/aclarar-evaluacion.use-case';
import type { LecturaEvaluacion } from '../aplicacion/lectura-evaluacion';
import { ValidacionEvaluacionError } from '../dominio/evaluacion';
import type { IdentificarSolicitante } from './incidentes.routes';

const LIMITE_CUERPO = '8kb';

export interface DependenciasRutaEvaluacion {
  readonly aclarar: AclararEvaluacion;
  readonly lectura: LecturaEvaluacion;
  readonly identificar: IdentificarSolicitante;
  /** Identificador del incidente por su referencia escrita (fachada de Operaciones); null si no existe. */
  readonly idPorReferencia: (texto: string) => Promise<string | null>;
  /** El incidente es del autor con cuenta (originales de Reportes). */
  readonly esDelAutor: (usuarioId: string, incidenteId: string) => Promise<boolean>;
  readonly logger: Logger;
}

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

const NO_ENCONTRADO = 'No encontramos ese reporte en tu cuenta.';

/**
 * `POST /ciudadano/incidentes/{referencia}/evaluacion`: aclaracion del autor con cuenta (spec
 * `reportes/evaluacion-rapida`). 404 uniforme para ajeno, de invitado, inexistente o sin evaluacion.
 */
export function crearRouterEvaluacionCiudadana(d: DependenciasRutaEvaluacion) {
  const router = express.Router();
  router.use('/ciudadano/incidentes/:referencia/evaluacion', (_req, res, next) => {
    requestId(res);
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });
  router
    .route('/ciudadano/incidentes/:referencia/evaluacion')
    .post(express.json({ limit: LIMITE_CUERPO, type: 'application/json', strict: false }), async (req: Request, res: Response) => {
      const quien = await d.identificar({
        ...(req.get('authorization') !== undefined ? { authorization: req.get('authorization')! } : {}),
        ...(req.get('cookie') !== undefined ? { cookie: req.get('cookie')! } : {}),
      });
      if (quien.tipo === 'institucional') return responderError(res, 403, 'FORBIDDEN', 'Esta acción es solo para ciudadanos con cuenta.');
      if (quien.tipo !== 'ciudadano') return responderError(res, 401, 'UNAUTHENTICATED', 'Inicia sesión para aclarar tu evaluación.');
      const id = await d.idPorReferencia(String(req.params.referencia ?? ''));
      if (!id || !(await d.esDelAutor(quien.usuarioId, id))) return responderError(res, 404, 'NOT_FOUND', NO_ENCONTRADO);
      const r = await d.aclarar.ejecutar(id, { origen: 'ciudadano', institucion: null, usuarioId: quien.usuarioId }, req.body);
      const vista = await d.lectura.vistaAutor(id, true);
      d.logger.registrar({
        evento: 'solicitud',
        requestId: requestId(res),
        resultado: r.nueva ? 'evaluacion_aclarada' : 'evaluacion_sin_cambios',
        detalle: { version: r.version },
      });
      res.status(200).json({ evaluacion: vista });
    })
    .all((_req, res) => {
      res.set('Allow', 'POST');
      responderError(res, 405, 'METHOD_NOT_ALLOWED', 'Este recurso solo admite POST.');
    });

  const manejarError: ErrorRequestHandler = (e: unknown, _req, res, next) => {
    if (res.headersSent) return next(e);
    if (e instanceof ValidacionEvaluacionError) return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa las respuestas.', { ...e.campos });
    if (e instanceof EvaluacionNoEncontradaError) return responderError(res, 404, 'NOT_FOUND', NO_ENCONTRADO);
    if (e instanceof EvaluacionCerradaError) {
      return responderError(res, 409, 'EVALUACION_CERRADA', 'El incidente está cerrado: la evaluación ya no puede aclararse.');
    }
    const lectura = e as { type?: string } | null;
    if (lectura?.type === 'entity.too.large') return responderError(res, 413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera 8 KiB.');
    if (lectura?.type === 'entity.parse.failed') {
      return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa las respuestas.', { cuerpo: 'El cuerpo de la solicitud no es un JSON válido.' });
    }
    const causa = (e as { causa?: unknown } | null)?.causa ?? e;
    d.logger.registrar({
      evento: 'error_interno',
      requestId: requestId(res),
      resultado: 'aclaracion_evaluacion',
      error: causa instanceof Error ? causa.name : 'desconocido',
    });
    return responderError(res, 503, 'SERVICE_UNAVAILABLE', 'No pudimos guardar la aclaración. Inténtalo de nuevo; no se duplicará.');
  };
  router.use('/ciudadano/incidentes/:referencia/evaluacion', manejarError);
  return router;
}
