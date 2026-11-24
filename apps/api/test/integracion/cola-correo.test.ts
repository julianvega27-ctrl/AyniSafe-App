import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { ProcesarEnviosCorreoUseCase } from '../../src/modules/identidad/aplicacion/procesar-envios-correo.use-case';
import { PLAZO_ENVIO_MS } from '../../src/modules/identidad/dominio/envio-correo';
import { GestorEnvios } from '../../src/modules/identidad/infraestructura/gestor-envios';
import { GmailApiCorreoAdapter } from '../../src/modules/identidad/infraestructura/gmail-api-correo.adapter';
import type { PropositoToken } from '../../src/modules/identidad/dominio/token-cuenta';
import {
  CLAVE,
  RUTA_REGISTRO,
  ORIGEN_WEB_PRUEBA,
  URL_PUBLICA_PRUEBA,
  crearArnes,
  limpiarBd,
} from './arnes';

const arnes = crearArnes();
const { app, prisma, reloj, deps, logger, correo, modulo } = arnes;
const MIN = 60 * 1000;
const CORREO_DESTINO = 'destinataria-identificable@ejemplo.com';

const procesador = () =>
  new ProcesarEnviosCorreoUseCase(deps.envios, deps.correo, modulo.emitirToken, deps.redactor, reloj, logger);

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
  correo.enviados.length = 0;
  correo.programarFallos(0);
  logger.eventos.length = 0;
});

async function ciudadano(email = CORREO_DESTINO) {
  const r = await request(app).post(RUTA_REGISTRO).send({ nombre: 'Rosa Quispe', correo: email, contrasena: CLAVE });
  expect(r.status).toBe(201);
  return r.body.usuario.id as string;
}

async function pendiente(email = 'invitada@ejemplo.com', rol: 'ciudadano' | 'operador' | 'administrador' = 'ciudadano') {
  const u = await prisma.usuario.create({
    data: { nombre: 'Invitada', correoNormalizado: email, passwordHash: null, rol, estado: 'pendiente_activacion' },
  });
  return u.id;
}

function encolar(usuarioId: string, tipo: PropositoToken = 'recuperacion', tx?: unknown) {
  const ahora = reloj.ahora();
  return deps.envios.encolar(
    { usuarioId, tipo, creadoAt: ahora, venceAt: new Date(ahora.getTime() + PLAZO_ENVIO_MS[tipo]) },
    tx,
  );
}

const filasEnvio = () =>
  prisma.$queryRawUnsafe<
    { estado: string; intentos: number; ultimo_codigo_error: string | null; proximo_intento_at: Date }[]
  >('SELECT estado::text, intentos, ultimo_codigo_error, proximo_intento_at FROM envios_correo ORDER BY created_at');

describe('4.3 encolado', () => {
  it('no apila envios activos del mismo usuario y tipo, pero si de otro tipo', async () => {
    const id = await ciudadano();
    expect(await encolar(id)).toBe(true);
    expect(await encolar(id)).toBe(false);
    expect(await encolar(id, 'activacion')).toBe(true);
    expect(await filasEnvio()).toHaveLength(2);
  });

  it('dentro de la transaccion del llamador: si esta se revierte no queda ningun envio', async () => {
    const id = await ciudadano();
    await expect(
      prisma.$transaction(async (tx) => {
        expect(await encolar(id, 'recuperacion', tx)).toBe(true);
        throw new Error('el llamador revierte');
      }),
    ).rejects.toThrow('el llamador revierte');
    expect(await filasEnvio()).toHaveLength(0);
  });

  it('dentro de la transaccion del llamador: al confirmarse queda el envio', async () => {
    const id = await ciudadano();
    await prisma.$transaction(async (tx) => {
      await encolar(id, 'recuperacion', tx);
    });
    expect(await filasEnvio()).toHaveLength(1);
  });
});

