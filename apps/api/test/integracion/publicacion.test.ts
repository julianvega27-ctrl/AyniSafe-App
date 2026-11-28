import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { crearArnes, crearCuentaDePrueba, limpiarBd, ORIGEN_WEB_PRUEBA } from './arnes';
import { activarTerritorio, cookieInstitucional, crearSedeDePrueba, registrarIncidente } from './fixtures-enrutamiento';
import { celdaDe, VIGENCIA_MS } from '../../src/modules/operaciones';

/**
 * P7, tareas A2.3, A3.4, C1 y C2: publicacion controlada contra PostgreSQL y por HTTP. Publicacion
 * expresa del responsable, retiro manual y automatico, vigencia, lista cerrada de campos publicos
 * (EQ-04/09), categorias sensibles, reserva y conteos con minimo de cinco.
 */
let ahora: Date | null = null;
const arnes = crearArnes({ enrutar: true, ahoraPublicacion: () => ahora ?? new Date() });
const { app, prisma, procesador } = arnes;
const BASE = '/api/v1/operador/incidentes';
const MAPA = '/api/v1/publico/mapa';
const MOTIVO = 'Confirmado por llamada al lugar';
const RESUMEN = 'La PNP acudió y atendió el caso.';
const DESCRIPCION = 'Me arrebataron el celular en la esquina';

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  ahora = null;
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
const publicar = (cookie: string, id: string, cuerpo: unknown = { estadoEsperado: 'EN_REVISION' }) => post(cookie, `${BASE}/${id}/publicacion`, cuerpo);
const retirar = (cookie: string, id: string, motivo: unknown = MOTIVO) => post(cookie, `${BASE}/${id}/publicacion/retiro`, { motivo });
const verificar = (cookie: string, id: string, valor: string, estadoEsperado = 'EN_REVISION') =>
  post(cookie, `${BASE}/${id}/verificacion`, { valor, motivo: MOTIVO, estadoEsperado });
const resumen = (cookie: string, id: string) => request(app).get(`${BASE}/${id}`).set('Cookie', cookie);
const mapa = (query = '') => request(app).get(`${MAPA}${query}`);

/** PNP principal con dos operadores (toma manual); robo enrutado, asumido por `a` y verificado. */
async function escenario(datos: Record<string, unknown> = {}, verificado = true) {
  const pnp = await crearSedeDePrueba(prisma, {
    institucion: 'pnp',
    categorias: ['robo', 'agresion', 'vandalismo'],
    operadores: ['activo', 'activo'],
  });
  const inc = await registrarIncidente(app, prisma, datos);
  await enrutarTodo();
  const [a, b] = await Promise.all(pnp.operadores.map((o) => cookieInstitucional(app, o.correo)));
  expect((await post(a!, `${BASE}/${inc.id}/asumir`)).status).toBe(201);
  if (verificado) expect((await verificar(a!, inc.id, 'VERIFICADO')).status).toBe(200);
  return { pnp, inc, a: a!, b: b! };
}

async function historial(id: string) {
  return prisma.historialIncidente.findMany({ where: { incidenteId: id }, orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }] });
}

