import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { crearArnes, crearCuentaDePrueba, limpiarBd, ORIGEN_WEB_PRUEBA, RUTA_LOGIN, RUTA_REGISTRO, CLAVE } from './arnes';
import {
  activarTerritorio,
  cookieInstitucional,
  crearSedeDePrueba,
  PUNTO_FUERA,
  registrarIncidente,
} from './fixtures-enrutamiento';

/** Bandeja del operador y aislamiento EQ-09 sobre incidentes (P4.2, tareas 6.1 y 6.2). */
const { app, prisma, procesador } = crearArnes({ enrutar: true });
const RUTA = '/api/v1/operador/incidentes';

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
const bandeja = (cookie: string, q = '') => request(app).get(`${RUTA}${q}`).set('Cookie', cookie);
const resumen = (cookie: string, id: string) => request(app).get(`${RUTA}/${id}`).set('Cookie', cookie);

async function operadorDe(sede: { operadores: readonly { correo: string }[] }) {
  return cookieInstitucional(app, sede.operadores[0]!.correo);
}

describe('bandeja FIFO', () => {
  it('ordena por llegada, desempata por id de forma estable y pagina de 50 sin repetir ni omitir', async () => {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
    const op = await operadorDe(pnp);
    for (let i = 0; i < 52; i++) await registrarIncidente(app, prisma);
    await enrutarTodo();
    // Dos incidentes con el mismo instante de registro: el orden lo decide el identificador.
    const [a, b] = await prisma.enrutamientoIncidente.findMany({ take: 2, orderBy: { registradoEn: 'asc' } });
    const instante = new Date('2026-11-26T10:00:00.000Z');
    await prisma.enrutamientoIncidente.updateMany({ where: { incidenteId: { in: [a!.incidenteId, b!.incidenteId] } }, data: { registradoEn: instante } });

    const vistos: string[] = [];
    let cursor: string | null = null;
    let paginas = 0;
    do {
      const r = await bandeja(op, cursor ? `?cursor=${cursor}` : '');
      expect(r.status).toBe(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body.elementos.length).toBeLessThanOrEqual(50);
      vistos.push(...r.body.elementos.map((e: { id: string }) => e.id));
      cursor = r.body.siguiente;
      paginas += 1;
    } while (cursor);
    expect(paginas).toBe(2);
    const esperado = (await prisma.enrutamientoIncidente.findMany({ orderBy: [{ registradoEn: 'asc' }, { incidenteId: 'asc' }] }))
      .map((e) => e.incidenteId);
    expect(vistos).toEqual(esperado);
    expect(vistos.slice(0, 2)).toEqual([a!.incidenteId, b!.incidenteId].sort());
  });

  it('bandeja vacia: 200 con lista vacia', async () => {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo'] });
    expect((await bandeja(await operadorDe(pnp))).body).toEqual({ elementos: [], siguiente: null });
  });

  it('la fila tiene solo los campos permitidos, con prioridad Sin evaluar', async () => {
    await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(app, prisma, { categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida', heridos: 'no_se' });
    await enrutarTodo();
    const fila = (await bandeja(await operadorDe(pnp))).body.elementos[0];
    expect(Object.keys(fila).sort()).toEqual([
      'categoria', 'condicionMedicaPorConfirmar', 'distrito', 'estado', 'id', 'papel', 'prioridad', 'referencia', 'registradoEn',
      'responsable', 'resultado', 'verificacion', 'vinculado',
    ]);
    expect(fila).toMatchObject({
      id: inc.id, referencia: inc.referencia, categoria: { id: 'accidente-transito', nombre: 'Accidente de tránsito' },
      distrito: { id: 'DIS-01', nombre: 'Ayacucho' }, estado: 'REGISTRADO', papel: 'principal',
      condicionMedicaPorConfirmar: true, prioridad: 'SIN_EVALUAR',
    });
  });
});

describe('resumen por identificador', () => {
  it('incluye originales permitidos y las otras instituciones; excluye telefono, coordenadas, codigo y sedes', async () => {
    const samu = await crearSedeDePrueba(prisma, { institucion: 'samu', categorias: ['accidente-transito'] });
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'] });
    const inc = await registrarIncidente(app, prisma, { categoriaId: 'accidente-transito', descripcion: 'Choque de dos autos en la avenida', heridos: 'si', atencionMedica: 'no_se' });
    await enrutarTodo();
    const r = await resumen(await operadorDe(pnp), inc.id);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual([
      'accesoSanitario', 'atencion', 'categoria', 'condicionMedica', 'condicionMedicaPorConfirmar', 'descripcion', 'distrito', 'estado', 'evidencias', 'id', 'ocurrencia', 'otrasInstituciones',
      'papel', 'prioridad', 'referencia', 'registradoEn', 'responsable', 'respuestasCiudadano', 'resultado', 'territorio', 'verificacion', 'vinculado',
    ]);
    expect(r.body).toMatchObject({
      papel: 'simultanea', descripcion: 'Choque de dos autos en la avenida',
      respuestasCiudadano: { heridos: 'si', atencionMedica: 'no_se' }, otrasInstituciones: ['samu'],
      territorio: { estado: 'resuelto', distrito: { id: 'DIS-01', nombre: 'Ayacucho' } },
    });
    const texto = JSON.stringify(r.body);
    expect(texto).not.toContain('987654321');
    expect(texto).not.toContain(inc.codigo);
    expect(texto).not.toContain(samu.id);
    expect(texto).not.toMatch(/latitud|longitud/);
  });
});

describe('EQ-09: aislamiento del operador', () => {
  async function escenario() {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['robo', 'incendio'] });
    const bomberos = await crearSedeDePrueba(prisma, { institucion: 'bomberos', categorias: ['incendio'] });
    const robo = await registrarIncidente(app, prisma);
    const incendio = await registrarIncidente(app, prisma, { categoriaId: 'incendio', descripcion: 'Se quema una casa en el jirón' });
    await enrutarTodo();
    return { pnp, bomberos, robo, incendio, opPnp: await operadorDe(pnp) };
  }

  it('URL directa de un caso de otra institucion, inexistente o malformado: el mismo 404', async () => {
    const { opPnp, incendio } = await escenario();
    const ajeno = await resumen(opPnp, incendio.id);
    const inexistente = await resumen(opPnp, randomUUID());
    const malformado = await resumen(opPnp, 'no-es-uuid');
    for (const r of [ajeno, inexistente, malformado]) {
      expect(r.status).toBe(404);
      expect(r.body.error.code).toBe('NOT_FOUND');
      expect(r.body.error.message).toBe('Incidente no disponible.');
      expect(Object.keys(r.body.error).sort()).toEqual(['code', 'message', 'requestId']);
    }
    expect((await bandeja(opPnp)).body.elementos.map((e: { id: string }) => e.id)).not.toContain(incendio.id);
  });

  it('un cursor alterado responde 400 y uno valido no amplia el conjunto', async () => {
    const { opPnp, robo, incendio } = await escenario();
    expect((await bandeja(opPnp, '?cursor=@@@')).status).toBe(400);
    const falso = Buffer.from(JSON.stringify(['2000-01-01T00:00:00.000Z', randomUUID()])).toString('base64url');
    const r = await bandeja(opPnp, `?cursor=${falso}`);
    expect(r.status).toBe(200);
    expect(r.body.elementos.map((e: { id: string }) => e.id)).toEqual([robo.id]);
    expect((await bandeja(opPnp, `?sedeId=${randomUUID()}`)).status).toBe(400);
    expect(JSON.stringify(r.body)).not.toContain(incendio.id);
  });

  it('al retirar la cobertura el caso desaparece y su resumen responde 404', async () => {
    const { opPnp, pnp, robo } = await escenario();
    expect((await resumen(opPnp, robo.id)).status).toBe(200);
    await prisma.coberturaSede.deleteMany({ where: { sedeId: pnp.id } });
    await prisma.coberturaSede.create({ data: { sedeId: pnp.id, distritoId: 'DIS-02' } });
    expect((await bandeja(opPnp)).body.elementos).toEqual([]);
    expect((await resumen(opPnp, robo.id)).status).toBe(404);
  });

  it('una participacion designada fuera de cobertura es visible para la sede designada', async () => {
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const cookieAdmin = await cookieInstitucional(app, admin.correo);
    const lejana = await crearSedeDePrueba(prisma, { institucion: 'pnp', distritos: ['DIS-05'] });
    const inc = await registrarIncidente(app, prisma, { punto: PUNTO_FUERA });
    await enrutarTodo();
    const d = await request(app).post(`/api/v1/admin/enrutamientos-pendientes/${inc.id}/designaciones`)
      .set('Cookie', cookieAdmin).set('Origin', ORIGEN_WEB_PRUEBA).set('Content-Type', 'application/json')
      .send(JSON.stringify({ institucion: 'pnp', sedeId: lejana.id, motivo: 'Punto fuera del área piloto, se asigna la comisaría' }));
    expect(d.status).toBe(201);
    const op = await operadorDe(lejana);
    expect((await bandeja(op)).body.elementos).toMatchObject([{ id: inc.id, papel: 'principal', distrito: null }]);
    expect((await resumen(op, inc.id)).body.territorio).toEqual({ estado: 'pendiente', motivo: 'fuera_area' });
  });

  it('un pendiente sin participacion de la sede no aparece aunque este en su distrito', async () => {
    const pnp = await crearSedeDePrueba(prisma, { institucion: 'pnp', categorias: ['accidente-transito'], distritos: ['DIS-01'] });
    // SAMU (principal) falta; la sede PNP sin competencia no participa.
    const serenazgo = await crearSedeDePrueba(prisma, { institucion: 'serenazgo', categorias: ['otra-emergencia'] });
    const inc = await registrarIncidente(app, prisma, { categoriaId: 'emergencia-medica', descripcion: 'Una persona se desmayó en la plaza' });
    await enrutarTodo();
    expect((await prisma.enrutamientoIncidente.findUniqueOrThrow({ where: { incidenteId: inc.id } })).resultado).toBe('ENRUTAMIENTO_PENDIENTE');
    for (const sede of [pnp, serenazgo]) {
      const op = await operadorDe(sede);
      expect((await bandeja(op)).body.elementos).toEqual([]);
      expect((await resumen(op, inc.id)).status).toBe(404);
    }
  });

  it('operador suspendido o de sede deshabilitada: 401/403 sin datos', async () => {
    const { pnp, opPnp } = await escenario();
    await prisma.sede.update({ where: { id: pnp.id }, data: { habilitadaAtencion: false } });
    const r = await bandeja(opPnp);
    expect(r.status).toBe(403);
    expect(r.body.elementos).toBeUndefined();
    await prisma.sede.update({ where: { id: pnp.id }, data: { habilitadaAtencion: true } });
    await prisma.usuario.update({ where: { id: pnp.operadores[0]!.id }, data: { estado: 'suspendido' } });
    expect((await bandeja(opPnp)).status).toBe(401);
  });

  it('administrador, ciudadano y sin sesion no acceden a la bandeja ni al resumen', async () => {
    const { robo } = await escenario();
    const admin = await crearCuentaDePrueba(prisma, { rol: 'administrador' });
    const cookieAdmin = await cookieInstitucional(app, admin.correo);
    expect((await bandeja(cookieAdmin)).status).toBe(403);
    expect((await resumen(cookieAdmin, robo.id)).status).toBe(403);
    const correo = `c-${randomUUID().slice(0, 8)}@ejemplo.com`;
    await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa', correo, contrasena: CLAVE });
    const token = (await request(app).post(RUTA_LOGIN).send({ correo, contrasena: CLAVE })).body.token as string;
    expect((await request(app).get(RUTA).set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).get(RUTA)).status).toBe(401);
    expect((await request(app).post(RUTA).set('Cookie', cookieAdmin)).status).toBe(405);
  });
});
