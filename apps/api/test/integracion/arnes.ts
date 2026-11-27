import 'dotenv/config';
import { afterAll } from '@jest/globals';
import type { Express } from 'express';
import { crearApp } from '../../src/app';
import { crearModuloConsultasConPrisma, idsDistritosPiloto } from '../../src/modules/consultas';
import { crearModuloReportesConPrisma, type ModuloReportes } from '../../src/modules/reportes';
import { crearModuloOperacionesConPrisma, type ModuloOperaciones, type ServicioAtencion, type ServicioEnrutamiento } from '../../src/modules/operaciones';
import { atencionDe, dependenciasRegistro, enrutamientoDe, opcionesBandeja, opcionesSeguimiento, routerOperaciones } from '../../src/composicion';
import type { ConsumidorEventos } from '../../src/compartido/eventos/eventos';
import { ProcesadorEntregas } from '../../src/compartido/eventos/procesador-entregas';
import { PrismaOrganizacionAdapter } from '../../src/modules/identidad/infraestructura/prisma-organizacion.adapter';
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
import { MemoriaEvidenciasAdapter } from '../../src/modules/reportes/infraestructura/memoria-evidencias.adapter';

export const SECRETO_PRUEBA = 'secreto-de-prueba-para-hmac-de-al-menos-32-caracteres';
export const SECRETO_SEGUIMIENTO_PRUEBA = 'secreto-de-seguimiento-de-prueba-de-al-menos-32-caracteres';
export const HUELLA_PRUEBA = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');
export const URL_PUBLICA_PRUEBA = 'https://api.ayinisafe.test';
export const ORIGEN_WEB_PRUEBA = 'https://web.ayinisafe.test';
export const CLAVE = 'contraseña-identificable-9f3a';
export const POLITICA_HOLGADA: PoliticaLimites = {
  registroPorIp: 100000,
  loginPorIp: 100000,
  loginPorCorreoIp: 100000,
  loginInstPorIp: 100000,
  loginInstPorCorreoIp: 100000,
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
  /** Consumidores de eventos del procesador del arnes (P4.1). Por defecto, ninguno. */
  readonly consumidores?: readonly ConsumidorEventos[];
  /** Registra el consumidor de enrutamiento (P4.2) en el procesador del arnes. Por defecto, no. */
  readonly enrutar?: boolean;
  /** Limite de envios de invitado (P4.1). Por defecto, holgado. */
  readonly limiteInvitado?: { readonly maximo: number; readonly ventanaMs: number };
  /** Limites de la consulta por codigo (P4.1). Por defecto, los del servicio. */
  readonly limitesSeguimiento?: {
    readonly porReferencia: { readonly maximo: number; readonly ventanaMs: number };
    readonly porOrigen: { readonly maximo: number; readonly ventanaMs: number };
  };
  /** Almacen de evidencias (P5.2). Por defecto, el doble en memoria; null = deshabilitado. */
  readonly almacenEvidencias?: MemoriaEvidenciasAdapter | null;
  readonly cuotaEvidencias?: { readonly maxBytes: number; readonly maxObjetos: number };
  readonly limiteCargasInvitado?: { readonly maximo: number; readonly ventanaMs: number };
}

export interface Arnes {
  readonly app: Express;
  readonly prisma: PrismaClient;
  readonly reloj: RelojControlable;
  readonly logger: LoggerCapturado;
  readonly modulo: ModuloIdentidad;
  readonly reportes: ModuloReportes;
  readonly operaciones: ModuloOperaciones;
  readonly procesador: ProcesadorEntregas;
  readonly enrutamiento: ServicioEnrutamiento;
  readonly atencion: ServicioAtencion;
  readonly deps: DependenciasIdentidad;
  /** Adaptador de correo en memoria (salvo que se sobrescriba): no valida el proveedor real. */
  readonly correo: CorreoPruebaAdapter;
  /** Doble del almacen de evidencias: no valida Cloudinary. */
  readonly almacenEvidencias: MemoriaEvidenciasAdapter;
}

