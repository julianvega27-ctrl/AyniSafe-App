import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Client } from 'pg';
import { crearPrismaClient } from '../src/modules/identidad/infraestructura/prisma-cliente';
import { PrismaTerritorioAdapter } from '../src/modules/consultas/infraestructura/prisma-territorio.adapter';
import { ConsultarTerritorio } from '../src/modules/consultas/aplicacion/territorio.use-case';
import { sha256, CONTRASTE_INEI } from '../src/modules/consultas/infraestructura/paquete-territorial';
import type { Posicion, Poligono } from '../src/modules/consultas/dominio/territorio';

/** Ensayo de lectura, sin carga, importación ni modificación de datos. */
async function main(): Promise<void> {
  const [salida] = process.argv.slice(2);
  if (!salida || process.argv.length !== 3 || !process.env.DATABASE_URL) throw new Error('Indica archivo de salida y configura la base.');
  const bytes = readFileSync('data/ayacucho-metropolitano.geojson');
  if (sha256(bytes) !== CONTRASTE_INEI.sha256Archivo) throw new Error('No coincide el paquete contrastado.');
  const fuente = JSON.parse(bytes.toString('utf8')) as { features: { properties: { code: string; name: string }; bbox: number[];
    geometry: { type: 'MultiPolygon'; coordinates: Poligono[] } }[] };
  const prisma = crearPrismaClient(process.env.DATABASE_URL);
  const sql = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await sql.connect();
    const repo = new PrismaTerritorioAdapter(prisma), servicio = new ConsultarTerritorio(repo);
    const inicio = performance.now(), snapshot = await repo.leer(), primeraLecturaMs = performance.now() - inicio;
    if (!snapshot || snapshot.metadatos.sha256Archivo !== CONTRASTE_INEI.sha256Archivo) throw new Error('Activa primero el paquete contrastado.');
    // Oráculo independiente: operadores geométricos nativos de PostgreSQL sobre el GeoJSON fuente.
    // No usa el algoritmo TS para seleccionar el punto esperado, ni supone que el centroide sea interior.
    const esInteriorFuente = async (p: Posicion, polys: Poligono[]): Promise<boolean> => {
      for (const poly of polys) {
        let interior = false;
        for (let i = 0; i < poly.length; i++) {
          const texto = `(${poly[i]!.map(([x, y]) => `(${x},${y})`).join(',')})`;
          const r = await sql.query<{ dentro: boolean }>('SELECT point($1,$2) <@ $3::polygon AS dentro', [p[0], p[1], texto]);
          if (i === 0) interior = r.rows[0]!.dentro;
          else if (r.rows[0]!.dentro) interior = false;
        }
        if (interior) return true;
      }
      return false;
    };
    const puntos = [];
    for (const f of fuente.features) {
      let referencia: Posicion | undefined;
      buscar: for (const fx of [0.5, 0.25, 0.75, 0.125, 0.875]) for (const fy of [0.5, 0.25, 0.75, 0.125, 0.875]) {
        const p: Posicion = [f.bbox[0]! + (f.bbox[2]! - f.bbox[0]!) * fx, f.bbox[1]! + (f.bbox[3]! - f.bbox[1]!) * fy];
        const pertenecientes = [];
        for (const otra of fuente.features) if (await esInteriorFuente(p, otra.geometry.coordinates)) pertenecientes.push(otra.properties.code);
        if (pertenecientes.length === 1 && pertenecientes[0] === f.properties.code) { referencia = p; break buscar; }
      }
      if (!referencia) throw new Error('No se pudo obtener un punto de referencia inequívoco.');
      const resultado = await servicio.resolver({ latitud: referencia[1], longitud: referencia[0] });
      if (resultado.distrito?.ubigeo !== f.properties.code || resultado.version !== snapshot.version) throw new Error('La clasificación no coincide con el oráculo.');
      puntos.push({ fuente: CONTRASTE_INEI.evidencia, oraculo: 'PostgreSQL point <@ polygon sobre GeoJSON INEI contrastado',
        ubigeoEsperado: f.properties.code, latitud: referencia[1], longitud: referencia[0], resultado });
    }
    const lecturas: number[] = [], resoluciones: number[] = [];
    for (let i = 0; i < 30; i++) {
      let t = performance.now(); await repo.leer(); lecturas.push(performance.now() - t);
      t = performance.now(); await servicio.resolver({ latitud: puntos[0]!.latitud, longitud: puntos[0]!.longitud }); resoluciones.push(performance.now() - t);
    }
    const resumen = (valores: number[]) => {
      const v = [...valores].sort((a, b) => a - b);
      return { muestras: v.length, minimoMs: v[0], p50Ms: v[Math.ceil(v.length * 0.5) - 1], p95Ms: v[Math.ceil(v.length * 0.95) - 1], maximoMs: v[v.length - 1] };
    };
    const consultas = [
      { nombre: 'puntero_activo', sql: 'SELECT version_id FROM estado_territorial WHERE ambito=$1', valores: ['ayacucho-metropolitano'] },
      { nombre: 'version', sql: 'SELECT id,metadatos FROM versiones_territoriales WHERE id=$1', valores: [snapshot.version] },
      { nombre: 'geometrias_y_distritos', sql: 'SELECT g.*,d.nombre FROM geometrias_distritales g JOIN distritos d ON d.id=g.distrito_id WHERE g.version_id=$1 ORDER BY g.distrito_id', valores: [snapshot.version] },
    ];
    await sql.query('ANALYZE estado_territorial'); await sql.query('ANALYZE versiones_territoriales');
    await sql.query('ANALYZE geometrias_distritales'); await sql.query('ANALYZE distritos');
    const planes = [];
    for (const q of consultas) planes.push({ nombre: q.nombre, sql: q.sql, plan: (await sql.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.sql}`, q.valores)).rows });
    const volumen = await sql.query('SELECT count(*)::int AS geometrias, sum(pg_column_size(geometria))::int AS bytes_geometrias FROM geometrias_distritales WHERE version_id=$1', [snapshot.version]);
    const informe = { fecha: '2026-11-25', ejecutadoEn: new Date().toISOString(), revision: 'estado local sin commit P3.1',
      ambiente: { node: process.version, plataforma: platform(), arquitectura: arch(), cpu: cpus()[0]?.model,
        postgres: (await sql.query('SHOW server_version')).rows[0], prisma: '7.10.1', red: 'loopback, PostgreSQL aislado puerto 55433', concurrencia: 1 },
      version: snapshot.version, sha256Geojson: sha256(bytes), volumen: volumen.rows[0], primeraLecturaMs,
      lecturaSnapshot: resumen(lecturas), resolucionConLectura: resumen(resoluciones), puntos, planes,
      limites: '30 muestras seriales con páginas calientes y sin caché de aplicación. Primera lectura incluye apertura del pool, no arranque del servicio. Oráculo nativo usa el mismo contorno de fuente; no es levantamiento en campo ni validación legal. No mide incidentes, clientes ni carga concurrente.' };
    writeFileSync(salida, JSON.stringify(informe, null, 2) + '\n');
    console.log(JSON.stringify({ salida, version: snapshot.version, puntosComprobados: puntos.length,
      lectura: informe.lecturaSnapshot, resolucion: informe.resolucionConLectura }));
  } finally { await sql.end(); await prisma.$disconnect(); }
}
main().catch(() => { console.error('No se pudo completar la medición territorial; no se publican detalles de conexión.'); process.exitCode = 1; });
