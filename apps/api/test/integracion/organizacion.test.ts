import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import {
  CLAVE,
  cookieDe,
  crearArnes,
  crearCuentaDePrueba,
  limpiarBd,
  ORIGEN_WEB_PRUEBA,
  RUTA_AMBITO,
  RUTA_INST_SESIONES,
  RUTA_LOGIN,
  RUTA_ORG,
} from './arnes';

/**
 * Organizacion institucional (P3.2) contra PostgreSQL aislado: alta atomica (EQ-12), reintentos y
 * concurrencia, invariantes de habilitacion, suspension con revocacion de sesiones, reenvio de
 * invitacion, ambito del operador y rechazo de otros roles (EQ-09 organizativo).
 */
const arnes = crearArnes();
const { app, prisma, modulo, correo } = arnes;
const NUEVA = 'contraseña de operador larga 7c2';

afterAll(async () => {
  await modulo.gestorEnvios.detener();
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fallo_inyectado ON pertenencias_operador');
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fallo_inyectado ON envios_correo');
});

beforeEach(async () => {
  await modulo.gestorEnvios.esperarReposo();
  await limpiarBd(prisma);
  await prisma.$executeRawUnsafe(`UPDATE instituciones SET activa = TRUE, contacto = NULL, nombre = upper(id) WHERE id IN ('pnp', 'samu')`);
  await prisma.$executeRawUnsafe(`UPDATE instituciones SET nombre = 'Bomberos' WHERE id = 'bomberos'`);
  await prisma.$executeRawUnsafe(`UPDATE instituciones SET nombre = 'Serenazgo' WHERE id = 'serenazgo'`);
  await prisma.$executeRawUnsafe('UPDATE categorias SET activa = TRUE');
  correo.enviados.length = 0;
});

async function ingresar(rol: 'administrador' | 'operador'): Promise<{ id: string; cookie: string }> {
  const cuenta = await crearCuentaDePrueba(prisma, { rol });
  const r = await request(app).post(RUTA_INST_SESIONES).set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: cuenta.correo, contrasena: CLAVE });
  expect(r.status).toBe(200);
  return { id: cuenta.id, cookie: `__Host-ayni_inst=${cookieDe(r) as string}` };
}

function pedir(cookie: string) {
  const h = { Cookie: cookie, Origin: ORIGEN_WEB_PRUEBA };
  return {
    get: (ruta: string) => request(app).get(ruta).set(h),
    post: (ruta: string, cuerpo?: object) => (cuerpo ? request(app).post(ruta).set(h).send(cuerpo) : request(app).post(ruta).set(h)),
    put: (ruta: string, cuerpo: object) => request(app).put(ruta).set(h).send(cuerpo),
    patch: (ruta: string, cuerpo: object) => request(app).patch(ruta).set(h).send(cuerpo),
    delete: (ruta: string) => request(app).delete(ruta).set(h),
  };
}

const alta = (n = 1, extra: object = {}) => ({
  institucionId: 'pnp',
  nombre: `Comisaría ${n}`,
  operador: { nombre: `Operador ${n}`, correo: `op${n}@ejemplo.com` },
  ...extra,
});

async function conteos(): Promise<{ sedes: number; operadores: number; pertenencias: number; envios: number }> {
  const [f] = await prisma.$queryRaw<{ sedes: number; operadores: number; pertenencias: number; envios: number }[]>`
    SELECT (SELECT count(*)::int FROM sedes) AS sedes,
           (SELECT count(*)::int FROM usuarios WHERE rol = 'operador') AS operadores,
           (SELECT count(*)::int FROM pertenencias_operador) AS pertenencias,
           (SELECT count(*)::int FROM envios_correo) AS envios`;
  return f!;
}

/** Activa la cuenta con el enlace realmente enviado por correo (adaptador de pruebas). */
async function activarPorCorreo(destinatario: string): Promise<void> {
  await modulo.gestorEnvios.esperarReposo();
  const mensaje = [...correo.enviados].reverse().find((m) => m.para === destinatario);
  const token = /#t=([A-Za-z0-9_-]+)/.exec(mensaje?.texto ?? '')?.[1];
  expect(token).toBeDefined();
  const r = await request(app).post('/api/v1/auth/activaciones').send({ token, contrasena: NUEVA });
  expect(r.status).toBe(204);
}

