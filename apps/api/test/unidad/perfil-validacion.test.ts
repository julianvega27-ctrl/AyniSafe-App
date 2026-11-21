import { describe, expect, it } from 'vitest';
import { normalizarTelefono, validarCambiosPerfil } from '../../src/modules/identidad/dominio/validacion';

describe('normalizarTelefono', () => {
  it('acepta 7, 9 y 15 digitos y rechaza 6 y 16', () => {
    expect(normalizarTelefono('1234567')).toBe('1234567');
    expect(normalizarTelefono('987654321')).toBe('987654321');
    expect(normalizarTelefono('123456789012345')).toBe('123456789012345');
    expect(normalizarTelefono('123456')).toBeUndefined();
    expect(normalizarTelefono('1234567890123456')).toBeUndefined();
  });
  it('quita separadores y conserva el + inicial', () => {
    expect(normalizarTelefono('+51 987-654-321')).toBe('+51987654321');
    expect(normalizarTelefono('(064) 123 456')).toBe('064123456');
    expect(normalizarTelefono('987.654.321')).toBe('987654321');
  });
  it('rechaza letras, + intermedio, + solo y tipos no texto', () => {
    for (const malo of ['98765432a', '987+654321', '+', '()', 123456789, true, {}, []]) {
      expect(normalizarTelefono(malo)).toBeUndefined();
    }
  });
  it('null y texto vacio borran el telefono', () => {
    expect(normalizarTelefono(null)).toBeNull();
    expect(normalizarTelefono('')).toBeNull();
    expect(normalizarTelefono('   ')).toBeNull();
  });
});

describe('validarCambiosPerfil', () => {
  it('aplica solo los campos enviados', () => {
    expect(validarCambiosPerfil({ nombre: '  Rosa  ' })).toEqual({ ok: true, valor: { nombre: 'Rosa' } });
    expect(validarCambiosPerfil({ telefono: null, compartirTelefono: false })).toEqual({
      ok: true,
      valor: { telefono: null, compartirTelefono: false },
    });
  });
  it('rechaza nombre vacio y de 101 puntos de codigo, y admite 100', () => {
    expect(validarCambiosPerfil({ nombre: '   ' })).toMatchObject({ ok: false, campos: { nombre: expect.any(String) } });
    expect(validarCambiosPerfil({ nombre: 'a'.repeat(101) })).toMatchObject({ ok: false });
    expect(validarCambiosPerfil({ nombre: '😀'.repeat(100) }).ok).toBe(true);
  });
  it('rechaza campos no admitidos: correo, id, rol, estado, dni', () => {
    for (const extra of ['correo', 'id', 'rol', 'estado', 'dni', 'contrasena']) {
      const r = validarCambiosPerfil({ nombre: 'Rosa', [extra]: 'x' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.campos.cuerpo).toBeDefined();
    }
  });
  it('rechaza cuerpo vacio o que no es objeto', () => {
    for (const malo of [{}, null, [], 'texto', 7, undefined]) {
      expect(validarCambiosPerfil(malo).ok).toBe(false);
    }
  });
  it('rechaza telefono invalido y compartirTelefono no booleano con error por campo', () => {
    expect(validarCambiosPerfil({ telefono: '123' })).toMatchObject({ ok: false, campos: { telefono: expect.any(String) } });
    expect(validarCambiosPerfil({ compartirTelefono: 'si' })).toMatchObject({
      ok: false,
      campos: { compartirTelefono: expect.any(String) },
    });
  });
});
