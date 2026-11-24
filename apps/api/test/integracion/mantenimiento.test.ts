import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import { PurgarCaducadosUseCase } from '../../src/modules/identidad/aplicacion/purgar-caducados.use-case';
import type { HashContrasenaPort } from '../../src/modules/identidad/aplicacion/puertos/hash-contrasena.port';
import type { PurgaPort } from '../../src/modules/identidad/aplicacion/puertos/purga.port';
import { ServicioNoDisponibleError } from '../../src/modules/identidad/dominio/errores';
import { Argon2idHashAdapter } from '../../src/modules/identidad/infraestructura/argon2id-hash.adapter';
import { HashConLimiteDeConcurrencia } from '../../src/modules/identidad/infraestructura/hash-con-limite.adapter';
import { PrismaPurgaAdapter } from '../../src/modules/identidad/infraestructura/prisma-purga.adapter';
import { CLAVE, crearArnes, limpiarBd, RelojControlable, RUTA_LOGIN, RUTA_REGISTRO } from './arnes';

const reloj = new RelojControlable();
const { prisma } = crearArnes({ reloj });

afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(async () => {
  await limpiarBd(prisma);
  reloj.fijar(new Date('2026-11-21T12:00:00.000Z'));
});

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const hace = (ms: number) => new Date(reloj.ahora().getTime() - ms);
const en = (ms: number) => new Date(reloj.ahora().getTime() + ms);

async function usuario(correo = 'p@ejemplo.com') {
  return prisma.usuario.create({
    data: { nombre: 'P', correoNormalizado: correo, passwordHash: 'h', rol: 'ciudadano', estado: 'activo' },
  });
}

async function sesion(usuarioId: string, hash: string, creada: Date, vence: Date, revocada: Date | null = null) {
  return prisma.sesion.create({ data: { usuarioId, tokenHash: hash, createdAt: creada, expiresAt: vence, revokedAt: revocada } });
}

describe('purga por lotes', () => {
  it('elimina sesiones vencidas/revocadas tras 7 dias y ventanas tras 24 h, sin tocar las vigentes', async () => {
    const u = await usuario();
    await sesion(u.id, 'vigente', hace(HORA), en(23 * HORA));
    await sesion(u.id, 'vencida-8d', hace(10 * DIA), hace(8 * DIA));
    await sesion(u.id, 'vencida-6d', hace(7 * DIA), hace(6 * DIA));
    await sesion(u.id, 'revocada-8d', hace(9 * DIA), en(DIA), hace(8 * DIA));
    await sesion(u.id, 'revocada-2d', hace(3 * DIA), en(DIA), hace(2 * DIA));
    await prisma.$executeRaw`INSERT INTO ventanas_intentos (tipo, clave_hash, ventana_inicio, contador) VALUES
      ('login_ip', 'vieja', ${hace(25 * HORA)}::timestamptz, 3),
      ('login_ip', 'reciente', ${hace(23 * HORA)}::timestamptz, 3),
      ('login_ip', 'actual', ${reloj.ahora()}::timestamptz, 1)`;

    const r = await new PurgarCaducadosUseCase(new PrismaPurgaAdapter(prisma), reloj).ejecutar();
    expect(r).toEqual({ sesiones: 2, ventanas: 1, tokens: 0, envios: 0 });

    const quedan = (await prisma.sesion.findMany()).map((s) => s.tokenHash).sort();
    expect(quedan).toEqual(['revocada-2d', 'vencida-6d', 'vigente']);
    const ventanas = (await prisma.$queryRawUnsafe<{ clave_hash: string }[]>('SELECT clave_hash FROM ventanas_intentos')).map((v) => v.clave_hash).sort();
    expect(ventanas).toEqual(['actual', 'reciente']);
  });

  it('procesa por lotes: muchos registros caducados se eliminan en varias pasadas', async () => {
    const u = await usuario();
    for (let i = 0; i < 7; i += 1) await sesion(u.id, `v${i}`, hace(20 * DIA), hace(10 * DIA));
    await sesion(u.id, 'viva', hace(HORA), en(DIA));
    const pasos: number[] = [];
    const real = new PrismaPurgaAdapter(prisma);
    const espia: PurgaPort = {
      purgarSesionesAnterioresA: async (c, l) => {
        const n = await real.purgarSesionesAnterioresA(c, l);
        pasos.push(n);
        return n;
      },
      purgarVentanasAnterioresA: (c, l) => real.purgarVentanasAnterioresA(c, l),
      purgarTokensAnterioresA: (c, l) => real.purgarTokensAnterioresA(c, l),
      purgarEnviosTerminadosAnterioresA: (c, l) => real.purgarEnviosTerminadosAnterioresA(c, l),
    };
    const r = await new PurgarCaducadosUseCase(espia, reloj, 3).ejecutar();
    expect(r.sesiones).toBe(7);
    expect(pasos).toEqual([3, 3, 1]);
    expect((await prisma.sesion.findMany()).map((s) => s.tokenHash)).toEqual(['viva']);
  });

  it('es recuperable: un fallo a mitad no deja estado intermedio y la siguiente pasada termina', async () => {
    const u = await usuario();
    for (let i = 0; i < 6; i += 1) await sesion(u.id, `v${i}`, hace(20 * DIA), hace(10 * DIA));
    await sesion(u.id, 'viva', hace(HORA), en(DIA));
    const real = new PrismaPurgaAdapter(prisma);
    let llamadas = 0;
    const inestable: PurgaPort = {
      purgarSesionesAnterioresA: (c, l) => {
        llamadas += 1;
        if (llamadas === 2) return Promise.reject(new ServicioNoDisponibleError(new Error('corte')));
        return real.purgarSesionesAnterioresA(c, l);
      },
      purgarVentanasAnterioresA: (c, l) => real.purgarVentanasAnterioresA(c, l),
      purgarTokensAnterioresA: (c, l) => real.purgarTokensAnterioresA(c, l),
      purgarEnviosTerminadosAnterioresA: (c, l) => real.purgarEnviosTerminadosAnterioresA(c, l),
    };
    await expect(new PurgarCaducadosUseCase(inestable, reloj, 2).ejecutar()).rejects.toBeInstanceOf(ServicioNoDisponibleError);
    expect(await prisma.sesion.count()).toBe(5); // se borro un lote de 2; quedan 4 caducadas + 1 viva
    const r = await new PurgarCaducadosUseCase(real, reloj, 2).ejecutar();
    expect(r.sesiones).toBe(4);
    expect((await prisma.sesion.findMany()).map((s) => s.tokenHash)).toEqual(['viva']);
  });
});

