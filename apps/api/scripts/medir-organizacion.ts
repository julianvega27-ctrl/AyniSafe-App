import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { arch, cpus, platform } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Client } from 'pg';
import { PrismaOrganizacionAdapter } from '../src/modules/identidad/infraestructura/prisma-organizacion.adapter';
import { crearPrismaClient } from '../src/modules/identidad/infraestructura/prisma-cliente';

const { validarUrlPruebas } = require('./modo-pruebas.cjs') as { validarUrlPruebas(value?: string): string };

const SEDES = 13;
const OPERADORES = 30;
const INSTITUCIONES = ['serenazgo', 'serenazgo', 'serenazgo', 'serenazgo', 'serenazgo', 'pnp', 'pnp', 'pnp', 'pnp', 'pnp', 'bomberos', 'bomberos', 'samu'];
const DISTRITOS = ['DIS-01', 'DIS-02', 'DIS-03', 'DIS-04', 'DIS-05'];
const PREFIJO = 'medicion-p32-';

/**
 * Medicion de lectura de la organizacion con datos de demostracion (4 instituciones, 13 sedes y 30
 * operadores), solo sobre una base aislada cuyo nombre termina en `_test`. Inserta datos marcados
 * como demostracion y los elimina al terminar. No mide carga concurrente ni incidentes.
 */
