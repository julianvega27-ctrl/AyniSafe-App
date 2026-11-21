import { crearApp } from './app';
import { LoggerConsola } from './compartido/logger';
import { cargarEntorno } from './config/entorno';
import { crearModuloIdentidadConPrisma } from './modules/identidad';
import { crearPrismaClient } from './modules/identidad/infraestructura/prisma-cliente';

const INTERVALO_PURGA_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const entorno = cargarEntorno();
  const logger = new LoggerConsola();
  const prisma = crearPrismaClient(entorno.urlBaseDeDatos);
  const identidad = crearModuloIdentidadConPrisma(entorno, prisma, logger);
  const app = crearApp({ saltosProxyConfianza: entorno.saltosProxyConfianza, identidad });

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

  const cerrar = (): void => {
    clearInterval(temporizador);
    servidor.close(() => {
      void identidad.gestorEnvios
        .detener()
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
