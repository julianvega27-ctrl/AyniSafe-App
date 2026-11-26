import { randomBytes } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { aCrockford, ALFABETO_CROCKFORD, normalizarCrockford } from '../../src/compartido/crockford';
import {
  FORMATO_REFERENCIA,
  normalizarReferencia,
  referenciaDesdeBytes,
} from '../../src/modules/operaciones/dominio/incidente';

describe('Crockford base32', () => {
  it('usa 32 simbolos sin I, L, O ni U', () => {
    expect(ALFABETO_CROCKFORD).toHaveLength(32);
    expect(ALFABETO_CROCKFORD).not.toMatch(/[ILOU]/);
  });

  it('codifica bits conocidos', () => {
    expect(aCrockford(Uint8Array.from([0, 0, 0, 0, 0]), 8)).toBe('00000000');
    expect(aCrockford(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff]), 8)).toBe('ZZZZZZZZ');
    // 0b00001 00010 00011 ... -> 1, 2, 3
    expect(aCrockford(Uint8Array.from([0b00001000, 0b10000110, 0, 0, 0]), 3)).toBe('123');
  });

  it('exige bytes suficientes', () => {
    expect(() => aCrockford(new Uint8Array(1), 2)).toThrow(RangeError);
  });

  it('normaliza la escritura humana y rechaza simbolos ajenos', () => {
    expect(normalizarCrockford('ab-cd o1 il')).toBe('ABCD0111');
    expect(normalizarCrockford('UUU')).toBeNull();
    expect(normalizarCrockford('a*b')).toBeNull();
  });
});

describe('referencia publica', () => {
  it('tiene el formato INC-XXXXX-XXXXX', () => {
    for (let i = 0; i < 200; i++) expect(referenciaDesdeBytes(randomBytes(7))).toMatch(FORMATO_REFERENCIA);
  });

  it('no es secuencial: referencias consecutivas no comparten prefijo ordenado', () => {
    const refs = Array.from({ length: 1000 }, () => referenciaDesdeBytes(randomBytes(7)));
    expect(new Set(refs).size).toBe(1000);
    const ordenadas = [...refs].sort();
    expect(refs).not.toEqual(ordenadas);
  });

  it('normaliza referencias escritas por una persona', () => {
    expect(normalizarReferencia('inc-7k3m9-q2txa')).toBe('INC-7K3M9-Q2TXA');
    expect(normalizarReferencia(' INC 7K3M9Q2TXA ')).toBe('INC-7K3M9-Q2TXA');
    expect(normalizarReferencia('7K3M9-Q2TXO')).toBe('INC-7K3M9-Q2TX0');
    expect(normalizarReferencia('INC-7K3M9')).toBeNull();
    expect(normalizarReferencia('INC-7K3M9-Q2TXU')).toBeNull();
    expect(normalizarReferencia(42)).toBeNull();
    expect(normalizarReferencia('x'.repeat(41))).toBeNull();
  });
});