describe('purga de tokens de cuenta y envios de correo (7 dias)', () => {
  const insertarToken = (usuarioId: string, hash: string, creado: Date, vence: Date, usado: Date | null = null) =>
    prisma.$executeRaw`INSERT INTO tokens_cuenta (usuario_id, proposito, token_hash, created_at, expires_at, used_at)
      VALUES (${usuarioId}::uuid, 'recuperacion', ${hash}, ${creado}::timestamptz, ${vence}::timestamptz, ${usado}::timestamptz)`;
  const insertarEnvio = (usuarioId: string, tipo: string, estado: string, creado: Date) =>
    prisma.$executeRaw`INSERT INTO envios_correo (tipo, usuario_id, estado, proximo_intento_at, vence_at, created_at)
      VALUES (${tipo}::"PropositoToken", ${usuarioId}::uuid, ${estado}::"EstadoEnvio", ${creado}::timestamptz, ${creado}::timestamptz, ${creado}::timestamptz)`;

  it('elimina tokens inservibles y envios terminados de mas de 7 dias, sin tocar los vigentes ni los activos', async () => {
    const u = await usuario();
    await insertarToken(u.id, 'vigente', hace(HORA), en(HORA));
    await insertarToken(u.id, 'vencido-8d', hace(9 * DIA), hace(8 * DIA));
    await insertarToken(u.id, 'vencido-2d', hace(3 * DIA), hace(2 * DIA));
    await insertarToken(u.id, 'usado-8d', hace(9 * DIA), en(DIA), hace(8 * DIA));
    await insertarEnvio(u.id, 'recuperacion', 'enviado', hace(8 * DIA));
    await insertarEnvio(u.id, 'activacion', 'fallido', hace(8 * DIA));
    await insertarEnvio(u.id, 'recuperacion', 'pendiente', hace(8 * DIA));
    const u2 = await usuario('q@ejemplo.com');
    await insertarEnvio(u2.id, 'recuperacion', 'enviado', hace(2 * DIA));

    const r = await new PurgarCaducadosUseCase(new PrismaPurgaAdapter(prisma), reloj).ejecutar();

    expect(r).toMatchObject({ tokens: 2, envios: 2 });
    const tokens = await prisma.$queryRawUnsafe<{ token_hash: string }[]>('SELECT token_hash FROM tokens_cuenta ORDER BY token_hash');
    expect(tokens.map((t) => t.token_hash)).toEqual(['vencido-2d', 'vigente']);
    const envios = await prisma.$queryRawUnsafe<{ estado: string }[]>('SELECT estado::text FROM envios_correo ORDER BY estado');
    expect(envios.map((e) => e.estado)).toEqual(['enviado', 'pendiente']);
  });
});

