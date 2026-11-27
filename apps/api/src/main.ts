import { crearApp } from './app';
import { ProcesadorEntregas } from './compartido/eventos/procesador-entregas';
import { LoggerConsola } from './compartido/logger';
import { atencionDe, dependenciasRegistro, enrutamientoDe, opcionesBandeja, opcionesSeguimiento, routerOperaciones } from './composicion';
import { cargarConfigEvidencias, cargarEntorno, cargarSecretoSeguimiento } from './config/entorno';
import { crearModuloConsultasConPrisma, idsDistritosPiloto } from './modules/consultas';
import { crearModuloIdentidadConPrisma } from './modules/identidad';
import { crearModuloOperacionesConPrisma } from './modules/operaciones';
import { crearAlmacenEvidencias, crearModuloReportesConPrisma, programarLimpieza, type ModuloReportes } from './modules/reportes';
import { crearPrismaClient } from './modules/identidad/infraestructura/prisma-cliente';

const INTERVALO_PURGA_MS = 60 * 60 * 1000;
const INTERVALO_LIMPIEZA_EVIDENCIAS_MS = 5 * 60 * 1000;

async function main(): Promise<void> {
  const entorno = cargarEntorno();
  const secretoSeguimiento = cargarSecretoSeguimiento();
  const configEvidencias = cargarConfigEvidencias(process.env, entorno.nodeEnv);
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
  // Atencion institucional (P6): asignaciones, transiciones e historial.
  const atencion = atencionDe(prisma, identidad);
  // Si la fuente de contenido publico no cumple el esquema, el arranque falla aqui.
  const consultas = crearModuloConsultasConPrisma(
    prisma,
    entorno.secretoLimitador,
    opcionesSeguimiento({ identidad, operaciones, enrutamiento, atencion }, () => reportes!, logger),
    opcionesBandeja(identidad, enrutamiento, () => reportes!, logger, atencion),
  );
  // Entregas de eventos (ADR-004). El enrutamiento (P4.2) recibe tambien los eventos anteriores a su
  // registro. Los avisos por usuario de P8 se registraran aqui sobre EnrutamientoResuelto.
  const procesador = new ProcesadorEntregas(prisma, [enrutamiento.consumidor()], logger);
  procesadorEntregas = procesador;
  reportes = crearModuloReportesConPrisma(prisma, {
    ...dependenciasRegistro(prisma, { identidad, consultas, operaciones, enrutamiento }, () => procesador.despertar(), logger),
    secretoSeguimiento,
    evidencias: {
      almacen: crearAlmacenEvidencias(configEvidencias),
      cuota: { maxBytes: configEvidencias.cuotaBytes, maxObjetos: configEvidencias.cuotaObjetos },
    },
  });
  const app = crearApp({
    saltosProxyConfianza: entorno.saltosProxyConfianza,
    identidad,
    consultas,
    reportes,
    operaciones: routerOperaciones(enrutamiento, identidad, () => reportes!, logger, atencion),
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
  // Limpieza de evidencias huerfanas o fallidas: al arrancar y cada 5 min (P5.2).
  const detenerLimpieza = reportes.limpiezaEvidencias
    ? programarLimpieza(reportes.limpiezaEvidencias, INTERVALO_LIMPIEZA_EVIDENCIAS_MS, (e) =>
        logger.registrar({ evento: 'limpieza_evidencias', resultado: 'fallo', error: e instanceof Error ? e.name : 'desconocido' }),
      )
    : () => undefined;

  const cerrar = (): void => {
    clearInterval(temporizador);
    detenerLimpieza();
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
