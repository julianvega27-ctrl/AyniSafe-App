import { crearApp } from './app';
import { ProcesadorEntregas } from './compartido/eventos/procesador-entregas';
import { LoggerConsola } from './compartido/logger';
import { dependenciasRegistro, enrutamientoDe, opcionesBandeja, opcionesSeguimiento, routerOperaciones } from './composicion';
import { cargarEntorno, cargarSecretoSeguimiento } from './config/entorno';
import { crearModuloConsultasConPrisma, idsDistritosPiloto } from './modules/consultas';
import { crearModuloIdentidadConPrisma } from './modules/identidad';
import { crearModuloOperacionesConPrisma } from './modules/operaciones';
import { crearModuloReportesConPrisma, type ModuloReportes } from './modules/reportes';
import { crearPrismaClient } from './modules/identidad/infraestructura/prisma-cliente';

const INTERVALO_PURGA_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const entorno = cargarEntorno();
  const secretoSeguimiento = cargarSecretoSeguimiento();
  const logger = new LoggerConsola();
  const prisma = crearPrismaClient(entorno.urlBaseDeDatos);
  const operaciones = crearModuloOperacionesConPrisma(prisma);
  // Identidad consume los catalogos de Consultas y Reportes solo por sus fachadas, mediante puertos.
  // El catalogo de categorias se lee al usarse: Reportes se compone despues porque depende de Identidad.
  let reportes: ModuloReportes | undefined;
  const identidad = crearModuloIdentidadConPrisma(entorno, prisma, logger, {
    distritos: { idsValidos: async () => idsDistritosPiloto() },
    categorias: { idsValidos: () => reportes!.categorias.idsActivos() },
  });
  // Enrutamiento (P4.2): se compone antes que Consultas, que lo usa en la bandeja y el seguimiento.
  let procesadorEntregas: ProcesadorEntregas | undefined;
  const enrutamiento = enrutamientoDe(prisma, identidad, () => reportes!, () => procesadorEntregas?.despertar());
  // Si la fuente de contenido publico no cumple el esquema, el arranque falla aqui.
  const consultas = crearModuloConsultasConPrisma(
    prisma,
    entorno.secretoLimitador,
    opcionesSeguimiento({ identidad, operaciones, enrutamiento }, () => reportes!, logger),
    opcionesBandeja(identidad, enrutamiento, () => reportes!, logger),
  );
  // Entregas de eventos (ADR-004). El enrutamiento (P4.2) recibe tambien los eventos anteriores a su
  // registro. Los avisos por usuario de P8 se registraran aqui sobre EnrutamientoResuelto.
  const procesador = new ProcesadorEntregas(prisma, [enrutamiento.consumidor()], logger);
  procesadorEntregas = procesador;
  reportes = crearModuloReportesConPrisma(prisma, {
    ...dependenciasRegistro(prisma, { identidad, consultas, operaciones }, () => procesador.despertar(), logger),
    secretoSeguimiento,
  });
  const app = crearApp({
    saltosProxyConfianza: entorno.saltosProxyConfianza,
    identidad,
    consultas,
    reportes,
    operaciones: routerOperaciones(enrutamiento, identidad, () => reportes!, logger),
  });

  const servidor = app.listen(entorno.puerto, () => {
    // Solo datos no sensibles: nunca imprimir variables de entorno ni la URL de la base.
    logger.registrar({ evento: 'arranque', detalle: { puerto: entorno.puerto, entorno: entorno.nodeEnv } });
  });

  const purgar = (): void => {
    identidad.purgarCaducados
      .ejecutar()
      .then((r) => logger.registrar({ evento: 'purga', resultado: 'ok', detalle: { ...r } }))
      .catch((e: unknown) =>
        logger.registrar({
          evento: 'purga',
          resultado: 'fallo',
          error: e instanceof Error ? e.name : 'desconocido',
        }),
      );
  };
  const temporizador = setInterval(purgar, INTERVALO_PURGA_MS);
  temporizador.unref();
  // Retoma los correos que quedaron pendientes antes de un reinicio.
  identidad.gestorEnvios.iniciar();
  // Retoma las entregas pendientes o interrumpidas antes de un reinicio (EQ-14).
  procesador.iniciar();

  const cerrar = (): void => {
    clearInterval(temporizador);
    servidor.close(() => {
      void Promise.all([identidad.gestorEnvios.detener(), procesador.detener()])
        .then(() => prisma.$disconnect())
        .finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', cerrar);
  process.on('SIGINT', cerrar);
}

main().catch((e: unknown) => {
  // Mensajes de configuracion: sin valores ni credenciales.
  console.error(e instanceof Error ? e.message : 'Fallo al iniciar la API');
  process.exit(1);
});
