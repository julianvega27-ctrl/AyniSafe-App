// Verificación visual reproducible con API interceptada: no acredita integración de backend.
// Desde apps/web: WEB_VISUAL_URL=http://127.0.0.1:5174 node e2e/publica-visual.mjs
// ORIGEN_VISUAL_URL opcional: copia aislada del donante, con Welcome y Login originales.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ = resolve(WEB, '../..');
const SALIDA = resolve(RAIZ, 'docs/validacion/p2/capturas');
const origen = process.env.ORIGEN_VISUAL_URL;
const destino = process.env.WEB_VISUAL_URL ?? 'http://127.0.0.1:5174';
const contenido = JSON.parse(readFileSync(resolve(WEB, '../api/src/modules/consultas/contenido/contenido-publico.json'), 'utf8'));
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!chrome) throw new Error('Configura CHROME_PATH con un navegador Chromium.');
mkdirSync(SALIDA, { recursive: true });
const fichas = [];
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const axe = readFileSync(resolve(WEB, 'node_modules/axe-core/axe.min.js'), 'utf8');
let comprobaciones = 0;
function verificar(ok, mensaje) { comprobaciones++; if (!ok) throw new Error(mensaje); }

try {
  const page = await browser.newPage();
  let estado = 'listo';
  const peticiones = [];
  const recursosExternos = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && ![new URL(destino).origin, ...(origen ? [new URL(origen).origin] : [])].includes(url.origin)) recursosExternos.push(url.origin);
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    peticiones.push(url.pathname);
    if (url.pathname.endsWith('/publico/contenido')) {
      if (estado === 'red') return route.abort('failed');
      if (estado === 'carga') await new Promise((r) => setTimeout(r, 1200));
      return route.fulfill({ status: estado === 'servicio' ? 503 : 200, json: estado === 'pendiente' ? { version: 2, app: { estado: 'pendiente' }, piloto: { estado: 'pendiente' }, desarrolladores: { estado: 'pendiente' } } : contenido });
    }
    if (url.pathname.endsWith('/tokens/consulta')) return route.fulfill({ status: 200, json: { proposito: 'activacion', expiresAt: '2026-12-01T00:00:00Z' } });
    return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED' } } });
  });

  async function capturar(nombre, variante, viewport, escala = 1) {
    await page.evaluate(() => document.fonts.ready);
    const medidas = await page.evaluate(() => ({
      ancho: innerWidth, alto: innerHeight, escala: devicePixelRatio,
      anchoDocumento: document.documentElement.scrollWidth,
      fuentes: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
      titulo: document.querySelector('h1')?.textContent,
      h1: getComputedStyle(document.querySelector('h1')).fontFamily,
      cuerpo: getComputedStyle(document.body).fontFamily,
    }));
    const archivo = `${nombre}-${variante}-${viewport.width}${escala === 2 ? '-texto200' : ''}.png`;
    await page.screenshot({ path: resolve(SALIDA, archivo), fullPage: true });
    console.log(`Captura: ${archivo}`);
    fichas.push({ archivo, variante, viewport, escalaTexto: escala, medidas, api: nombre === 'destino' ? 'interceptada, contenido versionado real; sesión/token de prueba' : 'sin backend, referencia visual' });
    if (nombre === 'destino') {
      verificar(medidas.anchoDocumento <= viewport.width + 1, `Desborde: ${archivo}`);
      verificar(medidas.fuentes.some((f) => f.includes('DM Sans')) && medidas.fuentes.some((f) => f.includes('Manrope')), `Fuentes no cargadas: ${archivo}`);
      await page.evaluate(axe);
      const fallos = await page.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })));
      fichas.at(-1).axe = fallos;
      verificar(fallos.length === 0, `axe ${archivo}: ${JSON.stringify(fallos)}`);
    }
  }

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    if (origen) for (const [ruta, nombre] of [['/', 'portada'], ['/login', 'acceso']]) {
      await page.goto(origen + ruta); await page.locator('h1').waitFor();
      await capturar('origen', nombre, viewport);
    }
    for (const variante of ['portada', 'pendiente', 'carga', 'red', 'servicio', 'acceso', 'activar']) {
      estado = variante === 'portada' ? 'listo' : variante;
      await page.goto(destino + (variante === 'acceso' ? '/acceso' : variante === 'activar' ? '/activar#t=token-visual-de-prueba-no-real-1234567890' : '/'));
      await page.locator('h1').waitFor();
      if (['portada', 'pendiente'].includes(variante)) await page.locator('#desarrolladores').waitFor();
      if (variante === 'red') await page.getByText('Sin conexión', { exact: true }).waitFor();
      if (variante === 'servicio') await page.getByText('El servicio no está disponible', { exact: true }).waitFor();
      if (variante === 'activar') {
        await page.getByLabel('Contraseña nueva', { exact: true }).waitFor();
        verificar(!page.url().includes('#'), 'El token permanece en la URL');
      }
      await capturar('destino', variante, viewport);
    }
    for (const ruta of ['/', '/acceso', '/activar']) {
      estado = 'listo'; await page.goto(destino + ruta); await page.locator('h1').waitFor();
      if (ruta === '/') await page.locator('#desarrolladores').waitFor();
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await capturar('destino', ruta === '/' ? 'portada' : ruta.slice(1), viewport, 2);
    }
  }
  await page.goto(destino + '/acceso');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  verificar(await page.getByRole('link', { name: 'Volver a la portada', exact: true }).evaluate((e) => e === document.activeElement), 'Retorno no alcanzable por teclado');
  await page.getByLabel('Correo', { exact: true }).fill('visual@ejemplo.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('clave-de-prueba-solo-en-memoria');
  await page.getByRole('button', { name: 'Mostrar', exact: true }).click();
  verificar(await page.getByLabel('Contraseña', { exact: true }).getAttribute('type') === 'text', 'Mostrar no funciona');
  await page.getByRole('link', { name: 'Volver a la portada', exact: true }).click();
  verificar(await page.locator('input[type=password]').count() === 0, 'Contraseña visible tras abandonar acceso');
  verificar(!peticiones.some((p) => /incidentes|notifications|alerts|reportes/.test(p)), 'Se consultó una capacidad futura');
  verificar(recursosExternos.length === 0, 'Se solicitaron recursos de terceros');
  console.log(JSON.stringify({ comprobaciones, capturas: fichas.length, estado: 'aprobado' }));
} finally {
  writeFileSync(resolve(SALIDA, '../fichas-web.json'), JSON.stringify({ referencia: 'efc1bce8c29b3c88487e36e10a324c71ae9c2029', revisionBaseDestino: 'd678217', comando: 'node e2e/publica-visual.mjs', fichas }, null, 2) + '\n');
  await browser.close();
}