describe('publicar (RF49)', () => {
  it('verificar publica en la misma operacion con instantanea generalizada; repetir no duplica', async () => {
    const { inc, a } = await escenario();
    const h0 = (await historial(inc.id)).filter((h) => h.accion === 'publicar');
    expect(h0.map((h) => h.valorNuevo)).toEqual(['VERIFICACION']);
    const r = await publicar(a, inc.id);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.publicacion).sort()).toEqual(['estado', 'publicadaEn', 'reservada', 'venceEn']);

    const envio = await prisma.envioIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } });
    const fila = await prisma.publicacionIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } });
    const celda = celdaDe(envio.latitud, envio.longitud);
    expect(fila).toMatchObject({ estado: 'VIGENTE', categoriaId: 'robo', distritoId: envio.distritoId, celdaLat: celda.lat, celdaLon: celda.lon });
    expect(fila.celdaLat).not.toBe(envio.latitud);
    expect(fila.venceEn.getTime() - envio.ocurridoEn.getTime()).toBe(VIGENCIA_MS);
    expect(await prisma.incidente.findUniqueOrThrow({ where: { id: inc.id } })).toMatchObject({ estado: 'EN_REVISION', verificacion: 'VERIFICADO' });

    await verificar(a, inc.id, 'VERIFICADO');
    expect((await historial(inc.id)).filter((h) => h.accion === 'publicar')).toHaveLength(1);
  });

  it('verificar fuera de plazo verifica sin publicar', async () => {
    const { inc, a } = await escenario({}, false);
    ahora = new Date(Date.now() + VIGENCIA_MS);
    expect((await verificar(a, inc.id, 'VERIFICADO')).status).toBe(200);
    expect(await prisma.publicacionIncidente.count()).toBe(0);
  });

  it('rechaza sin verificar, no responsable, apoyo, estado cambiado y otros roles', async () => {
    const { inc, a, b } = await escenario({}, false);
    expect((await publicar(a, inc.id)).body.error.code).toBe('NO_VERIFICADO');
    const noResp = await publicar(b, inc.id);
    expect([noResp.status, noResp.body.error.code]).toEqual([403, 'ASIGNACION_REQUERIDA']);
    expect((await publicar(a, inc.id, { estadoEsperado: 'EN_ATENCION' })).body.error.code).toBe('ESTADO_CAMBIADO');
    expect((await publicar(a, inc.id, { estadoEsperado: 'EN_REVISION', extra: 1 })).status).toBe(400);
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    expect((await publicar(await cookieInstitucional(app, admin.correo), inc.id)).status).toBe(403);
    expect((await request(app).post(`${BASE}/${inc.id}/publicacion`).set('Cookie', a).send({})).status).toBe(403);
    expect((await request(app).post(`${BASE}/${inc.id}/publicacion`)).status).toBe(401);
    expect(await prisma.publicacionIncidente.count()).toBe(0);
  });

  it('un apoyo no publica ni retira', async () => {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(app, prisma, { categoriaId: 'accidente-transito', descripcion: 'Choque con heridos en la avenida', heridos: 'si' });
    await enrutarTodo();
    const opSamu = await cookieInstitucional(app, samu.operadores[0]!.correo);
    const opPnp = await cookieInstitucional(app, pnp.operadores[0]!.correo);
    await post(opPnp, `${BASE}/${inc.id}/asumir`);
    await verificar(opSamu, inc.id, 'VERIFICADO');
    expect((await publicar(opPnp, inc.id)).body.error.code).toBe('NO_PRINCIPAL');
    expect((await publicar(opSamu, inc.id)).status).toBe(200); // ya publicado al verificar
    expect((await retirar(opPnp, inc.id)).body.error.code).toBe('NO_PRINCIPAL');
  });

  it('fuera de vigencia: ocurrido hace mas de 7 dias', async () => {
    const { inc, a, b } = await escenario();
    await retirar(b, inc.id);
    ahora = new Date(Date.now() + VIGENCIA_MS);
    expect((await publicar(a, inc.id)).body.error.code).toBe('FUERA_DE_VIGENCIA');
  });
});

