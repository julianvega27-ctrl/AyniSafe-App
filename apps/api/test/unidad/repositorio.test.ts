import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error modulo ESM sin tipos (script de la raiz del repositorio)
import { escanearRepositorio, escanearTexto, esArchivoDeEntorno } from '../../../../scripts/escanear-secretos.mjs';

const RAIZ = resolve(__dirname, '../../../..');
const SCRIPT = join(RAIZ, 'scripts', 'escanear-secretos.mjs');
const ciCompleto = readFileSync(join(RAIZ, '.github', 'workflows', 'ci.yml'), 'utf8');
// Sin comentarios: las comprobaciones de «no usa X» no deben dispararse por una mencion en un comentario.
const ci = ciCompleto
  .split('\n')
  .map((l) => l.replace(/^\s*#.*$/, '').replace(/\s+#.*$/, ''))
  .join('\n');

// Los valores de prueba se arman en tiempo de ejecucion: el repositorio no versiona ninguna credencial reconocible.
const relleno = (n: number, c = 'a') => c.repeat(n);
const FALSOS = {
  claveGoogle: `GOC${'SPX'}-${relleno(30)}`,
  refreshGoogle: `1/${'/'}${relleno(50)}`,
  awsId: `AK${'IA'}${relleno(16, 'A')}`,
  tokenGithub: `gh${'p'}_${relleno(40)}`,
  claveSlack: `xo${'xb'}-${relleno(20, '1')}`,
  clavePrivada: `-----BEGIN ${'RSA PRIVATE'} KEY-----`,
  conexionRemota: `postgres${'ql'}://admin:${relleno(18, 'q')}@ep-ejemplo.neon.tech/bd`,
};

describe('escaner de secretos', () => {
  it.each(Object.entries(FALSOS))('detecta %s y no devuelve el valor', (_n, valor) => {
    const h = escanearTexto(`config = "${valor}"`);
    expect(h).toHaveLength(1);
    expect(JSON.stringify(h)).not.toContain(valor);
    expect(Object.keys(h[0]).sort()).toEqual(['linea', 'regla']);
    expect(h[0].linea).toBe(1);
  });

  it('no marca marcadores ni hosts locales', () => {
    const limpio = [
      'DATABASE_URL=postgresql://usuario:contrasena@127.0.0.1:5433/ayni_safe_dev',
      'TEST=postgresql://u:p@127.0.0.1:5432/x',
      'URL=postgresql://ayni@127.0.0.1:5432/ayni_safe_test',
      'URL=postgresql://usuario:clave-identificable-91@localhost:1/bd',
      'URL=postgresql://${USUARIO}:${CLAVE}@host-remoto/bd',
      'ejemplo: postgresql://<usuario>:<clave>@host.remoto/bd',
      'GMAIL_CLIENT_SECRET=secreto-del-cliente',
      'GMAIL_REFRESH_TOKEN=lo-guarda-scripts/obtener-refresh-token.mjs',
    ].join('\n');
    expect(escanearTexto(limpio)).toEqual([]);
  });

  it('numera la linea del hallazgo', () => {
    expect(escanearTexto(`uno\ndos\n${FALSOS.tokenGithub}\ncuatro`)).toEqual([{ regla: 'token-github', linea: 3 }]);
  });

  it('un archivo de entorno versionado es un hallazgo; .env.example no', () => {
    expect(esArchivoDeEntorno('apps/api/.env')).toBe(true);
    expect(esArchivoDeEntorno('apps/web/.env.local')).toBe(true);
    expect(esArchivoDeEntorno('apps/api/.env.example')).toBe(false);
    expect(esArchivoDeEntorno('apps/api/src/config/entorno.ts')).toBe(false);
  });

  it('el repositorio versionado no contiene credenciales reconocibles ni archivos .env', () => {
    expect(escanearRepositorio()).toEqual([]);
  });

  describe('CLI sobre un repositorio temporal', () => {
    const carpetas: string[] = [];
    afterAll(() => {
      for (const c of carpetas) rmSync(c, { recursive: true, force: true });
    });
    function repo(archivos: Record<string, string>): string {
      const dir = mkdtempSync(join(tmpdir(), 'ayni-escaner-'));
      carpetas.push(dir);
      execFileSync('git', ['init', '-q'], { cwd: dir });
      for (const [nombre, contenido] of Object.entries(archivos)) {
        writeFileSync(join(dir, nombre), contenido);
        execFileSync('git', ['add', nombre], { cwd: dir });
      }
      return dir;
    }
    const correr = (cwd: string) => spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });

    it('con una credencial versionada falla, indica archivo y linea y no imprime el valor', () => {
      const r = correr(repo({ 'config.txt': `a=1\nclave=${FALSOS.claveGoogle}\n` }));
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('google-client-secret: config.txt:2');
      expect(r.stdout + r.stderr).not.toContain(FALSOS.claveGoogle);
    });

    it('con un .env versionado falla', () => {
      const r = correr(repo({ '.env': 'PORT=3000\n' }));
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('archivo-de-entorno-versionado: .env');
    });

    it('sin credenciales termina bien', () => {
      const r = correr(repo({ 'a.txt': 'nada que ocultar\n', '.env.example': 'PORT=3000\n' }));
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('correcto');
    });
  });
});

