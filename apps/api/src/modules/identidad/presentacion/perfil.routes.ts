import type { RequestHandler, Response, Router } from 'express';
import type { SesionActual } from '../aplicacion/consultar-sesion.use-case';
import type { ActualizarPerfilUseCase, ConsultarPerfilUseCase } from '../aplicacion/perfil.use-case';
import { exigirJson, leerJson } from './middlewares';

export interface CasosDeUsoPerfil {
  readonly consultar: ConsultarPerfilUseCase;
  readonly actualizar: ActualizarPerfilUseCase;
}

/** El titular sale de la sesion validada por el middleware, nunca de la solicitud. */
const titular = (res: Response): string => (res.locals.sesion as SesionActual).usuario.id;

/**
 * Perfil del propio ciudadano. No hay ruta con identificador. El correo no es editable: el PATCH
 * solo admite nombre, telefono y compartirTelefono.
 */
export function registrarRutasPerfil(router: Router, casos: CasosDeUsoPerfil, autenticar: RequestHandler): void {
  router.get('/perfil', autenticar, async (_req, res) => {
    res.status(200).json(await casos.consultar.ejecutar(titular(res)));
  });

  router.patch('/perfil', autenticar, exigirJson, leerJson, async (req, res) => {
    res.status(200).json(await casos.actualizar.ejecutar(titular(res), req.body));
  });
}