describe('retiro', () => {
  it('cualquier operador de la principal retira con motivo; republicar conserva el vencimiento', async () => {
    const { inc, a, b } = await escenario();
    const antes = await prisma.publicacionIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } });
    expect((await retirar(b, inc.id, 'corto')).status).toBe(400);
    expect((await retirar(b, inc.id)).status).toBe(200);
    expect(await prisma.publicacionIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } })).toMatchObject({ estado: 'RETIRADA', causaRetiro: 'DECISION' });
    expect((await retirar(b, inc.id)).body.error.code).toBe('NO_PUBLICADA');
    const h = (await historial(inc.id)).filter((x) => x.accion === 'retirar');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ valorNuevo: 'DECISION', motivo: MOTIVO });
    // Seguir verificado no republica un retiro por decision.
    expect((await prisma.publicacionIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } })).estado).toBe('RETIRADA');

    expect((await publicar(a, inc.id)).status).toBe(201);
    const despues = await prisma.publicacionIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } });
    expect(despues).toMatchObject({ estado: 'VIGENTE', causaRetiro: null, idPublico: antes.idPublico });
    expect(despues.venceEn).toEqual(antes.venceEn);
  });

  it('cierre, NO_VERIFICADO y vinculacion retiran en la misma transaccion', async () => {
    const { inc, a } = await escenario();
    await verificar(a, inc.id, 'NO_VERIFICADO');
    expect(await prisma.publicacionIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } })).toMatchObject({ estado: 'RETIRADA', causaRetiro: 'NO_VERIFICADO' });
    // Volver a verificar republica (la verificacion autoriza la publicacion).
    await verificar(a, inc.id, 'VERIFICADO');
    expect((await prisma.publicacionIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } })).estado).toBe('VIGENTE');

    await post(a, `${BASE}/${inc.id}/transiciones`, { accion: 'iniciar_atencion', estadoEsperado: 'EN_REVISION' });
    const cierre = await post(a, `${BASE}/${inc.id}/transiciones`, {
      accion: 'cerrar', estadoEsperado: 'EN_ATENCION', resultado: 'ATENDIDO', motivo: MOTIVO, resumenCiudadano: RESUMEN,
    });
    expect(cierre.status).toBe(200);
    expect(await prisma.publicacionIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } })).toMatchObject({ estado: 'RETIRADA', causaRetiro: 'CIERRE' });
    expect((await historial(inc.id)).filter((x) => x.accion === 'retirar').map((x) => x.valorNuevo)).toEqual(['NO_VERIFICADO', 'CIERRE']);
  });

  it('vincular como duplicado retira la publicacion del duplicado', async () => {
    const { inc: principal, a } = await escenario();
    const dup = await registrarIncidente(app, prisma);
    await enrutarTodo();
    await post(a, `${BASE}/${dup.id}/asumir`);
    await verificar(a, dup.id, 'VERIFICADO');
    expect((await prisma.publicacionIncidente.findUniqueOrThrow({ where: { incidenteId: dup.id } })).estado).toBe('VIGENTE');
    const v = await post(a, `${BASE}/${dup.id}/vinculo`, { referenciaPrincipal: principal.referencia, motivo: MOTIVO });
    expect(v.status).toBe(200);
    expect(await prisma.publicacionIncidente.findUniqueOrThrow({ where: { incidenteId: dup.id } })).toMatchObject({ estado: 'RETIRADA', causaRetiro: 'DUPLICADO' });
    expect((await publicar(a, dup.id)).body.error.code).toBe('INCIDENTE_VINCULADO');
  });

  it('si falla el historial del retiro, no se corrige la verificacion ni se retira (reversion)', async () => {
    const { inc, a } = await escenario();
    await prisma.$executeRawUnsafe(`ALTER TABLE historial_incidente ADD CONSTRAINT prueba_sin_retiro CHECK (accion <> 'retirar') NOT VALID`);
    try {
      const r = await verificar(a, inc.id, 'NO_VERIFICADO');
      expect(r.status).toBe(503);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE historial_incidente DROP CONSTRAINT prueba_sin_retiro');
    }
    expect(await prisma.incidente.findUniqueOrThrow({ where: { id: inc.id } })).toMatchObject({ verificacion: 'VERIFICADO' });
    expect((await prisma.publicacionIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } })).estado).toBe('VIGENTE');
  });
});

describe('resumen del operador', () => {
  it('informa estado, vencimiento y acciones; el no responsable solo retira', async () => {
    const { inc, a, b } = await escenario({}, false);
    let r = await resumen(a, inc.id);
    expect(r.body.atencion.publicacion).toMatchObject({ estado: 'NO_PUBLICADO', noPublicable: 'NO_VERIFICADO', accionesPermitidas: [], sensible: false });
    await verificar(a, inc.id, 'VERIFICADO');
    r = await resumen(a, inc.id);
    expect(r.body.atencion.publicacion).toMatchObject({ estado: 'VIGENTE', accionesPermitidas: ['retirar', 'reservar'] });
    expect((await resumen(b, inc.id)).body.atencion.publicacion.accionesPermitidas).toEqual(['retirar']);
    await retirar(b, inc.id);
    expect((await resumen(a, inc.id)).body.atencion.publicacion).toMatchObject({ estado: 'RETIRADA', causaRetiro: 'DECISION', accionesPermitidas: ['publicar'] });
  });
});

