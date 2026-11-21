import type { Router } from 'express';
import type { Logger } from '../../compartido/logger';
import type { Entorno } from '../../config/entorno';
import { ActualizarPerfilUseCase, ConsultarPerfilUseCase } from './aplicacion/perfil.use-case';
import { CerrarSesionUseCase } from './aplicacion/cerrar-sesion.use-case';
import { ConsultarSesionUseCase } from './aplicacion/consultar-sesion.use-case';
import { ConsultarTokenUseCase } from './aplicacion/consultar-token.use-case';
import { ConsumirTokenCuentaUseCase } from './aplicacion/consumir-token.use-case';
import { EmitirTokenCuentaUseCase } from './aplicacion/emitir-token-cuenta.use-case';
import { InvitarCuentaUseCase } from './aplicacion/invitar-cuenta.use-case';
import { ProcesarEnviosCorreoUseCase, type RedactorCorreo } from './aplicacion/procesar-envios-correo.use-case';
import { IniciarSesionUseCase } from './aplicacion/iniciar-sesion.use-case';
import type { PoliticaLimites } from './aplicacion/politica-limites';
import { PurgarCaducadosUseCase } from './aplicacion/purgar-caducados.use-case';
import type { CorreoPort } from './aplicacion/puertos/correo.port';
import type { CuentasPort } from './aplicacion/puertos/cuentas.port';
import type { EnviosCorreoPort } from './aplicacion/puertos/envios-correo.port';
import type { HashContrasenaPort } from './aplicacion/puertos/hash-contrasena.port';
import type { LimitadorPort } from './aplicacion/puertos/limitador.port';
import type { PurgaPort } from './aplicacion/puertos/purga.port';
import type { RelojPort } from './aplicacion/puertos/reloj.port';
import type { SesionesPort } from './aplicacion/puertos/sesiones.port';
import type { TokenPort } from './aplicacion/puertos/token.port';
import type { TokensCuentaPort } from './aplicacion/puertos/tokens-cuenta.port';
import { RegistrarCiudadanoUseCase } from './aplicacion/registrar-ciudadano.use-case';
import { SolicitarRecuperacionUseCase } from './aplicacion/solicitar-recuperacion.use-case';
import { Argon2idHashAdapter } from './infraestructura/argon2id-hash.adapter';
import { crearCorreo } from './infraestructura/crear-correo';
import { GestorEnvios } from './infraestructura/gestor-envios';
import { HashConLimiteDeConcurrencia } from './infraestructura/hash-con-limite.adapter';
import type { PrismaClient } from './infraestructura/prisma-cliente';
import { PrismaCuentasAdapter } from './infraestructura/prisma-cuentas.adapter';
import { PrismaEnviosCorreoAdapter } from './infraestructura/prisma-envios-correo.adapter';
import { PrismaLimitadorAdapter } from './infraestructura/prisma-limitador.adapter';
import { PrismaPurgaAdapter } from './infraestructura/prisma-purga.adapter';
import { PrismaSesionesAdapter } from './infraestructura/prisma-sesiones.adapter';
import { PrismaTokensCuentaAdapter } from './infraestructura/prisma-tokens-cuenta.adapter';
import { RedactorCorreoTextoPlano } from './infraestructura/redactor-correo-texto';
import { RelojSistemaAdapter } from './infraestructura/reloj-sistema.adapter';
import { TokenOpacoAdapter } from './infraestructura/token-opaco.adapter';
import { crearRutasAuth } from './presentacion/auth.routes';
import { crearRutasCuenta, type ConfigAndroid } from './presentacion/cuenta.routes';

