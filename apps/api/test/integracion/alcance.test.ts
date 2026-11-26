import type { Router } from 'express';
import { afterAll, describe, expect, it } from '@jest/globals';
import { crearModuloConsultas } from '../../src/modules/consultas';
import { crearArnes } from './arnes';

/**
 * Revision de alcance: ninguna ruta crea administradores; los operadores y sedes solo se crean por
 * la organizacion institucional (P3.2) y no existe verificacion de correo.
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
    const ORG = '/administrador/organizacion';
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
        // Organizacion institucional (P3.2): todas exigen sesion de administrador.
        `GET ${ORG}/instituciones`, `_ALL ${ORG}/instituciones`,
        `PATCH ${ORG}/instituciones/:id`, `_ALL ${ORG}/instituciones/:id`,
        `GET ${ORG}/sedes`, `POST ${ORG}/sedes`, `_ALL ${ORG}/sedes`,
        `PATCH ${ORG}/sedes/:id`, `_ALL ${ORG}/sedes/:id`,
        `PUT ${ORG}/sedes/:id/cobertura`, `_ALL ${ORG}/sedes/:id/cobertura`,
        `PUT ${ORG}/sedes/:id/competencias`, `_ALL ${ORG}/sedes/:id/competencias`,
        `POST ${ORG}/sedes/:id/habilitacion`, `DELETE ${ORG}/sedes/:id/habilitacion`, `_ALL ${ORG}/sedes/:id/habilitacion`,
        `GET ${ORG}/sedes/:id/operadores`, `POST ${ORG}/sedes/:id/operadores`, `_ALL ${ORG}/sedes/:id/operadores`,
        `PATCH ${ORG}/operadores/:id`, `_ALL ${ORG}/operadores/:id`,
        `POST ${ORG}/operadores/:id/invitacion`, `_ALL ${ORG}/operadores/:id/invitacion`,
        'GET /operador/ambito', '_ALL /operador/ambito',
      ].sort(),
    );
    for (const ruta of rutasDe(modulo.router)) {
      // Ninguna ruta crea administradores.
      expect(ruta).not.toMatch(/administradores/i);
      // Las unicas escrituras sobre sedes y operadores son las de organizacion (sesion de administrador,
      // comprobada por HTTP en organizacion.test.ts y contrato.test.ts).
      if (!/^(GET|_ALL) /.test(ruta) && /operador|sede|invit/i.test(ruta)) {
        expect(ruta.split(' ')[1]!.startsWith(`${ORG}/`)).toBe(true);
      }
      // Fuera de organizacion, las rutas de operador/administrador siguen siendo de solo lectura.
      if (/operador|administrador/i.test(ruta) && !ruta.split(' ')[1]!.startsWith(`${ORG}/`)) {
        expect(ruta).toMatch(/^(GET|_ALL) \/(operador\/(panel|ambito)|administrador\/panel)$/);
      }
    }
    // El registro publico y la recuperacion no crean ni modifican cuentas privilegiadas.
    for (const ruta of rutasDe(modulo.router)) {
      if (ruta.includes('/auth/')) expect(ruta).not.toMatch(/operador|administrador|roles|usuarios/i);
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
    // La verificacion documental de sedes (P3.2) no es verificacion de correo: se revisa la tabla de cuentas.
    expect(columnas.filter((c) => c.table_name === 'usuarios' && /verif|confirm/i.test(c.column_name))).toEqual([]);
    expect(columnas.filter((c) => /correo.*verif|verif.*correo|email/i.test(c.column_name))).toEqual([]);
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
