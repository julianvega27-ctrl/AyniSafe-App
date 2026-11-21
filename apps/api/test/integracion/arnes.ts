import 'dotenv/config';
import type { Express } from 'express';
import { crearApp } from '../../src/app';
import { crearModuloConsultas } from '../../src/modules/consultas';
import type { EventoLog, Logger } from '../../src/compartido/logger';
import type { PoliticaLimites } from '../../src/modules/identidad/aplicacion/politica-limites';
import type { HashContrasenaPort } from '../../src/modules/identidad/aplicacion/puertos/hash-contrasena.port';
import type { RelojPort } from '../../src/modules/identidad/aplicacion/puertos/reloj.port';
import {
  crearModuloIdentidad,
  type DependenciasIdentidad,
  type ModuloIdentidad,
} from '../../src/modules/identidad';
import { Argon2idHashAdapter } from '../../src/modules/identidad/infraestructura/argon2id-hash.adapter';
import { HashConLimiteDeConcurrencia } from '../../src/modules/identidad/infraestructura/hash-con-limite.adapter';
import {
  crearPrismaClient,
  type PrismaClient,
} from '../../src/modules/identidad/infraestructura/prisma-cliente';
import { PrismaCuentasAdapter } from '../../src/modules/identidad/infraestructura/prisma-cuentas.adapter';
import { PrismaLimitadorAdapter } from '../../src/modules/identidad/infraestructura/prisma-limitador.adapter';
import { PrismaPurgaAdapter } from '../../src/modules/identidad/infraestructura/prisma-purga.adapter';
import { CorreoPruebaAdapter } from '../../src/modules/identidad/infraestructura/correo-prueba.adapter';
import { PrismaEnviosCorreoAdapter } from '../../src/modules/identidad/infraestructura/prisma-envios-correo.adapter';
import { RedactorCorreoTextoPlano } from '../../src/modules/identidad/infraestructura/redactor-correo-texto';
import { PrismaSesionesAdapter } from '../../src/modules/identidad/infraestructura/prisma-sesiones.adapter';
import { PrismaTokensCuentaAdapter } from '../../src/modules/identidad/infraestructura/prisma-tokens-cuenta.adapter';
import { TokenOpacoAdapter } from '../../src/modules/identidad/infraestructura/token-opaco.adapter';

export const SECRETO_PRUEBA = 'secreto-de-prueba-para-hmac-de-al-menos-32-caracteres';
export const HUELLA_PRUEBA = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');
export const URL_PUBLICA_PRUEBA = 'https://api.ayinisafe.test';
export const CLAVE = 'contraseña-identificable-9f3a';
export const POLITICA_HOLGADA: PoliticaLimites = {
  registroPorIp: 100000,
  loginPorIp: 100000,
  loginPorCorreoIp: 100000,
  recuperacionPorIp: 100000,
  recuperacionPorCorreoIp: 100000,
  recuperacionPorCorreo: 100000,
  tokenPorIp: 100000,
  correoDiarioMax: 100000,
};

export class RelojControlable implements RelojPort {
  constructor(private actual: Date = new Date('2026-11-21T12:00:00.000Z')) {}
  ahora(): Date {
    return new Date(this.actual);
  }
  avanzar(ms: number): void {
    this.actual = new Date(this.actual.getTime() + ms);
  }
  fijar(fecha: Date): void {
    this.actual = new Date(fecha);
  }
}

export class LoggerCapturado implements Logger {
  readonly eventos: EventoLog[] = [];
  registrar(evento: EventoLog): void {
    this.eventos.push(evento);
  }
  texto(): string {
    return JSON.stringify(this.eventos);
  }
}

export interface OpcionesArnes {
  readonly politica?: Partial<PoliticaLimites>;
  readonly saltosProxy?: number;
  readonly hash?: HashContrasenaPort;
  readonly hashMaxConcurrencia?: number;
  readonly hashMaxCola?: number;
  readonly reloj?: RelojControlable;
  readonly prisma?: PrismaClient;
  readonly sobrescribir?: Partial<DependenciasIdentidad>;
}

export interface Arnes {
  readonly app: Express;
  readonly prisma: PrismaClient;
  readonly reloj: RelojControlable;
  readonly logger: LoggerCapturado;
  readonly modulo: ModuloIdentidad;
  readonly deps: DependenciasIdentidad;
  /** Adaptador de correo en memoria (salvo que se sobrescriba): no valida el proveedor real. */
  readonly correo: CorreoPruebaAdapter;
}

export function urlPruebas(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Falta TEST_DATABASE_URL (ver README de la API).');
  return url;
}

/** App completa sobre la base aislada, con reloj controlable y logger capturado. */
export function crearArnes(opciones: OpcionesArnes = {}): Arnes {
  const prisma = opciones.prisma ?? crearPrismaClient(urlPruebas());
  const reloj = opciones.reloj ?? new RelojControlable();
  const logger = new LoggerCapturado();
  const correo = new CorreoPruebaAdapter();
  const deps: DependenciasIdentidad = {
    cuentas: new PrismaCuentasAdapter(prisma),
    sesiones: new PrismaSesionesAdapter(prisma),
    tokensCuenta: new PrismaTokensCuentaAdapter(prisma),
    envios: new PrismaEnviosCorreoAdapter(prisma),
    correo,
    redactor: new RedactorCorreoTextoPlano(URL_PUBLICA_PRUEBA),
    hash:
      opciones.hash ??
      new HashConLimiteDeConcurrencia(
        new Argon2idHashAdapter(),
        opciones.hashMaxConcurrencia ?? 8,
        opciones.hashMaxCola ?? 64,
      ),
    tokens: new TokenOpacoAdapter(),
    limitador: new PrismaLimitadorAdapter(prisma, SECRETO_PRUEBA),
    reloj,
    purga: new PrismaPurgaAdapter(prisma),
    politicaLimites: { ...POLITICA_HOLGADA, ...opciones.politica },
    android: { paquete: 'pe.edu.unsch.ayni_safe', huellasSha256: [HUELLA_PRUEBA] },
    logger,
    ...opciones.sobrescribir,
  };
  const modulo = crearModuloIdentidad(deps);
  const app = crearApp({ saltosProxyConfianza: opciones.saltosProxy ?? 0, identidad: modulo, consultas: crearModuloConsultas() });
  return { app, prisma, reloj, logger, modulo, deps, correo };
}

export async function limpiarBd(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE envios_correo, tokens_cuenta, sesiones, usuarios, ventanas_intentos CASCADE');
}

export const RUTA_REGISTRO = '/api/v1/auth/ciudadanos/registro';
export const RUTA_LOGIN = '/api/v1/auth/ciudadanos/sesiones';
export const RUTA_SESION = '/api/v1/auth/sesion';
