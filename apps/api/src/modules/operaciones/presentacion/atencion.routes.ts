import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import type { Logger } from '../../../compartido/logger';
import type { AmbitoBandeja, ServicioEnrutamiento } from '../aplicacion/enrutamiento';
import type { ServicioAtencion } from '../aplicacion/atencion';
import {
  AtencionNoDisponibleError,
  ConflictoAtencionError,
  esUuid,
  PermisoAtencionError,
  ValidacionAtencionError,
  type CodigoConflicto,
} from '../dominio/atencion';
import type { IdentificarAdministrador } from './enrutamiento.routes';

export interface OpcionesRutasAtencion {
  readonly identificar: IdentificarAdministrador;
  readonly origenWebPermitido: (origin: string | undefined, secFetchSite: string | undefined) => boolean;
  /** Ambito vigente del operador (Identidad); null sin sede habilitada. */
  readonly ambito: (usuarioId: string) => Promise<AmbitoBandeja | null>;
  readonly logger: Logger;
}

const NO_DISPONIBLE = 'Incidente no disponible.';

const MENSAJES_CONFLICTO: Record<CodigoConflicto, string> = {
  CASO_ASUMIDO: 'Otro operador de tu institución ya es responsable de este caso.',
  ESTADO_CAMBIADO: 'El estado del incidente cambió. Revisa el caso actualizado.',
  TRANSICION_NO_PERMITIDA: 'Esa acción no corresponde al estado actual del incidente.',
  INCIDENTE_CERRADO: 'El incidente está cerrado.',
  DESTINO_NO_VALIDO: 'El operador elegido no puede recibir este caso.',
  ASIGNACION_INACTIVA: 'La asignación ya no está activa.',
  INCIDENTE_VINCULADO: 'El incidente está vinculado a otro reporte del mismo hecho y se atiende desde ese caso.',
  VINCULO_NO_PERMITIDO: 'No se puede vincular este incidente a ese caso.',
};

const MENSAJES_PERMISO = {
  ASIGNACION_REQUERIDA: 'Asume el caso antes de realizar esta acción.',
  NO_PRINCIPAL: 'Solo la institución principal puede realizar esta acción.',
} as const;

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
 * Atencion institucional (P6): asumir, transiciones y verificacion del operador; asignaciones del
 * administrador. Sesion institucional por cookie; las mutaciones exigen el origen web (CSRF). Fuera
 * de ambito responde el mismo 404 que un inexistente. Motivos y resumenes nunca se registran en logs.
 */
