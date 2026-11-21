import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Request, type RequestHandler } from 'express';
import type { ConsultarSesionUseCase } from '../aplicacion/consultar-sesion.use-case';
import type { Logger } from '../../../compartido/logger';
import {
  CorreoEnUsoError,
  CuotaCorreoAgotadaError,
  CredencialesInvalidasError,
  LimiteExcedidoError,
  NoAutenticadoError,
  ServicioNoDisponibleError,
  TokenInvalidoError,
  TokenUsadoError,
  TokenVencidoError,
  ValidacionError,
} from '../dominio/errores';

/** Limite del cuerpo JSON de autenticacion: 8 KiB. */
export const LIMITE_CUERPO = '8kb';

export type CodigoError =
  | 'VALIDATION_ERROR'
  | 'EMAIL_IN_USE'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'TOKEN_INVALID'
  | 'TOKEN_USED'
  | 'TOKEN_EXPIRED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

/**
 * Extrae el token de `Authorization: Bearer <token>`. Es el unico lugar desde el que se acepta
 * una sesion: ni la URL ni el cuerpo. Un token en la query simplemente se ignora.
 */
export function tokenBearer(req: Request): string | undefined {
  const cabecera = req.get('authorization');
  if (!cabecera) return undefined;
  const coincidencia = /^Bearer ([^\s]+)$/i.exec(cabecera);
  return coincidencia?.[1];
}

/**
 * Exige una sesion de ciudadano activo y deja el resultado en `res.locals.sesion`. La identidad
 * sale siempre del servidor; un fallo responde 401 sin datos privados.
 */
export function autenticarCiudadano(consultar: ConsultarSesionUseCase): RequestHandler {
  return (req, res, next) => {
    consultar.ejecutar(tokenBearer(req)).then(
      (sesion) => {
        res.locals.sesion = sesion;
        next();
      },
      (error: unknown) => next(error),
    );
  };
}

/** Identificador aleatorio de la solicitud: no contiene datos de cuenta. */
export const asignarRequestId: RequestHandler = (_req, res, next) => {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

/** Las respuestas de autenticacion nunca se almacenan en cache. */
export const sinCache: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export function registrarSolicitudes(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      logger.registrar({
        evento: 'solicitud',
        requestId: res.locals.requestId as string,
        metodo: req.method,
        // Patron de ruta, sin query ni valores concretos.
        ruta: typeof req.route?.path === 'string' ? `${req.baseUrl}${req.route.path}` : 'desconocida',
        estado: res.statusCode,
        duracionMs: Number((process.hrtime.bigint() - inicio) / 1_000_000n),
      });
    });
    next();
  };
}

/** Solo se admite application/json en UTF-8; cualquier otro tipo o codificacion recibe 415. */
export const exigirJson: RequestHandler = (req, res, next) => {
  const charset = /charset=("?)([^";\s]+)\1/i.exec(req.get('content-type') ?? '')?.[2]?.toLowerCase();
  if (req.is('application/json') && (charset === undefined || charset === 'utf-8')) {
    next();
    return;
  }
  responderError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'El contenido debe enviarse como application/json en UTF-8.');
};

/** Lector JSON limitado a 8 KiB. Los errores de lectura los traduce el manejador de errores. */
export const leerJson: RequestHandler = express.json({ limit: LIMITE_CUERPO, type: 'application/json' });

export function responderError(
  res: express.Response,
  estado: number,
  code: CodigoError,
  message: string,
  fields?: Record<string, string>,
): void {
  res.status(estado).json({
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
      requestId: res.locals.requestId as string,
    },
  });
}

interface ErrorDeLectura {
  readonly type?: string;
  readonly status?: number;
}

/** Traduce errores a respuestas del contrato. Nunca expone detalles internos. */
export function manejadorDeErrores(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof ValidacionError) {
      responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.', { ...error.campos });
      return;
    }
    if (error instanceof CorreoEnUsoError) {
      responderError(res, 409, 'EMAIL_IN_USE', 'Este correo ya está registrado. Inicia sesión.');
      return;
    }
    if (error instanceof CredencialesInvalidasError) {
      responderError(res, 401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
      return;
    }
    if (error instanceof NoAutenticadoError) {
      responderError(res, 401, 'UNAUTHENTICATED', 'Tu sesión no es válida. Inicia sesión de nuevo.');
      return;
    }
    if (error instanceof TokenInvalidoError) {
      responderError(res, 404, 'TOKEN_INVALID', 'El enlace o el código no es válido.');
      return;
    }
    if (error instanceof TokenUsadoError) {
      responderError(res, 410, 'TOKEN_USED', 'Este enlace ya se usó o fue reemplazado por uno más reciente.');
      return;
    }
    if (error instanceof TokenVencidoError) {
      responderError(res, 410, 'TOKEN_EXPIRED', 'Este enlace venció. Solicita uno nuevo.');
      return;
    }
    if (error instanceof LimiteExcedidoError) {
      res.setHeader('Retry-After', String(error.reintentarEnSegundos));
      responderError(res, 429, 'RATE_LIMITED', 'Demasiados intentos. Espera antes de volver a intentar.');
      return;
    }
    if (error instanceof CuotaCorreoAgotadaError) {
      res.setHeader('Retry-After', String(error.reintentarEnSegundos));
      responderError(res, 503, 'SERVICE_UNAVAILABLE', 'No podemos enviar más correos por hoy. Inténtalo de nuevo más tarde.');
      return;
    }
    if (error instanceof ServicioNoDisponibleError) {
      logger.registrar({
        evento: 'error_interno',
        requestId: res.locals.requestId as string,
        resultado: 'dependencia_no_disponible',
        error: errorNombre(error.causa),
      });
      responderError(res, 503, 'SERVICE_UNAVAILABLE', 'El servicio no está disponible por ahora. Inténtalo de nuevo en unos minutos.');
      return;
    }

    // Errores de lectura del cuerpo (body-parser).
    const lectura = error as ErrorDeLectura;
    if (lectura.type === 'entity.too.large') {
      responderError(res, 413, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande.');
      return;
    }
    if (lectura.type === 'charset.unsupported' || lectura.type === 'encoding.unsupported') {
      responderError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'La codificación del contenido no es compatible.');
      return;
    }
    if (lectura.type === 'entity.parse.failed' || lectura.type === 'request.aborted' || lectura.type === 'request.size.invalid') {
      responderError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.', {
        cuerpo: 'El cuerpo de la solicitud no es un JSON válido.',
      });
      return;
    }

    logger.registrar({
      evento: 'error_interno',
      requestId: res.locals.requestId as string,
      resultado: 'error_inesperado',
      error: errorNombre(error),
    });
    responderError(res, 500, 'INTERNAL_ERROR', 'Ocurrió un error inesperado. Si persiste, indica el código de la solicitud.');
  };
}

/** Solo el nombre o codigo del error: el mensaje puede contener datos de la consulta. */
function errorNombre(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as { code?: unknown; name?: unknown };
    if (typeof e.code === 'string') return e.code;
    if (typeof e.name === 'string') return e.name;
  }
  return 'desconocido';
}
