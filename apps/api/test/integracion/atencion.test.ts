import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { crearArnes, crearCuentaDePrueba, limpiarBd, ORIGEN_WEB_PRUEBA } from './arnes';
import { activarTerritorio, cookieInstitucional, crearSedeDePrueba, registrarIncidente } from './fixtures-enrutamiento';
import { atencionDe } from '../../src/composicion';
import { ServicioAtencion } from '../../src/modules/operaciones';
import { PrismaAtencionAdapter } from '../../src/modules/operaciones/infraestructura/prisma-atencion.adapter';
import { PrismaUnidadDeTrabajo } from '../../src/compartido/prisma-transaccion';

/**
 * P6, tareas A2.4 y A3.5: atencion institucional contra PostgreSQL y por HTTP. EQ-20 (asuncion
 * concurrente), EQ-05 (historial atomico), cierre Atendido/Descartado, verificacion separada,
 * reasignacion administrativa y privacidad del seguimiento.
 */
const arnes = crearArnes({ enrutar: true });
const { app, prisma, procesador } = arnes;
const BASE = '/api/v1/operador/incidentes';
const MOTIVO = 'Confirmado por llamada al lugar';
const RESUMEN = 'La PNP acudió y atendió el caso.';

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
  await activarTerritorio(prisma);
});

async function enrutarTodo(): Promise<void> {
  await procesador.esperarReposo();
  await procesador.procesarPendientes();
}

const post = (cookie: string, ruta: string, cuerpo?: unknown) => {
  const r = request(app).post(ruta).set('Cookie', cookie).set('Origin', ORIGEN_WEB_PRUEBA);
  return cuerpo === undefined ? r : r.set('Content-Type', 'application/json').send(JSON.stringify(cuerpo));
};
const asumir = (cookie: string, id: string) => post(cookie, `${BASE}/${id}/asumir`);
const transicion = (cookie: string, id: string, cuerpo: unknown) => post(cookie, `${BASE}/${id}/transiciones`, cuerpo);
const resumen = (cookie: string, id: string) => request(app).get(`${BASE}/${id}`).set('Cookie', cookie);

/** PNP con dos operadores y Serenazgo de apoyo; un robo enrutado. */
async function escenarioRobo() {
  const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'], operadores: ['activo', 'activo'] });
  const inc = await registrarIncidente(app, prisma);
  await enrutarTodo();
  const [a, b] = await Promise.all(pnp.operadores.map((o) => cookieInstitucional(app, o.correo)));
  return { pnp, inc, a: a!, b: b! };
}

async function historial(id: string) {
  return prisma.historialIncidente.findMany({ where: { incidenteId: id }, orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }] });
}

