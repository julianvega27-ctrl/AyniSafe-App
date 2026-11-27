import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { crearArnes, crearCuentaDePrueba, limpiarBd } from './arnes';
import { activarTerritorio, crearSedeDePrueba, PUNTO_FUERA, registrarIncidente } from './fixtures-enrutamiento';

/**
 * P5.1, tareas 5.1 y 5.2: enrutamiento con la condicion vigente y recalculo por la condicion medica.
 * `sin` registra sin enrutar (entrega pendiente); `con` procesa las entregas con el consumidor.
 */
const sin = crearArnes();
const con = crearArnes({ enrutar: true, prisma: sin.prisma });
const { prisma } = sin;
const aclarar = () => {
  const a = con.reportes.evaluacion?.aclarar;
  if (!a) throw new Error('Aclaraciones no compuestas');
  return a;
};

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

async function estado(id: string) {
  const e = await prisma.enrutamientoIncidente.findUniqueOrThrow({ where: { incidenteId: id } });
  const p = await prisma.participacionIncidente.findMany({ where: { incidenteId: id }, orderBy: [{ institucion: 'asc' }] });
  return {
    resultado: e.resultado,
    revision: e.revisionMedicaPendiente,
    faltantes: e.faltantes,
    participaciones: p.map((x) => [x.institucion, x.papel, x.origen]),
  };
}

const ACCIDENTE = { categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida' };
const operadorDe = (sede: { operadores: readonly { id: string }[] }, institucion: string) => ({
  origen: 'operador' as const,
  institucion,
  usuarioId: sede.operadores[0]!.id,
});
const MOTIVO = 'Confirmado por llamada al lugar';

async function unaPrincipal(id: string): Promise<void> {
  const principales = await prisma.participacionIncidente.findMany({ where: { incidenteId: id, papel: 'principal' }, distinct: ['institucion'] });
  expect(principales.length).toBeLessThanOrEqual(1);
}

describe('enrutamiento inicial con la condicion vigente (5.1)', () => {
  it('una aclaracion confirmada antes de la entrega produce SAMU principal y PNP simultanea', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(sin.app, prisma, { ...ACCIDENTE, heridos: 'no_se' });
    await aclarar().ejecutar(inc.id, operadorDe(pnp, 'pnp'), { heridos: 'si', motivo: MOTIVO });
    expect(await prisma.enrutamientoIncidente.count()).toBe(0);
    await enrutarTodo();
    expect(await estado(inc.id)).toEqual({
      resultado: 'ENRUTADO',
      revision: false,
      faltantes: [],
      participaciones: [
        ['pnp', 'simultanea', 'regla'],
        ['samu', 'principal', 'regla'],
      ],
    });
    // El recalculo no actuo (no habia enrutamiento): no hay auditoria ni segundo enrutamiento.
    expect(await prisma.cambioEnrutamiento.count()).toBe(0);
  });

  it('una entrega repetida no duplica nada y un robo se enruta igual que en P4', async () => {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
    const robo = await registrarIncidente(con.app, prisma);
    await enrutarTodo();
    await con.enrutamiento.enrutar({
      ...(await prisma.evento.findFirstOrThrow({ where: { agregadoId: robo.id, tipo: 'IncidenteRegistrado' } })),
      carga: {},
    } as never);
    expect((await estado(robo.id)).participaciones).toEqual([['pnp', 'principal', 'regla']]);
    expect(await prisma.participacionIncidente.count({ where: { sedeId: pnp.id } })).toBe(1);
  });
});

