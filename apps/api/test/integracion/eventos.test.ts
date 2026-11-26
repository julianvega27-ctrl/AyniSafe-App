import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import type { ConsumidorEventos, EventoPersistido } from '../../src/compartido/eventos/eventos';
import { contarEntregas, PrismaPublicadorEventos, reintentarFallidas } from '../../src/compartido/eventos/prisma-eventos';
import { ProcesadorEntregas } from '../../src/compartido/eventos/procesador-entregas';
import { PrismaUnidadDeTrabajo } from '../../src/compartido/prisma-transaccion';
import { crearPrismaClient, type PrismaClient } from '../../src/modules/identidad/infraestructura/prisma-cliente';
import { LoggerCapturado, urlPruebas } from './arnes';

let prisma: PrismaClient;
const uow = () => new PrismaUnidadDeTrabajo(prisma);
const publicador = new PrismaPublicadorEventos();

async function publicar(n = 1): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const agregado = randomUUID();
    ids.push(
      await uow().enTransaccion((tx) =>
        publicador.publicar(tx, { tipo: 'IncidenteRegistrado', version: 1, agregadoId: agregado, carga: { incidenteId: agregado } }),
      ),
    );
  }
  return ids;
}

/** Consumidor idempotente: escribe un efecto por evento con ON CONFLICT DO NOTHING. */
function consumidorConEfecto(nombre: string, comportamiento?: (e: EventoPersistido) => Promise<void> | void): ConsumidorEventos & {
  llamadas: string[];
} {
  const llamadas: string[] = [];
  return {
    nombre,
    tipos: ['IncidenteRegistrado'],
    llamadas,
    async manejar(e) {
      llamadas.push(e.id);
      await comportamiento?.(e);
      await prisma.$executeRaw`INSERT INTO prueba_efectos_evento (evento_id, consumidor) VALUES (${e.id}::uuid, ${nombre}) ON CONFLICT DO NOTHING`;
    },
  };
}

class FalloPrueba extends Error {
  override name = 'FalloPrueba';
}

