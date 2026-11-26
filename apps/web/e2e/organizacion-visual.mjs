// Verificación visual reproducible de las secciones de organización (P3.2) con API interceptada: no acredita
// integración de backend (esa evidencia está en las pruebas Jest de la API).
// Desde apps/web: WEB_VISUAL_URL=http://127.0.0.1:5174 ORIGEN_VISUAL_URL=http://127.0.0.1:5175 node e2e/organizacion-visual.mjs
// ORIGEN_VISUAL_URL opcional: copia aislada del donante con el arnés /organizacion (Organization.jsx real).
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ = resolve(WEB, '../..');
const SALIDA = resolve(RAIZ, 'docs/validacion/p3/capturas');
const origen = process.env.ORIGEN_VISUAL_URL;
const destino = process.env.WEB_VISUAL_URL ?? 'http://127.0.0.1:5174';
const fuentePaneles = readFileSync(resolve(WEB, '../api/src/modules/identidad/dominio/paneles.ts'), 'utf8');
const bloque = /administrador: \[([\s\S]*?)\]/.exec(fuentePaneles)[1];
const SECCIONES = [...bloque.matchAll(/\{ id: '([^']+)', titulo: '([^']+)', disponible: (true|false) \}/g)].map(([, id, titulo, d]) => ({ id, titulo, disponible: d === 'true' }));
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!chrome) throw new Error('Configura CHROME_PATH con un navegador Chromium.');
mkdirSync(SALIDA, { recursive: true });
const axe = readFileSync(resolve(WEB, 'node_modules/axe-core/axe.min.js'), 'utf8');
const ADMIN = { id: '5482bbd9-ef53-4049-a095-19a9d0144eeb', nombre: 'Ana Torres', correo: 'ana@ejemplo.test', rol: 'administrador' };
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 900, height: 900 }, { width: 360, height: 800 }];
const SEDE = {
  id: '11111111-1111-4111-8111-111111111111', institucionId: 'pnp', nombre: 'Comisaría de demostración', distritoUbicacionId: 'DIS-01',
  direccion: null, contacto: null, verificacion: { estado: 'verificada', fuente: 'Dato de demostración', fecha: '2026-11-25' },
  habilitadaAtencion: false, activa: true, esDemostracion: true, distritos: ['DIS-01'], categorias: ['robo'],
};
const OPERADOR = { id: '22222222-2222-4222-8222-222222222222', nombre: 'Operador de demostración', correo: 'operador@ejemplo.test', estado: 'pendiente_activacion', sedeId: SEDE.id, esDemostracion: true };
const INSTITUCIONES = ['bomberos', 'pnp', 'samu', 'serenazgo'].map((id) => ({ id, tipo: id, nombre: { pnp: 'PNP', samu: 'SAMU', bomberos: 'Bomberos', serenazgo: 'Serenazgo' }[id], contacto: null, activa: true }));
const DISTRITOS = [['DIS-01', 'Ayacucho'], ['DIS-02', 'San Juan Bautista'], ['DIS-03', 'Carmen Alto'], ['DIS-04', 'Jesús Nazareno'], ['DIS-05', 'Andrés Avelino Cáceres Dorregaray']].map(([id, nombre]) => ({ id, nombre, ubigeo: null }));
const CATEGORIAS = ['Accidente de tránsito', 'Acoso', 'Robo', 'Incendio'].map((nombre, i) => ({ id: ['accidente-transito', 'acoso', 'robo', 'incendio'][i], nombre, orden: i + 1, activa: true }));
// Referencia del donante: mismos datos con su forma de API (solo para dibujar la página original).
const REF = {
  institutions: [{ id: 'pnp', name: 'PNP', type: 'pnp', contactPhone: null, active: true, isDemo: true }],
  sites: [{ id: SEDE.id, institutionId: 'pnp', districtId: 1, name: SEDE.nombre, address: null, contactPhone: null, location: { latitude: -13.16, longitude: -74.22 }, active: true, isDemo: true, territoryStatus: 'resolved', territoryVersionId: null, districtName: 'Ayacucho' }],
  users: [{ id: OPERADOR.id, name: OPERADOR.nombre, email: OPERADOR.correo, status: 'active', institutionId: 'pnp', institutionName: 'PNP', siteId: SEDE.id, siteName: SEDE.nombre, role: 'Operador' }],
};
const fichas = [];
let comprobaciones = 0;
function verificar(ok, mensaje) { comprobaciones++; if (!ok) throw new Error(mensaje); }

