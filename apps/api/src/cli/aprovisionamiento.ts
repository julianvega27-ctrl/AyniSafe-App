import { cargarEntorno } from '../config/entorno';
import { LoggerConsola } from '../compartido/logger';
import { crearModuloIdentidadConPrisma } from '../modules/identidad';
import {
  AprovisionamientoAdministrador,
  AprovisionamientoRechazadoError,
  type SalidaAprovisionamiento,
} from '../modules/identidad/infraestructura/aprovisionamiento-administrador';
import { crearPrismaClient } from '../modules/identidad/infraestructura/prisma-cliente';
import { RelojSistemaAdapter } from '../modules/identidad/infraestructura/reloj-sistema.adapter';

export type ComandoAprovisionamiento = 'bootstrap' | 'reiniciar';

export interface EntradaCli {
  readonly comando: ComandoAprovisionamiento;
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  /** La salida estandar es una terminal interactiva. */
  readonly terminal: boolean;
  readonly salida: (linea: string) => void;
  readonly error: (linea: string) => void;
}

interface Argumentos {
  correo?: string;
  nombre?: string;
  emitirEnlace: boolean;
}

/** Tiempo maximo que el procedimiento espera la entrega del correo antes de informar «pendiente». */
const ESPERA_ENVIO_MS = 30_000;

class ArgumentoInvalidoError extends Error {}

/** Lee `--correo`, `--nombre` y `--emitir-enlace`; el correo y el nombre pueden venir del entorno. */
export function leerArgumentos(argv: readonly string[], env: NodeJS.ProcessEnv): Argumentos {
  const r: Argumentos = { emitirEnlace: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const [nombre, valorEnLinea] = a.split(/=(.*)/s, 2) as [string, string | undefined];
    const siguiente = (): string => {
      if (valorEnLinea !== undefined) return valorEnLinea;
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new ArgumentoInvalidoError();
      return v;
    };
    if (nombre === '--correo') r.correo = siguiente();
    else if (nombre === '--nombre') r.nombre = siguiente();
    else if (nombre === '--emitir-enlace' && valorEnLinea === undefined) r.emitirEnlace = true;
    else throw new ArgumentoInvalidoError();
  }
  r.correo ??= env.ADMIN_CORREO;
  r.nombre ??= env.ADMIN_NOMBRE;
  return r;
}

const verdadero = (v: string | undefined): boolean => v === 'true' || v === '1';

function resumen(comando: ComandoAprovisionamiento, s: SalidaAprovisionamiento): string {
  return `[admin:${comando}] resultado=${s.resultado}`;
}

/**
 * Procedimiento de linea de comandos del administrador inicial (`admin:bootstrap`) y de su reinicio
 * de emergencia (`admin:reiniciar`). Devuelve el codigo de salida. Solo imprime eventos genericos:
 * nunca correo, contrasena, token ni cadena de conexion; la unica excepcion es el enlace pedido con
 * `--emitir-enlace`, que se muestra una vez.
 */
export async function ejecutarCli(e: EntradaCli): Promise<number> {
  let args: Argumentos;
  try {
    args = leerArgumentos(e.argv, e.env);
  } catch {
    e.error(`[admin:${e.comando}] rechazado=ARGUMENTOS_INVALIDOS (usa --correo, --nombre y --emitir-enlace)`);
    return 2;
  }
  const integracionContinua = verdadero(e.env.CI);
  // Se comprueba antes de abrir ninguna conexion: con CI=true no se toca nada.
  if (args.emitirEnlace && integracionContinua) {
    e.error(`[admin:${e.comando}] rechazado=CI_NO_PERMITIDO`);
    return 1;
  }

  const entorno = cargarEntorno(e.env);
  const prisma = crearPrismaClient(entorno.urlBaseDeDatos);
  const modulo = crearModuloIdentidadConPrisma(entorno, prisma, new LoggerConsola());
  const servicio = new AprovisionamientoAdministrador(
    prisma,
    modulo.invitarCuenta,
    modulo.emitirToken,
    new RelojSistemaAdapter(),
    entorno.urlPublicaWeb,
    { integracionContinua, terminal: e.terminal },
  );
  try {
    const opciones = { emitirEnlace: args.emitirEnlace };
    const salida =
      e.comando === 'bootstrap'
        ? await servicio.altaAdministrador({ correo: args.correo ?? '', nombre: args.nombre ?? '' }, opciones)
        : await servicio.reiniciarAdministrador({ correo: args.correo ?? '' }, opciones);
    e.salida(resumen(e.comando, salida));

    if (salida.enlace !== undefined) {
      e.salida('Enlace de activacion (se muestra una sola vez; no lo compartas, no lo guardes ni lo pegues en un chat o registro):');
      e.salida(salida.enlace);
    } else if (salida.resultado === 'creada' || salida.resultado === 'reencolada' || salida.resultado === 'reiniciada') {
      // El correo se entrega desde este proceso; si no se logra, la API lo retoma al iniciar.
      modulo.gestorEnvios.despertar();
      await Promise.race([modulo.gestorEnvios.esperarReposo(), new Promise((r) => setTimeout(r, ESPERA_ENVIO_MS))]);
      const envio = await servicio.estadoEnvioActivacion(salida.usuarioId as string);
      e.salida(`[admin:${e.comando}] envio=${envio} adaptador=${entorno.correo.adaptador}`);
      if (envio !== 'enviado') {
        e.salida('El correo aun no se entrego: se reintentara cuando la API inicie, o usa --emitir-enlace desde tu terminal.');
      }
    } else if (salida.resultado === 'ya_activa') {
      e.salida('La cuenta ya esta activa; no se cambio nada. Para recuperar el acceso usa admin:reiniciar.');
    } else if (salida.resultado === 'suspendida') {
      e.salida('La cuenta esta suspendida; no se cambio nada. Para devolverle el acceso usa admin:reiniciar.');
    }
    return 0;
  } catch (error) {
    if (error instanceof AprovisionamientoRechazadoError) {
      e.error(`[admin:${e.comando}] rechazado=${error.codigo}`);
      return 1;
    }
    // Solo el nombre del error: su mensaje podria contener datos de la consulta o de la conexion.
    e.error(`[admin:${e.comando}] error=${error instanceof Error ? error.name : 'desconocido'}`);
    return 1;
  } finally {
    await modulo.gestorEnvios.detener();
    await prisma.$disconnect();
  }
}
