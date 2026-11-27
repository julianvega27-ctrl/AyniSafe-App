import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { Logger } from '../../../compartido/logger';
import { MAX_BYTES_FOTO } from '../dominio/evidencia';
import {
  AlmacenNoDisponibleError,
  CargaNoAutorizadaError,
  LimiteFotosError,
  type AdjuntarEvidenciaUseCase,
  type CargaAutorizada,
  type SolicitanteCarga,
} from '../aplicacion/adjuntar-evidencia.use-case';
import { FotoDemasiadoGrandeError, FotoInvalidaError } from '../aplicacion/puertos/evidencias.port';
import {
  ClaveIdempotenciaRequeridaError,
  ConflictoIdempotenciaError,
  LimiteEnviosError,
} from '../aplicacion/registrar-incidente.use-case';
import type { IdentificarSolicitante } from './incidentes.routes';

const CABECERA_PERMISO = 'x-permiso-evidencias';
const FORMATO_PERMISO = /^[A-Za-z0-9_-]{43}$/;

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

/** Un solo archivo `foto` en memoria; 5 MB como tope del parser (413 antes de procesar). */
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES_FOTO, files: 1, fields: 0, parts: 2, headerPairs: 50 },
}).single('foto');

/**
 * `POST /incidentes/{referencia}/evidencias` (spec `reportes/evidencias-fotograficas`). Autoriza antes de
 * leer el cuerpo; nunca registra el permiso, el nombre del archivo ni los metadatos.
 */
export function crearRouterEvidencias(caso: AdjuntarEvidenciaUseCase, identificar: IdentificarSolicitante, logger: Logger) {
  const router = express.Router();
  router.use('/incidentes/:referencia/evidencias', (_req, res, next) => {
    requestId(res);
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });
  router
    .route('/incidentes/:referencia/evidencias')
    .post(
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const authorization = req.get('authorization');
          const cookie = req.get('cookie');
          const permiso = req.get(CABECERA_PERMISO);
          let solicitante: SolicitanteCarga;
          if (authorization !== undefined || cookie !== undefined) {
            const quien = await identificar({
              ...(authorization !== undefined ? { authorization } : {}),
              ...(cookie !== undefined ? { cookie } : {}),
            });
            if (quien.tipo === 'institucional') return responderError(res, 403, 'FORBIDDEN', 'Las cuentas institucionales no adjuntan fotografías.');
            if (quien.tipo === 'ciudadano') solicitante = { tipo: 'ciudadano', usuarioId: quien.usuarioId };
            else if (quien.tipo === 'invalido' || permiso === undefined) {
              return responderError(res, 401, 'UNAUTHENTICATED', 'Tu sesión no es válida. Inicia sesión de nuevo.');
            } else solicitante = { tipo: 'invitado', permiso, origenRed: req.ip ?? 'sin-ip' };
          } else if (permiso !== undefined) {
            if (!FORMATO_PERMISO.test(permiso)) throw new CargaNoAutorizadaError();
            solicitante = { tipo: 'invitado', permiso, origenRed: req.ip ?? 'sin-ip' };
          } else {
            return responderError(res, 401, 'UNAUTHENTICATED', 'Inicia sesión o usa el permiso de carga de tu comprobante.');
          }
          res.locals.carga = await caso.autorizar(solicitante, String(req.params.referencia ?? ''));
          if (!req.is('multipart/form-data')) {
            return responderError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'La fotografía debe enviarse como multipart/form-data.');
          }
          next();
        } catch (e) {
          next(e);
        }
      },
      (req, res, next) => parser(req, res, next),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          if (!req.file) {
            return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.', { foto: 'Adjunta una fotografía en el campo foto.' });
          }
          const r = await caso.adjuntar(res.locals.carga as CargaAutorizada, req.get('idempotency-key'), {
            bytes: req.file.buffer,
            tipoDeclarado: req.file.mimetype,
          });
          res.status(r.nueva ? 201 : 200).json({
            id: r.evidencia.id,
            tipo: r.evidencia.tipo,
            bytes: r.evidencia.bytes,
            adjuntadaEn: r.evidencia.adjuntadaEn.toISOString(),
          });
        } catch (e) {
          next(e);
        }
      },
    )
    .all((_req, res) => {
      res.set('Allow', 'POST');
      responderError(res, 405, 'METHOD_NOT_ALLOWED', 'Este recurso solo admite POST.');
    });

  const manejarError: ErrorRequestHandler = (e: unknown, _req, res, _next) => {
    if (e instanceof CargaNoAutorizadaError) return responderError(res, 404, 'NOT_FOUND', 'El incidente no existe o ya no admite fotografías.');
    if (e instanceof ClaveIdempotenciaRequeridaError) return responderError(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key con un UUID.');
    if (e instanceof ConflictoIdempotenciaError) return responderError(res, 409, 'IDEMPOTENCY_CONFLICT', 'Esta clave ya se usó con otra fotografía.');
    if (e instanceof LimiteFotosError) return responderError(res, 409, 'EVIDENCE_LIMIT', 'El reporte ya tiene 3 fotografías.');
    if (e instanceof FotoDemasiadoGrandeError) return responderError(res, 413, 'PAYLOAD_TOO_LARGE', 'La fotografía supera 5 MB.');
    if (e instanceof FotoInvalidaError) {
      return responderError(res, 422, 'INVALID_IMAGE', 'Solo se admiten fotografías JPEG, PNG o WebP válidas.', { foto: 'El archivo no es una fotografía admitida.' });
    }
    if (e instanceof LimiteEnviosError) {
      res.set('Retry-After', String(e.reintentarEnSegundos));
      return responderError(res, 429, 'RATE_LIMITED', 'Demasiadas cargas desde esta conexión. Intenta más tarde.');
    }
    const m = e as { code?: string } | null;
    if (e instanceof multer.MulterError) {
      if (m?.code === 'LIMIT_FILE_SIZE') return responderError(res, 413, 'PAYLOAD_TOO_LARGE', 'La fotografía supera 5 MB.');
      return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.', { foto: 'Envía una sola fotografía en el campo foto.' });
    }
    if (e instanceof AlmacenNoDisponibleError) {
      logger.registrar({ evento: 'evidencia_no_disponible', requestId: requestId(res), resultado: e.motivo });
      return responderError(res, 503, 'EVIDENCE_STORAGE_UNAVAILABLE', 'No pudimos guardar la fotografía. Tu reporte sigue registrado; puedes reintentar o continuar sin ella.');
    }
    logger.registrar({
      evento: 'error_interno',
      requestId: requestId(res),
      resultado: 'carga_evidencia',
      error: e instanceof Error ? e.name : 'desconocido',
    });
    return responderError(res, 503, 'EVIDENCE_STORAGE_UNAVAILABLE', 'No pudimos guardar la fotografía. Tu reporte sigue registrado; puedes reintentar o continuar sin ella.');
  };
  router.use('/incidentes/:referencia/evidencias', manejarError);
  return router;
}