describe('flujo de integracion continua (ci.yml)', () => {
  it('declara permisos de solo lectura y no usa eventos peligrosos ni secretos', () => {
    expect(ci).toMatch(/^permissions:\s*\n\s+contents: read\s*$/m);
    expect(ci).not.toMatch(/pull_request_target/);
    expect(ci).not.toMatch(/\bsecrets\./);
    expect(ci).not.toMatch(/\bworkflow_run\b|\brepository_dispatch\b/);
    expect(ci).toMatch(/^on:\s*\n\s+push:\s*\n\s+branches: \[main\]\s*\n\s+pull_request:/m);
  });

  it('fija cada accion de terceros por SHA de commit y conserva el comentario de version', () => {
    const usos = [...ciCompleto.matchAll(/^\s*-?\s*uses:\s*(\S+)(.*)$/gm)];
    expect(usos.length).toBeGreaterThanOrEqual(7);
    for (const m of usos) {
      expect(m[1], `uses sin fijar: ${m[1]}`).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(m[2]).toMatch(/#\s*v\d/);
    }
  });

  it('no activa trazas ni vuelca el entorno, y enmascara el secreto generado', () => {
    expect(ci).not.toMatch(/set -[a-z]*x|\bprintenv\b|\benv\s*\|\s*|\bcat\s+.*\.env\b|ACTIONS_STEP_DEBUG|ACTIONS_RUNNER_DEBUG/);
    expect(ci).toMatch(/::add-mask::/);
    expect(ci).toMatch(/openssl rand -hex 32/);
    expect(ci).not.toMatch(/RATE_LIMIT_HMAC_SECRET:\s*\S+/); // nunca un valor fijo
  });

  it('API: base efimera aislada *_test y todas las comprobaciones', () => {
    for (const paso of ['npm run typecheck', 'npm run build', 'npm run contrato:validar', 'npm test']) expect(ci).toContain(paso);
    expect(ci).toMatch(/POSTGRES_DB: ayni_safe_test/);
    expect(ci).toMatch(/TEST_DATABASE_URL: postgresql:\/\/[^\s]+\/ayni_safe_test\s*$/m);
    expect(ci).not.toMatch(/TEST_DATABASE_URL:.*neon|onrender/i);
  });

  it('Flutter: analisis y pruebas de unidad y widgets, sin integration_test', () => {
    expect(ci).toContain('flutter analyze');
    expect(ci).toMatch(/^\s+run: flutter test\s*$/m);
    expect(ci).not.toMatch(/flutter test[^\n]*integration_test/);
    expect(ci).not.toMatch(/flutter (drive|build)/);
  });

  it('web: lint, tipos, compilacion, verificacion del artefacto y pruebas', () => {
    for (const paso of ['npm run lint', 'npm run typecheck', 'npm run build', 'npm run verificar:dist', 'npm test']) {
      expect(ci).toContain(paso);
    }
  });

  it('incluye el escaneo de secretos', () => {
    expect(ci).toContain('node scripts/escanear-secretos.mjs');
  });
});
