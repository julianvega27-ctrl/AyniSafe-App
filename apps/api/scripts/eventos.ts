import 'dotenv/config';
import { contarEntregas, reintentarFallidas } from '../src/compartido/eventos/prisma-eventos';
import { crearPrismaClient, type PrismaClient } from '../src/modules/identidad/infraestructura/prisma-cliente';

const CONSUMIDOR = /^[a-z][a-z0-9.-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const USO = 'Uso: eventos estado | eventos reintentar --consumidor <nombre> [--evento <id>]';

/**
 * CLI local de observabilidad y recuperacion de entregas (ADR-004). `estado` cuenta entregas por
 * consumidor y estado; `reintentar` devuelve a pendiente las fallidas de un consumidor o de un evento.
 * Solo imprime identificadores y conteos: los eventos no contienen datos personales.
 */
export async function ejecutar(args: readonly string[], prisma?: PrismaClient): Promise<string> {
  const [accion, ...opciones] = args;
  if (accion === 'estado') {
    if (opciones.length) throw new Error(USO);
    return conCliente(prisma, async (p) => JSON.stringify({ accion: 'estado', entregas: await contarEntregas(p) }));
  }
  if (accion !== 'reintentar') throw new Error(USO);
  // Solo pares `--bandera valor`, sin repetir banderas.
  const pares = new Map<string, string>();
  if (opciones.length % 2 !== 0) throw new Error(USO);
  for (let i = 0; i < opciones.length; i += 2) {
    const [bandera, v] = [opciones[i]!, opciones[i + 1]!];
    if (!['--consumidor', '--evento'].includes(bandera) || pares.has(bandera)) throw new Error(USO);
    pares.set(bandera, v);
  }
  const consumidor = pares.get('--consumidor');
  const evento = pares.get('--evento');
  if (!consumidor || !CONSUMIDOR.test(consumidor) || (evento !== undefined && !UUID.test(evento))) throw new Error(USO);
  return conCliente(prisma, async (p) => {
    const reintentadas = await reintentarFallidas(p, consumidor, evento);
    return JSON.stringify({ accion: 'reintentar', consumidor, ...(evento ? { evento } : {}), reintentadas });
  });
}

async function conCliente<T>(prisma: PrismaClient | undefined, fn: (p: PrismaClient) => Promise<T>): Promise<T> {
  if (prisma) return fn(prisma);
  if (!process.env.DATABASE_URL) throw new Error('Falta la configuración de base de datos.');
  const propio = crearPrismaClient(process.env.DATABASE_URL);
  try {
    return await fn(propio);
  } finally {
    await propio.$disconnect();
  }
}

if (require.main === module) {
  ejecutar(process.argv.slice(2)).then(
    (salida) => console.log(salida),
    (e: unknown) => {
      // Solo el mensaje de uso; nunca errores del driver ni la URL de la base.
      console.error(e instanceof Error && e.message === USO ? USO : 'No se pudo completar la operación de eventos.');
      process.exitCode = 1;
    },
  );
}
