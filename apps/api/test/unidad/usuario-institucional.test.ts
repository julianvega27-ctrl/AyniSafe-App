import { describe, expect, it } from '@jest/globals';
import {
  aUsuarioInstitucional,
  esCiudadanoActivo,
  esInstitucionalActivo,
  ROLES_INSTITUCIONALES,
  type Usuario,
} from '../../src/modules/identidad/dominio/usuario';
import { seccionesDelPanel } from '../../src/modules/identidad/dominio/paneles';
import { configurarCookie, cookieBorrada, cookieDeSesion, leerCookie } from '../../src/modules/identidad/presentacion/cookies';

const base: Usuario = {
  id: '5482bbd9-ef53-4049-a095-19a9d0144eeb',
  nombre: 'Ana',
  correoNormalizado: 'ana@ejemplo.com',
  passwordHash: 'hash',
  rol: 'administrador',
  estado: 'activo',
  createdAt: new Date('2026-11-21T00:00:00Z'),
};

describe('dominio institucional', () => {
  it('solo administrador y operador activos son institucionales; ciudadano nunca', () => {
    expect(esInstitucionalActivo(base)).toBe(true);
    expect(esInstitucionalActivo({ ...base, rol: 'operador' })).toBe(true);
    expect(esInstitucionalActivo({ ...base, rol: 'ciudadano' })).toBe(false);
    expect(esInstitucionalActivo({ ...base, estado: 'suspendido' })).toBe(false);
    expect(esInstitucionalActivo({ ...base, estado: 'pendiente_activacion', passwordHash: null })).toBe(false);
  });

  it('los conjuntos son disjuntos: un institucional no es ciudadano activo', () => {
    expect(esCiudadanoActivo(base)).toBe(false);
    expect(ROLES_INSTITUCIONALES).toEqual(['administrador', 'operador']);
  });

  it('la proyeccion no incluye hash ni estado', () => {
    expect(aUsuarioInstitucional(base)).toEqual({ id: base.id, nombre: 'Ana', correo: 'ana@ejemplo.com', rol: 'administrador' });
  });

  it('las secciones de cada panel siguen la guia y solo las de organizacion estan disponibles', () => {
    expect(seccionesDelPanel('operador').map((s) => s.titulo)).toEqual(['Inicio', 'Incidentes', 'Mapa', 'Indicadores', 'Historial']);
    expect(seccionesDelPanel('administrador').map((s) => s.titulo)).toEqual([
      'Inicio',
      'Instituciones y sedes',
      'Operadores',
      'Coberturas',
      'Categorías',
      'Reglas',
      'Contenido y contactos',
      'Historial',
    ]);
    // P3.2: solo las secciones de organizacion del administrador estan construidas.
    expect(seccionesDelPanel('operador').every((s) => !s.disponible)).toBe(true);
    expect(seccionesDelPanel('administrador').filter((s) => s.disponible).map((s) => s.id)).toEqual([
      'instituciones-sedes',
      'operadores',
      'coberturas',
    ]);
  });
});

describe('cookie de sesion', () => {
  it('con https usa __Host- y Secure; con http local, nombre simple y sin Secure', () => {
    expect(configurarCookie('https://web.test')).toEqual({ nombre: '__Host-ayni_inst', segura: true });
    expect(configurarCookie('http://localhost:5173')).toEqual({ nombre: 'ayni_inst', segura: false });
    const local = cookieDeSesion(configurarCookie('http://localhost:5173'), 'abc', 10);
    expect(local).not.toContain('Secure');
    expect(local).toContain('HttpOnly');
    expect(local).toContain('SameSite=Strict');
    expect(local).not.toMatch(/domain/i);
  });

  it('Max-Age no es negativo ni fraccionario y el borrado lo pone en cero', () => {
    const c = configurarCookie('https://web.test');
    expect(cookieDeSesion(c, 'abc', -5)).toContain('Max-Age=0');
    expect(cookieDeSesion(c, 'abc', 100.9)).toContain('Max-Age=100');
    expect(cookieBorrada(c)).toContain('Max-Age=0');
  });

  it('lee el valor exacto, ignora otros nombres y rechaza duplicados o valores raros', () => {
    expect(leerCookie('a=1; __Host-ayni_inst=abcDEF_-123; b=2', '__Host-ayni_inst')).toBe('abcDEF_-123');
    expect(leerCookie('x__Host-ayni_inst=abc', '__Host-ayni_inst')).toBeUndefined();
    expect(leerCookie('__Host-ayni_inst=a; __Host-ayni_inst=b', '__Host-ayni_inst')).toBeUndefined();
    expect(leerCookie('__Host-ayni_inst=a b', '__Host-ayni_inst')).toBeUndefined();
    expect(leerCookie(undefined, '__Host-ayni_inst')).toBeUndefined();
    expect(leerCookie(`__Host-ayni_inst=${'a'.repeat(600)}`, '__Host-ayni_inst')).toBeUndefined();
  });
});
