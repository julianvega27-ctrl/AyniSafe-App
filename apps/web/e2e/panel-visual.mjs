// Verificación visual reproducible del panel institucional con API interceptada: no acredita integración de backend.
// Desde apps/web: WEB_VISUAL_URL=http://127.0.0.1:5174 ORIGEN_VISUAL_URL=http://127.0.0.1:5175 node e2e/panel-visual.mjs
// ORIGEN_VISUAL_URL opcional: copia aislada del donante con el arnés /marco (Shell original, sesión interceptada).
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ = resolve(WEB, '../..');
const SALIDA = resolve(RAIZ, 'docs/validacion/p2/capturas');
const origen = process.env.ORIGEN_VISUAL_URL;
const destino = process.env.WEB_VISUAL_URL ?? 'http://127.0.0.1:5174';
// Catálogo real de la API, leído de su fuente (el paquete de la API es CommonJS/TypeScript).
const fuentePaneles = readFileSync(resolve(WEB, '../api/src/modules/identidad/dominio/paneles.ts'), 'utf8');
const CATALOGO = Object.fromEntries(['operador', 'administrador'].map((rol) => {
  const bloque = new RegExp(`${rol}: \\[([\\s\\S]*?)\\]`).exec(fuentePaneles)[1];
  return [rol, [...bloque.matchAll(/\{ id: '([^']+)', titulo: '([^']+)', disponible: (true|false) \}/g)].map(([, id, titulo, d]) => ({ id, titulo, disponible: d === 'true' }))];
}));
const seccionesDelPanel = (rol) => CATALOGO[rol];
if (!CATALOGO.operador.length || !CATALOGO.administrador.length) throw new Error('No se pudo leer el catálogo de paneles');
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!chrome) throw new Error('Configura CHROME_PATH con un navegador Chromium.');
mkdirSync(SALIDA, { recursive: true });
const axe = readFileSync(resolve(WEB, 'node_modules/axe-core/axe.min.js'), 'utf8');
const USUARIOS = {
  administrador: { id: '5482bbd9-ef53-4049-a095-19a9d0144eeb', nombre: 'Ana Torres', correo: 'ana@ejemplo.test', rol: 'administrador' },
  operador: { id: '0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8', nombre: 'Luis Quispe', correo: 'luis@ejemplo.test', rol: 'operador' },
};
const ROL_ORIGEN = { administrador: 'AdministradorInstitucional', operador: 'Operador' };
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 900, height: 900 }, { width: 600, height: 900 }, { width: 390, height: 844 }];
const fichas = [];
let comprobaciones = 0;
function verificar(ok, mensaje) { comprobaciones++; if (!ok) throw new Error(mensaje); }