export function crearRouterAtencion(atencion: ServicioAtencion, enrutamiento: ServicioEnrutamiento, o: OpcionesRutasAtencion) {
  const router = express.Router();

  const sinCache = (_req: Request, res: Response, next: NextFunction) => {
    requestId(res);
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  };

  const rol = (esperado: 'operador' | 'administrador', mutacion: boolean) => async (req: Request, res: Response, next: NextFunction) => {
    const quien = await o.identificar({
      ...(req.get('authorization') !== undefined ? { authorization: req.get('authorization')! } : {}),
      ...(req.get('cookie') !== undefined ? { cookie: req.get('cookie')! } : {}),
    });
    if (quien.tipo === 'anonimo' || quien.tipo === 'invalido') {
      return responderError(res, 401, 'UNAUTHENTICATED', 'Tu sesión no es válida. Inicia sesión de nuevo.');
    }
    if (quien.tipo !== 'institucional' || quien.rol !== esperado) {
      return responderError(res, 403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
    }
    if (mutacion && !o.origenWebPermitido(req.get('origin'), req.get('sec-fetch-site'))) {
      return responderError(res, 403, 'FORBIDDEN_ORIGIN', 'Solicitud no admitida desde este origen.');
    }
    res.locals.usuarioId = quien.usuarioId;
    next();
  };

  const json = [
    (req: Request, res: Response, next: NextFunction) => {
      const charset = /charset=("?)([^";\s]+)\1/i.exec(req.get('content-type') ?? '')?.[2]?.toLowerCase();
      if (!req.is('application/json') || (charset !== undefined && charset !== 'utf-8')) {
        return responderError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'El contenido debe enviarse como application/json en UTF-8.');
      }
      next();
    },
    express.json({ limit: '4kb', type: 'application/json', strict: false }),
  ];

  const sinCuerpo = (req: Request, res: Response, next: NextFunction) => {
    if (Number(req.get('content-length') ?? '0') > 0 || req.get('transfer-encoding')) {
      return responderError(res, 400, 'VALIDATION_ERROR', 'Esta acción no admite cuerpo.');
    }
    next();
  };

  /** Resuelve la participacion visible del operador o responde 403/404. */
  const participacion = async (req: Request, res: Response, next: NextFunction) => {
    const operadorId = res.locals.usuarioId as string;
    const ambito = await o.ambito(operadorId);
    if (!ambito) return responderError(res, 403, 'SIN_AMBITO', 'Tu sede no está habilitada para atender incidentes.');
    const id = String(req.params.id ?? '');
    const p = esUuid(id) ? await enrutamiento.participacionDe(ambito, id) : null;
    if (!p) return responderError(res, 404, 'NOT_FOUND', NO_DISPONIBLE);
    res.locals.participacion = { incidenteId: id, institucion: p.institucion, sedeId: ambito.sedeId };
    next();
  };

  const registrar = (res: Response, resultado: string, detalle?: Record<string, string | number>) =>
    o.logger.registrar({ evento: 'solicitud', requestId: requestId(res), resultado, ...(detalle ? { detalle } : {}) });

  router.post('/operador/incidentes/:id/asumir', sinCache, rol('operador', true), sinCuerpo, participacion, async (_req, res) => {
    const r = await atencion.asumir(res.locals.participacion, res.locals.usuarioId as string);
    registrar(res, r.nueva ? 'caso_asumido' : 'caso_ya_asumido');
    res.status(r.nueva ? 201 : 200).json({
      asignacion: { id: r.asignacion.id, institucion: r.asignacion.institucion, desde: r.asignacion.asignadaEn.toISOString() },
      estado: r.estado,
    });
  });

  router.post('/operador/incidentes/:id/transiciones', sinCache, rol('operador', true), ...json, participacion, async (req, res) => {
    const r = await atencion.transicion(res.locals.participacion, res.locals.usuarioId as string, req.body);
    registrar(res, 'transicion', { estado: r.estado });
    res.json(r);
  });

  router.post('/operador/incidentes/:id/verificacion', sinCache, rol('operador', true), ...json, participacion, async (req, res) => {
    const r = await atencion.verificar(res.locals.participacion, res.locals.usuarioId as string, req.body);
    registrar(res, 'verificacion');
    res.json(r);
  });

  router.get('/admin/asignaciones', sinCache, rol('administrador', false), async (req, res) => {
    if (Object.keys(req.query).length) return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos de la consulta.');
    res.json({ elementos: await atencion.listarAsignaciones() });
  });

  router.get('/admin/asignaciones/:id/candidatos', sinCache, rol('administrador', false), async (req, res) => {
    res.json({ elementos: await atencion.candidatos(String(req.params.id)) });
  });

  router.post('/admin/asignaciones/:id/liberar', sinCache, rol('administrador', true), ...json, async (req, res) => {
    const r = await atencion.liberar(String(req.params.id), res.locals.usuarioId as string, req.body);
    registrar(res, 'asignacion_liberada');
    res.json(r);
  });

  router.post('/admin/asignaciones/:id/reasignar', sinCache, rol('administrador', true), ...json, async (req, res) => {
    const r = await atencion.reasignar(String(req.params.id), res.locals.usuarioId as string, req.body);
    registrar(res, 'asignacion_reasignada');
    res.json({ asignacion: { id: r.asignacion.id, institucion: r.asignacion.institucion, desde: r.asignacion.asignadaEn.toISOString() } });
  });

  const manejarError: ErrorRequestHandler = (e: unknown, _req, res, next) => {
    if (res.headersSent) return next(e);
    res.set({ 'Cache-Control': 'no-store' });
    const lectura = e as { type?: string } | null;
    if (lectura?.type === 'entity.too.large') return responderError(res, 413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera 4 KiB.');
    if (lectura?.type === 'entity.parse.failed') {
      return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.', { fields: { cuerpo: 'El cuerpo no es un JSON válido.' } });
    }
    if (e instanceof ValidacionAtencionError) return responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.', { fields: e.campos });
    if (e instanceof AtencionNoDisponibleError) return responderError(res, 404, 'NOT_FOUND', NO_DISPONIBLE);
    if (e instanceof PermisoAtencionError) return responderError(res, 403, e.codigo, MENSAJES_PERMISO[e.codigo]);
    if (e instanceof ConflictoAtencionError) {
      return responderError(res, 409, e.codigo, MENSAJES_CONFLICTO[e.codigo], e.estadoActual ? { estadoActual: e.estadoActual } : {});
    }
    o.logger.registrar({
      evento: 'error_interno',
      requestId: requestId(res),
      resultado: 'atencion',
      error: e instanceof Error ? e.name : 'desconocido',
    });
    return responderError(res, 503, 'SERVICE_UNAVAILABLE', 'No pudimos completar la acción. Inténtalo de nuevo.');
  };
  router.use(['/operador/incidentes/:id', '/admin/asignaciones'], manejarError);
  return router;
}
