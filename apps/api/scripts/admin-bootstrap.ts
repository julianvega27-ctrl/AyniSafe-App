import { ejecutarCli } from '../src/cli/aprovisionamiento';

// Procedimiento controlado: ver apps/api/README.md (seccion «Administrador inicial»).
ejecutarCli({
  comando: 'bootstrap',
  argv: process.argv.slice(2),
  env: process.env,
  terminal: process.stdout.isTTY === true,
  salida: (linea) => console.log(linea),
  error: (linea) => console.error(linea),
}).then(
  (codigo) => process.exit(codigo),
  (e: unknown) => {
    // Solo el nombre del error: su mensaje podria contener datos de la conexion.
    console.error('[admin:bootstrap] error=' + (e instanceof Error ? e.name : 'desconocido'));
    process.exit(1);
  },
);
