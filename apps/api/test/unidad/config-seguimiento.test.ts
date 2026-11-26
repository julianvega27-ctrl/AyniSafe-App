import { describe, expect, it } from '@jest/globals';
import { cargarSecretoSeguimiento } from '../../src/config/entorno';

describe('TRACKING_CODE_HMAC_SECRET', () => {
  it('acepta un secreto de al menos 32 caracteres', () => {
    expect(cargarSecretoSeguimiento({ TRACKING_CODE_HMAC_SECRET: 'k'.repeat(32) })).toBe('k'.repeat(32));
  });

  it('falla si falta, sin imprimir valores', () => {
    expect(() => cargarSecretoSeguimiento({})).toThrow(/falta TRACKING_CODE_HMAC_SECRET/);
  });

  it('falla si es corto y el mensaje no contiene el valor', () => {
    const corto = 'valor-corto-secreto';
    let mensaje = '';
    try {
      cargarSecretoSeguimiento({ TRACKING_CODE_HMAC_SECRET: corto });
    } catch (e) {
      mensaje = e instanceof Error ? e.message : '';
    }
    expect(mensaje).toMatch(/al menos 32/);
    expect(mensaje).not.toContain(corto);
  });
});
