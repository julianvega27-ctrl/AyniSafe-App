// Fachada publica del modulo Consultas (contenido publico). Sin dependencia del modulo Identidad.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import fuente from './contenido/contenido-publico.json';
import { exigirContenidoValido, type ContenidoPublico } from './dominio/contenido';

export type { ContenidoPublico } from './dominio/contenido';

export interface ModuloConsultas {
  readonly router: Router;
  readonly contenido: ContenidoPublico;
}

/** Cache publica breve: es contenido sin datos personales y distinto del `no-store` de autenticacion. */
const CACHE_CONTENIDO = 'public, max-age=300';

/**
 * Valida la fuente al componer el modulo: si no cumple el esquema, el arranque falla.
 * La fuente puede inyectarse (pruebas); por defecto es el archivo versionado del repositorio.
 */
export function crearModuloConsultas(entrada: unknown = fuente): ModuloConsultas {
  const contenido = exigirContenidoValido(entrada);
  const router = Router();
  router
    .route('/publico/contenido')
    .get((_req, res) => {
      res.status(200).set({ 'Cache-Control': CACHE_CONTENIDO, 'X-Content-Type-Options': 'nosniff' }).json(contenido);
    })
    .all((_req, res) => {
      res
        .status(405)
        .set({ Allow: 'GET, HEAD', 'Cache-Control': 'no-store' })
        .json({
          error: { code: 'METHOD_NOT_ALLOWED', message: 'Este recurso solo admite lectura.', requestId: randomUUID() },
        });
    });
  return { router, contenido };
}
