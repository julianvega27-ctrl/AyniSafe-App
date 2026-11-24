import { describe, expect, it } from '@jest/globals';
import {
  Argon2idHashAdapter,
  PARAMETROS_ARGON2ID,
} from '../../src/modules/identidad/infraestructura/argon2id-hash.adapter';

const adapter = new Argon2idHashAdapter();

describe('Argon2idHashAdapter', () => {
  it('codifica Argon2id con los parametros minimos del diseno', async () => {
    expect(PARAMETROS_ARGON2ID).toMatchObject({ memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const h = await adapter.hash('una contrasena de prueba');
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('verifica la contrasena exacta', async () => {
    const clave = ' con espacios en extremos y acentos: contrase\u00f1a ';
    const h = await adapter.hash(clave);
    expect(await adapter.verificar(h, clave)).toBe(true);
  });

  it('cambiar, agregar o quitar un espacio, o variar mayusculas, no autentica', async () => {
    const clave = ' clave con espacios ';
    const h = await adapter.hash(clave);
    for (const variante of [
      clave.trim(),
      clave + ' ',
      ' ' + clave,
      clave.replace('clave con', 'clave  con'),
      clave.toUpperCase(),
      '',
    ]) {
      expect(await adapter.verificar(h, variante)).toBe(false);
    }
  });

  it('no normaliza Unicode: forma compuesta y descompuesta son secretos distintos', async () => {
    const compuesta = '\u00e9'.repeat(15);
    const descompuesta = 'e\u0301'.repeat(15);
    const h = await adapter.hash(compuesta);
    expect(await adapter.verificar(h, compuesta)).toBe(true);
    expect(await adapter.verificar(h, descompuesta)).toBe(false);
  });

  it('soporta 128 puntos de codigo fuera del plano basico sin truncar', async () => {
    const larga = '\u{1F600}'.repeat(128);
    const h = await adapter.hash(larga);
    expect(await adapter.verificar(h, larga)).toBe(true);
    expect(await adapter.verificar(h, '\u{1F600}'.repeat(127))).toBe(false);
    // Los bytes 129 en adelante importan: no hay truncamiento (bcrypt truncaria a 72 bytes).
    const casi = '\u{1F600}'.repeat(127) + '\u{1F601}';
    expect(await adapter.verificar(h, casi)).toBe(false);
  });

  it('el mismo secreto produce hashes distintos (sal individual) que verifican ambos', async () => {
    const clave = 'misma clave para dos cuentas';
    const [a, b] = await Promise.all([adapter.hash(clave), adapter.hash(clave)]);
    expect(a).not.toBe(b);
    expect(await adapter.verificar(a, clave)).toBe(true);
    expect(await adapter.verificar(b, clave)).toBe(true);
  });

  it('el hash no contiene el texto plano', async () => {
    const clave = 'secreto-identificable-12345';
    const h = await adapter.hash(clave);
    expect(h).not.toContain(clave);
    expect(h).not.toContain(Buffer.from(clave).toString('base64').replace(/=+$/, ''));
  });

  it('un hash ilegible cuenta como no coincidente en lugar de lanzar', async () => {
    expect(await adapter.verificar('no-es-un-hash', 'cualquier cosa larga')).toBe(false);
  });

  it('la verificacion ficticia devuelve false y cuesta tiempo comparable a una real', async () => {
    const clave = 'una clave cualquiera larga';
    const h = await adapter.hash(clave);
    await adapter.verificarFicticio(clave); // calienta el hash ficticio
    const medir = async (f: () => Promise<unknown>): Promise<number> => {
      const t0 = performance.now();
      for (let i = 0; i < 3; i += 1) await f();
      return (performance.now() - t0) / 3;
    };
    const real = await medir(() => adapter.verificar(h, 'otra clave incorrecta!!'));
    const ficticio = await medir(() => adapter.verificarFicticio('otra clave incorrecta!!'));
    expect(await adapter.verificarFicticio(clave)).toBe(false);
    // Mismo orden de magnitud (tolerancia amplia para evitar fragilidad por ruido de CPU).
    expect(ficticio).toBeGreaterThan(real / 3);
    expect(ficticio).toBeLessThan(real * 3);
  });
});