async function sedeLista(admin: ReturnType<typeof pedir>, n = 1): Promise<{ sedeId: string; operadorId: string; correoOp: string }> {
  const r = await admin.post(`${RUTA_ORG}/sedes`, alta(n));
  expect(r.status).toBe(201);
  const sedeId = r.body.sede.id as string;
  await activarPorCorreo(`op${n}@ejemplo.com`);
  expect((await admin.patch(`${RUTA_ORG}/sedes/${sedeId}`, { verificacion: { estado: 'verificada', fuente: 'Oficio de prueba', fecha: '2026-11-25' } })).status).toBe(200);
  expect((await admin.put(`${RUTA_ORG}/sedes/${sedeId}/cobertura`, { distritos: ['DIS-01', 'DIS-03'] })).status).toBe(200);
  expect((await admin.put(`${RUTA_ORG}/sedes/${sedeId}/competencias`, { categorias: ['robo', 'asalto'] })).status).toBe(200);
  return { sedeId, operadorId: r.body.operador.id as string, correoOp: `op${n}@ejemplo.com` };
}

describe('alta atomica de sede con operador inicial (RF29, EQ-12)', () => {
  it('crea sede deshabilitada, operador pendiente, pertenencia y un unico correo tras el commit', async () => {
    const admin = pedir((await ingresar('administrador')).cookie);
    const r = await admin.post(`${RUTA_ORG}/sedes`, alta(1, { distritoUbicacionId: 'DIS-02', esDemostracion: true }));
    expect(r.status).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.sede).toMatchObject({
      institucionId: 'pnp', nombre: 'Comisaría 1', distritoUbicacionId: 'DIS-02', habilitadaAtencion: false,
      activa: true, esDemostracion: true, distritos: [], categorias: [],
      verificacion: { estado: 'sin_verificar', fuente: null, fecha: null },
    });
    expect(r.body.operador).toMatchObject({ estado: 'pendiente_activacion', correo: 'op1@ejemplo.com', esDemostracion: true });
    expect(await conteos()).toEqual({ sedes: 1, operadores: 1, pertenencias: 1, envios: 1 });
    const cuenta = await prisma.usuario.findUniqueOrThrow({ where: { correoNormalizado: 'op1@ejemplo.com' } });
    expect(cuenta).toMatchObject({ rol: 'operador', estado: 'pendiente_activacion', passwordHash: null });
    await modulo.gestorEnvios.esperarReposo();
    expect(correo.enviados.map((m) => m.para)).toEqual(['op1@ejemplo.com']);
    expect(correo.enviados[0]!.texto).toContain(`${ORIGEN_WEB_PRUEBA}/activar#t=`);
    // La ubicacion no implica cobertura.
    expect(await prisma.coberturaSede.count()).toBe(0);
  });

  for (const [tabla, paso] of [['pertenencias_operador', 'la pertenencia'], ['envios_correo', 'la invitacion']] as const) {
    it(`un fallo real al insertar ${paso} revierte sede, cuenta y envio; el reintento posterior no duplica`, async () => {
      const admin = pedir((await ingresar('administrador')).cookie);
      await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fallo_inyectado() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'fallo inyectado'; END $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER fallo_inyectado BEFORE INSERT ON ${tabla} FOR EACH ROW EXECUTE FUNCTION fallo_inyectado()`);
      try {
        const r = await admin.post(`${RUTA_ORG}/sedes`, alta(2));
        expect(r.status).toBe(503);
        expect(r.text).not.toMatch(/fallo inyectado|op2@ejemplo/);
        expect(await conteos()).toEqual({ sedes: 0, operadores: 0, pertenencias: 0, envios: 0 });
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER fallo_inyectado ON ${tabla}`);
      }
      expect((await admin.post(`${RUTA_ORG}/sedes`, alta(2))).status).toBe(201);
      expect((await admin.post(`${RUTA_ORG}/sedes`, alta(2))).status).toBe(409);
      expect(await conteos()).toEqual({ sedes: 1, operadores: 1, pertenencias: 1, envios: 1 });
    });
  }

  it('reintento: SEDE_EXISTENTE (tambien con mayusculas y espacios) y EMAIL_IN_USE sin filas nuevas', async () => {
    const admin = pedir((await ingresar('administrador')).cookie);
    expect((await admin.post(`${RUTA_ORG}/sedes`, alta(3))).status).toBe(201);
    const repetida = await admin.post(`${RUTA_ORG}/sedes`, { ...alta(3), nombre: '  COMISARÍA   3 ', operador: { nombre: 'X', correo: 'otro@ejemplo.com' } });
    expect(repetida.status).toBe(409);
    expect(repetida.body.error.code).toBe('SEDE_EXISTENTE');
    const correoUsado = await admin.post(`${RUTA_ORG}/sedes`, { ...alta(4), operador: { nombre: 'X', correo: 'OP3@ejemplo.com' } });
    expect(correoUsado.status).toBe(409);
    expect(correoUsado.body.error.code).toBe('EMAIL_IN_USE');
    expect(correoUsado.text).not.toContain('op3@');
    expect(await conteos()).toEqual({ sedes: 1, operadores: 1, pertenencias: 1, envios: 1 });
    // El mismo nombre en otra institucion es otra sede.
    expect((await admin.post(`${RUTA_ORG}/sedes`, { ...alta(5), nombre: 'Comisaría 3', institucionId: 'serenazgo' })).status).toBe(201);
  });

  it('altas concurrentes con el mismo nombre o el mismo correo: una 201 y otra 409, sin filas parciales', async () => {
    const admin = pedir((await ingresar('administrador')).cookie);
    const mismoNombre = await Promise.all([
      admin.post(`${RUTA_ORG}/sedes`, alta(6)),
      admin.post(`${RUTA_ORG}/sedes`, { ...alta(6), operador: { nombre: 'B', correo: 'b6@ejemplo.com' } }),
    ]);
    expect(mismoNombre.map((r) => r.status).sort()).toEqual([201, 409]);
    const mismoCorreo = await Promise.all([
      admin.post(`${RUTA_ORG}/sedes`, { ...alta(7), operador: { nombre: 'C', correo: 'comun@ejemplo.com' } }),
      admin.post(`${RUTA_ORG}/sedes`, { ...alta(8), operador: { nombre: 'D', correo: 'comun@ejemplo.com' } }),
    ]);
    expect(mismoCorreo.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await conteos()).toEqual({ sedes: 2, operadores: 2, pertenencias: 2, envios: 2 });
  });

  it('valida institucion inactiva, distrito inexistente y campos no admitidos sin persistir', async () => {
    const admin = pedir((await ingresar('administrador')).cookie);
    await prisma.$executeRawUnsafe(`UPDATE instituciones SET activa = FALSE WHERE id = 'pnp'`);
    expect((await admin.post(`${RUTA_ORG}/sedes`, alta(9))).body.error.fields).toHaveProperty('institucionId');
    expect((await admin.post(`${RUTA_ORG}/sedes`, { ...alta(9), institucionId: 'samu', distritoUbicacionId: 'DIS-09' })).status).toBe(400);
    expect((await admin.post(`${RUTA_ORG}/sedes`, { ...alta(9), institucionId: 'samu', rol: 'administrador' })).status).toBe(400);
    expect((await admin.post(`${RUTA_ORG}/sedes`, { institucionId: 'samu', nombre: 'Sin operador' })).status).toBe(400);
    expect(await conteos()).toEqual({ sedes: 0, operadores: 0, pertenencias: 0, envios: 0 });
  });
});

