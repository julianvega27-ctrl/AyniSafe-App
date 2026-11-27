import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { crearArnes, limpiarBd } from './arnes';
import { LimpiezaEvidencias } from '../../src/modules/reportes';
import { PrismaEvidenciasAdapter } from '../../src/modules/reportes/infraestructura/prisma-evidencias.adapter';
import { MemoriaEvidenciasAdapter } from '../../src/modules/reportes/infraestructura/memoria-evidencias.adapter';
import type { AlmacenEvidenciasPort } from '../../src/modules/reportes/aplicacion/puertos/evidencias.port';

/** Limpieza persistente de huerfanas y fallidas (P5.2; design, decision 7), con PostgreSQL real. */
const { app, prisma } = crearArnes();
const repo = new PrismaEvidenciasAdapter(prisma);
const AHORA = () => new Date();

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
});

async function incidente(): Promise<string> {
  const r = await request(app)
    .post('/api/v1/incidentes')
    .set('Content-Type', 'application/json')
    .set('Idempotency-Key', randomUUID())
    .send(
      JSON.stringify({
        categoriaId: 'robo',
        descripcion: 'Me arrebataron el celular en la esquina',
        ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60_000).toISOString() },
        punto: { latitud: 1, longitud: 1, origen: 'manual' },
        telefonoContacto: '987654321',
      }),
    );
  return (await prisma.incidente.findUniqueOrThrow({ where: { referencia: r.body.referencia } })).id;
}

async function fila(incidenteId: string, ranura: number, estado: string, extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  const publicId = `aynisafe/${randomUUID()}`;
  await prisma.evidenciaIncidente.create({
    data: {
      id,
      incidenteId,
      ranura,
      publicId,
      proveedor: 'memoria',
      estado,
      tipoMedio: 'image/jpeg',
      bytes: 100,
      ancho: 10,
      alto: 10,
      sha256: 'a'.repeat(64),
      huellaCarga: 'b'.repeat(64),
      claveIdempotencia: randomUUID(),
      modalidad: 'invitado',
      ...extra,
    },
  });
  return { id, publicId };
}

