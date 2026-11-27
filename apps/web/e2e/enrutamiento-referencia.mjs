// Renderiza el donante SIN modificarlo; solo intercepta sus datos para la comparación de composición.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright-core';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ = resolve(WEB, '../..');
const DONANTE = resolve(RAIZ, '../Proyecto_incidencias_400par');
const salida = resolve(RAIZ, 'docs/validacion/p4/capturas-referencia');
const git = args => execFileSync('git', ['-c', `safe.directory=${DONANTE.replaceAll('\\', '/')}`, '-C', DONANTE, ...args], { encoding: 'utf8' }).trim();
if (git(['status', '--porcelain'])) throw new Error('El donante debe estar limpio.');
const head = git(['rev-parse', 'HEAD']);
mkdirSync(salida, { recursive: true });
const server = await createServer({ configFile: false, root: join(DONANTE, 'apps/admin'), envFile: false,
  cacheDir: join(WEB, 'node_modules/.cache/p4-referencia'), plugins: [react()],
  server: { host: 'localhost', port: 5177, strictPort: true } });
let browser;
try {
  await server.listen();
  const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  browser = await chromium.launch({ executablePath: chrome, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'es-PE' });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: ['DM Sans', 'Manrope'].map(f => `@font-face{font-family:'${f}';font-style:normal;font-weight:100 900;src:url(data:font/ttf;base64,${readFileSync(join(WEB, `public/fuentes/${f.replaceAll(' ', '-')}.ttf`)).toString('base64')})}`).join('\n') }));
  await page.route('**/api/v1/**', route => {
    const p = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (p === '/auth/login') return route.fulfill({ json: { accessToken: 'referencia', refreshToken: 'referencia', user: { id: 'ref', name: 'Prueba local pnp', roles: ['Operador'] } } });
    if (p === '/ops/incidents') return route.fulfill({ json: [1, 2, 3].map(n => ({ id: n, reference: `INC-REF0${n}-AAAAA`, categoryName: 'Accidente de tránsito', status: 'reported', verificationStatus: 'pending', priority: 'normal', createdAt: '2026-11-26T23:32:00Z' })) });
    return route.fulfill({ json: [] });
  });
  await page.goto('http://localhost:5177/login');
  await page.getByLabel('Correo institucional').fill('referencia@ejemplo.test');
  await page.getByLabel('Contraseña').fill('contraseña-de-referencia-local');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('link', { name: /Incidentes/ }).click();
  await page.getByRole('table').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const capturas = [];
  for (const ancho of [1440, 360]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    const archivo = `bandeja-origen-${ancho}.png`;
    await page.screenshot({ path: join(salida, archivo), fullPage: true });
    capturas.push(archivo);
  }
  if (git(['status', '--porcelain'])) throw new Error('El donante cambió durante el render.');
  writeFileSync(resolve(RAIZ, 'docs/validacion/p4/referencia-renderizada.json'), JSON.stringify({ fecha: new Date().toISOString(), head, donanteLimpioAntesYDespues: true, capturas, limites: 'UI original con API interceptada para render. Las fuentes DM Sans y Manrope se sirven desde los recursos locales de AyniSafe. No prueba operación del donante ni igualdad píxel a píxel.' }, null, 2) + '\n');
  console.log('Referencia renderizada; donante sin modificaciones.');
} finally { await browser?.close(); await server.close(); }
