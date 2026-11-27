import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import { codificarCursorFifo, decodificarCursorFifo } from '../../../compartido/cursor-fifo';
import type { Logger } from '../../../compartido/logger';
import {
  ConflictoEnrutamientoError,
  DesignacionInvalidaError,
  EnrutamientoNoEncontradoError,
  type EnrutamientoGuardado,
  type ServicioEnrutamiento,
} from '../aplicacion/enrutamiento';

/** Quien hace la solicitud, segun Identidad (fachada inyectada en la composicion). */
export type IdentificarAdministrador = (cabeceras: { readonly authorization?: string; readonly cookie?: string }) => Promise<
  | { readonly tipo: 'anonimo' }
  | { readonly tipo: 'ciudadano'; readonly usuarioId: string }
  | { readonly tipo: 'institucional'; readonly usuarioId: string; readonly rol: 'operador' | 'administrador' }
  | { readonly tipo: 'invalido' }
>;

/** Nombres para la vista de pendientes, de Reportes y Consultas (puertos de la composicion). */
export interface VistaPendientesPort {
  nombresCategorias(): Promise<ReadonlyMap<string, string>>;
  nombreDistrito(id: string): string | null;
  /** Motivo territorial original de un incidente sin distrito; null si no hay. */
  motivoTerritorial(incidenteId: string): Promise<string | null>;
}

export interface OpcionesRutasEnrutamiento {
  readonly identificar: IdentificarAdministrador;
  readonly origenWebPermitido: (origin: string | undefined, secFetchSite: string | undefined) => boolean;
  readonly vista: VistaPendientesPort;
  readonly logger: Logger;
}

const PAGINA = 50;
const BASE = '/admin/enrutamientos-pendientes';

const MENSAJES_CONFLICTO: Record<ConflictoEnrutamientoError['codigo'], string> = {
  FALTANTE_INEXISTENTE: 'El caso ya no necesita una sede de esa institución.',
  SEDE_NO_DESIGNABLE: 'La sede elegida no cumple los requisitos para recibir el caso.',
  ENRUTAMIENTO_NO_PENDIENTE: 'El caso ya no está pendiente de enrutamiento.',
};

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
 * Enrutamientos pendientes del administrador (P4.2, RF35): lista FIFO, designacion auditada y
 * reevaluacion. Sesion institucional de administrador por cookie; las mutaciones exigen el origen
 * web (CSRF). El motivo nunca se registra en logs.
 */
