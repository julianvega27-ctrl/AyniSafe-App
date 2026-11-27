import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { ProcesadorEntregas } from '../../src/compartido/eventos/procesador-entregas';
import type { EventoPersistido } from '../../src/compartido/eventos/eventos';
import { CONSUMIDOR_ENRUTAMIENTO, IncidenteSinOriginalesError } from '../../src/modules/operaciones';
import { crearArnes, limpiarBd } from './arnes';
import { activarTerritorio, crearSedeDePrueba, PUNTO_FUERA, registrarIncidente } from './fixtures-enrutamiento';

/**
 * Consumidor de enrutamiento (P4.2, tarea 4.2). `sin` registra sin enrutar (simula la API antes del
 * consumidor o caida antes de procesar); `con` registra con el consumidor en su procesador.
 */
const sin = crearArnes();
const con = crearArnes({ enrutar: true, prisma: sin.prisma });
const { prisma } = sin;

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
  await activarTerritorio(prisma);
});

async function enrutarTodo(): Promise<void> {
  await con.procesador.esperarReposo();
  await con.procesador.procesarPendientes();
}

async function enrutamientoDe(id: string) {
  const e = await prisma.enrutamientoIncidente.findUnique({ where: { incidenteId: id } });
  const p = await prisma.participacionIncidente.findMany({ where: { incidenteId: id }, orderBy: [{ institucion: 'asc' }, { sedeId: 'asc' }] });
  return { e, p: p.map((x) => ({ sedeId: x.sedeId, institucion: x.institucion, papel: x.papel, origen: x.origen })) };
}

async function eventoRegistrado(id: string): Promise<EventoPersistido> {
  const ev = await prisma.evento.findFirstOrThrow({ where: { agregadoId: id, tipo: 'IncidenteRegistrado' } });
  return { id: ev.id, tipo: ev.tipo, version: ev.version, agregadoId: ev.agregadoId, carga: ev.carga as never, ocurridoEn: ev.ocurridoEn };
}