describe('verificacion, coberturas, competencias y habilitacion', () => {
  it('requisitos faltantes listados; con todos se habilita y las invariantes impiden vaciar o suspender al ultimo', async () => {
    const admin = pedir((await ingresar('administrador')).cookie);
    const creada = await admin.post(`${RUTA_ORG}/sedes`, alta(10));
    const id = creada.body.sede.id as string;
    const faltan = await admin.post(`${RUTA_ORG}/sedes/${id}/habilitacion`);
    expect(faltan.status).toBe(409);
    expect(faltan.body.error).toMatchObject({ code: 'REQUISITOS_HABILITACION', faltantes: ['sede_verificada', 'cobertura', 'competencias', 'operador_activo'] });

    const verif = await admin.patch(`${RUTA_ORG}/sedes/${id}`, { verificacion: { estado: 'verificada', fuente: 'Oficio 7', fecha: '2026-11-25' } });
    expect(verif.body.sede).toMatchObject({ verificacion: { estado: 'verificada', fuente: 'Oficio 7', fecha: '2026-11-25' }, habilitadaAtencion: false });
    expect((await admin.put(`${RUTA_ORG}/sedes/${id}/cobertura`, { distritos: ['DIS-09'] })).status).toBe(400);
    expect((await admin.put(`${RUTA_ORG}/sedes/${id}/competencias`, { categorias: ['inventada'] })).status).toBe(400);
    const cob = await admin.put(`${RUTA_ORG}/sedes/${id}/cobertura`, { distritos: ['DIS-03', 'DIS-01'] });
    expect(cob.body.sede.distritos).toEqual(['DIS-01', 'DIS-03']);
    expect((await admin.put(`${RUTA_ORG}/sedes/${id}/competencias`, { categorias: ['robo', 'asalto'] })).body.sede.categorias).toEqual(['asalto', 'robo']);

    // Operador aun pendiente: no cuenta como activo.
    expect((await admin.post(`${RUTA_ORG}/sedes/${id}/habilitacion`)).body.error.faltantes).toEqual(['operador_activo']);
    await activarPorCorreo('op10@ejemplo.com');
    const ok = await admin.post(`${RUTA_ORG}/sedes/${id}/habilitacion`);
    expect(ok.status).toBe(200);
    expect(ok.body.sede.habilitadaAtencion).toBe(true);

    for (const [ruta, cuerpo] of [['cobertura', { distritos: [] }], ['competencias', { categorias: [] }]] as const) {
      const r = await admin.put(`${RUTA_ORG}/sedes/${id}/${ruta}`, cuerpo);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('SEDE_HABILITADA');
    }
    expect((await admin.patch(`${RUTA_ORG}/sedes/${id}`, { verificacion: { estado: 'sin_verificar' } })).body.error.code).toBe('SEDE_HABILITADA');
    expect((await admin.patch(`${RUTA_ORG}/instituciones/pnp`, { activa: false })).body.error.code).toBe('SEDE_HABILITADA');
    const operadorId = creada.body.operador.id as string;
    const ultimo = await admin.patch(`${RUTA_ORG}/operadores/${operadorId}`, { estado: 'suspendido' });
    expect(ultimo.status).toBe(409);
    expect(ultimo.body.error.code).toBe('ULTIMO_OPERADOR_ACTIVO');

    // Suspender la sede la deshabilita; despues puede vaciarse su cobertura.
    const suspendida = await admin.patch(`${RUTA_ORG}/sedes/${id}`, { activa: false });
    expect(suspendida.body.sede).toMatchObject({ activa: false, habilitadaAtencion: false });
    expect((await admin.put(`${RUTA_ORG}/sedes/${id}/cobertura`, { distritos: [] })).status).toBe(200);
    const deshabilitada = await admin.delete(`${RUTA_ORG}/sedes/${id}/habilitacion`);
    expect(deshabilitada.body.sede.habilitadaAtencion).toBe(false);
    expect(await prisma.sede.count()).toBe(1);
  });

  it('carrera entre habilitar y suspender al unico operador: nunca queda una sede habilitada sin operador activo', async () => {
    const admin = pedir((await ingresar('administrador')).cookie);
    for (let i = 0; i < 6; i++) {
      const { sedeId, operadorId } = await sedeLista(admin, 20 + i);
      const [hab, sus] = await Promise.all([
        admin.post(`${RUTA_ORG}/sedes/${sedeId}/habilitacion`),
        admin.patch(`${RUTA_ORG}/operadores/${operadorId}`, { estado: 'suspendido' }),
      ]);
      expect([200, 409]).toContain(hab.status);
      expect([200, 409]).toContain(sus.status);
      const [estado] = await prisma.$queryRaw<{ habilitada: boolean; activos: number }[]>`
        SELECT s.habilitada_atencion AS habilitada,
               (SELECT count(*)::int FROM pertenencias_operador p JOIN usuarios u ON u.id = p.usuario_id
                 WHERE p.sede_id = s.id AND u.estado = 'activo') AS activos
          FROM sedes s WHERE s.id = ${sedeId}::uuid`;
      expect(estado!.habilitada && estado!.activos === 0).toBe(false);
      expect(hab.status === 200 && sus.status === 200).toBe(false);
    }
  });
});