export function urlPruebas(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Falta TEST_DATABASE_URL (ver README de la API).');
  return url;
}

const modulosCreados = new Set<ModuloIdentidad>();
const clientesCreados = new Set<PrismaClient>();
const procesadoresCreados = new Set<ProcesadorEntregas>();
afterAll(async () => {
  // Las rutas de recuperacion despiertan consumidores asincronos. Primero detenerlos
  // y esperar su pasada; desconectar Prisma antes permite trabajo tras el teardown VM.
  await Promise.all([...modulosCreados].map((m) => m.gestorEnvios.detener()));
  await Promise.all([...procesadoresCreados].map((p) => p.detener()));
  await Promise.all([...clientesCreados].map((p) => p.$disconnect()));
});

/** App completa sobre la base aislada, con reloj controlable y logger capturado. */
export function crearArnes(opciones: OpcionesArnes = {}): Arnes {
  const prisma = opciones.prisma ?? crearPrismaClient(urlPruebas());
  const reloj = opciones.reloj ?? new RelojControlable();
  const logger = new LoggerCapturado();
  const correo = new CorreoPruebaAdapter();
  const almacenEvidencias = opciones.almacenEvidencias ?? new MemoriaEvidenciasAdapter();
  // El catalogo de categorias se lee al usarse: Reportes se compone despues porque depende de Identidad.
  let reportes: ModuloReportes | undefined;
  const deps: DependenciasIdentidad = {
    cuentas: new PrismaCuentasAdapter(prisma),
    sesiones: new PrismaSesionesAdapter(prisma),
    tokensCuenta: new PrismaTokensCuentaAdapter(prisma),
    envios: new PrismaEnviosCorreoAdapter(prisma),
    correo,
    redactor: new RedactorCorreoTextoPlano(URL_PUBLICA_PRUEBA, ORIGEN_WEB_PRUEBA),
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
    web: { origen: ORIGEN_WEB_PRUEBA },
    logger,
    organizacion: new PrismaOrganizacionAdapter(prisma),
    catalogoDistritos: { idsValidos: async () => idsDistritosPiloto() },
    catalogoCategorias: { idsValidos: () => reportes!.categorias.idsActivos() },
    ...opciones.sobrescribir,
  };
  const modulo = crearModuloIdentidad(deps);
  const operaciones = crearModuloOperacionesConPrisma(prisma);
  modulosCreados.add(modulo);
  clientesCreados.add(prisma);
  let procesadorCreado: ProcesadorEntregas | undefined;
  const enrutamiento = enrutamientoDe(prisma, modulo, () => reportes!, () => procesadorCreado?.despertar());
  const atencion = atencionDe(prisma, modulo);
  const consultas = crearModuloConsultasConPrisma(
    prisma,
    SECRETO_PRUEBA,
    {
      ...opcionesSeguimiento({ identidad: modulo, operaciones, enrutamiento, atencion }, () => reportes!, logger),
      ...(opciones.limitesSeguimiento ? { limites: opciones.limitesSeguimiento } : {}),
    },
    opcionesBandeja(modulo, enrutamiento, () => reportes!, logger, atencion),
  );
  const procesador = new ProcesadorEntregas(
    prisma,
    [...(opciones.consumidores ?? []), ...(opciones.enrutar ? [enrutamiento.consumidor()] : [])],
    logger,
  );
  procesadorCreado = procesador;
  procesadoresCreados.add(procesador);
  reportes = crearModuloReportesConPrisma(prisma, {
    ...dependenciasRegistro(prisma, { identidad: modulo, consultas, operaciones, enrutamiento }, () => procesador.despertar(), logger),
    secretoSeguimiento: SECRETO_SEGUIMIENTO_PRUEBA,
    limiteInvitado: opciones.limiteInvitado ?? { maximo: 100000, ventanaMs: 60 * 60 * 1000 },
    evidencias: {
      almacen: opciones.almacenEvidencias === undefined ? almacenEvidencias : opciones.almacenEvidencias,
      cuota: opciones.cuotaEvidencias ?? { maxBytes: 500 * 1024 * 1024, maxObjetos: 1000 },
      limiteInvitado: opciones.limiteCargasInvitado ?? { maximo: 100000, ventanaMs: 60 * 60 * 1000 },
    },
  });
  const app = crearApp({
    saltosProxyConfianza: opciones.saltosProxy ?? 0,
    identidad: modulo,
    consultas,
    reportes,
    operaciones: routerOperaciones(enrutamiento, modulo, () => reportes!, logger, atencion, operaciones.incidentes),
  });
  return { app, prisma, reloj, logger, modulo, reportes, operaciones, procesador, enrutamiento, atencion, deps, correo, almacenEvidencias };
}

