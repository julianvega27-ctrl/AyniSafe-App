import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(__dirname, '..');
const vercel = JSON.parse(readFileSync(join(raiz, 'vercel.json'), 'utf8')) as {
  rewrites: { source: string; destination: string }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const cabecera = (clave: string): string | undefined =>
  vercel.headers.find((h) => h.source === '/(.*)')?.headers.find((h) => h.key.toLowerCase() === clave.toLowerCase())?.value;

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? fuentes(ruta) : [ruta];
  });
}
const codigo = fuentes(join(raiz, 'src')).filter((f) => /\.(ts|tsx)$/.test(f));

describe('vercel.json: mismo origen y cabeceras de seguridad', () => {
  it('reescribe /api/* hacia la API antes del respaldo del SPA, que excluye /api', () => {
    expect(vercel.rewrites[0]?.source).toBe('/api/:path*');
    expect(vercel.rewrites[0]?.destination).toMatch(/^https:\/\/[^/]+\/api\/:path\*$/);
    expect(vercel.rewrites[1]?.destination).toBe('/index.html');
    expect(vercel.rewrites[1]?.source).toContain('(?!api/)');
  });

  it('el destino de la API es un marcador no valido hasta fijarlo tras el spike (no apunta a un tercero)', () => {
    // Debe reemplazarse por el host real de Render al desplegar (ver README de la web).
    expect(vercel.rewrites[0]?.destination).toContain('.invalid');
  });

  it('la politica de contenido impide scripts y estilos de terceros y la incrustacion', () => {
    const csp = cabecera('Content-Security-Policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    // P7 (ADR-009): el unico origen externo son las imagenes del mapa base, solo en img-src.
    const externos = [...csp.matchAll(/https?:\/\/[^\s;]+/g)].map((m) => m[0]);
    expect(externos).toEqual(['https://tile.openstreetmap.org']);
    expect(csp).toMatch(/img-src 'self' data: https:\/\/tile\.openstreetmap\.org;/);
  });

  it('nosniff, sin referrer (no filtra fragmentos) y sin permisos de dispositivo', () => {
    expect(cabecera('X-Content-Type-Options')).toBe('nosniff');
    expect(cabecera('Referrer-Policy')).toBe('no-referrer');
    expect(cabecera('X-Frame-Options')).toBe('DENY');
    expect(cabecera('Permissions-Policy')).toMatch(/geolocation=\(\)/);
  });

  it('index.html tambien declara referrer nulo y no carga recursos externos', () => {
    const html = readFileSync(join(raiz, 'index.html'), 'utf8');
    expect(html).toContain('name="referrer" content="no-referrer"');
    expect(html).not.toMatch(/(src|href)="https?:\/\//);
    expect(html).not.toMatch(/<script(?![^>]*src=)[^>]*>/); // sin scripts en linea (la CSP los bloquearia)
  });
});

describe('codigo fuente: llamadas al mismo origen y sin almacenamiento', () => {
  it('ninguna URL absoluta de la API ni de terceros en el codigo', () => {
    for (const f of codigo) {
      const t = readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    }
  });

  it('las llamadas a la API usan rutas relativas /api/v1', () => {
    const cliente = readFileSync(join(raiz, 'src/api/cliente.ts'), 'utf8');
    const rutas = [...cliente.matchAll(/['`](\/api\/[^'`]+)['`]/g)].map((m) => m[1]!);
    expect(rutas.length).toBeGreaterThan(5);
    for (const r of rutas) expect(r.startsWith('/api/v1/')).toBe(true);
  });

  it('no hay almacenamiento del navegador, cookies ni estilos en linea (la CSP los bloquea)', () => {
    for (const f of codigo) {
      const t = readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b/);
      expect(t, f).not.toMatch(/document\.cookie/);
      expect(t, f).not.toMatch(/\sstyle=\{/);
      expect(t, f).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  it('la web no es un cliente ciudadano ni ofrece alta de cuentas', () => {
    const t = codigo.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(t).not.toMatch(/ciudadanos\/(registro|sesiones)/);
    expect(t).not.toMatch(/auth\/recuperaciones/);
  });
});