async function main(): Promise<void> {
  const [salida] = process.argv.slice(2);
  if (!salida || process.argv.length !== 3) throw new Error('Indica el archivo de salida.');
  const url = validarUrlPruebas(process.env.TEST_DATABASE_URL);
  const prisma = crearPrismaClient(url);
  const sql = new Client({ connectionString: url });
  await sql.connect();
  try {
    await limpiar(sql);
    const admin = (await sql.query<{ id: string }>(
      `INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
       VALUES ('Admin medicion', $1, 'hash-de-medicion', 'administrador', 'activo', now()) RETURNING id`,
      [`${PREFIJO}admin@ejemplo.com`],
    )).rows[0]!.id;
    const sedes: string[] = [];
    for (let i = 0; i < SEDES; i++) {
      const r = await sql.query<{ id: string }>(
        `INSERT INTO sedes (institucion_id, nombre, nombre_normalizado, distrito_ubicacion_id, es_demostracion, creado_por,
                            verificacion, fuente_verificacion, verificada_en)
         VALUES ($1, $2, lower($2), $3, TRUE, $4, 'verificada', 'Dato de demostracion', '2026-11-25') RETURNING id`,
        [INSTITUCIONES[i], `Sede de demostracion ${i + 1}`, DISTRITOS[i % 5], admin],
      );
      const id = r.rows[0]!.id;
      sedes.push(id);
      for (const d of DISTRITOS.slice(0, 1 + (i % 5))) await sql.query('INSERT INTO coberturas_sede VALUES ($1, $2)', [id, d]);
      for (const c of ['robo', 'asalto', 'incendio', 'emergencia-medica'].slice(0, 1 + (i % 4))) {
        await sql.query('INSERT INTO competencias_sede VALUES ($1, $2)', [id, c]);
      }
    }
    const operadores: string[] = [];
    for (let i = 0; i < OPERADORES; i++) {
      const u = (await sql.query<{ id: string }>(
        `INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
         VALUES ($1, $2, 'hash-de-medicion', 'operador', 'activo', now()) RETURNING id`,
        [`Operador demostracion ${i + 1}`, `${PREFIJO}op${i + 1}@ejemplo.com`],
      )).rows[0]!.id;
      operadores.push(u);
      await sql.query('INSERT INTO pertenencias_operador (usuario_id, sede_id, es_demostracion) VALUES ($1, $2, TRUE)', [u, sedes[i % SEDES]]);
    }
    for (const t of ['instituciones', 'sedes', 'pertenencias_operador', 'coberturas_sede', 'competencias_sede', 'usuarios', 'categorias']) {
      await sql.query(`ANALYZE ${t}`);
    }

    const repo = new PrismaOrganizacionAdapter(prisma);
    const inicio = performance.now();
    await repo.listarSedes();
    const primeraLecturaMs = performance.now() - inicio;
    const listados: number[] = [];
    const ambitos: number[] = [];
    for (let i = 0; i < 30; i++) {
      let t = performance.now();
      const lista = await repo.listarSedes();
      listados.push(performance.now() - t);
      if (lista.length < SEDES) throw new Error('Listado incompleto.');
      t = performance.now();
      const ambito = await repo.ambitoDeOperador(operadores[i]!);
      ambitos.push(performance.now() - t);
      if (!ambito) throw new Error('Ambito vacio inesperado.');
    }
    const resumen = (valores: number[]) => {
      const v = [...valores].sort((a, b) => a - b);
      return { muestras: v.length, minimoMs: v[0], p50Ms: v[Math.ceil(v.length * 0.5) - 1], p95Ms: v[Math.ceil(v.length * 0.95) - 1], maximoMs: v[v.length - 1] };
    };

    // Consultas equivalentes a las del adaptador (mismo texto SQL, parametros posicionales).
    const consultas = [
      {
        nombre: 'listado_sedes',
        sql: `SELECT s.id, s.institucion_id, s.nombre, s.habilitada_atencion,
                     COALESCE((SELECT array_agg(c.distrito_id ORDER BY c.distrito_id) FROM coberturas_sede c WHERE c.sede_id = s.id), '{}') AS distritos,
                     COALESCE((SELECT array_agg(k.categoria_id ORDER BY k.categoria_id) FROM competencias_sede k WHERE k.sede_id = s.id), '{}') AS categorias
                FROM sedes s ORDER BY s.institucion_id, s.nombre_normalizado`,
        valores: [] as string[],
      },
      {
        nombre: 'ambito_operador',
        sql: `SELECT i.id, i.nombre, s.id, s.nombre, s.habilitada_atencion,
                     COALESCE((SELECT array_agg(c.distrito_id ORDER BY c.distrito_id) FROM coberturas_sede c WHERE c.sede_id = s.id), '{}') AS distritos,
                     COALESCE((SELECT array_agg(k.categoria_id ORDER BY k.categoria_id) FROM competencias_sede k WHERE k.sede_id = s.id), '{}') AS categorias
                FROM usuarios u JOIN pertenencias_operador p ON p.usuario_id = u.id
                JOIN sedes s ON s.id = p.sede_id JOIN instituciones i ON i.id = s.institucion_id
               WHERE u.id = $1::uuid AND u.rol = 'operador' AND u.estado = 'activo' AND s.activa AND i.activa`,
        valores: [operadores[0]!],
      },
      {
        nombre: 'sedes_que_cubren_distrito',
        sql: `SELECT s.id FROM coberturas_sede c JOIN sedes s ON s.id = c.sede_id
               WHERE c.distrito_id = $1 AND s.habilitada_atencion`,
        valores: ['DIS-03'],
      },
    ];
    const planes = [];
    for (const q of consultas) {
      planes.push({ nombre: q.nombre, sql: q.sql, plan: (await sql.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.sql}`, q.valores)).rows });
    }
    const volumen = (await sql.query(
      `SELECT (SELECT count(*)::int FROM instituciones) AS instituciones, (SELECT count(*)::int FROM sedes) AS sedes,
              (SELECT count(*)::int FROM pertenencias_operador) AS operadores, (SELECT count(*)::int FROM coberturas_sede) AS coberturas,
              (SELECT count(*)::int FROM competencias_sede) AS competencias`,
    )).rows[0];
    const informe = {
      fecha: '2026-11-25',
      ejecutadoEn: new Date().toISOString(),
      revision: 'estado local sin commit P3.2 sobre 0f2366a',
      ambiente: {
        node: process.version, plataforma: platform(), arquitectura: arch(), cpu: cpus()[0]?.model,
        postgres: (await sql.query('SHOW server_version')).rows[0], prisma: '7.10.1',
        red: 'loopback, PostgreSQL aislado puerto 55433, base *_test', concurrencia: 1,
      },
      volumen,
      primeraLecturaMs,
      listadoSedes: resumen(listados),
      ambitoOperador: resumen(ambitos),
      planes,
      limites: '30 muestras seriales con paginas calientes y sin cache de aplicacion, sobre datos de demostracion generados por el script y eliminados al terminar. Las latencias ejecutan el adaptador Prisma real. Los EXPLAIN usan SQL equivalente al del adaptador. No mide HTTP, carga concurrente, incidentes ni el perfil de 2.000 VU.',
    };
    writeFileSync(salida, JSON.stringify(informe, null, 2) + '\n');
    console.log(JSON.stringify({ salida, volumen, primeraLecturaMs, listadoSedes: informe.listadoSedes, ambitoOperador: informe.ambitoOperador }));
  } finally {
    await limpiar(sql);
    await sql.end();
    await prisma.$disconnect();
  }
}

/** Elimina solo los datos de esta medicion (identificados por el prefijo del correo). */
async function limpiar(sql: Client): Promise<void> {
  const usuarios = `SELECT id FROM usuarios WHERE correo_normalizado LIKE '${PREFIJO}%'`;
  await sql.query(`DELETE FROM pertenencias_operador WHERE usuario_id IN (${usuarios})`);
  const sedes = `SELECT id FROM sedes WHERE creado_por IN (${usuarios})`;
  await sql.query(`DELETE FROM coberturas_sede WHERE sede_id IN (${sedes})`);
  await sql.query(`DELETE FROM competencias_sede WHERE sede_id IN (${sedes})`);
  await sql.query(`DELETE FROM sedes WHERE creado_por IN (${usuarios})`);
  await sql.query(`DELETE FROM usuarios WHERE correo_normalizado LIKE '${PREFIJO}%'`);
}

main().catch(() => {
  console.error('No se pudo completar la medicion de organizacion; no se publican detalles de conexion.');
  process.exitCode = 1;
});
