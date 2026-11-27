import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import type { EventoPersistido } from '../../src/compartido/eventos/eventos';
import { crearArnes, limpiarBd } from './arnes';
import { activarTerritorio, administradorDePrueba, crearSedeDePrueba, registrarIncidente } from './fixtures-enrutamiento';

/**
 * P5.1, tarea 5.3: aclaraciones concurrentes con la entrega de enrutamiento y con una designacion.
 * El orden de bloqueos es evaluacion -> enrutamiento; designar solo bloquea el enrutamiento. Cada
 * ronda tiene un limite de tiempo: un bloqueo mutuo haria fallar la prueba por tiempo.
 */
const sin = crearArnes();
const con = crearArnes({ enrutar: true, prisma: sin.prisma });
const { prisma } = sin;
const RONDAS = 5;
const MOTIVO = 'Confirmado por llamada al lugar';

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  // El procesador de la ronda anterior puede seguir trabajando: limpiar con el en reposo.
  await Promise.all([con.procesador.esperarReposo(), sin.procesador.esperarReposo()]);
  await limpiarBd(prisma);
  await activarTerritorio(prisma);
});

const aclarar = () => con.reportes.evaluacion!.aclarar!;

async function eventoRegistrado(id: string): Promise<EventoPersistido> {
  const ev = await prisma.evento.findFirstOrThrow({ where: { agregadoId: id, tipo: 'IncidenteRegistrado' } });
  return { id: ev.id, tipo: ev.tipo, version: ev.version, agregadoId: ev.agregadoId, carga: ev.carga as never, ocurridoEn: ev.ocurridoEn };
}

function conLimite<T>(p: Promise<T>, ms = 15_000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rechazar) => setTimeout(() => rechazar(new Error('posible bloqueo mutuo')), ms))]);
}

async function versionesSinHuecos(id: string): Promise<number> {
  const v = await prisma.versionEvaluacion.findMany({ where: { incidenteId: id }, orderBy: { version: 'asc' }, select: { version: true } });
  expect(v.map((x) => x.version)).toEqual(v.map((_, i) => i + 1));
  return v.length;
}

describe('concurrencia de aclaraciones', () => {
  it('aclaraciones simultaneas con la entrega de enrutamiento pendiente', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const operador = { origen: 'operador' as const, institucion: 'pnp', usuarioId: pnp.operadores[0]!.id };
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const inc = await registrarIncidente(sin.app, prisma, { categoriaId: 'accidente-transito', descripcion: 'Choque en la avenida', heridos: 'no_se' });
      const evento = await eventoRegistrado(inc.id);
      await conLimite(
        Promise.all([
          aclarar().ejecutar(inc.id, operador, { heridos: 'si', motivo: MOTIVO }),
          con.enrutamiento.enrutar(evento),
          aclarar().ejecutar(inc.id, operador, { cantidadHeridos: 3, motivo: MOTIVO }).catch(() => undefined),
        ]),
      );
      const e = await prisma.enrutamientoIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } });
      const p = await prisma.participacionIncidente.findMany({ where: { incidenteId: inc.id }, orderBy: { institucion: 'asc' } });
      // Coherente con la ultima version (heridos si): SAMU principal, PNP simultanea, sin revision.
      expect(e.revisionMedicaPendiente).toBe(false);
      expect(p.map((x) => [x.institucion, x.papel])).toEqual([
        ['pnp', 'simultanea'],
        ['samu', 'principal'],
      ]);
      expect(await prisma.enrutamientoIncidente.count({ where: { incidenteId: inc.id } })).toBe(1);
      await versionesSinHuecos(inc.id);
    }
  });

  it('aclaracion simultanea con una designacion del administrador en curso', async () => {
    const admin = await administradorDePrueba(prisma);
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    // Sede SAMU sin cobertura del distrito: no es elegible por regla, pero si designable.
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', distritos: ['DIS-02'], categorias: ['accidente-transito'] });
    const operador = { origen: 'operador' as const, institucion: 'pnp', usuarioId: pnp.operadores[0]!.id };
    for (let ronda = 0; ronda < RONDAS; ronda++) {
      const inc = await registrarIncidente(con.app, prisma, { categoriaId: 'accidente-transito', descripcion: 'Choque en la avenida', heridos: 'si' });
      await con.procesador.esperarReposo();
      await con.procesador.procesarPendientes();
      // Pendiente: falta la principal SAMU.
      expect((await prisma.enrutamientoIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } })).resultado).toBe('ENRUTAMIENTO_PENDIENTE');
      const [designada] = await conLimite(
        Promise.allSettled([
          con.enrutamiento.designar(inc.id, { institucion: 'samu', sedeId: samu.id, motivo: 'Sede SAMU mas cercana disponible' }, admin.id),
          aclarar().ejecutar(inc.id, operador, { atencionMedica: 'si', cantidadHeridos: 2, motivo: MOTIVO }),
        ]),
      );
      expect(designada.status).toBe('fulfilled');
      const e = await prisma.enrutamientoIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } });
      expect(e.resultado).toBe('ENRUTADO');
      const principales = await prisma.participacionIncidente.findMany({ where: { incidenteId: inc.id, papel: 'principal' } });
      expect(principales.map((x) => x.institucion)).toEqual(['samu']);
      expect(await versionesSinHuecos(inc.id)).toBe(2);
    }
  });
});