describe('operadores: alta adicional, suspension, reactivacion e invitacion', () => {
  it('suspender revoca la sesion abierta e impide el acceso; reactivar conserva la contrasena', async () => {
    const admin = pedir((await ingresar('administrador')).cookie);
    const { sedeId, operadorId, correoOp } = await sedeLista(admin, 30);
    const login = await request(app).post(RUTA_INST_SESIONES).set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: correoOp, contrasena: NUEVA });
    expect(login.status).toBe(200);
    const cookieOp = `__Host-ayni_inst=${cookieDe(login) as string}`;
    expect((await request(app).get(RUTA_AMBITO).set('Cookie', cookieOp)).status).toBe(200);

    const sus = await admin.patch(`${RUTA_ORG}/operadores/${operadorId}`, { estado: 'suspendido' });
    expect(sus.body.operador).toMatchObject({ id: operadorId, estado: 'suspendido', sedeId });
    expect((await request(app).get(RUTA_AMBITO).set('Cookie', cookieOp)).status).toBe(401);
    const denegado = await request(app).post(RUTA_INST_SESIONES).set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: correoOp, contrasena: NUEVA });
    expect(denegado.status).toBe(401);
    expect(denegado.body.error.code).toBe('INVALID_CREDENTIALS');

    expect((await admin.patch(`${RUTA_ORG}/operadores/${operadorId}`, { estado: 'activo' })).body.operador.estado).toBe('activo');
    expect((await request(app).post(RUTA_INST_SESIONES).set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: correoOp, contrasena: NUEVA })).status).toBe(200);
    expect(await prisma.usuario.count({ where: { correoNormalizado: correoOp } })).toBe(1);
  });

  it('operador adicional con invitacion; un suspendido que nunca activo vuelve a pendiente', async () => {
    const admin = pedir((await ingresar('administrador')).cookie);
    const sede = await admin.post(`${RUTA_ORG}/sedes`, alta(31));
    const id = sede.body.sede.id as string;
    const nuevo = await admin.post(`${RUTA_ORG}/sedes/${id}/operadores`, { nombre: 'Ana', correo: 'ana31@ejemplo.com' });
    expect(nuevo.status).toBe(201);
    expect(nuevo.body.operador).toMatchObject({ estado: 'pendiente_activacion', sedeId: id });
    expect((await admin.post(`${RUTA_ORG}/sedes/${id}/operadores`, { nombre: 'Ana', correo: 'ana31@ejemplo.com' })).status).toBe(409);
    expect((await admin.post(`${RUTA_ORG}/sedes/00000000-0000-4000-8000-000000000000/operadores`, { nombre: 'B', correo: 'b31@ejemplo.com' })).status).toBe(404);
    const lista = await admin.get(`${RUTA_ORG}/sedes/${id}/operadores`);
    expect(lista.body.operadores.map((o: { correo: string }) => o.correo).sort()).toEqual(['ana31@ejemplo.com', 'op31@ejemplo.com']);

    // Suspender a una pendiente revoca su invitacion: el enlace recibido deja de servir, tambien tras reactivar.
    const anaId = nuevo.body.operador.id as string;
    await modulo.gestorEnvios.esperarReposo();
    const tokenAna = /#t=([A-Za-z0-9_-]+)/.exec(correo.enviados.find((m) => m.para === 'ana31@ejemplo.com')!.texto)![1];
    expect((await admin.patch(`${RUTA_ORG}/operadores/${anaId}`, { estado: 'suspendido' })).body.operador.estado).toBe('suspendido');
    expect((await request(app).post('/api/v1/auth/activaciones').send({ token: tokenAna, contrasena: NUEVA })).status).toBe(410);
    expect((await admin.patch(`${RUTA_ORG}/operadores/${anaId}`, { estado: 'activo' })).body.operador.estado).toBe('pendiente_activacion');
    expect((await request(app).post('/api/v1/auth/activaciones').send({ token: tokenAna, contrasena: NUEVA })).status).toBe(410);
    expect((await admin.post(`${RUTA_ORG}/operadores/${anaId}/invitacion`)).status).toBe(202);
    await activarPorCorreo('ana31@ejemplo.com');
    expect(await prisma.usuario.count({ where: { rol: 'operador' } })).toBe(2);
  });

  it('reenvio de invitacion: invalida el enlace anterior, no duplica envios activos y no aplica a activos', async () => {
    const admin = pedir((await ingresar('administrador')).cookie);
    const sede = await admin.post(`${RUTA_ORG}/sedes`, alta(32));
    const operadorId = sede.body.operador.id as string;
    await modulo.gestorEnvios.esperarReposo();
    const primerToken = /#t=([A-Za-z0-9_-]+)/.exec(correo.enviados[0]!.texto)![1];

    const r = await admin.post(`${RUTA_ORG}/operadores/${operadorId}/invitacion`);
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ estado: 'invitacion_encolada' });
    const consulta = await request(app).post('/api/v1/auth/tokens/consulta').send({ token: primerToken });
    expect(consulta.status).toBe(410);
    await modulo.gestorEnvios.esperarReposo();
    expect(correo.enviados.filter((m) => m.para === 'op32@ejemplo.com')).toHaveLength(2);
    expect(JSON.stringify(r.body)).not.toMatch(/#t=|token/);

    await activarPorCorreo('op32@ejemplo.com');
    const activo = await admin.post(`${RUTA_ORG}/operadores/${operadorId}/invitacion`);
    expect(activo.status).toBe(409);
    expect(activo.body.error.code).toBe('INVITACION_NO_APLICABLE');
    // Un administrador o ciudadano no es un operador con sede: 404.
    const otro = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    expect((await admin.post(`${RUTA_ORG}/operadores/${otro.id}/invitacion`)).status).toBe(404);
    expect((await admin.patch(`${RUTA_ORG}/operadores/${otro.id}`, { estado: 'suspendido' })).status).toBe(404);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: otro.id } })).estado).toBe('activo');
  });
});