const browser = await chromium.launch({ executablePath: chrome, headless: true });
try {
  const page = await browser.newPage();
  const peticiones = [];
  const externos = [];
  const escenario = { rol: 'administrador', sesion: 'ok', panel: 'ok' };
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && ![new URL(destino).origin, ...(origen ? [new URL(origen).origin] : [])].includes(u.origin)) externos.push(u.origin);
  });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const ruta = url.pathname.replace(/^\/api\/v1/, '');
    if (origen && url.origin === new URL(origen).origin) {
      // Referencia: sesión y avisos vacíos solo para dibujar el Shell original.
      if (ruta === '/auth/login') return route.fulfill({ json: { accessToken: 'ref', refreshToken: 'ref', user: { id: 'ref', name: USUARIOS[escenario.rol].nombre, roles: [ROL_ORIGEN[escenario.rol]] } } });
      if (ruta.startsWith('/notifications/mine')) return route.fulfill({ json: [] });
      return route.fulfill({ status: 404, json: {} });
    }
    peticiones.push(`${req.method()} ${ruta}`);
    if (ruta === '/auth/institucional/sesion' && req.method() === 'GET') {
      if (escenario.sesion === 'vencida') return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED' } } });
      return route.fulfill({ json: { usuario: USUARIOS[escenario.rol], expiresAt: '2026-12-01T00:00:00.000Z' }, headers: { 'cache-control': 'no-store' } });
    }
    if (ruta === '/auth/institucional/sesion' && req.method() === 'DELETE') return route.fulfill({ status: 204 });
    const m = /^\/(administrador|operador)\/panel$/.exec(ruta);
    if (m) {
      if (escenario.panel === 'servicio') return route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE' } } });
      if (escenario.panel === 'carga') await new Promise((r) => setTimeout(r, 1500));
      if (m[1] !== escenario.rol) return route.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN' } } });
      return route.fulfill({ json: { usuario: USUARIOS[escenario.rol], secciones: seccionesDelPanel(escenario.rol) } });
    }
    if (ruta === '/publico/contenido') return route.fulfill({ json: JSON.parse(readFileSync(resolve(WEB, '../api/src/modules/consultas/contenido/contenido-publico.json'), 'utf8')) });
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });

  async function capturar(lado, rol, estado, viewport, escala = 1) {
    await page.evaluate(() => document.fonts.ready);
    const medidas = await page.evaluate(() => ({
      ancho: innerWidth, alto: innerHeight, escala: devicePixelRatio,
      anchoDocumento: document.documentElement.scrollWidth,
      fuentes: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
      lateral: document.querySelector('.sidebar')?.getBoundingClientRect().width ?? null,
    }));
    const archivo = `panel-${lado}-${rol}-${estado}-${viewport.width}${escala === 2 ? '-texto200' : ''}.png`;
    await page.screenshot({ path: resolve(SALIDA, archivo), fullPage: true });
    console.log(`Captura: ${archivo}`);
    fichas.push({ archivo, lado, rol, estado, viewport, escalaTexto: escala, medidas });
    if (lado === 'destino') {
      verificar(medidas.anchoDocumento <= viewport.width + 1, `Desborde: ${archivo}`);
      verificar(medidas.fuentes.some((f) => f.includes('DM Sans')) && medidas.fuentes.some((f) => f.includes('Manrope')), `Fuentes no cargadas: ${archivo}`);
      await page.evaluate(axe);
      const fallos = await page.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })));
      fichas.at(-1).axe = fallos;
      verificar(fallos.length === 0, `axe ${archivo}: ${JSON.stringify(fallos)}`);
    }
  }
  const panelListo = () => page.getByRole('heading', { level: 2 }).first().waitFor();

  for (const rol of ['administrador', 'operador']) {
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      Object.assign(escenario, { rol, sesion: 'ok', panel: 'ok' });
      if (origen) {
        await page.goto(`${origen}/marco`);
        await page.locator('.app-shell').waitFor();
        await capturar('origen', rol, 'marco', viewport);
        if (viewport.width === 1440 || viewport.width === 390) {
          await page.locator('.account-trigger').click();
          await capturar('origen', rol, 'cuenta', viewport);
          await page.keyboard.press('Escape');
          await page.locator('.notification-button').click();
          await capturar('origen', rol, 'avisos', viewport);
        }
      }
      await page.goto(`${destino}/panel/${rol}`);
      await panelListo();
      await capturar('destino', rol, 'inicio', viewport);
      const items = page.getByRole('navigation', { name: /Secciones del panel/ }).getByRole('link');
      verificar(await items.count() === seccionesDelPanel(rol).length, `Destinos incompletos: ${rol} ${viewport.width}`);
      for (let i = 0; i < await items.count(); i++) {
        const caja = await items.nth(i).boundingBox();
        verificar(caja && caja.height >= 47.5 && caja.width >= 47.5, `Destino menor a 48 px: ${rol} ${viewport.width}`);
      }
      if (viewport.width === 1440 || viewport.width === 390) {
        await page.getByRole('button', { name: /^Cuenta de / }).click();
        await capturar('destino', rol, 'cuenta', viewport);
        await page.keyboard.press('Escape');
        verificar(await page.getByRole('button', { name: /^Cuenta de / }).evaluate((e) => e === document.activeElement), 'Escape no devuelve el foco a la cuenta');
        await page.getByRole('button', { name: 'Avisos: aún no disponible' }).click();
        await capturar('destino', rol, 'avisos', viewport);
        await page.keyboard.press('Escape');
        await items.last().click();
        await page.getByRole('heading', { name: 'Historial', level: 2 }).waitFor();
        await capturar('destino', rol, 'historial', viewport);
        Object.assign(escenario, { panel: 'servicio' });
        await page.goto(`${destino}/panel/${rol}`);
        await page.getByText('El servicio no está disponible', { exact: true }).waitFor();
        await capturar('destino', rol, 'servicio', viewport);
        Object.assign(escenario, { panel: 'carga' });
        await page.goto(`${destino}/panel/${rol}`);
        await page.getByText('Cargando tu panel…').waitFor();
        await capturar('destino', rol, 'carga', viewport);
        await panelListo();
        Object.assign(escenario, { panel: 'ok' });
        await page.goto(`${destino}/panel/${rol}`);
        await panelListo();
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await capturar('destino', rol, 'inicio', viewport, 2);
      }
    }
  }

  // Rol ajeno: el operador abre el panel del administrador; la API decide (403) y no aparecen sus secciones.
  await page.setViewportSize({ width: 1440, height: 900 });
  Object.assign(escenario, { rol: 'operador', sesion: 'ok', panel: 'ok' });
  await page.goto(`${destino}/panel/administrador`);
  await page.getByText('No tienes permiso para ver este panel').waitFor();
  verificar(await page.getByText('Instituciones y sedes').count() === 0, 'Rol ajeno ve secciones del administrador');
  await capturar('destino', 'operador', 'rol-ajeno', { width: 1440, height: 900 });

  // Teclado: saltar al contenido, recorrer destinos y abrir uno con Enter.
  Object.assign(escenario, { rol: 'administrador' });
  await page.goto(`${destino}/panel/administrador`);
  await panelListo();
  await page.keyboard.press('Tab');
  verificar(await page.evaluate(() => document.activeElement?.textContent) === 'Saltar al contenido', 'Primer Tab no es «Saltar al contenido»');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  verificar(/Instituciones y sedes/.test(await page.evaluate(() => document.activeElement?.textContent ?? '')), 'Destinos no alcanzables por teclado');
  const contorno = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  verificar(contorno !== 'none', 'Foco no visible en el lateral');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Instituciones y sedes', level: 2 }).waitFor();

  // Cierre: revoca, vuelve a la portada y Atrás no reabre el panel.
  await page.getByRole('button', { name: /^Cuenta de / }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForURL(`${destino}/`);
  verificar(peticiones.includes('DELETE /auth/institucional/sesion'), 'No se revocó la sesión');
  Object.assign(escenario, { sesion: 'vencida' });
  await page.goBack();
  await page.waitForURL(`${destino}/`);
  await page.locator('h1').waitFor();
  verificar(await page.getByText('Ana Torres').count() === 0 && await page.locator('.app-shell').count() === 0, 'Atrás reabre el panel tras cerrar sesión');

  // Sesión vencida al abrir o recargar una ruta protegida: va al acceso con aviso, sin destello del panel.
  await page.goto(`${destino}/panel/operador`);
  await page.waitForURL(/\/acceso$/);
  await page.getByText('Tu sesión no es válida o venció').waitFor();
  verificar(await page.getByText('Luis Quispe').count() === 0, 'Sesión vencida muestra identidad');
  await capturar('destino', 'operador', 'sesion-vencida', { width: 1440, height: 900 });

  verificar(!peticiones.some((p) => /notific|alert|incident|reporte|mapa|historial|indicador/.test(p)), `Se consultó una capacidad futura: ${peticiones.join(', ')}`);
  verificar(externos.length === 0, `Se solicitaron recursos de terceros: ${externos.join(', ')}`);
  console.log(JSON.stringify({ comprobaciones, capturas: fichas.length, estado: 'aprobado' }));
} finally {
  writeFileSync(resolve(SALIDA, '../fichas-panel.json'), JSON.stringify({ referencia: 'efc1bce8c29b3c88487e36e10a324c71ae9c2029', revisionBaseDestino: 'd678217', comando: 'node e2e/panel-visual.mjs', arnesOrigen: '.cache/p2-referencia/src/MarcoReferencia.jsx', fichas }, null, 2) + '\n');
  await browser.close();
}