const browser = await chromium.launch({ executablePath: chrome, headless: true });
try {
  const page = await browser.newPage();
  const externos = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && ![new URL(destino).origin, ...(origen ? [new URL(origen).origin] : [])].includes(u.origin)) externos.push(u.origin);
  });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const ruta = url.pathname.replace(/^\/api\/v1/, '');
    if (origen && url.origin === new URL(origen).origin) {
      if (ruta === '/auth/login') return route.fulfill({ json: { accessToken: 'ref', refreshToken: 'ref', user: { id: 'ref', name: ADMIN.nombre, roles: ['SuperAdministrador'] } } });
      if (ruta.startsWith('/notifications/mine')) return route.fulfill({ json: [] });
      if (ruta === '/admin/institutions') return route.fulfill({ json: REF.institutions });
      if (ruta === '/admin/sites') return route.fulfill({ json: REF.sites });
      if (ruta === '/admin/users') return route.fulfill({ json: REF.users });
      if (ruta.startsWith('/territory/districts')) return route.fulfill({ json: [{ id: 1, name: 'Ayacucho' }] });
      return route.fulfill({ status: 404, json: {} });
    }
    if (ruta === '/auth/institucional/sesion') return route.fulfill({ json: { usuario: ADMIN, expiresAt: '2026-12-01T00:00:00.000Z' } });
    if (ruta === '/administrador/panel') return route.fulfill({ json: { usuario: ADMIN, secciones: SECCIONES } });
    if (ruta === '/administrador/organizacion/instituciones') return route.fulfill({ json: { instituciones: INSTITUCIONES } });
    if (ruta === '/administrador/organizacion/sedes') return route.fulfill({ json: { sedes: [SEDE] } });
    if (ruta === `/administrador/organizacion/sedes/${SEDE.id}/operadores`) return route.fulfill({ json: { operadores: [OPERADOR] } });
    if (ruta === '/publico/territorio/distritos') return route.fulfill({ json: { estado: 'pendiente', version: null, distritos: DISTRITOS } });
    if (ruta === '/publico/categorias') return route.fulfill({ json: { categorias: CATEGORIAS } });
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });

  async function medir() {
    return page.evaluate(() => ({
      anchoDocumento: document.documentElement.scrollWidth,
      anchoVentana: window.innerWidth,
    }));
  }
  async function auditar() {
    await page.addScriptTag({ content: axe });
    return page.evaluate(async () => {
      const r = await axe.run(document, { resultTypes: ['violations'] });
      return r.violations.map((v) => `${v.id}: ${v.nodes.length}`);
    });
  }
  async function capturar(lado, nombre, viewport, extra = {}) {
    const archivo = `organizacion-${lado}-${nombre}-${viewport.width}.png`;
    await page.screenshot({ path: resolve(SALIDA, archivo), fullPage: true });
    fichas.push({ lado, nombre, viewport, archivo, ...extra });
  }

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    if (origen) {
      await page.goto(`${origen}/organizacion`);
      await page.getByRole('heading', { name: 'Instituciones y sedes' }).waitFor();
      await capturar('origen', 'instituciones-sedes', viewport, await medir());
    }
    for (const seccion of ['instituciones-sedes', 'operadores', 'coberturas']) {
      await page.goto(`${destino}/panel/administrador/${seccion}`);
      await page.getByRole('heading', { name: SECCIONES.find((x) => x.id === seccion).titulo, level: 1 }).waitFor();
      const listo = { 'instituciones-sedes': page.getByRole('list', { name: 'Sedes de PNP' }), operadores: page.getByText(OPERADOR.correo), coberturas: page.getByRole('button', { name: 'Guardar cobertura' }) };
      await listo[seccion].waitFor();
      const medidas = await medir();
      verificar(medidas.anchoDocumento <= medidas.anchoVentana, `${seccion} ${viewport.width}: desborda horizontalmente (${medidas.anchoDocumento} > ${medidas.anchoVentana})`);
      const violaciones = await auditar();
      verificar(violaciones.length === 0, `${seccion} ${viewport.width}: axe ${violaciones.join(', ')}`);
      await capturar('destino', seccion, viewport, { ...medidas, violacionesAxe: violaciones });
    }
  }

  // Teclado: el alta de sede se completa solo con teclado y el foco es visible en cada control.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${destino}/panel/administrador/instituciones-sedes`);
  await page.getByRole('button', { name: 'Crear sede e invitar' }).waitFor();
  await page.getByLabel('Institución').focus();
  const recorrido = [];
  for (let i = 0; i < 12; i++) {
    const foco = await page.evaluate(() => {
      const el = document.activeElement;
      const estilo = el ? getComputedStyle(el) : null;
      return { etiqueta: el?.getAttribute('aria-label') ?? el?.labels?.[0]?.textContent ?? el?.textContent?.trim().slice(0, 40), tag: el?.tagName, contorno: estilo?.outlineStyle !== 'none' || estilo?.boxShadow !== 'none' };
    });
    recorrido.push(foco);
    if (foco.tag === 'BUTTON' && /Crear sede/.test(foco.etiqueta ?? '')) break;
    await page.keyboard.press('Tab');
  }
  verificar(recorrido.some((f) => f.tag === 'BUTTON' && /Crear sede/.test(f.etiqueta ?? '')), 'El botón de alta no es alcanzable con Tab desde Institución');
  verificar(recorrido.every((f) => f.contorno), 'Algún control del formulario no muestra foco visible');
  verificar(externos.length === 0, `Peticiones a otros orígenes: ${[...new Set(externos)].join(', ')}`);
  writeFileSync(resolve(RAIZ, 'docs/validacion/p3/fichas-organizacion.json'), JSON.stringify({
    fecha: new Date().toISOString(), destino, origen: origen ?? null, navegador: chrome.split('/').pop(), comprobaciones,
    recorridoTeclado: recorrido, fichas,
    limites: 'API interceptada con datos de demostración; jsdom no interviene. axe sin reglas desactivadas en navegador real. La comparación con el origen es visual (capturas lado a lado), sin diferencia de píxeles automatizada.',
  }, null, 2) + '\n');
  console.log(`organizacion-visual correcto: ${comprobaciones} comprobaciones, ${fichas.length} capturas.`);
} finally {
  await browser.close();
}
