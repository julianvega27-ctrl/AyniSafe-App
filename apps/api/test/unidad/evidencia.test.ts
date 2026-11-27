import { describe, expect, it } from '@jest/globals';
import {
  BACKOFF_TOPE_MS,
  PLAZO_CARGA_MS,
  PublicIdInvalidoError,
  cabeEnCuota,
  dentroDePlazoCarga,
  esHuerfana,
  esPublicIdValido,
  esTipoMedio,
  esperaReintento,
  exigirPublicId,
  nuevoPublicId,
  puedeTransitar,
  ranuraLibre,
  venceCarga,
  type EstadoEvidencia,
} from '../../src/modules/reportes/dominio/evidencia';

const UUID = '3f2b8c1e-5a4d-4e6f-9b7a-0c1d2e3f4a5b';

describe('public_id aislado bajo aynisafe/', () => {
  it.each([
    [`aynisafe/${UUID}`, true],
    [`incidencias/${UUID}`, false],
    [`otro/aynisafe/${UUID}`, false],
    [`aynisafe/../${UUID}`, false],
    [`aynisafe/${UUID.toUpperCase()}`, false],
    ['aynisafe/3f2b8c1e-5a4d-1e6f-9b7a-0c1d2e3f4a5b', false], // uuid v1
    ['aynisafe/3f2b8c1e-5a4d-4e6f-7b7a-0c1d2e3f4a5b', false], // variante invalida
    [`aynisafe/${UUID}/x`, false],
    [`aynisafe/${UUID}.jpg`, false],
    ['aynisafe/', false],
    ['aynisafe', false],
    [42, false],
    [null, false],
  ])('%p -> %p', (valor, esperado) => {
    expect(esPublicIdValido(valor)).toBe(esperado);
  });

  it('exigirPublicId lanza ante un identificador ajeno', () => {
    expect(() => exigirPublicId(`incidencias/${UUID}`)).toThrow(PublicIdInvalidoError);
    expect(exigirPublicId(`aynisafe/${UUID}`)).toBe(`aynisafe/${UUID}`);
  });

  it('nuevoPublicId normaliza a minusculas y rechaza uuid no v4', () => {
    expect(nuevoPublicId(UUID.toUpperCase())).toBe(`aynisafe/${UUID}`);
    expect(() => nuevoPublicId('no-es-uuid')).toThrow(PublicIdInvalidoError);
  });
});

describe('tipos de medio', () => {
  it.each([
    ['image/jpeg', true],
    ['image/png', true],
    ['image/webp', true],
    ['image/heic', false],
    ['application/pdf', false],
    ['image/gif', false],
    [undefined, false],
  ])('%p -> %p', (v, e) => expect(esTipoMedio(v)).toBe(e));
});

describe('transiciones de estado', () => {
  const estados: EstadoEvidencia[] = ['pendiente', 'disponible', 'eliminacion_pendiente', 'eliminada'];
  const permitidas = new Set([
    'pendiente>disponible',
    'pendiente>eliminacion_pendiente',
    'disponible>eliminacion_pendiente',
    'eliminacion_pendiente>eliminada',
  ]);
  for (const d of estados)
    for (const h of estados)
      it(`${d} -> ${h}`, () => expect(puedeTransitar(d, h)).toBe(permitidas.has(`${d}>${h}`)));
});

describe('plazo de carga', () => {
  const recibido = new Date('2026-11-27T10:00:00.000Z');
  it('24 h exactas siguen dentro', () => {
    expect(dentroDePlazoCarga(recibido, new Date(recibido.getTime() + PLAZO_CARGA_MS))).toBe(true);
  });
  it('1 ms despues queda fuera', () => {
    expect(dentroDePlazoCarga(recibido, new Date(recibido.getTime() + PLAZO_CARGA_MS + 1))).toBe(false);
  });
  it('vencimiento = recepcion + 24 h', () => {
    expect(venceCarga(recibido).toISOString()).toBe('2026-11-28T10:00:00.000Z');
  });
});

describe('ranuras', () => {
  it.each([
    [[], 1],
    [[1], 2],
    [[2], 1],
    [[1, 3], 2],
    [[1, 2], 3],
    [[1, 2, 3], null],
  ])('%p -> %p', (ocupadas, esperada) => expect(ranuraLibre(ocupadas)).toBe(esperada));
});

describe('cuota local', () => {
  const cuota = { maxBytes: 1000, maxObjetos: 3 };
  it('cabe justo en el limite de bytes', () => expect(cabeEnCuota({ bytes: 900, objetos: 0 }, 100, cuota)).toBe(true));
  it('supera bytes por 1', () => expect(cabeEnCuota({ bytes: 900, objetos: 0 }, 101, cuota)).toBe(false));
  it('cabe el ultimo objeto', () => expect(cabeEnCuota({ bytes: 0, objetos: 2 }, 1, cuota)).toBe(true));
  it('supera objetos', () => expect(cabeEnCuota({ bytes: 0, objetos: 3 }, 1, cuota)).toBe(false));
});

describe('backoff de la limpieza', () => {
  it.each([
    [0, 60_000],
    [1, 60_000],
    [2, 120_000],
    [3, 240_000],
    [9, 15_360_000],
    [10, BACKOFF_TOPE_MS],
    [1000, BACKOFF_TOPE_MS],
  ])('intento %p -> %p ms', (n, ms) => expect(esperaReintento(n)).toBe(ms));
});

describe('huerfanas', () => {
  const creada = new Date('2026-11-27T10:00:00.000Z');
  it('15 min exactos aun no', () => expect(esHuerfana(creada, new Date(creada.getTime() + 15 * 60_000))).toBe(false));
  it('pasados 15 min si', () => expect(esHuerfana(creada, new Date(creada.getTime() + 15 * 60_000 + 1))).toBe(true));
});