describe('LimpiezaEvidencias', () => {
  it('una pendiente de mas de 15 min pasa a eliminada con motivo huerfana; una reciente no', async () => {
    const inc = await incidente();
    const almacen = new MemoriaEvidenciasAdapter();
    const vieja = await fila(inc, 1, 'pendiente', { creadaEn: new Date(Date.now() - 16 * 60_000) });
    const reciente = await fila(inc, 2, 'pendiente');
    await almacen.subir(vieja.publicId, Buffer.from('x'), 'image/jpeg');
    const r = await new LimpiezaEvidencias({ evidencias: repo, almacen, ahora: AHORA }).ejecutar();
    expect(r).toEqual({ eliminadas: 1, reprogramadas: 0 });
    const f = await prisma.evidenciaIncidente.findUniqueOrThrow({ where: { id: vieja.id } });
    expect(f).toMatchObject({ estado: 'eliminada', motivoEliminacion: 'huerfana', sha256: null, ancho: null, alto: null });
    expect(f.eliminadaEn).not.toBeNull();
    expect(almacen.existe(vieja.publicId)).toBe(false);
    expect((await prisma.evidenciaIncidente.findUniqueOrThrow({ where: { id: reciente.id } })).estado).toBe('pendiente');
  });

  it('no_existe en el proveedor tambien se marca eliminada', async () => {
    const inc = await incidente();
    const f = await fila(inc, 1, 'eliminacion_pendiente', { motivoEliminacion: 'fallo_carga', proximoIntentoEn: new Date() });
    const r = await new LimpiezaEvidencias({ evidencias: repo, almacen: new MemoriaEvidenciasAdapter(), ahora: AHORA }).ejecutar();
    expect(r.eliminadas).toBe(1);
    expect((await prisma.evidenciaIncidente.findUniqueOrThrow({ where: { id: f.id } })).estado).toBe('eliminada');
  });

  it('un fallo del almacen incrementa intentos y reprograma; la evidencia sigue sin ofrecerse', async () => {
    const inc = await incidente();
    const almacen = new MemoriaEvidenciasAdapter();
    almacen.fallarEliminar = true;
    const f = await fila(inc, 1, 'eliminacion_pendiente', { motivoEliminacion: 'fallo_carga', proximoIntentoEn: new Date() });
    const r = await new LimpiezaEvidencias({ evidencias: repo, almacen, ahora: AHORA }).ejecutar();
    expect(r).toEqual({ eliminadas: 0, reprogramadas: 1 });
    const g = await prisma.evidenciaIncidente.findUniqueOrThrow({ where: { id: f.id } });
    expect(g.estado).toBe('eliminacion_pendiente');
    expect(g.intentosEliminacion).toBe(1);
    expect(g.proximoIntentoEn!.getTime()).toBeGreaterThan(Date.now() + 50_000);
    expect(await repo.disponibles([inc])).toEqual([]);
  });

  it('tras un reinicio (instancia nueva) procesa los pendientes', async () => {
    const inc = await incidente();
    await fila(inc, 1, 'eliminacion_pendiente', { motivoEliminacion: 'fallo_carga', proximoIntentoEn: new Date() });
    await fila(inc, 2, 'eliminacion_pendiente', { motivoEliminacion: 'fallo_carga', proximoIntentoEn: null });
    const nueva = new LimpiezaEvidencias({ evidencias: new PrismaEvidenciasAdapter(prisma), almacen: new MemoriaEvidenciasAdapter(), ahora: AHORA });
    expect((await nueva.ejecutar()).eliminadas).toBe(2);
  });

  it('dos procesos concurrentes no eliminan dos veces el mismo public_id', async () => {
    const inc = await incidente();
    for (let r = 1; r <= 3; r++) await fila(inc, r, 'eliminacion_pendiente', { motivoEliminacion: 'fallo_carga', proximoIntentoEn: new Date() });
    const llamadas: string[] = [];
    const contador = (): AlmacenEvidenciasPort => {
      const m = new MemoriaEvidenciasAdapter();
      return {
        proveedor: 'memoria',
        subir: (...a) => m.subir(...a),
        obtener: (...a) => m.obtener(...a),
        eliminar: async (pid) => {
          llamadas.push(pid);
          await new Promise((r) => setTimeout(r, 30));
          return m.eliminar(pid);
        },
      };
    };
    const a = new LimpiezaEvidencias({ evidencias: new PrismaEvidenciasAdapter(prisma), almacen: contador(), ahora: AHORA });
    const b = new LimpiezaEvidencias({ evidencias: new PrismaEvidenciasAdapter(prisma), almacen: contador(), ahora: AHORA });
    const [ra, rb] = await Promise.all([a.ejecutar(), b.ejecutar()]);
    expect(ra.eliminadas + rb.eliminadas).toBe(3);
    expect(new Set(llamadas).size).toBe(llamadas.length);
    expect(llamadas).toHaveLength(3);
  });

  it('el almacen solo recibe public_id leidos de la tabla', async () => {
    const inc = await incidente();
    const registrados = [
      (await fila(inc, 1, 'eliminacion_pendiente', { motivoEliminacion: 'fallo_carga', proximoIntentoEn: new Date() })).publicId,
      (await fila(inc, 2, 'pendiente', { creadaEn: new Date(Date.now() - 20 * 60_000) })).publicId,
    ];
    const vistos: string[] = [];
    const m = new MemoriaEvidenciasAdapter();
    await new LimpiezaEvidencias({
      evidencias: repo,
      almacen: { proveedor: 'memoria', subir: (...a) => m.subir(...a), obtener: (...a) => m.obtener(...a), eliminar: async (p) => (vistos.push(p), m.eliminar(p)) },
      ahora: AHORA,
    }).ejecutar();
    expect(vistos.sort()).toEqual(registrados.sort());
  });

  it('sin almacen configurado conserva las tareas', async () => {
    const inc = await incidente();
    const f = await fila(inc, 1, 'eliminacion_pendiente', { motivoEliminacion: 'fallo_carga', proximoIntentoEn: new Date() });
    expect(await new LimpiezaEvidencias({ evidencias: repo, almacen: null, ahora: AHORA }).ejecutar()).toEqual({ eliminadas: 0, reprogramadas: 0 });
    expect((await prisma.evidenciaIncidente.findUniqueOrThrow({ where: { id: f.id } })).estado).toBe('eliminacion_pendiente');
  });
});