describe('ambito del operador', () => {
  it('lectura del propio ambito exacta; cambio de cobertura reflejado; sede suspendida deja ambito vacio', async () => {
    const admin = pedir((await ingresar('administrador')).cookie);
    const { sedeId, correoOp } = await sedeLista(admin, 40);
    await sedeLista(admin, 41); // otra sede no debe aparecer
    const login = await request(app).post(RUTA_INST_SESIONES).set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: correoOp, contrasena: NUEVA });
    const cookieOp = `__Host-ayni_inst=${cookieDe(login) as string}`;
    const r = await request(app).get(RUTA_AMBITO).set('Cookie', cookieOp);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toEqual({
      ambito: {
        institucion: { id: 'pnp', nombre: 'PNP' },
        sede: { id: sedeId, nombre: 'Comisaría 40' },
        distritos: ['DIS-01', 'DIS-03'],
        categorias: ['asalto', 'robo'],
        habilitadaAtencion: false,
      },
    });
    expect(JSON.stringify(r.body)).not.toMatch(/op41|Comisaría 41|correo/);
    await admin.put(`${RUTA_ORG}/sedes/${sedeId}/cobertura`, { distritos: ['DIS-05'] });
    expect((await request(app).get(RUTA_AMBITO).set('Cookie', cookieOp)).body.ambito.distritos).toEqual(['DIS-05']);
    await admin.patch(`${RUTA_ORG}/sedes/${sedeId}`, { activa: false });
    expect((await request(app).get(RUTA_AMBITO).set('Cookie', cookieOp)).body).toEqual({ ambito: null });
    // Contrato interno exportado por la fachada.
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { correoNormalizado: correoOp } });
    expect(await modulo.consultarAmbitoOperador.ejecutar(usuario.id)).toBeNull();
  });

  it('un administrador recibe 403 en el ambito del operador', async () => {
    const { cookie } = await ingresar('administrador');
    expect((await request(app).get(RUTA_AMBITO).set('Cookie', cookie)).status).toBe(403);
  });
});