export function crearRouterEnrutamiento(servicio: ServicioEnrutamiento, o: OpcionesRutasEnrutamiento) {
  const router = express.Router();

  const sinCache = (_req: Request, res: Response, next: NextFunction) => {
    requestId(res);
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  };

  const administrador = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const quien = await o.identificar({
        ...(req.get('authorization') !== undefined ? { authorization: req.get('authorization')! } : {}),
        ...(req.get('cookie') !== undefined ? { cookie: req.get('cookie')! } : {}),
      });
      if (quien.tipo === 'institucional' && quien.rol === 'administrador') {
        res.locals.administradorId = quien.usuarioId;
        next();
        return;
      }
      if (quien.tipo === 'anonimo' || quien.tipo === 'invalido') {
        responderError(res, 401, 'UNAUTHENTICATED', 'Tu sesión no es válida. Inicia sesión de nuevo.');
        return;
      }
      responderError(res, 403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
    } catch (e) {
      next(e);
    }
  };

  const origen = (req: Request, res: Response, next: NextFunction) => {
    if (!o.origenWebPermitido(req.get('origin'), req.get('sec-fetch-site'))) {
      responderError(res, 403, 'FORBIDDEN_ORIGIN', 'Solicitud no admitida desde este origen.');
      return;
    }
    next();
  };

  const json = [
    (req: Request, res: Response, next: NextFunction) => {
      const charset = /charset=("?)([^";\s]+)\1/i.exec(req.get('content-type') ?? '')?.[2]?.toLowerCase();
      if (!req.is('application/json') || (charset !== undefined && charset !== 'utf-8')) {
        responderError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'El contenido debe enviarse como application/json en UTF-8.');
        return;
      }
      next();
    },
    express.json({ limit: '4kb', type: 'application/json', strict: false }),
  ];

  const sinCuerpo = (req: Request, res: Response, next: NextFunction) => {
    const longitud = Number(req.get('content-length') ?? '0');
    if (longitud > 0 || req.get('transfer-encoding')) {
      responderError(res, 400, 'VALIDATION_ERROR', 'Esta acción no admite cuerpo.');
      return;
    }
    next();
  };

  const noPermitido = (allow: string) => (_req: Request, res: Response) => {
    res.set('Allow', allow);
    responderError(res, 405, 'METHOD_NOT_ALLOWED', `Este recurso solo admite ${allow}.`);
  };

  const resumen = (e: EnrutamientoGuardado) => ({
    incidenteId: e.incidenteId,
    resultado: e.resultado,
    faltantes: e.faltantes.map((f) => ({ institucion: f.institucion, papel: f.papel, motivo: f.motivo })),
  });

  router
    .route(BASE)
    .get(sinCache, administrador, async (req, res) => {
      if (Object.keys(req.query).some((k) => k !== 'cursor') || Array.isArray(req.query.cursor)) {
        responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos de la consulta.');
        return;
      }
      let despuesDe = null;
      if (req.query.cursor !== undefined) {
        const c = decodificarCursorFifo(req.query.cursor);
        if (!c) {
          responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos de la consulta.');
          return;
        }
        despuesDe = { registradoEn: c.instante, incidenteId: c.id };
      }
      const filas = await servicio.pendientes(despuesDe, PAGINA + 1);
      const pagina = filas.slice(0, PAGINA);
      const categorias = await o.vista.nombresCategorias();
      const elementos = [];
      for (const f of pagina) {
        elementos.push({
          incidenteId: f.incidenteId,
          referencia: f.referencia,
          categoria: { id: f.categoriaId, nombre: categorias.get(f.categoriaId) ?? null },
          territorio: f.distritoId !== null
            ? { estado: 'resuelto', distrito: { id: f.distritoId, nombre: o.vista.nombreDistrito(f.distritoId) } }
            : { estado: 'pendiente', motivo: (await o.vista.motivoTerritorial(f.incidenteId)) ?? 'sin_distrito' },
          registradoEn: f.registradoEn.toISOString(),
          faltantes: f.faltantes.map((x) => ({ institucion: x.institucion, papel: x.papel, motivo: x.motivo })),
        });
      }
      const ultima = pagina[pagina.length - 1];
      res.json({
        elementos,
        siguiente: filas.length > PAGINA && ultima ? codificarCursorFifo({ instante: ultima.registradoEn, id: ultima.incidenteId }) : null,
      });
    })
    .all(sinCache, noPermitido('GET'));

  router
    .route(`${BASE}/:incidenteId/designaciones`)
    .post(sinCache, origen, administrador, ...json, async (req, res) => {
      const r = await servicio.designar(String(req.params.incidenteId), req.body, res.locals.administradorId as string);
      res.status(201).json({ enrutamiento: resumen(r) });
    })
    .all(sinCache, noPermitido('POST'));

  router
    .route(`${BASE}/:incidenteId/reevaluar`)
    .post(sinCache, origen, administrador, sinCuerpo, async (req, res) => {
      const r = await servicio.reevaluar(String(req.params.incidenteId));
      res.status(200).json({ enrutamiento: resumen(r) });
    })
    .all(sinCache, noPermitido('POST'));

  const manejarError: ErrorRequestHandler = (e: unknown, _req, res, _next) => {
    res.set({ 'Cache-Control': 'no-store' });
    if (e instanceof DesignacionInvalidaError) {
      return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos de la designación.', { fields: e.campos });
    }
    if (e instanceof EnrutamientoNoEncontradoError) return responderError(res, 404, 'NOT_FOUND', 'No encontramos ese caso pendiente.');
    if (e instanceof ConflictoEnrutamientoError) {
      return responderError(res, 409, e.codigo, MENSAJES_CONFLICTO[e.codigo], e.requisitos.length ? { requisitos: [...e.requisitos] } : {});
    }
    const lectura = e as { type?: string } | null;
    if (lectura?.type === 'entity.too.large') return responderError(res, 413, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande.');
    if (lectura?.type === 'entity.parse.failed' || lectura?.type === 'request.aborted') {
      return responderError(res, 400, 'VALIDATION_ERROR', 'El cuerpo de la solicitud no es un JSON válido.');
    }
    o.logger.registrar({
      evento: 'error_interno',
      resultado: 'enrutamiento',
      requestId: requestId(res),
      error: e instanceof Error ? e.name : 'desconocido',
    });
    responderError(res, 503, 'SERVICE_UNAVAILABLE', 'El servicio no está disponible. Intenta más tarde.');
  };
  router.use(manejarError);
  return router;
}