describe('recalculo por la condicion medica (5.2)', () => {
  it('accidente con revision pendiente: heridos si pasa a SAMU principal y PNP simultanea, con auditoria y evento', async () => {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(con.app, prisma, { ...ACCIDENTE, heridos: 'no_se' });
    await enrutarTodo();
    expect((await estado(inc.id)).revision).toBe(true);

    const r = await aclarar().ejecutar(inc.id, operadorDe(pnp, 'pnp'), { heridos: 'si', motivo: MOTIVO });
    expect(r).toMatchObject({ nueva: true, version: 2, samuIncorporado: true });
    expect(await estado(inc.id)).toEqual({
      resultado: 'ENRUTADO',
      revision: false,
      faltantes: [],
      participaciones: [
        ['pnp', 'simultanea', 'regla'],
        ['samu', 'principal', 'condicion_medica'],
      ],
    });
    expect((await prisma.participacionIncidente.findFirstOrThrow({ where: { sedeId: samu.id } })).incidenteId).toBe(inc.id);
    await unaPrincipal(inc.id);

    const cambio = await prisma.cambioEnrutamiento.findFirstOrThrow({ where: { incidenteId: inc.id } });
    expect(cambio).toMatchObject({ versionEvaluacion: 2, origen: 'condicion_medica', actorTipo: 'operador', actorUsuarioId: pnp.operadores[0]!.id });
    expect(cambio.antes).toEqual({ destinatarios: [{ institucion: 'pnp', papel: 'principal' }], revisionMedicaPendiente: true, resultado: 'ENRUTADO' });
    expect(cambio.despues).toEqual({
      destinatarios: [
        { institucion: 'pnp', papel: 'simultanea' },
        { institucion: 'samu', papel: 'principal' },
      ],
      revisionMedicaPendiente: false,
      resultado: 'ENRUTADO',
    });
    expect(JSON.stringify([cambio.antes, cambio.despues])).not.toMatch(/Confirmado|heridos|consciente/);
    const evento = await prisma.evento.findFirstOrThrow({ where: { agregadoId: inc.id, tipo: 'EnrutamientoResuelto', carga: { path: ['origen'], equals: 'condicion_medica' } } });
    expect(evento.carga).toEqual({ incidenteId: inc.id, resultado: 'ENRUTADO', origen: 'condicion_medica' });
  });

  it('agresion aclarada por el autor: SAMU condicionada y PNP sigue principal', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['agresion'] });
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['agresion'] });
    const autor = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    const inc = await registrarIncidente(con.app, prisma, { categoriaId: 'agresion', descripcion: 'Agresion en la plaza', heridos: 'no_se' });
    await enrutarTodo();
    const r = await aclarar().ejecutar(inc.id, { origen: 'ciudadano', institucion: null, usuarioId: autor.id }, { heridos: 'si' });
    expect(r.samuIncorporado).toBe(true);
    expect((await estado(inc.id)).participaciones).toEqual([
      ['pnp', 'principal', 'regla'],
      ['samu', 'condicionada', 'condicion_medica'],
    ]);
    expect((await prisma.cambioEnrutamiento.findFirstOrThrow({ where: { incidenteId: inc.id } })).actorTipo).toBe('ciudadano');
  });

  it('sin sede SAMU elegible queda pendiente con el faltante y PNP conserva su participacion', async () => {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(con.app, prisma, { ...ACCIDENTE, heridos: 'no_se' });
    await enrutarTodo();
    const r = await aclarar().ejecutar(inc.id, operadorDe(pnp, 'pnp'), { atencionMedica: 'si', motivo: MOTIVO });
    expect(r.samuIncorporado).toBe(true);
    const e = await estado(inc.id);
    expect(e).toMatchObject({ resultado: 'ENRUTAMIENTO_PENDIENTE', participaciones: [['pnp', 'simultanea', 'regla']] });
    expect(e.faltantes).toEqual([{ institucion: 'samu', papel: 'principal', motivo: 'sin_sede_elegible' }]);
    await unaPrincipal(inc.id);
  });

  it('un incidente sin distrito queda con el faltante sin_distrito de SAMU', async () => {
    const operador = await crearCuentaDePrueba(prisma, { rol: 'operador' });
    const inc = await registrarIncidente(con.app, prisma, { ...ACCIDENTE, heridos: 'no_se', punto: PUNTO_FUERA });
    await enrutarTodo();
    await aclarar().ejecutar(inc.id, { origen: 'operador', institucion: 'pnp', usuarioId: operador.id }, { heridos: 'si', motivo: MOTIVO });
    const e = await estado(inc.id);
    expect(e.faltantes).toEqual([
      { institucion: 'pnp', papel: 'simultanea', motivo: 'sin_distrito' },
      { institucion: 'samu', papel: 'principal', motivo: 'sin_distrito' },
    ]);
    expect(e.participaciones).toEqual([]);
  });

  it('una correccion negativa con SAMU principal no retira ni rebaja a nadie', async () => {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(con.app, prisma, { ...ACCIDENTE, heridos: 'si' });
    await enrutarTodo();
    const antes = await estado(inc.id);
    const r = await aclarar().ejecutar(inc.id, operadorDe(samu, 'samu'), { heridos: 'no', atencionMedica: 'no', motivo: 'Sin lesionados al llegar' });
    expect(r).toMatchObject({ nueva: true, samuIncorporado: false });
    expect(await estado(inc.id)).toEqual(antes);
    expect(await prisma.cambioEnrutamiento.count()).toBe(0);
  });

  it('no/no sobre una revision pendiente la cierra sin SAMU, con auditoria', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(con.app, prisma, { ...ACCIDENTE, heridos: 'no_se' });
    await enrutarTodo();
    const r = await aclarar().ejecutar(inc.id, operadorDe(pnp, 'pnp'), { heridos: 'no', atencionMedica: 'no', motivo: MOTIVO });
    expect(r.samuIncorporado).toBe(false);
    expect(await estado(inc.id)).toMatchObject({ revision: false, participaciones: [['pnp', 'principal', 'regla']] });
    expect(await prisma.cambioEnrutamiento.count()).toBe(1);
  });

  it('un recalculo sin efecto no escribe auditoria ni evento de enrutamiento', async () => {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['emergencia-medica'] });
    const inc = await registrarIncidente(con.app, prisma, { categoriaId: 'emergencia-medica', descripcion: 'Persona desmayada en la calle' });
    await enrutarTodo();
    const eventos = await prisma.evento.count({ where: { tipo: 'EnrutamientoResuelto' } });
    await aclarar().ejecutar(inc.id, operadorDe(samu, 'samu'), { personaPrincipal: { consciente: 'no' }, motivo: 'Informe de la unidad' });
    expect(await prisma.cambioEnrutamiento.count()).toBe(0);
    expect(await prisma.evento.count({ where: { tipo: 'EnrutamientoResuelto' } })).toBe(eventos);
    expect(await prisma.evento.count({ where: { tipo: 'EvaluacionActualizada' } })).toBe(1);
  });
});