export async function limpiarBd(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE participaciones_incidente, enrutamientos_incidente, entregas_evento, eventos, solicitudes_envio, envios_incidente, incidentes CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE envios_correo, tokens_cuenta, sesiones, usuarios, ventanas_intentos CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE estado_territorial, geometrias_distritales, versiones_territoriales CASCADE');
  await prisma.$executeRaw`INSERT INTO estado_territorial(ambito) VALUES ('ayacucho-metropolitano')`;
}

export const RUTA_REGISTRO = '/api/v1/auth/ciudadanos/registro';
export const RUTA_LOGIN = '/api/v1/auth/ciudadanos/sesiones';
export const RUTA_SESION = '/api/v1/auth/sesion';

export const RUTA_INST_SESIONES = '/api/v1/auth/institucional/sesiones';
export const RUTA_INST_SESION = '/api/v1/auth/institucional/sesion';
export const RUTA_PANEL_ADMIN = '/api/v1/administrador/panel';
export const RUTA_PANEL_OPERADOR = '/api/v1/operador/panel';
export const RUTA_ORG = '/api/v1/administrador/organizacion';
export const RUTA_AMBITO = '/api/v1/operador/ambito';

export interface CuentaDePrueba {
  readonly id: string;
  readonly correo: string;
}

/**
 * Inserta directamente una cuenta con el rol y estado indicados (fixture de pruebas): no existe
 * ninguna ruta de alta de administradores u operadores. Con `estado: 'pendiente_activacion'` no
 * lleva contrasena.
 */
export async function crearCuentaDePrueba(
  prisma: PrismaClient,
  datos: {
    readonly rol: 'ciudadano' | 'operador' | 'administrador';
    readonly estado?: 'activo' | 'suspendido' | 'pendiente_activacion';
    readonly correo?: string;
    readonly contrasena?: string;
  },
): Promise<CuentaDePrueba> {
  const correo = datos.correo ?? `${datos.rol}-${Math.random().toString(36).slice(2, 8)}@ejemplo.com`;
  const estado = datos.estado ?? 'activo';
  const passwordHash =
    estado === 'pendiente_activacion' ? null : await new Argon2idHashAdapter().hash(datos.contrasena ?? CLAVE);
  const u = await prisma.usuario.create({
    data: { nombre: 'Cuenta de prueba', correoNormalizado: correo, passwordHash, rol: datos.rol, estado },
  });
  return { id: u.id, correo };
}

/** Extrae el valor de la cookie de sesion de las cabeceras `Set-Cookie` de una respuesta. */
export function cookieDe(res: { headers: Record<string, unknown> }, nombre = '__Host-ayni_inst'): string | undefined {
  const crudo = res.headers['set-cookie'];
  const lista = Array.isArray(crudo) ? (crudo as string[]) : typeof crudo === 'string' ? [crudo] : [];
  const linea = lista.find((c) => c.startsWith(`${nombre}=`));
  return linea?.split(';')[0]?.slice(nombre.length + 1);
}
