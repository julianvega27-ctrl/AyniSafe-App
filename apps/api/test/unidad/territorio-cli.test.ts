import { it, expect, jest } from '@jest/globals';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ejecutar } from '../../scripts/territorio';
import { paqueteSintetico } from '../fixtures/territorio';

it('CLI simula sin escribir y rechaza importación de un fixture sin constancia', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ayni-territorio-'));
  const archivo = join(dir, 'fixture.json');
  writeFileSync(archivo, paqueteSintetico().bytes);
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    await ejecutar(['validar', archivo]);
    await ejecutar(['importar', archivo, '--dry-run']);
    const resultados = log.mock.calls.map(x => JSON.parse(String(x[0])) as { escrituras: number; contrastado: boolean });
    expect(resultados).toHaveLength(2);
    expect(resultados.every(x => x.escrituras === 0 && !x.contrastado)).toBe(true);
    await expect(ejecutar(['importar', archivo])).rejects.toThrow('sin constancia');
    for (const args of [[], ['otra'], ['validar', '--activar'], ['importar', '--dry-run', '--activar'],
      ['importar', '--forzar'], ['activar'], ['activar', 'no-version'], ['validar', archivo, archivo]]) {
      await expect(ejecutar(args)).rejects.toThrow();
    }
  } finally { log.mockRestore(); unlinkSync(archivo); rmdirSync(dir); }
});
