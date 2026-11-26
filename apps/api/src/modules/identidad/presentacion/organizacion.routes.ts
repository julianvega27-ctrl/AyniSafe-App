import type { RequestHandler, Response, Router } from 'express';
import type { SesionInstitucionalActual } from '../aplicacion/consultar-sesion-institucional.use-case';
import type {
  AdministrarOrganizacionUseCase,
  AgregarOperadorUseCase,
  ConsultarAmbitoOperadorUseCase,
  CrearSedeConOperadorUseCase,
  ReenviarInvitacionUseCase,
} from '../aplicacion/organizacion.use-case';
import { exigirJson, exigirJsonSiHayContenido, exigirRol, leerJson, responderError } from './middlewares';

export interface CasosDeUsoOrganizacion {
  readonly administrar: AdministrarOrganizacionUseCase;
  readonly crearSede: CrearSedeConOperadorUseCase;
  readonly agregarOperador: AgregarOperadorUseCase;
  readonly reenviarInvitacion: ReenviarInvitacionUseCase;
  readonly consultarAmbito: ConsultarAmbitoOperadorUseCase;
}

const sesionDe = (res: Response): SesionInstitucionalActual => res.locals.sesionInstitucional as SesionInstitucionalActual;
const param = (valor: string | string[] | undefined): string => (typeof valor === 'string' ? valor : '');

function noPermitido(permitidos: string): RequestHandler {
  return (_req, res) => {
    res.setHeader('Allow', permitidos);
    responderError(res, 405, 'METHOD_NOT_ALLOWED', 'Método no admitido en este recurso.');
  };
}

/**
 * Organizacion institucional (P3.2). Todas las rutas de administracion exigen sesion de
 * administrador activo; las mutaciones exigen ademas el origen web (CSRF). Administrar no concede
 * lectura de incidentes ni permisos de atencion. El operador solo lee su propio ambito.
 */
export function registrarRutasOrganizacion(
  router: Router,
  casos: CasosDeUsoOrganizacion,
  autenticar: RequestHandler,
  origen: RequestHandler,
): void {
  const admin = [autenticar, exigirRol('administrador')];
  const mutacion = [...admin, origen];
  const base = '/administrador/organizacion';

  router
    .route(`${base}/instituciones`)
    .get(...admin, async (_req, res) => {
      res.status(200).json({ instituciones: await casos.administrar.listarInstituciones() });
    })
    .all(noPermitido('GET, HEAD'));

  router
    .route(`${base}/instituciones/:id`)
    .patch(...mutacion, exigirJson, leerJson, async (req, res) => {
      res.status(200).json({ institucion: await casos.administrar.actualizarInstitucion(param(req.params.id), req.body) });
    })
    .all(noPermitido('PATCH'));

  router
    .route(`${base}/sedes`)
    .get(...admin, async (_req, res) => {
      res.status(200).json({ sedes: await casos.administrar.listarSedes() });
    })
    .post(...mutacion, exigirJson, leerJson, async (req, res) => {
      const creada = await casos.crearSede.ejecutar(req.body, sesionDe(res).usuario.id);
      res.status(201).json(creada);
    })
    .all(noPermitido('GET, HEAD, POST'));

  router
    .route(`${base}/sedes/:id`)
    .patch(...mutacion, exigirJson, leerJson, async (req, res) => {
      res.status(200).json({ sede: await casos.administrar.actualizarSede(param(req.params.id), req.body) });
    })
    .all(noPermitido('PATCH'));

  router
    .route(`${base}/sedes/:id/cobertura`)
    .put(...mutacion, exigirJson, leerJson, async (req, res) => {
      res.status(200).json({ sede: await casos.administrar.reemplazarCobertura(param(req.params.id), req.body) });
    })
    .all(noPermitido('PUT'));

  router
    .route(`${base}/sedes/:id/competencias`)
    .put(...mutacion, exigirJson, leerJson, async (req, res) => {
      res.status(200).json({ sede: await casos.administrar.reemplazarCompetencias(param(req.params.id), req.body) });
    })
    .all(noPermitido('PUT'));

  router
    .route(`${base}/sedes/:id/habilitacion`)
    .post(...mutacion, exigirJsonSiHayContenido, async (req, res) => {
      res.status(200).json({ sede: await casos.administrar.habilitar(param(req.params.id)) });
    })
    .delete(...mutacion, exigirJsonSiHayContenido, async (req, res) => {
      res.status(200).json({ sede: await casos.administrar.deshabilitar(param(req.params.id)) });
    })
    .all(noPermitido('POST, DELETE'));

  router
    .route(`${base}/sedes/:id/operadores`)
    .get(...admin, async (req, res) => {
      res.status(200).json({ operadores: await casos.administrar.listarOperadores(param(req.params.id)) });
    })
    .post(...mutacion, exigirJson, leerJson, async (req, res) => {
      res.status(201).json({ operador: await casos.agregarOperador.ejecutar(param(req.params.id), req.body) });
    })
    .all(noPermitido('GET, HEAD, POST'));

  router
    .route(`${base}/operadores/:id`)
    .patch(...mutacion, exigirJson, leerJson, async (req, res) => {
      res.status(200).json({ operador: await casos.administrar.cambiarEstadoOperador(param(req.params.id), req.body) });
    })
    .all(noPermitido('PATCH'));

  router
    .route(`${base}/operadores/:id/invitacion`)
    .post(...mutacion, exigirJsonSiHayContenido, async (req, res) => {
      await casos.reenviarInvitacion.ejecutar(param(req.params.id));
      res.status(202).json({ estado: 'invitacion_encolada' });
    })
    .all(noPermitido('POST'));

  router
    .route('/operador/ambito')
    .get(autenticar, exigirRol('operador'), async (_req, res) => {
      res.status(200).json({ ambito: await casos.consultarAmbito.ejecutar(sesionDe(res).usuario.id) });
    })
    .all(noPermitido('GET, HEAD'));
}