describe('enrutamiento por la matriz', () => {
  it('robo con su sede PNP queda ENRUTADO, con evento EnrutamientoResuelto y en REGISTRADO', async () => {
    // Dos operadores: el enrutamiento no cambia el estado; la asignacion automatica (P6 grupo D) solo aplica al operador unico.
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'], operadores: ['activo', 'activo'] });
    const inc = await registrarIncidente(con.app, prisma);
    await enrutarTodo();
    const { e, p } = await enrutamientoDe(inc.id);
    expect(e).toMatchObject({ versionRegla: 'matriz-09-v1', categoriaId: 'robo', distritoId: 'DIS-01', resultado: 'ENRUTADO', revisionMedicaPendiente: false, faltantes: [] });
    expect(p).toEqual([{ sedeId: pnp.id, institucion: 'pnp', papel: 'principal', origen: 'regla' }]);
    const resuelto = await prisma.evento.findFirstOrThrow({ where: { agregadoId: inc.id, tipo: 'EnrutamientoResuelto' } });
    expect(resuelto.carga).toEqual({ incidenteId: inc.id, resultado: 'ENRUTADO', origen: 'regla' });
    expect((await prisma.incidente.findUniqueOrThrow({ where: { id: inc.id } })).estado).toBe('REGISTRADO');
    const entrega = await prisma.entregaEvento.findFirstOrThrow({ where: { consumidor: CONSUMIDOR_ENRUTAMIENTO } });
    expect(entrega.estado).toBe('procesada');
  });

  it('accidente con heridos: SAMU principal y PNP simultanea', async () => {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(con.app, prisma, { categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida', heridos: 'si' });
    await enrutarTodo();
    const { e, p } = await enrutamientoDe(inc.id);
    expect(e?.resultado).toBe('ENRUTADO');
    expect(p).toEqual([
      { sedeId: pnp.id, institucion: 'pnp', papel: 'simultanea', origen: 'regla' },
      { sedeId: samu.id, institucion: 'samu', papel: 'principal', origen: 'regla' },
    ]);
  });

  it('accidente sin condicion medica: PNP principal sin SAMU; con condicion desconocida, revision pendiente', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const base = { categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida' };
    const sinCondicion = await registrarIncidente(con.app, prisma, { ...base, heridos: 'no', atencionMedica: 'no' });
    const desconocida = await registrarIncidente(con.app, prisma, { ...base, heridos: 'no_se', atencionMedica: 'no' });
    await enrutarTodo();
    for (const [inc, revision] of [[sinCondicion, false], [desconocida, true]] as const) {
      const { e, p } = await enrutamientoDe(inc.id);
      expect(e?.revisionMedicaPendiente).toBe(revision);
      expect(p).toEqual([{ sedeId: pnp.id, institucion: 'pnp', papel: 'principal', origen: 'regla' }]);
    }
  });

  it('agresion con heridos anade SAMU condicionada', async () => {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['agresion'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['agresion'] });
    const inc = await registrarIncidente(con.app, prisma, { categoriaId: 'agresion', descripcion: 'Golpearon a una persona en el parque', heridos: 'si' });
    await enrutarTodo();
    expect((await enrutamientoDe(inc.id)).p).toEqual([
      { sedeId: pnp.id, institucion: 'pnp', papel: 'principal', origen: 'regla' },
      { sedeId: samu.id, institucion: 'samu', papel: 'condicionada', origen: 'regla' },
    ]);
  });

  it('vandalismo con dos sedes de Serenazgo: ambas participan y el incidente sigue siendo uno', async () => {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['vandalismo'] });
    const s1 = await crearSedeDePrueba(prisma, { institucion: 'serenazgo', categorias: ['vandalismo'] });
    const s2 = await crearSedeDePrueba(prisma, { institucion: 'serenazgo', categorias: ['vandalismo'] });
    const inc = await registrarIncidente(con.app, prisma, { categoriaId: 'vandalismo', descripcion: 'Pintaron las paredes del colegio' });
    await enrutarTodo();
    const { e, p } = await enrutamientoDe(inc.id);
    expect(e?.resultado).toBe('ENRUTADO');
    expect(p).toEqual([
      { sedeId: pnp.id, institucion: 'pnp', papel: 'principal', origen: 'regla' },
      ...[s1.id, s2.id].sort().map((sedeId) => ({ sedeId, institucion: 'serenazgo', papel: 'simultanea', origen: 'regla' })),
    ]);
    expect(await prisma.incidente.count()).toBe(1);
  });
});

describe('ENRUTAMIENTO_PENDIENTE', () => {
  it('sin distrito: pendiente con faltante sin_distrito, sin participaciones', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
    const inc = await registrarIncidente(con.app, prisma, { punto: PUNTO_FUERA });
    await enrutarTodo();
    const { e, p } = await enrutamientoDe(inc.id);
    expect(e).toMatchObject({ resultado: 'ENRUTAMIENTO_PENDIENTE', distritoId: null, faltantes: [{ institucion: 'pnp', papel: 'principal', motivo: 'sin_distrito' }] });
    expect(p).toEqual([]);
    expect((await prisma.incidente.findUniqueOrThrow({ where: { id: inc.id } })).estado).toBe('REGISTRADO');
  });

  it('falta la principal SAMU: PNP participa como simultanea y queda pendiente', async () => {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(con.app, prisma, { categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida', heridos: 'si' });
    await enrutarTodo();
    const { e, p } = await enrutamientoDe(inc.id);
    expect(e).toMatchObject({ resultado: 'ENRUTAMIENTO_PENDIENTE', faltantes: [{ institucion: 'samu', papel: 'principal', motivo: 'sin_sede_elegible' }] });
    expect(p).toEqual([{ sedeId: pnp.id, institucion: 'pnp', papel: 'simultanea', origen: 'regla' }]);
  });

  it('Otra emergencia sin sede de Serenazgo queda pendiente (EQ-19)', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'serenazgo', categorias: ['otra-emergencia'], distritos: ['DIS-02'] });
    const inc = await registrarIncidente(con.app, prisma, { categoriaId: 'otra-emergencia', descripcion: 'Un poste cayó sobre la vereda y bloquea el paso' });
    await enrutarTodo();
    expect((await enrutamientoDe(inc.id)).e).toMatchObject({
      resultado: 'ENRUTAMIENTO_PENDIENTE', faltantes: [{ institucion: 'serenazgo', papel: 'principal', motivo: 'sin_sede_elegible' }],
    });
  });

  it('Otra emergencia con sede de Serenazgo competente llega a Serenazgo (EQ-19)', async () => {
    const ser = await crearSedeDePrueba(prisma, { institucion: 'serenazgo', categorias: ['otra-emergencia'] });
    const inc = await registrarIncidente(con.app, prisma, { categoriaId: 'otra-emergencia', descripcion: 'Un poste cayó sobre la vereda y bloquea el paso' });
    await enrutarTodo();
    expect((await enrutamientoDe(inc.id)).p).toEqual([{ sedeId: ser.id, institucion: 'serenazgo', papel: 'principal', origen: 'regla' }]);
  });
});