describe('mapa publico (EQ-04/09)', () => {
  it('lista cerrada de campos: nunca referencia, punto exacto, descripcion, telefono ni institucion', async () => {
    const { inc, a } = await escenario();
    await publicar(a, inc.id);
    const r = await mapa();
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=30');
    expect(Object.keys(r.body).sort()).toEqual(['elementos', 'filtros', 'generadoEn', 'radioZonaM', 'reservados']);
    expect(r.body.elementos).toHaveLength(1);
    const e = r.body.elementos[0];
    expect(Object.keys(e).sort()).toEqual(['antiguedadHoras', 'categoria', 'distrito', 'estado', 'id', 'ocurridoEn', 'zona']);
    expect(e.zona.aproximada).toBe(true);
    const envio = await prisma.envioIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } });
    const texto = JSON.stringify(r.body);
    for (const prohibido of [inc.id, inc.referencia, inc.codigo, DESCRIPCION, '987654321', 'pnp']) {
      expect(texto).not.toContain(prohibido);
    }
    expect([e.zona.lat, e.zona.lon]).not.toContain(envio.latitud);
    expect([e.zona.lat, e.zona.lon]).not.toContain(envio.longitud);
  });

  it('retirado, vencido, cerrado y sensibles fuera; filtros combinados', async () => {
    const { inc, a } = await escenario();
    await publicar(a, inc.id);
    const agresion = await registrarIncidente(app, prisma, { categoriaId: 'agresion', descripcion: 'Agresión en la vía pública' });
    await enrutarTodo();
    await post(a, `${BASE}/${agresion.id}/asumir`);
    await verificar(a, agresion.id, 'VERIFICADO');
    expect((await prisma.publicacionIncidente.findUniqueOrThrow({ where: { incidenteId: agresion.id } })).estado).toBe('VIGENTE');
    expect((await resumen(a, agresion.id)).body.atencion.publicacion.sensible).toBe(true);

    expect((await mapa()).body.elementos.map((e: { categoria: { id: string } }) => e.categoria.id)).toEqual(['robo']);
    expect((await mapa('?distrito=DIS-01&categoria=robo&periodo=24h')).body.elementos).toHaveLength(1);
    expect((await mapa('?distrito=DIS-02')).body.elementos).toHaveLength(0);
    expect((await mapa('?categoria=vandalismo')).body.elementos).toHaveLength(0);

    ahora = new Date(Date.now() + VIGENCIA_MS);
    expect((await mapa()).body.elementos).toHaveLength(0);
    ahora = null;
    await retirar(a, inc.id);
    expect((await mapa()).body.elementos).toHaveLength(0);
  });

  it('filtros invalidos responden 422; otros metodos 405', async () => {
    for (const q of ['?distrito=DIS-99', '?periodo=30d', '?categoria=nada', '?otro=1', '?distrito=']) {
      const r = await mapa(q);
      expect([q, r.status, r.body.error.code]).toEqual([q, 422, 'VALIDATION_ERROR']);
    }
    expect((await request(app).post(MAPA)).status).toBe(405);
  });
});

