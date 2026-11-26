import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { arch, cpus, platform } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Client } from 'pg';
import request from 'supertest';
import { crearApp } from '../src/app';
import { dependenciasRegistro } from '../src/composicion';
import type { ConsumidorEventos } from '../src/compartido/eventos/eventos';
import { ProcesadorEntregas } from '../src/compartido/eventos/procesador-entregas';
import { LoggerSilencioso } from '../src/compartido/logger';
import { cargarEntorno } from '../src/config/entorno';
import { crearModuloConsultasConPrisma, idsDistritosPiloto } from '../src/modules/consultas';
import { crearModuloIdentidadConPrisma } from '../src/modules/identidad';
import { Argon2idHashAdapter } from '../src/modules/identidad/infraestructura/argon2id-hash.adapter';
import { crearPrismaClient } from '../src/modules/identidad/infraestructura/prisma-cliente';
import { crearModuloOperacionesConPrisma } from '../src/modules/operaciones';
import { crearModuloReportesConPrisma, type ModuloReportes } from '../src/modules/reportes';

const { validarUrlPruebas } = require('./modo-pruebas.cjs') as { validarUrlPruebas(value?: string): string };

const POR_MODALIDAD = 100;
const BLOQUEO_CONSUMIDOR_MS = 30_000;
const CORREO = 'medicion-p41@ejemplo.com';
const CLAVE = 'clave de medicion p41 suficientemente larga';

/**
 * Medicion local del registro de incidentes (P4.1, evidencia parcial de EQ-02). Solo sobre una base
 * aislada cuyo nombre termina en `_test`, que se vacia al empezar. Envia en serie 100 registros con
 * cuenta y 100 como invitado por HTTP en proceso (supertest) mientras un consumidor de prueba queda
 * bloqueado 30 s: la confirmacion no debe esperarlo. No mide carga concurrente ni el perfil de 2.000 VU.
 */
