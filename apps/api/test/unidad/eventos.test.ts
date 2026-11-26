import { describe, expect, it } from '@jest/globals';
import { CargaEventoInvalidaError, validarNuevoEvento, type NuevoEvento } from '../../src/compartido/eventos/eventos';

const base: NuevoEvento = {
  tipo: 'IncidenteRegistrado',
  version: 1,
  agregadoId: '0b9c1e4e-2f0a-4c55-9d8e-6f1a2b3c4d5e',
  carga: { incidenteId: '0b9c1e4e-2f0a-4c55-9d8e-6f1a2b3c4d5e', modalidad: 'invitado' },
};

describe('validarNuevoEvento', () => {
  it('acepta identificadores, enumeraciones, enteros, booleanos y nulos', () => {
    expect(() => validarNuevoEvento({ ...base, carga: { a: 'x-1', b: 3, c: true, d: null } })).not.toThrow();
  });

  it.each([
    ['tipo con espacios', { ...base, tipo: 'Incidente registrado' }],
    ['version cero', { ...base, version: 0 }],
    ['agregado no uuid', { ...base, agregadoId: 'abc' }],
    ['carga arreglo', { ...base, carga: [] as unknown as NuevoEvento['carga'] }],
    ['texto libre', { ...base, carga: { descripcion: 'Hay una pelea frente al mercado' } }],
    ['telefono con +', { ...base, carga: { telefono: '+51987654321' } }],
    ['coordenada decimal', { ...base, carga: { latitud: -13.16 } }],
    ['objeto anidado', { ...base, carga: { punto: { x: 1 } } as unknown as NuevoEvento['carga'] }],
    ['clave no camelCase', { ...base, carga: { 'Mi clave': 'x' } }],
  ])('rechaza %s', (_n, evento) => {
    expect(() => validarNuevoEvento(evento as NuevoEvento)).toThrow(CargaEventoInvalidaError);
  });
});