describe('reserva y conteos (grupo C)', () => {
  it('reservar con motivo quita el punto publico y queda en el historial', async () => {
    const { inc, a, b } = await escenario();
    await publicar(a, inc.id);
    const ruta = `${BASE}/${inc.id}/publicacion/reserva`;
    expect((await post(b, ruta, { reservada: true, motivo: MOTIVO })).status).toBe(403);
    expect((await post(a, ruta, { reservada: true })).status).toBe(400);
    expect((await post(a, ruta, { reservada: true, motivo: MOTIVO })).body).toEqual({ reservada: true });
    expect((await mapa()).body.elementos).toHaveLength(0);
    expect((await resumen(a, inc.id)).body.atencion.publicacion.accionesPermitidas).toEqual(['retirar', 'quitar_reserva']);
    await post(a, ruta, { reservada: false, motivo: MOTIVO });
    expect((await mapa()).body.elementos).toHaveLength(1);
    expect((await historial(inc.id)).filter((h) => h.accion === 'reservar').map((h) => h.valorNuevo)).toEqual(['true', 'false']);
  });

  it('republicar como reservado exige motivo', async () => {
    const { inc, a, b } = await escenario();
    await retirar(b, inc.id);
    expect((await publicar(a, inc.id, { estadoEsperado: 'EN_REVISION', reservada: true })).status).toBe(400);
    expect((await publicar(a, inc.id, { estadoEsperado: 'EN_REVISION', reservada: true, motivoReserva: MOTIVO })).status).toBe(201);
    expect((await mapa()).body.elementos).toHaveLength(0);
  });

  it('conteos por distrito y mes solo con al menos cinco y sin retirados por decision', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push((await registrarIncidente(app, prisma, { categoriaId: 'agresion', descripcion: 'Agresión en la vía pública' })).id);
    await enrutarTodo();
    const insertar = (id: string, causa: string | null) => prisma.$executeRaw`
      INSERT INTO publicaciones_incidente (incidente_id, estado, institucion, categoria_id, distrito_id, celda_lat, celda_lon,
                                           ocurrido_en, vence_en, retirada_en, causa_retiro)
      SELECT incidente_id, CASE WHEN ${causa}::text IS NULL THEN 'VIGENTE' ELSE 'RETIRADA' END, 'pnp', categoria_id, distrito_id, 0, 0,
             ocurrido_en, ocurrido_en + INTERVAL '7 days', CASE WHEN ${causa}::text IS NULL THEN NULL ELSE now() END, ${causa}
        FROM envios_incidente WHERE incidente_id = ${id}::uuid`;
    for (const id of ids.slice(0, 4)) await insertar(id, null);
    await insertar(ids[4]!, 'DECISION');
    expect((await mapa()).body.reservados).toEqual([]);
    await insertar(ids[5]!, 'CIERRE');
    const r = await mapa();
    expect(r.body.reservados).toEqual([{ distrito: { id: 'DIS-01', nombre: expect.any(String) }, mes: expect.stringMatching(/^\d{4}-\d{2}$/), total: 5 }]);
    expect(r.body.elementos).toHaveLength(0);
    expect((await mapa('?distrito=DIS-02')).body.reservados).toEqual([]);
  });
});

describe('mapa operativo (grupo B)', () => {
  const OPERATIVO = '/api/v1/operador/mapa';
  const operativo = (cookie: string, query = '') => request(app).get(`${OPERATIVO}${query}`).set('Cookie', cookie);

  it('punto exacto solo de los incidentes de su sede, sin datos privados; publicacion indicada', async () => {
    const { inc, a } = await escenario();
    await publicar(a, inc.id);
    const ajena = await crearSedeDePrueba(prisma, { institucion: 'pnp', distritos: ['DIS-02'], categorias: ['robo'] });
    const opAjeno = await cookieInstitucional(app, ajena.operadores[0]!.correo);

    const r = await operativo(a);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.truncado).toBe(false);
    expect(r.body.elementos).toHaveLength(1);
    const e = r.body.elementos[0];
    const envio = await prisma.envioIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } });
    expect(e).toMatchObject({ id: inc.id, referencia: inc.referencia, punto: { lat: envio.latitud, lon: envio.longitud }, publicacion: { vigente: true, reservada: false } });
    expect(Object.keys(e).sort()).toEqual(['categoria', 'distrito', 'estado', 'id', 'prioridad', 'publicacion', 'punto', 'referencia', 'registradoEn']);
    const texto = JSON.stringify(r.body);
    for (const prohibido of [DESCRIPCION, '987654321', inc.codigo]) expect(texto).not.toContain(prohibido);

    expect((await operativo(opAjeno)).body.elementos).toEqual([]);
    expect((await operativo(a, '?distrito=DIS-02')).body.elementos).toEqual([]);
    expect((await operativo(a, '?categoria=robo&periodo=24h')).body.elementos).toHaveLength(1);
  });

  it('otros roles 401/403 y filtros invalidos 422', async () => {
    const { a } = await escenario({}, false);
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    expect((await operativo(await cookieInstitucional(app, admin.correo))).status).toBe(403);
    expect((await request(app).get(OPERATIVO)).status).toBe(401);
    for (const q of ['?periodo=3d', '?distrito=DIS-99', '?x=1']) expect((await operativo(a, q)).status).toBe(422);
    expect((await request(app).post(OPERATIVO).set('Cookie', a)).status).toBe(405);
  });
});
