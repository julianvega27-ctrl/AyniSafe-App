import { afterAll, describe, expect, it } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const { verificar } = require('../../scripts/verificar-arquitectura.cjs') as {
  verificar(root: string): { archivos: number; infracciones: { regla: string; file: string }[]; limites: unknown[] };
};
const roots: string[] = [];
function fixture(files: Record<string, string>, options: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ayni-arquitectura-'));
  roots.push(root);
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'Node16', moduleResolution: 'Node16', ...options }, include: ['src/**/*'] }));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}
afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('limites arquitectonicos', () => {
  it('permite aplicacion, dominio y puertos sin requerir capas vacias', () => {
    const root = fixture({
      'src/modules/uno/dominio/modelo.ts': 'export interface Modelo { id: string }',
      'src/modules/uno/aplicacion/caso.ts': "import type { Modelo } from '../dominio/modelo'; export type Caso = Modelo;",
    });
    expect(verificar(root).infracciones).toEqual([]);
  });

  it.each([
    ["import type { Repo } from '../infraestructura/repo';", 'import de tipos'],
    ["export { Repo } from '../infraestructura/repo';", 'reexport'],
    ["const x = require('../infraestructura/repo');", 'require'],
    ["const x = import('../infraestructura/repo');", 'import dinamico'],
    ["type X = import('../infraestructura/repo').Repo;", 'import type node'],
  ])('rechaza dependencias externas incluso %s (%s)', (code) => {
    const root = fixture({
      'src/modules/uno/dominio/modelo.ts': code,
      'src/modules/uno/infraestructura/repo.ts': 'export class Repo {}',
    });
    expect(verificar(root).infracciones.some((i) => i.regla === 'dependencia-hacia-capa-externa')).toBe(true);
  });

  it('rechaza dominio hacia aplicacion', () => {
    const root = fixture({
      'src/modules/uno/dominio/x.ts': "import '../aplicacion/y';",
      'src/modules/uno/aplicacion/y.ts': 'export const y = 1;',
    });
    expect(verificar(root).infracciones.some((i) => i.regla === 'dominio-depende-de-aplicacion')).toBe(true);
  });

  it.each(['express', '@prisma/client', 'pg', 'firebase-admin', 'node:fs'])('rechaza tecnologia %s en aplicacion', (name) => {
    const root = fixture({ 'src/modules/uno/aplicacion/x.ts': `import '${name}';` });
    expect(verificar(root).infracciones.some((i) => i.regla === 'tecnologia-en-capa-interna')).toBe(true);
  });

  it('no permite ocultar infraestructura tras un alias y utilidades compartidas', () => {
    const root = fixture({
      'src/modules/uno/aplicacion/x.ts': "import '@compartido/puente';",
      'src/compartido/puente.ts': "export * from '../modules/uno/infraestructura/repo';",
      'src/modules/uno/infraestructura/repo.ts': 'export const repo = 1;',
    }, { baseUrl: '.', paths: { '@compartido/*': ['src/compartido/*'] } });
    expect(verificar(root).infracciones.some((i) => i.regla === 'dependencia-hacia-capa-externa')).toBe(true);
  });

  it('rechaza cliente generado aunque el destino no se recorra', () => {
    const root = fixture({
      'src/modules/uno/dominio/x.ts': "import '../../../generated/client';",
      'src/generated/client.ts': 'export const client = 1;',
    });
    expect(verificar(root).infracciones.some((i) => i.regla === 'cliente-generado-en-capa-interna')).toBe(true);
  });

  it('rechaza internos ajenos y admite fachada publica pura', () => {
    const root = fixture({
      'src/modules/uno/presentacion/x.ts': "import '../../dos/infraestructura/repo';",
      'src/modules/dos/infraestructura/repo.ts': 'export const repo = 1;',
    });
    expect(verificar(root).infracciones.some((i) => i.regla === 'internos-de-otro-modulo')).toBe(true);
    const valid = fixture({
      'src/modules/uno/aplicacion/x.ts': "import type { Contrato } from '../../dos';",
      'src/modules/dos/index.ts': 'export interface Contrato { id: string }',
    });
    expect(verificar(valid).infracciones).toEqual([]);
  });

  it('permite composicion declarada sin eximir a las capas internas', () => {
    const root = fixture({
      'src/modules/uno/uno.module.ts': "import './infraestructura/repo'; import 'express';",
      'src/modules/uno/infraestructura/repo.ts': 'export const repo = 1;',
      'src/modules/uno/dominio/modelo.ts': '// import express from "express";\nexport const x = 1;',
    });
    expect(verificar(root).infracciones).toEqual([]);
  });

  it('identifica destinos computados como limite de revision manual', () => {
    const root = fixture({ 'src/modules/uno/dominio/x.ts': 'const nombre = "x"; const x = import(nombre);' });
    expect(verificar(root).limites).toHaveLength(1);
  });

  it('la CLI falla ante infraccion y pasa ante un ejemplo valido', () => {
    const bad = fixture({ 'src/modules/uno/dominio/x.ts': "import 'pg';" });
    const good = fixture({ 'src/modules/uno/dominio/x.ts': 'export const x = 1;' });
    const script = resolve(__dirname, '../../scripts/verificar-arquitectura.cjs');
    const invalid = spawnSync(process.execPath, [script, '--raiz', bad], { encoding: 'utf8' });
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('tecnologia-en-capa-interna');
    expect(spawnSync(process.execPath, [script, '--raiz', good], { encoding: 'utf8' }).status).toBe(0);
  });
});
