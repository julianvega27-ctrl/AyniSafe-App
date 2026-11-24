import type { Router } from 'express';
import { afterAll, describe, expect, it } from '@jest/globals';
import { crearModuloConsultas } from '../../src/modules/consultas';
import { crearArnes } from './arnes';

/**
 * Revision de alcance de la entrega `correo-recuperacion-activacion`: ninguna ruta crea
 * operadores, administradores ni sedes, y no existe verificacion de correo.
 */
const { prisma, modulo } = crearArnes();
const consultas = crearModuloConsultas();

afterAll(async () => {
  await modulo.gestorEnvios.detener();
  await prisma.$disconnect();
});

interface CapaRuta {
  route?: { path: string; methods: Record<string, boolean> };
}

function rutasDe(router: Router): string[] {
  const capas = (router as unknown as { stack: CapaRuta[] }).stack;
  return capas
    .filter((c) => c.route !== undefined)
    .flatMap((c) =>
      Object.keys(c.route!.methods)
        .filter((m) => c.route!.methods[m])
        .map((m) => `${m.toUpperCase()} ${c.route!.path}`),
    )
    .sort();
}

describe('11.4 alcance de la entrega', () => {
  it('las rutas de /api/v1 son exactamente las del contrato y ninguna crea cuentas privilegiadas', () => {
    expect(rutasDe(modulo.router)).toEqual(
      [
        'POST /auth/ciudadanos/registro',
        'POST /auth/ciudadanos/sesiones',
        'GET /auth/sesion',
        'DELETE /auth/sesion',
        'POST /auth/recuperaciones',
        'POST /auth/tokens/consulta',
        'POST /auth/contrasena/restablecer',
        'POST /auth/activaciones',
        'GET /perfil',
        'PATCH /perfil',
        'POST /auth/institucional/sesiones',
        'GET /auth/institucional/sesion',
        'DELETE /auth/institucional/sesion',
        'GET /administrador/panel',
        'GET /operador/panel',
      ].sort(),
    );
    // Ninguna ruta crea, invita ni modifica cuentas privilegiadas: los paneles son solo lectura.
    for (const ruta of rutasDe(modulo.router)) {
      expect(ruta).not.toMatch(/sede|invit|verific|correo|alta|crear/i);
      if (/operador|administrador/i.test(ruta)) expect(ruta).toMatch(/^GET \/(operador|administrador)\/panel$/);
    }
    // Y no hay ninguna ruta de escritura sobre operadores, administradores, cuentas o roles.
    for (const ruta of rutasDe(modulo.router)) {
      if (!ruta.startsWith('GET ')) expect(ruta).not.toMatch(/operador|administrador|cuentas|roles|usuarios/i);
    }
  });

  it('el modulo Consultas solo publica el contenido, de solo lectura, y ninguna ruta cambia el correo', () => {
    expect(rutasDe(consultas.router)).toEqual(['GET /publico/contenido', '_ALL /publico/contenido'].sort());
    for (const ruta of [...rutasDe(modulo.router), ...rutasDe(consultas.router)]) {
      expect(ruta).not.toMatch(/correo|email|mail/i);
    }
  });

  it('las rutas publicas de la raiz son solo las paginas de respaldo y assetlinks.json', () => {
    expect(rutasDe(modulo.routerPublico)).toEqual(
      ['GET /cuenta/restablecer', 'GET /cuenta/activar', 'GET /.well-known/assetlinks.json'].sort(),
    );
  });

  it('no existe ninguna columna ni estado de verificacion de correo en el esquema', async () => {
    const columnas = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    expect(columnas.filter((c) => /verif|confirm/i.test(c.column_name))).toEqual([]);
    const estados = await prisma.$queryRawUnsafe<{ e: string }[]>(
      `SELECT unnest(enum_range(NULL::"EstadoUsuario"))::text AS e`,
    );
    expect(estados.map((x) => x.e)).toEqual(['activo', 'suspendido', 'pendiente_activacion']);
  });

  it('la capacidad de invitacion no expone ningun metodo que cree cuentas', () => {
    const metodos = Object.getOwnPropertyNames(Object.getPrototypeOf(modulo.invitarCuenta)).filter((m) => m !== 'constructor');
    expect(metodos).toEqual(['ejecutar']);
    expect(modulo.invitarCuenta.ejecutar.length).toBe(2); // (usuarioId, tx): no recibe nombre, correo ni rol
  });
});
