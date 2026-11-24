import { afterAll, describe, expect, it } from '@jest/globals';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const { prepararEntorno, validarUrlPruebas } = require('../../scripts/modo-pruebas.cjs') as {
  prepararEntorno(mode: string, env: NodeJS.ProcessEnv, root: string): NodeJS.ProcessEnv;
  validarUrlPruebas(value?: string): string;
};
const roots: string[] = [];
function fixture(local = '', withinApi = false) {
  const root = mkdtempSync(join(withinApi ? resolve(__dirname) : tmpdir(), '.ayni-pruebas-'));
  roots.push(root);
  if (local) writeFileSync(join(root, '.env'), local);
  return root;
}
afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('modos de pruebas e integracion aislada', () => {
  it('unidad no lee la URL insegura de .env ni configura preparacion de BD', () => {
    const root = fixture('TEST_DATABASE_URL=valor-inseguro');
    expect(prepararEntorno('unidad', {}, root)).toEqual({ AYNI_TEST_MODE: 'unidad' });
    const result = spawnSync(process.execPath, ['-e', "console.log(require('./jest.config.cjs').globalSetup)"], {
      cwd: resolve(__dirname, '../..'), env: { ...process.env, AYNI_TEST_MODE: 'unidad' }, encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('undefined');
  });

  it.each([undefined, '', 'invalida', 'postgresql://u:p@localhost/desarrollo', 'https://localhost/datos_test'])('rechaza URL ausente/insegura %s sin imprimirla', (value) => {
    expect(() => validarUrlPruebas(value)).toThrow('TEST_DATABASE_URL');
    if (value && value !== '') {
      try { validarUrlPruebas(value); } catch (error) { expect(String(error)).not.toContain(value); }
    }
  });

  it('no usa DATABASE_URL como respaldo y respeta una URL de pruebas explicita', () => {
    const root = fixture();
    expect(() => prepararEntorno('integracion', { DATABASE_URL: 'postgresql://u:p@localhost/desarrollo' }, root)).toThrow();
    const url = 'postgresql://u:p@localhost/aislada_test';
    expect(prepararEntorno('integracion', { TEST_DATABASE_URL: url, DATABASE_URL: 'otra' }, root).DATABASE_URL).toBe(url);
  });

  it('una variable vacia explicita no se sustituye por la del archivo', () => {
    const root = fixture('TEST_DATABASE_URL=postgresql://u:p@localhost/aislada_test');
    expect(() => prepararEntorno('cobertura', { TEST_DATABASE_URL: '' }, root)).toThrow();
  });

  it('el lanzador devuelve fallo si no encuentra pruebas', () => {
    const script = resolve(__dirname, '../../scripts/ejecutar-pruebas.cjs');
    const result = spawnSync(process.execPath, [script, 'unidad', '--testPathPatterns', 'no-existe-p1'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/No tests found/);
  });

  it('una seleccion que omite todos los casos tampoco acredita exito', () => {
    const script = resolve(__dirname, '../../scripts/ejecutar-pruebas.cjs');
    const result = spawnSync(process.execPath, [script, 'unidad', '--runTestsByPath', 'test/unidad/validacion.test.ts', '--testNamePattern', 'ningun-caso-p1-coincide'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('skipped');
  });

  it('un fallo de asercion llega a la salida del lanzador', () => {
    const root = fixture('', true);
    writeFileSync(join(root, 'control.test.cjs'), "test('fallo-control-p1', () => expect(1).toBe(2));");
    const script = resolve(__dirname, '../../scripts/ejecutar-pruebas.cjs');
    const result = spawnSync(process.execPath, [script, 'unidad', '--rootDir', root, '--testMatch', '**/*.test.cjs'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('fallo-control-p1');
  });

  it('cobertura mantiene en cero un fuente propio que no se importa', () => {
    const root = fixture('', true);
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/no-ejercitado.cjs'), 'module.exports = () => 42;');
    writeFileSync(join(root, 'control.test.cjs'), "test('control-cobertura-p1', () => expect(true).toBe(true));");
    const script = resolve(__dirname, '../../scripts/ejecutar-pruebas.cjs');
    const result = spawnSync(process.execPath, [script, 'unidad', '--rootDir', root, '--testMatch', '**/*.test.cjs', '--coverage', '--collectCoverageFrom', 'src/**/*.cjs', '--coverageDirectory', join(root, 'coverage')], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const summary = JSON.parse(readFileSync(join(root, 'coverage/coverage-summary.json'), 'utf8')) as Record<string, { lines: { pct: number } }>;
    const key = Object.keys(summary).find((name) => name.endsWith('no-ejercitado.cjs'));
    expect(key).toBeDefined();
    expect(summary[key!]?.lines.pct).toBe(0);
  });
});