describe('instituciones y permisos (EQ-09 organizativo)', () => {
  it('cuatro instituciones; editar nombre y contacto no cambia el tipo; no existe ruta de creacion', async () => {
    const admin = pedir((await ingresar('administrador')).cookie);
    const lista = await admin.get(`${RUTA_ORG}/instituciones`);
    expect(lista.body.instituciones.map((i: { tipo: string }) => i.tipo)).toEqual(['bomberos', 'pnp', 'samu', 'serenazgo']);
    const edit = await admin.patch(`${RUTA_ORG}/instituciones/samu`, { nombre: 'SAMU Ayacucho', contacto: '106' });
    expect(edit.body.institucion).toEqual({ id: 'samu', tipo: 'samu', nombre: 'SAMU Ayacucho', contacto: '106', activa: true });
    expect((await admin.patch(`${RUTA_ORG}/instituciones/samu`, { tipo: 'pnp' })).status).toBe(400);
    expect((await admin.patch(`${RUTA_ORG}/instituciones/municipalidad`, { nombre: 'X' })).status).toBe(404);
    const crear = await admin.post(`${RUTA_ORG}/instituciones`, { tipo: 'municipalidad', nombre: 'X' });
    expect(crear.status).toBe(405);
    expect(crear.headers.allow).toBe('GET, HEAD');
    expect(await prisma.institucion.count()).toBe(4);
  });

  it('operador: 403 en todas las rutas de organizacion, incluso de su sede; sin sesion o ciudadano: 401', async () => {
    const admin = pedir((await ingresar('administrador')).cookie);
    const { sedeId, operadorId, correoOp } = await sedeLista(admin, 50);
    const login = await request(app).post(RUTA_INST_SESIONES).set('Origin', ORIGEN_WEB_PRUEBA).send({ correo: correoOp, contrasena: NUEVA });
    const op = pedir(`__Host-ayni_inst=${cookieDe(login) as string}`);
    const ciudadano = await crearCuentaDePrueba(prisma, { rol: 'ciudadano' });
    const token = (await request(app).post(RUTA_LOGIN).send({ correo: ciudadano.correo, contrasena: CLAVE })).body.token as string;
    const rutas: [string, string, object?][] = [
      ['get', `${RUTA_ORG}/instituciones`], ['patch', `${RUTA_ORG}/instituciones/pnp`, { nombre: 'X' }],
      ['get', `${RUTA_ORG}/sedes`], ['post', `${RUTA_ORG}/sedes`, alta(51)],
      ['patch', `${RUTA_ORG}/sedes/${sedeId}`, { nombre: 'X' }], ['put', `${RUTA_ORG}/sedes/${sedeId}/cobertura`, { distritos: [] }],
      ['put', `${RUTA_ORG}/sedes/${sedeId}/competencias`, { categorias: [] }], ['post', `${RUTA_ORG}/sedes/${sedeId}/habilitacion`],
      ['delete', `${RUTA_ORG}/sedes/${sedeId}/habilitacion`], ['get', `${RUTA_ORG}/sedes/${sedeId}/operadores`],
      ['post', `${RUTA_ORG}/sedes/${sedeId}/operadores`, { nombre: 'X', correo: 'x50@ejemplo.com' }],
      ['patch', `${RUTA_ORG}/operadores/${operadorId}`, { estado: 'suspendido' }], ['post', `${RUTA_ORG}/operadores/${operadorId}/invitacion`],
    ];
    const antes = await conteos();
    for (const [metodo, ruta, cuerpo] of rutas) {
      const r = await (op as unknown as Record<string, (r: string, c?: object) => request.Test>)[metodo]!(ruta, cuerpo);
      expect([ruta, r.status, r.body.sedes ?? r.body.instituciones ?? r.body.operadores]).toEqual([ruta, 403, undefined]);
      const anonimo = await (request(app) as unknown as Record<string, (r: string) => request.Test>)[metodo]!(ruta).set('Origin', ORIGEN_WEB_PRUEBA);
      expect([ruta, anonimo.status]).toEqual([ruta, 401]);
      const bearer = await (request(app) as unknown as Record<string, (r: string) => request.Test>)[metodo]!(ruta).set({ Origin: ORIGEN_WEB_PRUEBA, Authorization: `Bearer ${token}` });
      expect([ruta, bearer.status]).toEqual([ruta, 401]);
    }
    expect(await conteos()).toEqual(antes);
    // Mutacion de administrador sin el origen web: rechazo CSRF vigente.
    const sinOrigen = await request(app).post(`${RUTA_ORG}/sedes`).set('Cookie', (await ingresar('administrador')).cookie).send(alta(52));
    expect(sinOrigen.status).toBe(403);
    expect(sinOrigen.body.error.code).toBe('FORBIDDEN_ORIGIN');
    expect(await conteos()).toEqual(antes);
  });
});