async function main(): Promise<void> {
  const [salida] = process.argv.slice(2);
  if (!salida || process.argv.length !== 3) throw new Error('Indica el archivo de salida.');
  const url = validarUrlPruebas(process.env.TEST_DATABASE_URL);
  const sql = new Client({ connectionString: url });
  await sql.connect();
  const prisma = crearPrismaClient(url);
  let liberar: () => void = () => undefined;
  let procesador: ProcesadorEntregas | undefined;
  try {
    await sql.query('TRUNCATE entregas_evento, eventos, solicitudes_envio, envios_incidente, incidentes, sesiones, usuarios, ventanas_intentos CASCADE');
    const entorno = cargarEntorno({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      RATE_LIMIT_HMAC_SECRET: 'medicion-p41-secreto-del-limitador-de-32-caracteres',
      EMAIL_ADAPTER: 'prueba',
    });
    const logger = new LoggerSilencioso();
    const consultas = crearModuloConsultasConPrisma(prisma, entorno.secretoLimitador);
    const operaciones = crearModuloOperacionesConPrisma(prisma);
    let reportes: ModuloReportes | undefined;
    const identidad = crearModuloIdentidadConPrisma(entorno, prisma, logger, {
      distritos: { idsValidos: async () => idsDistritosPiloto() },
      categorias: { idsValidos: () => reportes!.categorias.idsActivos() },
    });
    // Consumidor de prueba que se bloquea 30 s en su primera entrega (servicio externo lento).
    let primeraEntregaEn: number | null = null;
    const bloqueante: ConsumidorEventos = {
      nombre: 'medicion.bloqueante',
      tipos: ['IncidenteRegistrado'],
      manejar: () =>
        new Promise<void>((resolver) => {
          primeraEntregaEn ??= performance.now();
          const t = setTimeout(resolver, BLOQUEO_CONSUMIDOR_MS);
          liberar = () => {
            clearTimeout(t);
            resolver();
          };
        }),
    };
    const p = new ProcesadorEntregas(prisma, [bloqueante], logger);
    procesador = p;
    reportes = crearModuloReportesConPrisma(prisma, {
      ...dependenciasRegistro(prisma, { identidad, consultas, operaciones }, () => p.despertar(), logger),
      secretoSeguimiento: 'medicion-p41-secreto-de-seguimiento-de-32-caracteres',
      limiteInvitado: { maximo: 100_000, ventanaMs: 60 * 60 * 1000 },
    });
    const app = crearApp({ saltosProxyConfianza: 0, identidad, consultas, reportes });

    await sql.query(
      `INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
       VALUES ('Medicion', $1, $2, 'ciudadano', 'activo', now())`,
      [CORREO, await new Argon2idHashAdapter().hash(CLAVE)],
    );
    const login = await request(app).post('/api/v1/auth/ciudadanos/sesiones').send({ correo: CORREO, contrasena: CLAVE });
    if (login.status !== 200) throw new Error('No se pudo iniciar la sesion de medicion.');
    const token = login.body.token as string;

    const cuerpo = (i: number, invitado: boolean) => ({
      categoriaId: ['robo', 'pelea', 'accidente-transito', 'vandalismo'][i % 4],
      descripcion: `Registro de medicion numero ${i}`,
      ocurrencia: { modo: 'ahora', instante: new Date().toISOString() },
      punto: { latitud: -13.16 + i / 10_000, longitud: -74.22, origen: 'manual' },
      ...(invitado ? { telefonoContacto: '987654321' } : {}),
    });
    const medir = async (invitado: boolean) => {
      const tiempos: number[] = [];
      for (let i = 0; i < POR_MODALIDAD; i++) {
        let r = request(app).post('/api/v1/incidentes').set('Content-Type', 'application/json').set('Idempotency-Key', randomUUID());
        if (!invitado) r = r.set('Authorization', `Bearer ${token}`);
        const t = performance.now();
        const res = await r.send(JSON.stringify(cuerpo(i, invitado)));
        tiempos.push(performance.now() - t);
        if (res.status !== 201) throw new Error(`Respuesta inesperada ${res.status}.`);
      }
      return tiempos;
    };
    const inicio = performance.now();
    const cuenta = await medir(false);
    const invitado = await medir(true);
    const duracionMs = performance.now() - inicio;

    const resumen = (valores: number[]) => {
      const v = [...valores].sort((a, b) => a - b);
      return { muestras: v.length, minimoMs: v[0], p50Ms: v[Math.ceil(v.length * 0.5) - 1], p95Ms: v[Math.ceil(v.length * 0.95) - 1], maximoMs: v[v.length - 1] };
    };
    const conteos = (await sql.query(
      `SELECT (SELECT count(*)::int FROM incidentes) AS incidentes, (SELECT count(*)::int FROM envios_incidente) AS envios,
              (SELECT count(*)::int FROM eventos) AS eventos,
              (SELECT count(*)::int FROM entregas_evento WHERE estado = 'procesada') AS entregas_procesadas,
              (SELECT count(*)::int FROM entregas_evento WHERE estado IN ('pendiente', 'en_proceso')) AS entregas_pendientes`,
    )).rows[0];

    // Historial del autor: misma consulta que usara el seguimiento (mas reciente primero, desempate por id).
    for (const t of ['envios_incidente', 'incidentes']) await sql.query(`ANALYZE ${t}`);
    const autor = (await sql.query<{ id: string }>('SELECT id FROM usuarios WHERE correo_normalizado = $1', [CORREO])).rows[0]!.id;
    const historial = `SELECT incidente_id, categoria_id, recibido_en, estado_territorial, distrito_id, motivo_territorial
                         FROM envios_incidente WHERE autor_usuario_id = $1::uuid
                        ORDER BY recibido_en DESC, incidente_id DESC LIMIT 21`;
    const plan = (await sql.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${historial}`, [autor])).rows;

    const informe = {
      fecha: '2026-11-26',
      ejecutadoEn: new Date().toISOString(),
      revision: 'estado local sin commit P4.1 sobre 039e9f4',
      ambiente: {
        node: process.version, plataforma: platform(), arquitectura: arch(), cpu: cpus()[0]?.model,
        postgres: (await sql.query('SHOW server_version')).rows[0], prisma: '7.10.1',
        red: 'loopback, PostgreSQL local puerto 5433, base *_test', http: 'supertest en proceso (sin red TCP externa)', concurrencia: 1,
      },
      escenario: {
        registros: { cuenta: POR_MODALIDAD, invitado: POR_MODALIDAD },
        consumidorBloqueadoMs: BLOQUEO_CONSUMIDOR_MS,
        cartografia: 'sin version territorial activa (todos los envios quedan pendientes sin_cartografia)',
      },
      duracionTotalMs: duracionMs,
      primeraEntregaTomadaTrasInicioMs: primeraEntregaEn === null ? null : primeraEntregaEn - inicio,
      registroConCuenta: resumen(cuenta),
      registroInvitado: resumen(invitado),
      conteosAlTerminar: conteos,
      historialAutor: { sql: historial, plan },
      limites: 'Muestras seriales por HTTP en proceso sobre PostgreSQL local, sin red real, TLS ni arranque en frio. El consumidor bloqueado demuestra que la confirmacion no espera el procesamiento posterior; no reproduce la carga de 50/min durante 10 min de EQ-02 ni el perfil de 2.000 VU. Sin cartografia activa no se mide la resolucion territorial con geometrias reales.',
    };
    writeFileSync(salida, JSON.stringify(informe, null, 2) + '\n');
    console.log(JSON.stringify({ salida, duracionTotalMs: duracionMs, registroConCuenta: informe.registroConCuenta, registroInvitado: informe.registroInvitado, conteos }));
  } finally {
    liberar();
    await procesador?.detener();
    await sql.query('TRUNCATE entregas_evento, eventos, solicitudes_envio, envios_incidente, incidentes, sesiones, usuarios, ventanas_intentos CASCADE').catch(() => undefined);
    await sql.end();
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'No se pudo completar la medicion.');
  process.exitCode = 1;
});