describe('idempotencia y recuperacion', () => {
  it('la entrega repetida no duplica el enrutamiento, las participaciones ni el evento', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
    const inc = await registrarIncidente(sin.app, prisma);
    const evento = await eventoRegistrado(inc.id);
    await con.enrutamiento.enrutar(evento);
    await con.enrutamiento.enrutar(evento);
    expect(await prisma.enrutamientoIncidente.count()).toBe(1);
    expect(await prisma.participacionIncidente.count()).toBe(1);
    expect(await prisma.evento.count({ where: { tipo: 'EnrutamientoResuelto' } })).toBe(1);
  });

  it('eventos previos al consumidor (reinicio antes de procesar): se enrutan al arrancar (EQ-10 parcial, EQ-14)', async () => {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const a = await registrarIncidente(sin.app, prisma, { categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida', heridos: 'si' });
    const b = await registrarIncidente(sin.app, prisma);
    expect(await prisma.enrutamientoIncidente.count()).toBe(0);
    // Nueva instancia del procesador con el consumidor: equivale al arranque tras el reinicio.
    const reinicio = new ProcesadorEntregas(prisma, [con.enrutamiento.consumidor()], con.logger);
    try {
      reinicio.iniciar();
      await reinicio.esperarReposo();
    } finally {
      await reinicio.detener();
    }
    expect((await enrutamientoDe(a.id)).p).toEqual([
      { sedeId: pnp.id, institucion: 'pnp', papel: 'simultanea', origen: 'regla' },
      { sedeId: samu.id, institucion: 'samu', papel: 'principal', origen: 'regla' },
    ]);
    expect((await enrutamientoDe(b.id)).e?.resultado).toBe('ENRUTAMIENTO_PENDIENTE');
  });

  it('un incidente sin originales falla, la entrega se reintenta y no se enruta', async () => {
    const fantasma = randomUUID();
    await expect(con.enrutamiento.enrutar({
      id: randomUUID(), tipo: 'IncidenteRegistrado', version: 1, agregadoId: fantasma, carga: { incidenteId: fantasma }, ocurridoEn: new Date(),
    })).rejects.toBeInstanceOf(IncidenteSinOriginalesError);
    await prisma.evento.create({ data: { id: randomUUID(), tipo: 'IncidenteRegistrado', version: 1, agregadoId: fantasma, carga: { incidenteId: fantasma, modalidad: 'invitado' } } });
    const proc = new ProcesadorEntregas(prisma, [con.enrutamiento.consumidor()], con.logger);
    try {
      await proc.procesarPendientes();
    } finally {
      await proc.detener();
    }
    const entrega = await prisma.entregaEvento.findFirstOrThrow({ where: { consumidor: CONSUMIDOR_ENRUTAMIENTO } });
    expect(entrega).toMatchObject({ estado: 'pendiente', intentos: 1 });
    expect(entrega.ultimoError).toMatch(/IncidenteSinOriginales/);
    expect(await prisma.enrutamientoIncidente.count()).toBe(0);
  });
});