describe('4.3 envio, reintentos y recuperacion', () => {
  it('envia, marca enviado y no duplica al volver a procesar', async () => {
    const id = await ciudadano();
    await encolar(id);
    const r = await procesador().ejecutar();
    expect(r.enviados).toBe(1);
    expect(correo.enviados).toHaveLength(1);
    expect(correo.enviados[0]!.para).toBe(CORREO_DESTINO);
    expect((await filasEnvio())[0]).toMatchObject({ estado: 'enviado', intentos: 0 });
    await procesador().ejecutar();
    expect(correo.enviados).toHaveLength(1);
  });

  it('el token se genera al enviar: la cola no guarda secretos y el enlace corresponde a un token vigente', async () => {
    const id = await ciudadano();
    await encolar(id);
    const columnas = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'envios_correo'`,
    );
    expect(columnas.map((c) => c.column_name).some((c) => /token|enlace|cuerpo|texto/i.test(c))).toBe(false);
    await procesador().ejecutar();
    const token = /#t=([A-Za-z0-9_-]{43})/.exec(correo.enviados[0]!.texto)![1]!;
    expect(await deps.tokensCuenta.consultar(deps.tokens.huella(token), reloj.ahora())).toMatchObject({
      estado: 'vigente',
      proposito: 'recuperacion',
    });
  });

  it('un fallo del proveedor reprograma con espera de 1 minuto, guarda solo un codigo y no envia antes de tiempo', async () => {
    const id = await ciudadano();
    await encolar(id);
    correo.programarFallos(1, 'CONEXION');
    const t0 = reloj.ahora().getTime();

    const r = await procesador().ejecutar();

    expect(r.reprogramados).toBe(1);
    const [fila] = await filasEnvio();
    expect(fila).toMatchObject({ estado: 'pendiente', intentos: 1, ultimo_codigo_error: 'CONEXION' });
    expect(fila!.proximo_intento_at.getTime()).toBe(t0 + MIN);
    expect((await procesador().ejecutar()).enviados).toBe(0);
    expect(correo.enviados).toHaveLength(0);

    reloj.avanzar(MIN + 1000);
    expect((await procesador().ejecutar()).enviados).toBe(1);
    expect((await filasEnvio())[0]).toMatchObject({ estado: 'enviado', intentos: 1 });
    reloj.avanzar(-(MIN + 1000));
  });

  it('el reintento emite un token nuevo que invalida el del intento fallido', async () => {
    const id = await ciudadano();
    await encolar(id);
    correo.programarFallos(1);
    await procesador().ejecutar();
    reloj.avanzar(2 * MIN);
    await procesador().ejecutar();
    reloj.avanzar(-2 * MIN);
    const tokens = await prisma.$queryRawUnsafe<{ invalidado_at: Date | null }[]>(
      'SELECT invalidado_at FROM tokens_cuenta ORDER BY created_at',
    );
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.invalidado_at).not.toBeNull();
    expect(tokens[1]!.invalidado_at).toBeNull();
  });

  it('una recuperacion que agota su plazo de 15 minutos queda fallida con codigo generico y no se envia vencida', async () => {
    const id = await ciudadano();
    await encolar(id);
    correo.programarFallos(10, 'TIEMPO_AGOTADO');
    const inicio = reloj.ahora();
    await procesador().ejecutar();
    reloj.avanzar(MIN + 1000);
    await procesador().ejecutar();
    reloj.avanzar(5 * MIN + 1000);
    const r = await procesador().ejecutar();
    expect(r.fallidos).toBe(1);
    expect((await filasEnvio())[0]).toMatchObject({ estado: 'fallido', intentos: 3, ultimo_codigo_error: 'TIEMPO_AGOTADO' });
    reloj.avanzar(60 * MIN);
    await procesador().ejecutar();
    expect(correo.enviados).toHaveLength(0);
    reloj.fijar(inicio);
  });

  it('un envio pendiente cuyo plazo vencio se descarta sin enviarlo (VENCIDO)', async () => {
    const id = await ciudadano();
    await encolar(id);
    reloj.avanzar(16 * MIN);
    const r = await procesador().ejecutar();
    reloj.avanzar(-16 * MIN);
    expect(r.descartados).toBe(1);
    expect(correo.enviados).toHaveLength(0);
    expect((await filasEnvio())[0]).toMatchObject({ estado: 'fallido', ultimo_codigo_error: 'VENCIDO' });
  });

  it('reinicio con envios pendientes: una instancia nueva los retoma sin duplicar los ya enviados', async () => {
    const a = await ciudadano('a@ejemplo.com');
    const b = await ciudadano('b@ejemplo.com');
    await encolar(a);
    await procesador().ejecutar();
    await encolar(b);
    expect(correo.enviados).toHaveLength(1);

    // "Reinicio": se descarta el estado en memoria y se crea otro gestor sobre la misma base.
    const reiniciada = crearArnes({ prisma, reloj });
    const gestor = new GestorEnvios(
      new ProcesarEnviosCorreoUseCase(
        reiniciada.deps.envios,
        reiniciada.correo,
        reiniciada.modulo.emitirToken,
        reiniciada.deps.redactor,
        reloj,
        reiniciada.logger,
      ),
      reiniciada.deps.envios,
      reloj,
      reiniciada.logger,
    );
    gestor.iniciar();
    await gestor.esperarReposo();
    await gestor.detener();

    expect(reiniciada.correo.enviados.map((m) => m.para)).toEqual(['b@ejemplo.com']);
    expect(correo.enviados).toHaveLength(1);
  });

  it('retoma un envio "enviando" solo cuando vence su arrendamiento', async () => {
    const id = await ciudadano();
    await encolar(id);
    const ahora = reloj.ahora();
    const marcar = (hasta: Date) =>
      prisma.$executeRaw`UPDATE envios_correo SET estado = 'enviando', reclamado_hasta = ${hasta}::timestamptz`;
    await marcar(new Date(ahora.getTime() + 60 * MIN));
    expect((await procesador().ejecutar()).enviados).toBe(0);
    await marcar(new Date(ahora.getTime() - 1000));
    expect((await procesador().ejecutar()).enviados).toBe(1);
  });

  it('cuenta suspendida o ya activada despues de encolar: no se envia y queda CUENTA_NO_APTA', async () => {
    const id = await ciudadano();
    await encolar(id);
    await prisma.usuario.update({ where: { id }, data: { estado: 'suspendido' } });
    const r = await procesador().ejecutar();
    expect(r.fallidos).toBe(1);
    expect(correo.enviados).toHaveLength(0);
    expect((await filasEnvio())[0]).toMatchObject({ estado: 'fallido', ultimo_codigo_error: 'CUENTA_NO_APTA' });

    const act = await ciudadano('activa@ejemplo.com');
    await encolar(act, 'activacion');
    await procesador().ejecutar();
    expect(correo.enviados).toHaveLength(0);
  });

  it('un error no previsto del proveedor se registra como DESCONOCIDO', async () => {
    const id = await ciudadano();
    await encolar(id);
    const raro = { enviar: () => Promise.reject(new Error('detalle-interno-secreto')) };
    const proc = new ProcesarEnviosCorreoUseCase(deps.envios, raro, modulo.emitirToken, deps.redactor, reloj, logger);
    await proc.ejecutar();
    expect((await filasEnvio())[0]).toMatchObject({ ultimo_codigo_error: 'DESCONOCIDO' });
    expect(logger.texto()).not.toContain('detalle-interno-secreto');
  });
});

describe('4.3 gestor sin sondeo en reposo', () => {
  let gestor: GestorEnvios | undefined;
  afterEach(async () => {
    await gestor?.detener();
    gestor = undefined;
  });

  const nuevoGestor = () =>
    new GestorEnvios(procesador(), deps.envios, reloj, logger);

  it('sin envios activos no queda ningun temporizador', async () => {
    gestor = nuevoGestor();
    gestor.iniciar();
    await gestor.esperarReposo();
    expect(gestor.hayTemporizador()).toBe(false);
  });

  it('despertar procesa de inmediato lo encolado y, sin pendientes, vuelve al reposo', async () => {
    const id = await ciudadano();
    gestor = nuevoGestor();
    await encolar(id);
    gestor.despertar();
    await gestor.esperarReposo();
    expect(correo.enviados).toHaveLength(1);
    expect(gestor.hayTemporizador()).toBe(false);
  });

  it('con un reintento pendiente programa un unico temporizador; detener lo cancela', async () => {
    const id = await ciudadano();
    await encolar(id);
    correo.programarFallos(1);
    gestor = nuevoGestor();
    gestor.despertar();
    await gestor.esperarReposo();
    expect(correo.enviados).toHaveLength(0);
    expect(gestor.hayTemporizador()).toBe(true);
    await gestor.detener();
    expect(gestor.hayTemporizador()).toBe(false);
  });
});

describe('4.4 contenido del correo', () => {
  const enlaceDe = (texto: string) => /https:\/\/\S+/.exec(texto)![0];

  it('recuperacion: enlace HTTPS con el token solo en el fragmento y el codigo para pegar', async () => {
    const id = await ciudadano();
    await encolar(id);
    await procesador().ejecutar();
    const { asunto, texto } = correo.enviados[0]!;
    const enlace = enlaceDe(texto);
    const url = new URL(enlace);
    expect(asunto).toBe('Restablece tu contraseña de AyniSafe');
    expect(url.origin).toBe(URL_PUBLICA_PRUEBA);
    expect(url.pathname).toBe('/cuenta/restablecer');
    expect(url.search).toBe('');
    expect(url.hash).toMatch(/^#t=[A-Za-z0-9_-]{43}$/);
    const token = url.hash.slice(3);
    expect(texto.split(token).length - 1).toBe(2); // enlace + codigo para pegar
    expect(texto).toContain('30 minutos');
    expect(texto).toContain('Solo el enlace más reciente es válido');
    expect(texto).toContain('Hola, Rosa Quispe');
  });

  it('activacion: ruta propia, 72 horas y sin promesa de acceso', async () => {
    const id = await pendiente();
    await encolar(id, 'activacion');
    await procesador().ejecutar();
    const { asunto, texto } = correo.enviados[0]!;
    expect(asunto).toBe('Activa tu cuenta de AyniSafe');
    expect(new URL(enlaceDe(texto)).pathname).toBe('/cuenta/activar');
    expect(texto).toContain('72 horas');
    expect(texto).toContain('Solo el enlace más reciente es válido');
  });

  it.each(['administrador', 'operador'] as const)(
    'activacion de %s: enlace de la web (/activar) con el token solo en el fragmento y sin mencion a la app',
    async (rol) => {
      const id = await pendiente(`${rol}@ejemplo.com`, rol);
      await encolar(id, 'activacion');
      await procesador().ejecutar();
      const { asunto, texto } = correo.enviados[0]!;
      const url = new URL(enlaceDe(texto));
      expect(url.origin).toBe(ORIGEN_WEB_PRUEBA);
      expect(url.pathname).toBe('/activar');
      expect(url.search).toBe('');
      expect(url.hash).toMatch(/^#t=[A-Za-z0-9_-]{43}$/);
      const token = url.hash.slice(3);
      expect(texto.split(token).length - 1).toBe(2); // enlace + codigo para pegar
      expect(asunto).toBe('Activa tu cuenta institucional de AyniSafe');
      expect(texto).toContain('72 horas');
      expect(texto).not.toContain(URL_PUBLICA_PRUEBA);
      expect(texto).not.toMatch(/app|aplicaci[oó]n|Android/i);
      // El token del correo es de activacion y consume la cuenta institucional.
      expect(await deps.tokensCuenta.consultar(deps.tokens.huella(token), reloj.ahora())).toMatchObject({
        estado: 'vigente',
        proposito: 'activacion',
      });
    },
  );

  it('los registros del envio institucional no contienen el enlace, el token ni el origen web', async () => {
    const id = await pendiente('admin-log@ejemplo.com', 'administrador');
    await encolar(id, 'activacion');
    await procesador().ejecutar();
    const token = /#t=([A-Za-z0-9_-]{43})/.exec(correo.enviados[0]!.texto)![1]!;
    const registro = logger.texto();
    for (const secreto of ['admin-log@ejemplo.com', token, '#t=', ORIGEN_WEB_PRUEBA, '/activar']) {
      expect(registro).not.toContain(secreto);
    }
  });

  it('el correo no contiene HTML, el enlace en el asunto ni datos ajenos a la cuenta', async () => {
    const id = await ciudadano();
    await encolar(id);
    await procesador().ejecutar();
    const { asunto, texto } = correo.enviados[0]!;
    expect(texto).not.toMatch(/<[a-z][^>]*>/i);
    expect(asunto).not.toMatch(/https?:|#t=/);
    expect(texto).not.toContain(CLAVE);
  });

  it('los registros no contienen el correo, el enlace, el token ni el cuerpo', async () => {
    const id = await ciudadano();
    await encolar(id);
    correo.programarFallos(1, 'RECHAZADO');
    await procesador().ejecutar();
    reloj.avanzar(2 * MIN);
    await procesador().ejecutar();
    reloj.avanzar(-2 * MIN);
    const token = /#t=([A-Za-z0-9_-]{43})/.exec(correo.enviados[0]!.texto)![1]!;
    const registro = logger.texto();
    for (const secreto of [CORREO_DESTINO, token, '#t=', 'Hola, Rosa', URL_PUBLICA_PRUEBA, 'Restablece']) {
      expect(registro).not.toContain(secreto);
    }
    expect(logger.eventos.filter((e) => e.evento === 'envio_correo').map((e) => e.resultado)).toEqual(['reintento', 'enviado']);
  });
});

describe('4.5 credenciales del proveedor revocadas (Gmail API) en la cola', () => {
  const SECRETOS = ['secreto-cliente-identificable-4471', 'refresh-token-identificable-98123'];

  it('el envio se clasifica AUTENTICACION, se reintenta y queda fallido sin filtrar secretos; la solicitud ya respondio 202', async () => {
    let llamadas = 0;
    const revocado = new GmailApiCorreoAdapter({
      clienteId: 'id.apps.googleusercontent.com',
      clienteSecreto: SECRETOS[0]!,
      refreshToken: SECRETOS[1]!,
      remitenteNombre: 'AyniSafe',
      remitenteDireccion: 'cuenta@gmail.com',
      fetchFn: (async () => {
        llamadas += 1;
        return new Response(JSON.stringify({ error: 'invalid_grant', error_description: `${SECRETOS.join(' ')} ${CORREO_DESTINO}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch,
    });
    const id = await ciudadano();
    const solicitud = await request(app).post('/api/v1/auth/recuperaciones').send({ correo: CORREO_DESTINO });
    expect(solicitud.status).toBe(202);
    await modulo.gestorEnvios.esperarReposo();
    await prisma.$executeRawUnsafe('TRUNCATE envios_correo');

    await encolar(id);
    const proc = new ProcesarEnviosCorreoUseCase(deps.envios, revocado, modulo.emitirToken, deps.redactor, reloj, logger);
    const inicio = reloj.ahora();
    await proc.ejecutar();
    expect((await filasEnvio())[0]).toMatchObject({ estado: 'pendiente', intentos: 1, ultimo_codigo_error: 'AUTENTICACION' });
    reloj.avanzar(MIN + 1000);
    await proc.ejecutar();
    reloj.avanzar(5 * MIN + 1000);
    await proc.ejecutar();
    expect((await filasEnvio())[0]).toMatchObject({ estado: 'fallido', intentos: 3, ultimo_codigo_error: 'AUTENTICACION' });
    reloj.fijar(inicio);

    expect(llamadas).toBeGreaterThanOrEqual(3);
    const volcado = logger.texto();
    for (const secreto of [...SECRETOS, CORREO_DESTINO, 'Restablece', '#t=']) expect(volcado).not.toContain(secreto);
    const filas = JSON.stringify(await prisma.$queryRawUnsafe('SELECT * FROM envios_correo'));
    for (const secreto of SECRETOS) expect(filas).not.toContain(secreto);
  });
});
