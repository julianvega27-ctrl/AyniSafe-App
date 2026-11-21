import { Router, type Request } from 'express';
import type { Logger } from '../../../compartido/logger';
import type { CerrarSesionUseCase } from '../aplicacion/cerrar-sesion.use-case';
import type { ConsultarSesionUseCase } from '../aplicacion/consultar-sesion.use-case';
import type { ConsultarTokenUseCase } from '../aplicacion/consultar-token.use-case';
import type { ConsumirTokenCuentaUseCase } from '../aplicacion/consumir-token.use-case';
import type { IniciarSesionUseCase } from '../aplicacion/iniciar-sesion.use-case';
import type { RegistrarCiudadanoUseCase } from '../aplicacion/registrar-ciudadano.use-case';
import type { SolicitarRecuperacionUseCase } from '../aplicacion/solicitar-recuperacion.use-case';
import {
  asignarRequestId,
  exigirJson,
  leerJson,
  manejadorDeErrores,
  registrarSolicitudes,
  sinCache,
} from './middlewares';

export interface CasosDeUsoAuth {
  readonly registrar: RegistrarCiudadanoUseCase;
  readonly iniciarSesion: IniciarSesionUseCase;
  readonly consultarSesion: ConsultarSesionUseCase;
  readonly cerrarSesion: CerrarSesionUseCase;
  readonly solicitarRecuperacion: SolicitarRecuperacionUseCase;
  readonly consultarToken: ConsultarTokenUseCase;
  readonly consumirToken: ConsumirTokenCuentaUseCase;
}

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

function ipDelCliente(req: Request): string {
  return req.ip ?? 'desconocida';
}

export function crearRutasAuth(casos: CasosDeUsoAuth, logger: Logger): Router {
  const router = Router();
  router.use(asignarRequestId, sinCache, registrarSolicitudes(logger));

  router.post('/auth/ciudadanos/registro', exigirJson, leerJson, async (req, res) => {
    const usuario = await casos.registrar.ejecutar({ cuerpo: req.body, ip: ipDelCliente(req) });
    res.status(201).json({ usuario });
  });

  router.post('/auth/ciudadanos/sesiones', exigirJson, leerJson, async (req, res) => {
    const sesion = await casos.iniciarSesion.ejecutar({ cuerpo: req.body, ip: ipDelCliente(req) });
    res.status(200).json({
      token: sesion.token,
      expiresAt: sesion.expiresAt.toISOString(),
      usuario: sesion.usuario,
    });
  });

  // Respuesta uniforme: no revela si el correo corresponde a una cuenta.
  router.post('/auth/recuperaciones', exigirJson, leerJson, async (req, res) => {
    await casos.solicitarRecuperacion.ejecutar({ cuerpo: req.body, ip: ipDelCliente(req) });
    res.status(202).json({ estado: 'solicitud_recibida' });
  });

  // El cambio de contrasena no inicia sesion: 204 sin cuerpo ni token.
  router.post('/auth/contrasena/restablecer', exigirJson, leerJson, async (req, res) => {
    await casos.consumirToken.ejecutar({ cuerpo: req.body, proposito: 'recuperacion', ip: ipDelCliente(req) });
    res.status(204).end();
  });

  router.post('/auth/activaciones', exigirJson, leerJson, async (req, res) => {
    await casos.consumirToken.ejecutar({ cuerpo: req.body, proposito: 'activacion', ip: ipDelCliente(req) });
    res.status(204).end();
  });

  router.post('/auth/tokens/consulta', exigirJson, leerJson, async (req, res) => {
    const vigente = await casos.consultarToken.ejecutar(req.body, ipDelCliente(req));
    res.status(200).json({ proposito: vigente.proposito, expiresAt: vigente.expiresAt.toISOString() });
  });

  router.get('/auth/sesion', async (req, res) => {
    const actual = await casos.consultarSesion.ejecutar(tokenBearer(req));
    res.status(200).json({ usuario: actual.usuario, expiresAt: actual.expiresAt.toISOString() });
  });

  router.delete('/auth/sesion', async (req, res) => {
    await casos.cerrarSesion.ejecutar(tokenBearer(req));
    res.status(204).end();
  });

  router.use(manejadorDeErrores(logger));
  return router;
}
