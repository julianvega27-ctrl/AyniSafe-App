import { describe, expect, it } from 'vitest';
import { cargarEntorno, cargarOrigenesWeb } from '../../src/config/entorno';

const BASE = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5433/x',
  RATE_LIMIT_HMAC_SECRET: 'x'.repeat(40),
  API_PUBLIC_URL: 'https://api.ayinisafe.test',
};
const PROD = {
  ...BASE,
  NODE_ENV: 'production',
  EMAIL_ADAPTER: 'smtp',
  SMTP_USUARIO: 'cuenta@gmail.com',
  SMTP_CLAVE: 'clave',
};

describe('origen web (WEB_ORIGIN / WEB_PUBLIC_URL)', () => {
  it('acepta un origen https valido en produccion y normaliza la barra final', () => {
    const r = cargarOrigenesWeb({ WEB_ORIGIN: 'https://web.test/', WEB_PUBLIC_URL: 'https://web.test' }, 'production');
    expect(r).toEqual({ origenWeb: 'https://web.test', urlPublicaWeb: 'https://web.test' });
  });

  it('en desarrollo usa un valor local y WEB_PUBLIC_URL hereda WEB_ORIGIN', () => {
    expect(cargarOrigenesWeb({}, 'development')).toEqual({
      origenWeb: 'http://localhost:5173',
      urlPublicaWeb: 'http://localhost:5173',
    });
    expect(cargarOrigenesWeb({ WEB_ORIGIN: 'http://localhost:4000' }, 'development').urlPublicaWeb).toBe('http://localhost:4000');
  });

  it.each([
    ['con ruta', 'https://web.test/panel'],
    ['con credenciales', 'https://u:p@web.test'],
    ['con parametros', 'https://web.test/?a=1'],
    ['con fragmento', 'https://web.test/#x'],
    ['sin esquema valido', 'web.test'],
    ['con otro esquema', 'ftp://web.test'],
  ])('rechaza un origen %s', (_n, valor) => {
    expect(() => cargarOrigenesWeb({ WEB_ORIGIN: valor, WEB_PUBLIC_URL: valor }, 'production')).toThrow(/WEB_ORIGIN/);
  });

  it('en produccion exige https', () => {
    expect(() => cargarOrigenesWeb({ WEB_ORIGIN: 'http://web.test', WEB_PUBLIC_URL: 'http://web.test' }, 'production')).toThrow(/https/);
  });

  it('en produccion exige ambas variables y que coincidan', () => {
    expect(() => cargarOrigenesWeb({}, 'production')).toThrow(/WEB_ORIGIN/);
    expect(() => cargarOrigenesWeb({ WEB_ORIGIN: 'https://web.test' }, 'production')).toThrow(/WEB_PUBLIC_URL/);
    expect(() =>
      cargarOrigenesWeb({ WEB_ORIGIN: 'https://a.test', WEB_PUBLIC_URL: 'https://b.test' }, 'production'),
    ).toThrow(/mismo origen/);
  });

  it('los mensajes de error no incluyen el valor configurado', () => {
    const secreto = 'https://usuario:clave-identificable-77@web.test';
    try {
      cargarOrigenesWeb({ WEB_ORIGIN: secreto, WEB_PUBLIC_URL: secreto }, 'production');
      expect.unreachable();
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('clave-identificable-77');
    }
  });

  it('cargarEntorno expone los origenes y los limites institucionales', () => {
    const e = cargarEntorno({ ...PROD, WEB_ORIGIN: 'https://web.test', WEB_PUBLIC_URL: 'https://web.test' });
    expect(e.origenWeb).toBe('https://web.test');
    expect(e.politicaLimites.loginInstPorCorreoIp).toBe(5);
    const personalizado = cargarEntorno({
      ...BASE,
      RL_LOGIN_INST_IP_MAX: '7',
      RL_LOGIN_INST_CORREO_IP_MAX: '2',
    });
    expect(personalizado.politicaLimites.loginInstPorIp).toBe(7);
    expect(personalizado.politicaLimites.loginInstPorCorreoIp).toBe(2);
    expect(() => cargarEntorno({ ...BASE, RL_LOGIN_INST_IP_MAX: '0' })).toThrow(/RL_LOGIN_INST_IP_MAX/);
  });
});
