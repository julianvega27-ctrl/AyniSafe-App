import type { Router } from 'express';
import type { Logger } from '../../compartido/logger';
import type { Entorno } from '../../config/entorno';
import { CerrarSesionUseCase } from './aplicacion/cerrar-sesion.use-case';
import { ConsultarSesionUseCase } from './aplicacion/consultar-sesion.use-case';
import { IniciarSesionUseCase } from './aplicacion/iniciar-sesion.use-case';
import type { PoliticaLimites } from './aplicacion/politica-limites';
import { PurgarCaducadosUseCase } from './aplicacion/purgar-caducados.use-case';
import type { CuentasPort } from './aplicacion/puertos/cuentas.port';
import type { HashContrasenaPort } from './aplicacion/puertos/hash-contrasena.port';
import type { LimitadorPort } from './aplicacion/puertos/limitador.port';
import type { PurgaPort } from './aplicacion/puertos/purga.port';
import type { RelojPort } from './aplicacion/puertos/reloj.port';
import type { SesionesPort } from './aplicacion/puertos/sesiones.port';
import type { TokenPort } from './aplicacion/puertos/token.port';
import { RegistrarCiudadanoUseCase } from './aplicacion/registrar-ciudadano.use-case';
import { Argon2idHashAdapter } from './infraestructura/argon2id-hash.adapter';
import { HashConLimiteDeConcurrencia } from './infraestructura/hash-con-limite.adapter';
import type { PrismaClient } from './infraestructura/prisma-cliente';
import { PrismaCuentasAdapter } from './infraestructura/prisma-cuentas.adapter';
import { PrismaLimitadorAdapter } from './infraestructura/prisma-limitador.adapter';
import { PrismaPurgaAdapter } from './infraestructura/prisma-purga.adapter';
import { PrismaSesionesAdapter } from './infraestructura/prisma-sesiones.adapter';
import { RelojSistemaAdapter } from './infraestructura/reloj-sistema.adapter';
import { TokenOpacoAdapter } from './infraestructura/token-opaco.adapter';
import { crearRutasAuth } from './presentacion/auth.routes';

/** Puertos que el modulo necesita. Los adaptadores concretos se inyectan desde fuera. */
export interface DependenciasIdentidad {
  readonly cuentas: CuentasPort;
  readonly sesiones: SesionesPort;
  readonly hash: HashContrasenaPort;
  readonly tokens: TokenPort;
  readonly limitador: LimitadorPort;
  readonly reloj: RelojPort;
  readonly purga: PurgaPort;
  readonly politicaLimites: PoliticaLimites;
  readonly logger: Logger;
}

export interface ModuloIdentidad {
  readonly router: Router;
  readonly purgarCaducados: PurgarCaducadosUseCase;
}

/**
 * Raiz de composicion del modulo. El dominio y la aplicacion no conocen Express, Prisma ni la
 * criptografia concreta: solo los puertos recibidos aqui.
 */
export function crearModuloIdentidad(deps: DependenciasIdentidad): ModuloIdentidad {
  const router = crearRutasAuth(
    {
      registrar: new RegistrarCiudadanoUseCase(deps.cuentas, deps.hash, deps.limitador, deps.reloj, deps.politicaLimites),
      iniciarSesion: new IniciarSesionUseCase(
        deps.cuentas,
        deps.sesiones,
        deps.hash,
        deps.tokens,
        deps.limitador,
        deps.reloj,
        deps.politicaLimites,
      ),
      consultarSesion: new ConsultarSesionUseCase(deps.sesiones, deps.tokens, deps.reloj),
      cerrarSesion: new CerrarSesionUseCase(deps.sesiones, deps.tokens, deps.reloj),
    },
    deps.logger,
  );
  return { router, purgarCaducados: new PurgarCaducadosUseCase(deps.purga, deps.reloj) };
}

/** Composicion de produccion: adaptadores Prisma, Argon2id y reloj del sistema. */
export function crearModuloIdentidadConPrisma(
  entorno: Entorno,
  prisma: PrismaClient,
  logger: Logger,
  reloj: RelojPort = new RelojSistemaAdapter(),
): ModuloIdentidad {
  return crearModuloIdentidad({
    cuentas: new PrismaCuentasAdapter(prisma),
    sesiones: new PrismaSesionesAdapter(prisma),
    hash: new HashConLimiteDeConcurrencia(
      new Argon2idHashAdapter(),
      entorno.hashMaxConcurrencia,
      entorno.hashMaxCola,
    ),
    tokens: new TokenOpacoAdapter(),
    limitador: new PrismaLimitadorAdapter(prisma, entorno.secretoLimitador),
    reloj,
    purga: new PrismaPurgaAdapter(prisma),
    politicaLimites: entorno.politicaLimites,
    logger,
  });
}
