import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import type { Logger } from '../../../compartido/logger';
import type { AmbitoBandeja, ServicioEnrutamiento } from '../aplicacion/enrutamiento';
import type { InstitucionDestino } from '../dominio/matriz';
import type { IdentificarAdministrador } from './enrutamiento.routes';

/** Resultado de la aclaracion en Reportes, traducido por la composicion (sin importar Reportes). */
export type ResultadoAclaracionOperador =
  | {
      readonly tipo: 'ok';
      readonly version: number;
      readonly condicionMedica: {
        readonly heridos: string | null;
        readonly atencionMedica: string | null;
        readonly cantidadHeridos: number | 'no_se' | null;
      };
      readonly samuIncorporado: boolean;
      readonly nueva: boolean;
    }
  | { readonly tipo: 'validacion'; readonly campos: Readonly<Record<string, string>> }
  | { readonly tipo: 'no_encontrado' }
  | { readonly tipo: 'cerrado' };

export interface OpcionesRutaEvaluacionOperador {
  readonly identificar: IdentificarAdministrador;
  readonly origenWebPermitido: (origin: string | undefined, secFetchSite: string | undefined) => boolean;
  /** Ambito vigente del operador (Identidad); null sin sede habilitada. */
  readonly ambito: (usuarioId: string) => Promise<AmbitoBandeja | null>;
  /** Aclaracion por la fachada de Reportes, con la institucion del operador. */
  readonly aclarar: (
    incidenteId: string,
    autor: { readonly usuarioId: string; readonly institucion: InstitucionDestino },
    entrada: unknown,
  ) => Promise<ResultadoAclaracionOperador>;
  readonly logger: Logger;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NO_DISPONIBLE = 'Incidente no disponible.';

function requestId(res: Response): string {
  const actual = res.locals.requestId;
  if (typeof actual === 'string') return actual;
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  return id;
}

function responderError(res: Response, estado: number, code: string, message: string, extra: Record<string, unknown> = {}): void {
  res.status(estado).json({ error: { code, message, ...extra, requestId: requestId(res) } });
}

/**
 * `POST /operador/incidentes/{id}/evaluacion` (P5.1): precision o aclaracion de la condicion medica
 * por un operador cuya sede participa dentro de su ambito vigente. 404 uniforme fuera de ambito; el
 * motivo y las respuestas nunca se registran en logs. La respuesta solo lleva el resumen de heridos.
 */
export function crearRouterEvaluacionOperador(servicio: ServicioEnrutamiento, o: OpcionesRutaEvaluacionOperador) {
  const router = express.Router();
  const RUTA = '/operador/incidentes/:id/evaluacion';

  router.post(
    RUTA,
    (req, res, next) => {
      requestId(res);
      res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      next();
    },
    async (req: Request, res: Response, next) => {
      const quien = await o.identificar({
        ...(req.get('authorization') !== undefined ? { authorization: req.get('authorization')! } : {}),
        ...(req.get('cookie') !== undefined ? { cookie: req.get('cookie')! } : {}),
      });
      if (quien.tipo === 'anonimo' || quien.tipo === 'invalido') {
        return responderError(res, 401, 'UNAUTHENTICATED', 'Tu sesión no es válida. Inicia sesión de nuevo.');
      }
      if (quien.tipo !== 'institucional' || quien.rol !== 'operador') {
        return responderError(res, 403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
      }
      if (!o.origenWebPermitido(req.get('origin'), req.get('sec-fetch-site'))) {
        return responderError(res, 403, 'FORBIDDEN_ORIGIN', 'Solicitud no admitida desde este origen.');
      }
      res.locals.operadorId = quien.usuarioId;
      next();
    },
    (req, res, next) => {
      const charset = /charset=("?)([^";\s]+)\1/i.exec(req.get('content-type') ?? '')?.[2]?.toLowerCase();
      if (!req.is('application/json') || (charset !== undefined && charset !== 'utf-8')) {
        return responderError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'El contenido debe enviarse como application/json en UTF-8.');
      }
      next();
    },
    express.json({ limit: '4kb', type: 'application/json', strict: false }),
    async (req: Request, res: Response) => {
      const operadorId = res.locals.operadorId as string;
      const id = String(req.params.id ?? '');
      const ambito = await o.ambito(operadorId);
      if (!ambito) return responderError(res, 403, 'SIN_AMBITO', 'Tu sede no está habilitada para atender incidentes.');
      const participacion = UUID.test(id) ? await servicio.participacionDe(ambito, id) : null;
      if (!participacion) return responderError(res, 404, 'NOT_FOUND', NO_DISPONIBLE);
      const r = await o.aclarar(id, { usuarioId: operadorId, institucion: participacion.institucion }, req.body);
      if (r.tipo === 'validacion') return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.', { fields: r.campos });
      if (r.tipo === 'no_encontrado') return responderError(res, 404, 'NOT_FOUND', NO_DISPONIBLE);
      if (r.tipo === 'cerrado') return responderError(res, 409, 'EVALUACION_CERRADA', 'El incidente está cerrado: la condición ya no puede precisarse.');
      o.logger.registrar({
        evento: 'solicitud',
        requestId: requestId(res),
        resultado: r.nueva ? 'condicion_precisada' : 'condicion_sin_cambios',
        detalle: { version: r.version, samuIncorporado: r.samuIncorporado ? 1 : 0 },
      });
      res.status(200).json({ version: r.version, condicionMedica: r.condicionMedica, samuIncorporado: r.samuIncorporado });
    },
  );

  const manejarError: ErrorRequestHandler = (e: unknown, _req, res, next) => {
    if (res.headersSent) return next(e);
    const lectura = e as { type?: string } | null;
    if (lectura?.type === 'entity.too.large') return responderError(res, 413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera 4 KiB.');
    if (lectura?.type === 'entity.parse.failed') {
      return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.', { fields: { cuerpo: 'El cuerpo no es un JSON válido.' } });
    }
    o.logger.registrar({
      evento: 'error_interno',
      requestId: requestId(res),
      resultado: 'precision_condicion',
      error: e instanceof Error ? e.name : 'desconocido',
    });
    return responderError(res, 503, 'SERVICE_UNAVAILABLE', 'No pudimos guardar la precisión. Inténtalo de nuevo; no se duplicará.');
  };
  router.use(RUTA, manejarError);
  return router;
}