async function entregas(consumidor: string) {
  return prisma.entregaEvento.findMany({ where: { consumidor }, orderBy: { eventoId: 'asc' } });
}
async function efectos(consumidor: string): Promise<number> {
  const [f] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM prueba_efectos_evento WHERE consumidor = ${consumidor}`;
  return Number(f!.n);
}

beforeAll(async () => {
  prisma = crearPrismaClient(urlPruebas());
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS prueba_efectos_evento (evento_id UUID NOT NULL, consumidor TEXT NOT NULL, PRIMARY KEY (evento_id, consumidor))',
  );
});
afterAll(async () => {
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS prueba_efectos_evento');
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE entregas_evento, eventos, prueba_efectos_evento CASCADE');
});

describe('evento en la transaccion del hecho', () => {
  it('si la transaccion se revierte no queda evento', async () => {
    await expect(
      uow().enTransaccion(async (tx) => {
        await publicador.publicar(tx, { tipo: 'IncidenteRegistrado', version: 1, agregadoId: randomUUID(), carga: {} });
        throw new FalloPrueba();
      }),
    ).rejects.toThrow(FalloPrueba);
    expect(await prisma.evento.count()).toBe(0);
  });
});

describe('entregas por consumidor', () => {
  it('sin consumidores registrados el evento se conserva sin entregas', async () => {
    await publicar();
    const p = new ProcesadorEntregas(prisma, [], new LoggerCapturado());
    expect(await p.procesarPendientes()).toBe(0);
    expect(await prisma.evento.count()).toBe(1);
    expect(await prisma.entregaEvento.count()).toBe(0);
  });

  it('dos consumidores se procesan de forma independiente: el fallo de uno no bloquea al otro', async () => {
    await publicar();
    const a = consumidorConEfecto('prueba.a');
    const b = consumidorConEfecto('prueba.b', () => {
      throw new FalloPrueba();
    });
    await new ProcesadorEntregas(prisma, [a, b], new LoggerCapturado(), { esperaBaseMs: 60_000 }).procesarPendientes();
    expect((await entregas('prueba.a'))[0]).toMatchObject({ estado: 'procesada', intentos: 1 });
    expect((await entregas('prueba.b'))[0]).toMatchObject({ estado: 'pendiente', intentos: 1, ultimoError: 'FalloPrueba' });
    expect(await efectos('prueba.a')).toBe(1);
  });

  it('un consumidor registrado despues recibe los eventos anteriores', async () => {
    await publicar(3);
    await new ProcesadorEntregas(prisma, [consumidorConEfecto('prueba.a')], new LoggerCapturado()).procesarPendientes();
    const tardio = consumidorConEfecto('prueba.tardio');
    await new ProcesadorEntregas(prisma, [tardio], new LoggerCapturado()).procesarPendientes();
    expect(tardio.llamadas).toHaveLength(3);
    expect((await entregas('prueba.tardio')).every((e) => e.estado === 'procesada')).toBe(true);
  });

  it('ignora eventos de tipos a los que el consumidor no se suscribe', async () => {
    await uow().enTransaccion((tx) =>
      publicador.publicar(tx, { tipo: 'OtroHecho', version: 1, agregadoId: randomUUID(), carga: {} }),
    );
    const c = consumidorConEfecto('prueba.a');
    await new ProcesadorEntregas(prisma, [c], new LoggerCapturado()).procesarPendientes();
    expect(c.llamadas).toHaveLength(0);
    expect(await prisma.entregaEvento.count()).toBe(0);
  });
});

describe('reintentos y fallo definitivo', () => {
  it('un fallo transitorio se reintenta con espera creciente y termina procesado', async () => {
    await publicar();
    let llamadas = 0;
    const c = consumidorConEfecto('prueba.a', () => {
      llamadas += 1;
      if (llamadas === 1) throw new FalloPrueba();
    });
    const logger = new LoggerCapturado();
    const p = new ProcesadorEntregas(prisma, [c], logger, { esperaBaseMs: 400 });
    await p.procesarPendientes();
    const tras1 = (await entregas('prueba.a'))[0]!;
    expect(tras1).toMatchObject({ estado: 'pendiente', intentos: 1 });
    expect(tras1.proximoIntentoEn.getTime() - Date.now()).toBeGreaterThan(100);
    // Antes de vencer la espera no se reintenta.
    await p.procesarPendientes();
    expect(llamadas).toBe(1);
    await new Promise((r) => setTimeout(r, 450));
    await p.procesarPendientes();
    expect((await entregas('prueba.a'))[0]).toMatchObject({ estado: 'procesada', intentos: 2, ultimoError: null });
    expect(logger.eventos.map((e) => e.resultado)).toEqual(['reintento', 'recuperada']);
  });

  it('tras agotar los intentos queda fallida, identificable y recuperable manualmente', async () => {
    const [eventoId] = await publicar();
    let fallar = true;
    const c = consumidorConEfecto('prueba.a', () => {
      if (fallar) throw new FalloPrueba();
    });
    const logger = new LoggerCapturado();
    const p = new ProcesadorEntregas(prisma, [c], logger, { esperaBaseMs: 0, maxIntentos: 8 });
    await p.procesarPendientes();
    expect((await entregas('prueba.a'))[0]).toMatchObject({ estado: 'fallida', intentos: 8, ultimoError: 'FalloPrueba' });
    expect(c.llamadas).toHaveLength(8);
    expect(logger.eventos.at(-1)).toMatchObject({ evento: 'entrega_evento', resultado: 'fallida', error: 'FalloPrueba' });
    expect(logger.eventos.at(-1)?.detalle).toEqual({ eventoId, consumidor: 'prueba.a', intentos: 8 });
    // Fallida no se reintenta sola.
    await p.procesarPendientes();
    expect(c.llamadas).toHaveLength(8);
    expect(await contarEntregas(prisma)).toEqual([{ consumidor: 'prueba.a', estado: 'fallida', total: 1 }]);
    // Recuperacion documentada.
    fallar = false;
    expect(await reintentarFallidas(prisma, 'prueba.a')).toBe(1);
    await p.procesarPendientes();
    expect(await contarEntregas(prisma)).toEqual([{ consumidor: 'prueba.a', estado: 'procesada', total: 1 }]);
  });
});

describe('recuperacion y concurrencia', () => {
  it('dos procesadores concurrentes no toman la misma entrega', async () => {
    await publicar(30);
    const vistas = new Map<string, number>();
    const contar = (e: EventoPersistido) => {
      vistas.set(e.id, (vistas.get(e.id) ?? 0) + 1);
      return new Promise<void>((r) => setTimeout(r, 5));
    };
    const otroPrisma = crearPrismaClient(urlPruebas());
    try {
      const p1 = new ProcesadorEntregas(prisma, [consumidorConEfecto('prueba.a', contar)], new LoggerCapturado(), { lote: 5 });
      const p2 = new ProcesadorEntregas(otroPrisma, [consumidorConEfecto('prueba.a', contar)], new LoggerCapturado(), { lote: 5 });
      const [n1, n2] = await Promise.all([p1.procesarPendientes(), p2.procesarPendientes()]);
      expect(n1 + n2).toBe(30);
      expect(vistas.size).toBe(30);
      expect([...vistas.values()].every((v) => v === 1)).toBe(true);
    } finally {
      await otroPrisma.$disconnect();
    }
  });

  it('una entrega en proceso con bloqueo vencido se retoma; con bloqueo vigente no', async () => {
    const [eventoId] = await publicar();
    await prisma.$executeRaw`INSERT INTO entregas_evento (evento_id, consumidor, estado, bloqueado_hasta)
      VALUES (${eventoId}::uuid, 'prueba.a', 'en_proceso', now() + interval '1 minute')`;
    const c = consumidorConEfecto('prueba.a');
    const p = new ProcesadorEntregas(prisma, [c], new LoggerCapturado());
    await p.procesarPendientes();
    expect(c.llamadas).toHaveLength(0);
    await prisma.$executeRaw`UPDATE entregas_evento SET bloqueado_hasta = now() - interval '1 second'`;
    await p.procesarPendientes();
    expect(c.llamadas).toEqual([eventoId]);
    expect((await entregas('prueba.a'))[0]?.estado).toBe('procesada');
  });

  it('repetir una entrega tras una caida antes de marcarla no duplica el efecto del consumidor', async () => {
    await publicar();
    const c = consumidorConEfecto('prueba.a');
    const p = new ProcesadorEntregas(prisma, [c], new LoggerCapturado());
    await p.procesarPendientes();
    // Simula que el proceso cayo tras el efecto y antes de marcar: la entrega quedo en proceso.
    await prisma.$executeRaw`UPDATE entregas_evento SET estado = 'en_proceso', procesada_en = NULL,
      bloqueado_hasta = now() - interval '1 second'`;
    await p.procesarPendientes();
    expect(c.llamadas).toHaveLength(2);
    expect(await efectos('prueba.a')).toBe(1);
    expect((await entregas('prueba.a'))[0]?.estado).toBe('procesada');
  });

  it('una marca tardia con un bloqueo ya reemplazado no pisa la entrega retomada por otra pasada', async () => {
    await publicar();
    let liberar: () => void = () => undefined;
    const lento = consumidorConEfecto('prueba.a', () => new Promise<void>((r) => (liberar = r)));
    const p1 = new ProcesadorEntregas(prisma, [lento], new LoggerCapturado(), { bloqueoMs: 50 });
    const enCurso = p1.procesarPendientes();
    await new Promise((r) => setTimeout(r, 200));
    // Otra pasada retoma la entrega con bloqueo vencido y falla: queda pendiente con un intento.
    const p2 = new ProcesadorEntregas(
      prisma,
      [consumidorConEfecto('prueba.a', () => { throw new FalloPrueba(); })],
      new LoggerCapturado(),
      { esperaBaseMs: 60_000 },
    );
    await p2.procesarPendientes();
    liberar();
    await enCurso;
    expect((await entregas('prueba.a'))[0]).toMatchObject({ estado: 'pendiente', intentos: 1 });
  });

  it('el gestor reanuda al arrancar las entregas que quedaron pendientes antes de un reinicio (EQ-14)', async () => {
    await publicar(2);
    // Primera instancia: se detiene antes de procesar (simula caida tras el commit).
    const antes = new ProcesadorEntregas(prisma, [consumidorConEfecto('prueba.a')], new LoggerCapturado());
    await antes.detener();
    expect(await efectos('prueba.a')).toBe(0);
    // Nueva instancia tras el reinicio.
    const despues = new ProcesadorEntregas(prisma, [consumidorConEfecto('prueba.a')], new LoggerCapturado());
    despues.iniciar();
    await despues.esperarReposo();
    await despues.detener();
    expect(await efectos('prueba.a')).toBe(2);
    expect(await contarEntregas(prisma)).toEqual([{ consumidor: 'prueba.a', estado: 'procesada', total: 2 }]);
    expect(despues.hayTemporizador()).toBe(false);
  });
});