describe('limite de concurrencia del hash', () => {
  class HashBloqueable implements HashContrasenaPort {
    enCurso = 0;
    maximoObservado = 0;
    private readonly esperas: Array<() => void> = [];
    private readonly real = new Argon2idHashAdapter();
    abierto = false;

    private async compuerta(): Promise<void> {
      this.enCurso += 1;
      this.maximoObservado = Math.max(this.maximoObservado, this.enCurso);
      if (!this.abierto) await new Promise<void>((r) => this.esperas.push(r));
      this.enCurso -= 1;
    }
    liberar(): void {
      this.abierto = true;
      this.esperas.splice(0).forEach((r) => r());
    }
    async hash(c: string) {
      await this.compuerta();
      return this.real.hash(c);
    }
    async verificar(h: string, c: string) {
      await this.compuerta();
      return this.real.verificar(h, c);
    }
    async verificarFicticio(c: string) {
      await this.compuerta();
      return this.real.verificarFicticio(c);
    }
  }

  it('nunca ejecuta mas hashes simultaneos que el limite; el exceso espera y la cola llena se rechaza', async () => {
    const interno = new HashBloqueable();
    const limitado = new HashConLimiteDeConcurrencia(interno, 2, 1);
    const resultados = [1, 2, 3, 4, 5].map((i) => limitado.hash(`clave larga numero ${i}`).then(() => 'ok', (e: unknown) => e));
    await new Promise((r) => setTimeout(r, 50));
    expect(interno.enCurso).toBe(2); // 2 en curso, 1 en cola, 2 rechazados
    interno.liberar();
    const r = await Promise.all(resultados);
    expect(r.filter((x) => x === 'ok')).toHaveLength(3);
    expect(r.filter((x) => x instanceof ServicioNoDisponibleError)).toHaveLength(2);
    expect(interno.maximoObservado).toBeLessThanOrEqual(2);
    // Tras liberar, el limitador vuelve a aceptar trabajo.
    await expect(limitado.hash('una clave larga posterior')).resolves.toMatch(/^\$argon2id\$/);
  });

  it('HTTP: al saturarse responde 503 sin crear cuentas ni sesiones parciales', async () => {
    const interno = new HashBloqueable();
    const arnes = crearArnes({ prisma, hash: new HashConLimiteDeConcurrencia(interno, 1, 0) });
    const primera = request(arnes.app).post(RUTA_REGISTRO).send({ nombre: 'Uno', correo: 'uno@ejemplo.com', contrasena: CLAVE }).then((r) => r);
    await new Promise((r) => setTimeout(r, 300));
    expect(interno.enCurso).toBe(1);

    const saturada = await request(arnes.app).post(RUTA_REGISTRO).send({ nombre: 'Dos', correo: 'dos@ejemplo.com', contrasena: CLAVE });
    expect(saturada.status).toBe(503);
    expect(saturada.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(saturada.headers['cache-control']).toBe('no-store');
    expect(await prisma.usuario.count({ where: { correoNormalizado: 'dos@ejemplo.com' } })).toBe(0);

    interno.liberar();
    expect((await primera).status).toBe(201);
    expect(await prisma.usuario.count()).toBe(1);
    expect(await prisma.sesion.count()).toBe(0);
  });

  it('HTTP: el login saturado devuelve 503 sin token ni sesion', async () => {
    const interno = new HashBloqueable();
    interno.liberar(); // el registro no se bloquea
    const normal = crearArnes({ prisma, hash: interno });
    await request(normal.app).post(RUTA_REGISTRO).send({ nombre: 'Uno', correo: 'uno@ejemplo.com', contrasena: CLAVE }).expect(201);

    const bloqueable = new HashBloqueable();
    const arnes = crearArnes({ prisma, hash: new HashConLimiteDeConcurrencia(bloqueable, 1, 0) });
    const enCurso = request(arnes.app).post(RUTA_LOGIN).send({ correo: 'uno@ejemplo.com', contrasena: CLAVE }).then((r) => r);
    await new Promise((r) => setTimeout(r, 300));
    const saturada = await request(arnes.app).post(RUTA_LOGIN).send({ correo: 'uno@ejemplo.com', contrasena: CLAVE });
    expect(saturada.status).toBe(503);
    expect(saturada.body.token).toBeUndefined();
    bloqueable.liberar();
    expect((await enCurso).status).toBe(200);
    expect(await prisma.sesion.count()).toBe(1); // solo la de la solicitud que si se proceso
  });
});
