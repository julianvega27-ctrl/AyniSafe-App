import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import type { Logger } from '../../../compartido/logger';
import {
  ClaveIdempotenciaRequeridaError,
  ConflictoIdempotenciaError,
  LimiteEnviosError,
  RegistroNoDisponibleError,
  type Comprobante,
  type RegistrarIncidenteUseCase,
  type SolicitanteEnvio,
} from '../aplicacion/registrar-incidente.use-case';
import { ValidacionEnvioError } from '../dominio/envio';

/** Quien envia, segun Identidad (fachada inyectada en la composicion). */
export type SolicitanteHttp =
  | { readonly tipo: 'anonimo' }
  | { readonly tipo: 'ciudadano'; readonly usuarioId: string }
  | { readonly tipo: 'institucional' }
  | { readonly tipo: 'invalido' };

export type IdentificarSolicitante = (cabeceras: { readonly authorization?: string; readonly cookie?: string }) => Promise<SolicitanteHttp>;

const LIMITE_CUERPO = '8kb';

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

/** Representacion HTTP del comprobante: sin telefono, coordenadas, autor ni datos de enrutamiento. */
export function comprobanteHttp(c: Comprobante): Record<string, unknown> {
  return {
    referencia: c.referencia,
    estado: c.estado,
    recibidoEn: c.recibidoEn.toISOString(),
    modalidad: c.modalidad,
    territorio:
      c.territorio.estado === 'resuelto'
        ? { estado: 'resuelto', distrito: { id: c.territorio.distritoId, nombre: c.nombreDistrito } }
        : { estado: 'pendiente', motivo: c.territorio.motivo },
    ...(c.codigoSeguimiento ? { codigoSeguimiento: c.codigoSeguimiento } : {}),
    ...(c.permisoEvidencias
      ? { permisoEvidencias: { valor: c.permisoEvidencias.valor, venceEn: c.permisoEvidencias.venceEn.toISOString() } }
      : {}),
  };
}

/** `POST /incidentes`: envio ciudadano como invitado o con cuenta (spec `reportes/registro-incidentes`). */
export function crearRouterIncidentes(registrar: RegistrarIncidenteUseCase, identificar: IdentificarSolicitante, logger: Logger) {
  const router = express.Router();
  router.use((_req, res, next) => {
    requestId(res);
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });
  router
    .route('/incidentes')
    .post(
      (req, res, next) => {
        const charset = /charset=("?)([^";\s]+)\1/i.exec(req.get('content-type') ?? '')?.[2]?.toLowerCase();
        if (!req.is('application/json') || (charset !== undefined && charset !== 'utf-8')) {
          responderError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'El contenido debe enviarse como application/json en UTF-8.');
          return;
        }
        next();
      },
      express.json({ limit: LIMITE_CUERPO, type: 'application/json', strict: false }),
      async (req: Request, res: Response) => {
        const quien = await identificar({
          ...(req.get('authorization') !== undefined ? { authorization: req.get('authorization')! } : {}),
          ...(req.get('cookie') !== undefined ? { cookie: req.get('cookie')! } : {}),
        });
        if (quien.tipo === 'invalido') {
          responderError(res, 401, 'UNAUTHENTICATED', 'Tu sesión no es válida. Inicia sesión de nuevo o envía como invitado.');
          return;
        }
        if (quien.tipo === 'institucional') {
          responderError(res, 403, 'FORBIDDEN', 'Las cuentas institucionales no registran incidentes.');
          return;
        }
        const solicitante: SolicitanteEnvio =
          quien.tipo === 'ciudadano'
            ? { modalidad: 'cuenta', usuarioId: quien.usuarioId }
            : { modalidad: 'invitado', origenRed: req.ip ?? 'sin-ip' };
        const r = await registrar.ejecutar(solicitante, req.get('idempotency-key'), req.body);
        res.status(r.nuevo ? 201 : 200).json(comprobanteHttp(r.comprobante));
      },
    )
    .all((_req, res) => {
      res.set('Allow', 'POST');
      responderError(res, 405, 'METHOD_NOT_ALLOWED', 'Este recurso solo admite POST.');
    });

  const manejarError: ErrorRequestHandler = (e: unknown, _req, res, _next) => {
    if (e instanceof ValidacionEnvioError) return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.', { ...e.campos });
    if (e instanceof ClaveIdempotenciaRequeridaError) {
      return responderError(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key con un UUID.');
    }
    if (e instanceof ConflictoIdempotenciaError) {
      return responderError(res, 409, 'IDEMPOTENCY_CONFLICT', 'Esta clave ya se usó con un contenido distinto.');
    }
    if (e instanceof LimiteEnviosError) {
      res.set('Retry-After', String(e.reintentarEnSegundos));
      return responderError(res, 429, 'RATE_LIMITED', 'Demasiados envíos desde esta conexión. Intenta más tarde.');
    }
    const lectura = e as { type?: string } | null;
    if (lectura?.type === 'entity.too.large') return responderError(res, 413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera 8 KiB.');
    if (lectura?.type === 'entity.parse.failed' || lectura?.type === 'request.aborted') {
      return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.', { cuerpo: 'El cuerpo de la solicitud no es un JSON válido.' });
    }
    const causa = e instanceof RegistroNoDisponibleError ? e.causa : e;
    logger.registrar({
      evento: 'error_interno',
      requestId: requestId(res),
      resultado: 'registro_incidente',
      error: causa instanceof Error ? causa.name : 'desconocido',
    });
    return responderError(res, 503, 'SERVICE_UNAVAILABLE', 'No pudimos registrar el incidente. Inténtalo de nuevo; no se duplicará.');
  };
  router.use(manejarError);
  return router;
}
