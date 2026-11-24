import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  longitudEnPuntosDeCodigo,
  validarLogin,
  validarRegistro,
} from '../../src/modules/identidad/dominio/validacion';

type Valor = string | { repetir: string; veces: number } | Valor[];
interface Vector {
  caso: string;
  valor: Valor;
  valido: boolean;
  normalizado?: string;
}

const vectores = JSON.parse(
  readFileSync(resolve(__dirname, '../../../shared/vectores-validacion.json'), 'utf8'),
) as { nombre: Vector[]; correo: Vector[]; contrasena: Vector[] };

function expandir(v: Valor): string {
  if (Array.isArray(v)) return v.map(expandir).join('');
  return typeof v === 'string' ? v : v.repetir.repeat(v.veces);
}

const NOMBRE_OK = 'Rosa';
const CORREO_OK = 'rosa@ejemplo.com';
const CLAVE_OK = 'una clave bien larga';

describe('vectores compartidos', () => {
  for (const v of vectores.nombre) {
    it(`nombre: ${v.caso}`, () => {
      const r = validarRegistro({ nombre: expandir(v.valor), correo: CORREO_OK, contrasena: CLAVE_OK });
      expect(r.ok).toBe(v.valido);
      if (r.ok && v.normalizado !== undefined) expect(r.valor.nombre).toBe(v.normalizado);
      if (!r.ok) expect(Object.keys(r.campos)).toEqual(['nombre']);
    });
  }
  for (const v of vectores.correo) {
    it(`correo: ${v.caso}`, () => {
      const r = validarRegistro({ nombre: NOMBRE_OK, correo: expandir(v.valor), contrasena: CLAVE_OK });
      expect(r.ok).toBe(v.valido);
      if (r.ok && v.normalizado !== undefined) expect(r.valor.correoNormalizado).toBe(v.normalizado);
      if (!r.ok) expect(Object.keys(r.campos)).toEqual(['correo']);
    });
  }
  for (const v of vectores.contrasena) {
    it(`contrasena: ${v.caso}`, () => {
      const valor = expandir(v.valor);
      const r = validarRegistro({ nombre: NOMBRE_OK, correo: CORREO_OK, contrasena: valor });
      expect(r.ok).toBe(v.valido);
      if (r.ok) expect(r.valor.contrasena).toBe(valor); // exacta: sin recorte ni normalizacion
      if (!r.ok) expect(Object.keys(r.campos)).toEqual(['contrasena']);
      expect(validarLogin({ correo: CORREO_OK, contrasena: valor }).ok).toBe(v.valido);
    });
  }
});

describe('conteo en puntos de codigo', () => {
  it('un caracter fuera del plano basico cuenta como uno', () => {
    expect('\u{1F600}'.length).toBe(2);
    expect(longitudEnPuntosDeCodigo('\u{1F600}')).toBe(1);
  });
});

describe('contrasena exacta', () => {
  it('no normaliza Unicode: forma compuesta y descompuesta se conservan distintas', () => {
    const compuesta = 'é'.repeat(15);
    const descompuesta = 'é'.repeat(15);
    const a = validarLogin({ correo: CORREO_OK, contrasena: compuesta });
    const b = validarLogin({ correo: CORREO_OK, contrasena: descompuesta });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.valor.contrasena).not.toBe(b.valor.contrasena);
  });
});

describe('tipos y campos extra', () => {
  it('rechaza cuerpos que no son objetos', () => {
    for (const e of [null, undefined, 'texto', 5, [], true]) {
      const r = validarRegistro(e);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(Object.keys(r.campos)).toEqual(['cuerpo']);
    }
  });
  it('rechaza campos ausentes con error por campo', () => {
    const r = validarRegistro({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.campos).sort()).toEqual(['contrasena', 'correo', 'nombre']);
  });
  it('rechaza tipos incorrectos', () => {
    const r = validarRegistro({ nombre: 5, correo: ['a@b.co'], contrasena: { x: 1 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.campos).sort()).toEqual(['contrasena', 'correo', 'nombre']);
  });
  it('rechaza rol, institucion u otros campos no admitidos sin reflejar su nombre', () => {
    const r = validarRegistro({
      nombre: NOMBRE_OK,
      correo: CORREO_OK,
      contrasena: CLAVE_OK,
      rol: 'administrador',
      institucionId: 'x',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.campos)).toEqual(['cuerpo']);
      expect(JSON.stringify(r.campos)).not.toContain('administrador');
      expect(JSON.stringify(r.campos)).not.toContain('institucionId');
    }
  });
  it('login tambien rechaza campos extra', () => {
    expect(validarLogin({ correo: CORREO_OK, contrasena: CLAVE_OK, rol: 'operador' }).ok).toBe(false);
  });
  it('los mensajes de error no contienen el valor enviado', () => {
    const secreto = 'secreto-corto';
    const r = validarRegistro({ nombre: NOMBRE_OK, correo: CORREO_OK, contrasena: secreto });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(JSON.stringify(r.campos)).not.toContain(secreto);
  });
});

describe('identidad del correo', () => {
  it('Vecina@Ejemplo.com y vecina@ejemplo.com son la misma clave', () => {
    const a = validarLogin({ correo: ' Vecina@Ejemplo.com ', contrasena: CLAVE_OK });
    const b = validarLogin({ correo: 'vecina@ejemplo.com', contrasena: CLAVE_OK });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.valor.correoNormalizado).toBe(b.valor.correoNormalizado);
  });
  it('puntos y sufijos distintos no se fusionan', () => {
    const claves = ['ana.maria@x.com', 'anamaria@x.com', 'ana+a@x.com', 'ana@x.com'].map((c) => {
      const r = validarLogin({ correo: c, contrasena: CLAVE_OK });
      return r.ok ? r.valor.correoNormalizado : 'invalido';
    });
    expect(new Set(claves).size).toBe(4);
  });
});