describe('asumir caso (EQ-20)', () => {
  it('dos operadores simultaneos: solo uno obtiene la asignacion; repetir no duplica', async () => {
    const { inc, a, b } = await escenarioRobo();
    const [ra, rb] = await Promise.all([asumir(a, inc.id), asumir(b, inc.id)]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const perdedor = ra.status === 409 ? ra : rb;
    expect(perdedor.body.error.code).toBe('CASO_ASUMIDO');
    expect(JSON.stringify(perdedor.body)).not.toMatch(/Cuenta de prueba/);
    expect(await prisma.asignacionIncidente.count({ where: { incidenteId: inc.id, activa: true } })).toBe(1);

    const ganador = ra.status === 201 ? a : b;
    const repetida = await asumir(ganador, inc.id);
    expect(repetida.status).toBe(200);
    expect(await prisma.asignacionIncidente.count({ where: { incidenteId: inc.id } })).toBe(1);
    expect((await historial(inc.id)).filter((h) => h.accion === 'asumir')).toHaveLength(1);
  });

  it('la principal inicia la revision; el apoyo asume con responsable propio sin cambiar estado', async () => {
    // Dos operadores SAMU: sin asignacion automatica (grupo D), la toma es manual.
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'], operadores: ['activo', 'activo'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(app, prisma, { categoriaId: 'accidente-transito', descripcion: 'Choque con heridos en la avenida', heridos: 'si' });
    await enrutarTodo();
    const opPnp = await cookieInstitucional(app, pnp.operadores[0]!.correo);
    const opSamu = await cookieInstitucional(app, samu.operadores[0]!.correo);

    expect((await asumir(opPnp, inc.id)).body.estado).toBe('REGISTRADO');
    const r = await asumir(opSamu, inc.id);
    expect(r.status).toBe(201);
    expect(r.body.estado).toBe('EN_REVISION');
    expect(await prisma.asignacionIncidente.count({ where: { incidenteId: inc.id, activa: true } })).toBe(2);
  });

  it('fuera de ambito responde el mismo 404; otros roles y origen ajeno se rechazan', async () => {
    const { inc } = await escenarioRobo();
    const ajena = await crearSedeDePrueba(prisma, { institucion: 'pnp', distritos: ['DIS-02'], categorias: ['robo'] });
    const op = await cookieInstitucional(app, ajena.operadores[0]!.correo);
    expect((await asumir(op, inc.id)).status).toBe(404);
    expect((await asumir(op, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    expect((await asumir(await cookieInstitucional(app, admin.correo), inc.id)).status).toBe(403);
    const sinOrigen = await request(app).post(`${BASE}/${inc.id}/asumir`).set('Cookie', op);
    expect(sinOrigen.status).toBe(403);
    expect((await request(app).post(`${BASE}/${inc.id}/asumir`)).status).toBe(401);
  });
});

describe('transiciones y cierre (RF45/RF46, EQ-05)', () => {
  it('recorre revision, atencion y cierre atendido con historial e hitos ciudadanos', async () => {
    const { inc, a } = await escenarioRobo();
    await asumir(a, inc.id);
    expect((await transicion(a, inc.id, { accion: 'cerrar', estadoEsperado: 'EN_REVISION', resultado: 'ATENDIDO', motivo: MOTIVO, resumenCiudadano: RESUMEN })).body.error.code)
      .toBe('TRANSICION_NO_PERMITIDA');
    expect((await transicion(a, inc.id, { accion: 'iniciar_atencion', estadoEsperado: 'EN_REVISION' })).body).toEqual({ estado: 'EN_ATENCION', resultado: null });
    const cierre = await transicion(a, inc.id, { accion: 'cerrar', estadoEsperado: 'EN_ATENCION', resultado: 'ATENDIDO', motivo: MOTIVO, resumenCiudadano: RESUMEN });
    expect(cierre.status).toBe(200);
    expect(await prisma.incidente.findUniqueOrThrow({ where: { id: inc.id } })).toMatchObject({ estado: 'CERRADO', resultado: 'ATENDIDO', resumenCiudadano: RESUMEN });

    const h = await historial(inc.id);
    expect(h.map((x) => [x.accion, x.valorAnterior, x.valorNuevo])).toEqual([
      ['asumir', null, expect.any(String)],
      ['transicion', 'REGISTRADO', 'EN_REVISION'],
      ['transicion', 'EN_REVISION', 'EN_ATENCION'],
      ['transicion', 'EN_ATENCION', 'CERRADO:ATENDIDO'],
    ]);
    for (const x of h) expect(x).toMatchObject({ actorTipo: 'operador', institucion: 'pnp', incidenteId: inc.id });

    // Seguimiento del invitado: hitos sin operadores ni motivo interno.
    const vista = await request(app).post('/api/v1/publico/seguimiento').set('Content-Type', 'application/json')
      .send(JSON.stringify({ referencia: inc.referencia, codigo: inc.codigo }));
    expect(vista.status).toBe(200);
    expect(vista.body.estado).toBe('CERRADO');
    expect(vista.body.cierre).toEqual({ resultado: 'ATENDIDO', resumenCiudadano: RESUMEN });
    expect(vista.body.actuaciones.map((x: { texto: string }) => x.texto)).toEqual(['En revisión', expect.stringMatching(/^En atención por /), 'Cerrado: atendido']);
    const texto = JSON.stringify(vista.body);
    expect(texto).not.toContain(MOTIVO);
    expect(texto).not.toMatch(/Cuenta de prueba|operador|VERIFICADO/i);

    // Cerrado: sin mas transiciones ni asunciones.
    expect((await transicion(a, inc.id, { accion: 'iniciar_atencion', estadoEsperado: 'CERRADO' })).body.error.code).toBe('INCIDENTE_CERRADO');
  });

  it('descarta desde revision sin pasar por atencion y exige resumen ciudadano', async () => {
    const { inc, a } = await escenarioRobo();
    await asumir(a, inc.id);
    const sinResumen = await transicion(a, inc.id, { accion: 'cerrar', estadoEsperado: 'EN_REVISION', resultado: 'DESCARTADO', motivo: MOTIVO });
    expect(sinResumen.status).toBe(400);
    expect(sinResumen.body.error.fields).toHaveProperty('resumenCiudadano');
    const r = await transicion(a, inc.id, { accion: 'cerrar', estadoEsperado: 'EN_REVISION', resultado: 'DESCARTADO', motivo: MOTIVO, resumenCiudadano: 'El hecho no pudo confirmarse.' });
    expect(r.body).toEqual({ estado: 'CERRADO', resultado: 'DESCARTADO' });
    expect((await historial(inc.id)).some((x) => x.valorNuevo === 'EN_ATENCION')).toBe(false);
  });

  it('permisos: sin asumir, apoyo y estado esperado desactualizado', async () => {
    const { inc, a, b } = await escenarioRobo();
    expect((await transicion(a, inc.id, { accion: 'cerrar', estadoEsperado: 'REGISTRADO', resultado: 'DESCARTADO', motivo: MOTIVO, resumenCiudadano: RESUMEN })).body.error.code)
      .toBe('ASIGNACION_REQUERIDA');
    await asumir(a, inc.id);
    expect((await transicion(b, inc.id, { accion: 'iniciar_atencion', estadoEsperado: 'EN_REVISION' })).body.error.code).toBe('ASIGNACION_REQUERIDA');
    const [x, y] = await Promise.all([
      transicion(a, inc.id, { accion: 'iniciar_atencion', estadoEsperado: 'EN_REVISION' }),
      transicion(a, inc.id, { accion: 'iniciar_atencion', estadoEsperado: 'EN_REVISION' }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    expect((x.status === 409 ? x : y).body.error).toMatchObject({ code: 'ESTADO_CAMBIADO', estadoActual: 'EN_ATENCION' });
  });

  it('el responsable de apoyo no cierra y la principal cambiada por condicion medica conserva al PNP como apoyo', async () => {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(app, prisma, { categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida', heridos: 'no_se' });
    await enrutarTodo();
    const opPnp = await cookieInstitucional(app, pnp.operadores[0]!.correo);
    expect((await asumir(opPnp, inc.id)).body.estado).toBe('EN_REVISION');
    // Un operador PNP precisa heridos si: SAMU pasa a principal (P5.1).
    const aclarado = await post(opPnp, `${BASE}/${inc.id}/evaluacion`, { heridos: 'si', motivo: MOTIVO });
    expect(aclarado.status).toBe(200);
    expect((await transicion(opPnp, inc.id, { accion: 'iniciar_atencion', estadoEsperado: 'EN_REVISION' })).body.error.code).toBe('NO_PRINCIPAL');
    expect(await prisma.asignacionIncidente.count({ where: { incidenteId: inc.id, institucion: 'pnp', activa: true } })).toBe(1);
    const opSamu = await cookieInstitucional(app, samu.operadores[0]!.correo);
    await asumir(opSamu, inc.id);
    expect((await transicion(opSamu, inc.id, { accion: 'iniciar_atencion', estadoEsperado: 'EN_REVISION' })).status).toBe(200);
  });
});

describe('verificacion separada', () => {
  it('cambia la verificacion sin cambiar el estado y audita la correccion', async () => {
    const { inc, a } = await escenarioRobo();
    await asumir(a, inc.id);
    const v = (valor: string) => post(a, `${BASE}/${inc.id}/verificacion`, { valor, motivo: MOTIVO, estadoEsperado: 'EN_REVISION' });
    expect((await v('VERIFICADO')).body).toEqual({ verificacion: 'VERIFICADO', estado: 'EN_REVISION' });
    expect((await v('NO_VERIFICADO')).status).toBe(200);
    const h = (await historial(inc.id)).filter((x) => x.accion === 'verificacion');
    expect(h.map((x) => [x.valorAnterior, x.valorNuevo])).toEqual([['SIN_VERIFICAR', 'VERIFICADO'], ['VERIFICADO', 'NO_VERIFICADO']]);
    expect((await prisma.incidente.findUniqueOrThrow({ where: { id: inc.id } })).estado).toBe('EN_REVISION');
  });
});

describe('bandeja y resumen con atencion', () => {
  it('la fila indica responsable propio y el resumen trae acciones permitidas e historial', async () => {
    const { inc, a, b } = await escenarioRobo();
    const antes = await resumen(a, inc.id);
    expect(antes.body.atencion.accionesPermitidas).toEqual(['asumir']);
    await asumir(a, inc.id);
    const fila = (await request(app).get(BASE).set('Cookie', a)).body.elementos[0];
    expect(fila).toMatchObject({ estado: 'EN_REVISION', verificacion: 'SIN_VERIFICAR', resultado: null, vinculado: false, responsable: { asignado: true, esUsted: true } });
    const r = (await resumen(a, inc.id)).body;
    expect(r.atencion.accionesPermitidas).toEqual(['iniciar_atencion', 'descartar', 'verificar', 'vincular', 'priorizar']);
    expect(r.atencion.responsable).toMatchObject({ asignado: true, esUsted: true, nombre: 'Cuenta de prueba' });
    expect(r.atencion.historial.map((h: { accion: string }) => h.accion)).toEqual(['asumir', 'transicion']);
    const otro = (await resumen(b, inc.id)).body;
    expect(otro.atencion.accionesPermitidas).toEqual([]);
    expect(otro.atencion.responsable).toMatchObject({ asignado: true, esUsted: false });
  });
});

describe('reasignacion administrativa', () => {
  it('lista, reasigna con motivo a un operador elegible, rechaza destinos no validos y libera', async () => {
    const { pnp, inc, a } = await escenarioRobo();
    await asumir(a, inc.id);
    const otraInst = await crearSedeDePrueba(prisma, { institucion: 'serenazgo', categorias: ['robo'] });
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const ca = await cookieInstitucional(app, admin.correo);

    const lista = await request(app).get('/api/v1/admin/asignaciones').set('Cookie', ca);
    expect(lista.status).toBe(200);
    expect(lista.body.elementos).toHaveLength(1);
    const asig = lista.body.elementos[0];
    expect(asig).toMatchObject({ referencia: inc.referencia, estado: 'EN_REVISION', institucion: 'pnp', requiereReasignacion: false });
    expect(JSON.stringify(lista.body)).not.toMatch(/descripcion|celular|latitud|telefono/i);
    expect((await request(app).get('/api/v1/admin/asignaciones').set('Cookie', a)).status).toBe(403);

    const candidatos = await request(app).get(`/api/v1/admin/asignaciones/${asig.id}/candidatos`).set('Cookie', ca);
    expect(candidatos.body.elementos.map((c: { id: string }) => c.id)).toEqual([pnp.operadores[1]!.id]);

    const ajeno = await post(ca, `/api/v1/admin/asignaciones/${asig.id}/reasignar`, { operadorId: otraInst.operadores[0]!.id, motivo: MOTIVO });
    expect(ajeno.body.error.code).toBe('DESTINO_NO_VALIDO');
    const ok = await post(ca, `/api/v1/admin/asignaciones/${asig.id}/reasignar`, { operadorId: pnp.operadores[1]!.id, motivo: MOTIVO });
    expect(ok.status).toBe(200);
    const activas = await prisma.asignacionIncidente.findMany({ where: { incidenteId: inc.id }, orderBy: { asignadaEn: 'asc' } });
    expect(activas.map((x) => [x.operadorId, x.activa, x.origen])).toEqual([
      [pnp.operadores[0]!.id, false, 'asumida'],
      [pnp.operadores[1]!.id, true, 'reasignada'],
    ]);
    expect((await prisma.incidente.findUniqueOrThrow({ where: { id: inc.id } })).estado).toBe('EN_REVISION');
    // La asignacion antigua ya no admite cambios.
    expect((await post(ca, `/api/v1/admin/asignaciones/${asig.id}/liberar`, { motivo: MOTIVO })).status).toBe(404);

    const nueva = (await request(app).get('/api/v1/admin/asignaciones').set('Cookie', ca)).body.elementos[0];
    expect((await post(ca, `/api/v1/admin/asignaciones/${nueva.id}/liberar`, { motivo: 'corto' })).status).toBe(400);
    expect((await post(ca, `/api/v1/admin/asignaciones/${nueva.id}/liberar`, { motivo: MOTIVO })).status).toBe(200);
    expect(await prisma.asignacionIncidente.count({ where: { incidenteId: inc.id, activa: true } })).toBe(0);
    expect((await asumir(a, inc.id)).status).toBe(201);
    expect((await historial(inc.id)).filter((h) => h.actorTipo === 'administrador').map((h) => h.accion)).toEqual(['reasignar', 'liberar']);
  });

  it('marca como pendiente de reasignacion la asignacion de un operador suspendido', async () => {
    const { pnp, inc, a } = await escenarioRobo();
    await asumir(a, inc.id);
    await prisma.usuario.update({ where: { id: pnp.operadores[0]!.id }, data: { estado: 'suspendido' } });
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const lista = await request(app).get('/api/v1/admin/asignaciones').set('Cookie', await cookieInstitucional(app, admin.correo));
    expect(lista.body.elementos[0]).toMatchObject({ requiereReasignacion: true });
  });
});

describe('historial atomico (EQ-05)', () => {
  it('si falla el registro del historial, la transicion y la asignacion se revierten', async () => {
    const { pnp, inc } = await escenarioRobo();
    const real = new PrismaAtencionAdapter(prisma);
    const fallido = Object.assign(Object.create(real) as PrismaAtencionAdapter, {
      registrar: async () => { throw new Error('fallo simulado del historial'); },
    });
    const servicio = new ServicioAtencion({
      repositorio: fallido,
      operadores: { describir: async () => new Map(), deSedes: async () => [] },
      unidadDeTrabajo: new PrismaUnidadDeTrabajo(prisma),
    });
    await expect(servicio.asumir({ incidenteId: inc.id, institucion: 'pnp', sedeId: pnp.id }, pnp.operadores[0]!.id)).rejects.toThrow('fallo simulado');
    expect(await prisma.asignacionIncidente.count()).toBe(0);
    expect((await prisma.incidente.findUniqueOrThrow({ where: { id: inc.id } })).estado).toBe('REGISTRADO');
    expect(atencionDe).toBeDefined();
  });
});

describe('integridad en la BD', () => {
  it('rechaza un incidente cerrado sin resultado y una segunda asignacion activa', async () => {
    const { inc, a } = await escenarioRobo();
    await expect(prisma.$executeRaw`UPDATE incidentes SET estado = 'CERRADO' WHERE id = ${inc.id}::uuid`).rejects.toThrow();
    await asumir(a, inc.id);
    const actual = await prisma.asignacionIncidente.findFirstOrThrow({ where: { incidenteId: inc.id } });
    await expect(prisma.asignacionIncidente.create({
      data: { incidenteId: inc.id, institucion: 'pnp', operadorId: actual.operadorId, sedeId: actual.sedeId, origen: 'asumida' },
    })).rejects.toThrow();
  });
});

describe('asignacion automatica al operador unico (grupo D)', () => {
  it('con un solo operador activo en la unica sede principal, asigna y pasa a revision con actor sistema', async () => {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'], operadores: ['activo', 'suspendido'] });
    const inc = await registrarIncidente(app, prisma);
    await enrutarTodo();
    const a = await prisma.asignacionIncidente.findFirstOrThrow({ where: { incidenteId: inc.id, activa: true } });
    expect(a).toMatchObject({ operadorId: pnp.operadores[0]!.id, origen: 'automatica', institucion: 'pnp' });
    expect((await prisma.incidente.findUniqueOrThrow({ where: { id: inc.id } })).estado).toBe('EN_REVISION');
    const h = await historial(inc.id);
    expect(h.map((x) => [x.accion, x.actorTipo, x.actorUsuarioId])).toEqual([
      ['asumir', 'sistema', null],
      ['transicion', 'sistema', null],
    ]);
    // El operador puede actuar sin tomar el caso.
    const op = await cookieInstitucional(app, pnp.operadores[0]!.correo);
    expect((await transicion(op, inc.id, { accion: 'iniciar_atencion', estadoEsperado: 'EN_REVISION' })).status).toBe(200);
  });

  it('con varios operadores activos no asigna; con dos sedes principales tampoco', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'], operadores: ['activo', 'activo'] });
    const inc = await registrarIncidente(app, prisma);
    await enrutarTodo();
    expect(await prisma.asignacionIncidente.count({ where: { incidenteId: inc.id } })).toBe(0);
    expect((await prisma.incidente.findUniqueOrThrow({ where: { id: inc.id } })).estado).toBe('REGISTRADO');
    await limpiarBd(prisma);
    await activarTerritorio(prisma);
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
    await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
    const dos = await registrarIncidente(app, prisma);
    await enrutarTodo();
    expect(await prisma.asignacionIncidente.count({ where: { incidenteId: dos.id } })).toBe(0);
  });

  it('cuando SAMU pasa a principal con un operador unico, se le asigna y PNP conserva su asignacion', async () => {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(app, prisma, { categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida', heridos: 'no_se' });
    await enrutarTodo();
    expect((await prisma.asignacionIncidente.findFirstOrThrow({ where: { incidenteId: inc.id, institucion: 'pnp' } })).origen).toBe('automatica');
    const opPnp = await cookieInstitucional(app, pnp.operadores[0]!.correo);
    expect((await post(opPnp, `${BASE}/${inc.id}/evaluacion`, { heridos: 'si', motivo: MOTIVO })).status).toBe(200);
    const activas = await prisma.asignacionIncidente.findMany({ where: { incidenteId: inc.id, activa: true }, orderBy: { institucion: 'asc' } });
    expect(activas.map((x) => [x.institucion, x.operadorId, x.origen])).toEqual([
      ['pnp', pnp.operadores[0]!.id, 'automatica'],
      ['samu', samu.operadores[0]!.id, 'automatica'],
    ]);
  });
});

describe('filtro de responsable en la bandeja (grupo D)', () => {
  it('sin_tomar y mios filtran en el backend conservando FIFO; un valor no admitido es 400', async () => {
    const { inc, a, b } = await escenarioRobo();
    const otro = await registrarIncidente(app, prisma);
    await enrutarTodo();
    await asumir(a, inc.id);
    const ids = async (cookie: string, q: string) => (await request(app).get(`${BASE}${q}`).set('Cookie', cookie)).body.elementos.map((e: { id: string }) => e.id);
    expect(await ids(a, '?responsable=mios')).toEqual([inc.id]);
    expect(await ids(b, '?responsable=mios')).toEqual([]);
    expect(await ids(b, '?responsable=sin_tomar')).toEqual([otro.id]);
    expect(await ids(a, '')).toEqual([inc.id, otro.id]);
    expect((await request(app).get(`${BASE}?responsable=todos`).set('Cookie', a)).status).toBe(400);
  });
});
