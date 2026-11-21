/**
 * Mide latencia y memoria de Argon2id con los parametros del diseno bajo distintas
 * concurrencias. Resultado orientativo: depende de la maquina. Repetir en el entorno objetivo
 * (Render) antes de habilitar el registro en un entorno compartido.
 * Uso: npx tsx scripts/medir-hash.ts
 */
import os from 'node:os';
import { Argon2idHashAdapter, PARAMETROS_ARGON2ID } from '../src/modules/identidad/infraestructura/argon2id-hash.adapter';

const adapter = new Argon2idHashAdapter();
const clave = 'una contrasena representativa de 30 caracteres';
const mb = (b: number): string => (b / 1024 / 1024).toFixed(0);
const percentil = (xs: number[], p: number): number =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]!;

async function ronda(concurrencia: number): Promise<void> {
  const total = concurrencia * 3;
  const latencias: number[] = [];
  let rssPico = 0;
  const muestreo = setInterval(() => {
    rssPico = Math.max(rssPico, process.memoryUsage().rss);
  }, 10);
  const t0 = performance.now();
  for (let i = 0; i < total; i += concurrencia) {
    await Promise.all(
      Array.from({ length: concurrencia }, async () => {
        const t = performance.now();
        await adapter.hash(clave);
        latencias.push(performance.now() - t);
      }),
    );
  }
  clearInterval(muestreo);
  const dur = performance.now() - t0;
  console.log(
    `${String(concurrencia).padStart(11)} | ${(total / (dur / 1000)).toFixed(1).padStart(8)} | ` +
      `${percentil(latencias, 0.5).toFixed(0).padStart(7)} | ${percentil(latencias, 0.95).toFixed(0).padStart(7)} | ${mb(rssPico).padStart(8)}`,
  );
}

async function main(): Promise<void> {
  console.log(`Argon2id m=${PARAMETROS_ARGON2ID.memoryCost} KiB, t=${PARAMETROS_ARGON2ID.timeCost}, p=${PARAMETROS_ARGON2ID.parallelism}`);
  console.log(`Equipo: ${os.cpus().length} CPU, ${mb(os.totalmem())} MB RAM, Node ${process.version}, UV_THREADPOOL_SIZE=${process.env.UV_THREADPOOL_SIZE ?? '4 (por defecto)'}`);
  await adapter.hash(clave); // calentamiento
  console.log(`RSS base: ${mb(process.memoryUsage().rss)} MB`);
  console.log('concurrencia | hash/seg | p50 ms  | p95 ms  | RSS pico MB');
  for (const c of [1, 2, 4, 8, 16, 32]) await ronda(c);
}

void main();