/** Puertos que el modulo necesita. Los adaptadores concretos se inyectan desde fuera. */
export interface DependenciasIdentidad {
  readonly cuentas: CuentasPort;
  readonly sesiones: SesionesPort;
  readonly tokensCuenta: TokensCuentaPort;
  readonly envios: EnviosCorreoPort;
  readonly correo: CorreoPort;
  readonly redactor: RedactorCorreo;
  readonly hash: HashContrasenaPort;
  readonly tokens: TokenPort;
  readonly limitador: LimitadorPort;
  readonly reloj: RelojPort;
  readonly purga: PurgaPort;
  readonly politicaLimites: PoliticaLimites;
  readonly logger: Logger;
  /** Datos para verificar los App Links de Android (assetlinks.json). */
  readonly android: ConfigAndroid;
}

export interface ModuloIdentidad {
  readonly router: Router;
  /** Paginas de respaldo y assetlinks.json: se montan en la raiz, fuera de /api/v1. */
  readonly routerPublico: Router;
  readonly purgarCaducados: PurgarCaducadosUseCase;
  /** Uso interno (entrega de correo): emite el token de recuperacion o activacion. */
  readonly emitirToken: EmitirTokenCuentaUseCase;
  /** Cambia la contrasena con un token; lo exponen las rutas publicas de recuperacion y activacion. */
  readonly consumirToken: ConsumirTokenCuentaUseCase;
  /** Cola de correos: llamar a `despertar()` tras encolar y a `iniciar()` al arrancar. */
  readonly gestorEnvios: GestorEnvios;
  /**
   * Capacidad de invitacion para Spec 06: encola el correo de activacion dentro de la transaccion
   * del llamador. No crea cuentas. Tras el commit debe llamarse a `gestorEnvios.despertar()`.
   */
  readonly invitarCuenta: InvitarCuentaUseCase;
}

/**
 * Raiz de composicion del modulo. El dominio y la aplicacion no conocen Express, Prisma ni la
 * criptografia concreta: solo los puertos recibidos aqui.
 */
export function crearModuloIdentidad(deps: DependenciasIdentidad): ModuloIdentidad {
  const emitirToken = new EmitirTokenCuentaUseCase(deps.tokensCuenta, deps.tokens, deps.reloj);
  const consumirToken = new ConsumirTokenCuentaUseCase(
    deps.tokensCuenta,
    deps.hash,
    deps.tokens,
    deps.reloj,
    deps.limitador,
    deps.politicaLimites,
  );
  const gestorEnvios = new GestorEnvios(
    new ProcesarEnviosCorreoUseCase(deps.envios, deps.correo, emitirToken, deps.redactor, deps.reloj, deps.logger),
    deps.envios,
    deps.reloj,
    deps.logger,
  );
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
      solicitarRecuperacion: new SolicitarRecuperacionUseCase(
        deps.cuentas,
        deps.envios,
        deps.limitador,
        deps.reloj,
        deps.politicaLimites,
        () => gestorEnvios.despertar(),
      ),
      consultarToken: new ConsultarTokenUseCase(
        deps.tokensCuenta,
        deps.tokens,
        deps.reloj,
        deps.limitador,
        deps.politicaLimites,
      ),
      consumirToken,
      perfil: {
        consultar: new ConsultarPerfilUseCase(deps.cuentas),
        actualizar: new ActualizarPerfilUseCase(deps.cuentas, deps.reloj),
      },
    },
    deps.logger,
  );
  return {
    router,
    routerPublico: crearRutasCuenta(deps.android),
    purgarCaducados: new PurgarCaducadosUseCase(deps.purga, deps.reloj),
    emitirToken,
    consumirToken,
    gestorEnvios,
    invitarCuenta: new InvitarCuentaUseCase(deps.envios, deps.reloj),
  };
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
    tokensCuenta: new PrismaTokensCuentaAdapter(prisma),
    envios: new PrismaEnviosCorreoAdapter(prisma),
    correo: crearCorreo(entorno.correo),
    redactor: new RedactorCorreoTextoPlano(entorno.urlPublicaApi),
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
    android: { paquete: entorno.androidPaquete, huellasSha256: entorno.androidHuellasSha256 },
  });
}
