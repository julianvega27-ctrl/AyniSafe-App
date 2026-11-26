import type { Request, Response, Router } from 'express';
import type { CerrarSesionUseCase } from '../aplicacion/cerrar-sesion.use-case';
import type {
  ConsultarSesionInstitucionalUseCase,
  SesionInstitucionalActual,
} from '../aplicacion/consultar-sesion-institucional.use-case';
import type { IniciarSesionInstitucionalUseCase } from '../aplicacion/iniciar-sesion-institucional.use-case';
import { seccionesDelPanel } from '../dominio/paneles';
import { cookieBorrada, cookieDeSesion, leerCookie, type ConfigCookie } from './cookies';
import {
  autenticarInstitucional,
  exigirJson,
  exigirJsonSiHayContenido,
  exigirOrigenWeb,
  exigirRol,
  leerJson,
} from './middlewares';
import { registrarRutasOrganizacion, type CasosDeUsoOrganizacion } from './organizacion.routes';

export interface CasosDeUsoInstitucionales {
  readonly iniciarSesion: IniciarSesionInstitucionalUseCase;
  readonly consultarSesion: ConsultarSesionInstitucionalUseCase;
  readonly cerrarSesion: CerrarSesionUseCase;
  readonly organizacion: CasosDeUsoOrganizacion;
}

export interface ConfigInstitucional {
  readonly origenWeb: string;
  readonly cookie: ConfigCookie;
}

const ip = (req: Request): string => req.ip ?? 'desconocida';
const sesionDe = (res: Response): SesionInstitucionalActual => res.locals.sesionInstitucional as SesionInstitucionalActual;

/**
 * Acceso institucional y paneles minimos. La sesion viaja solo en una cookie HttpOnly del mismo
 * origen (nunca en el cuerpo). Sin cabeceras CORS. Los operadores solo se crean por la organizacion
 * institucional, con sesion de administrador; ninguna ruta crea administradores.
 */
export function registrarRutasInstitucionales(
  router: Router,
  casos: CasosDeUsoInstitucionales,
  config: ConfigInstitucional,
  ahora: () => Date,
): void {
  const autenticar = autenticarInstitucional(casos.consultarSesion, config.cookie);
  const origen = exigirOrigenWeb(config.origenWeb);

  router.post('/auth/institucional/sesiones', origen, exigirJson, leerJson, async (req, res) => {
    const sesion = await casos.iniciarSesion.ejecutar({ cuerpo: req.body, ip: ip(req) });
    const segundos = (sesion.expiresAt.getTime() - ahora().getTime()) / 1000;
    res.setHeader('Set-Cookie', cookieDeSesion(config.cookie, sesion.token, segundos));
    res.status(200).json({ usuario: sesion.usuario, expiresAt: sesion.expiresAt.toISOString() });
  });

  router.get('/auth/institucional/sesion', autenticar, (_req, res) => {
    const actual = sesionDe(res);
    res.status(200).json({ usuario: actual.usuario, expiresAt: actual.expiresAt.toISOString() });
  });

  router.delete('/auth/institucional/sesion', origen, exigirJsonSiHayContenido, async (req, res) => {
    await casos.cerrarSesion.ejecutar(leerCookie(req.get('cookie'), config.cookie.nombre));
    res.setHeader('Set-Cookie', cookieBorrada(config.cookie));
    res.status(204).end();
  });

  const panel = (rol: 'administrador' | 'operador') => (_req: Request, res: Response) => {
    const { usuario } = sesionDe(res);
    res.status(200).json({ usuario, secciones: seccionesDelPanel(rol) });
  };
  router.get('/administrador/panel', autenticar, exigirRol('administrador'), panel('administrador'));
  router.get('/operador/panel', autenticar, exigirRol('operador'), panel('operador'));

  registrarRutasOrganizacion(router, casos.organizacion, autenticar, origen);
}
