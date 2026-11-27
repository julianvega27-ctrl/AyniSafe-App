// Verificación visual reproducible de la bandeja del operador y del Inicio del administrador (P4.2) con la API
// interceptada: no acredita integración de backend (esa evidencia está en las pruebas Jest de la API).
// Desde apps/web, con `npm run dev -- --port 5174` abierto:
//   WEB_VISUAL_URL=http://127.0.0.1:5174 node e2e/incidentes-visual.mjs
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ = resolve(WEB, '../..');
const SALIDA = resolve(RAIZ, 'docs/validacion/p4/capturas-enrutamiento');
const destino = process.env.WEB_VISUAL_URL ?? 'http://127.0.0.1:5174';
const fuentePaneles = readFileSync(resolve(WEB, '../api/src/modules/identidad/dominio/paneles.ts'), 'utf8');
const secciones = (rol) =>
  [...new RegExp(`${rol}: \\[([\\s\\S]*?)\\]`).exec(fuentePaneles)[1].matchAll(/\{ id: '([^']+)', titulo: '([^']+)', disponible: (true|false) \}/g)]
    .map(([, id, titulo, d]) => ({ id, titulo, disponible: d === 'true' }));
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!chrome) throw new Error('Configura CHROME_PATH con un navegador Chromium.');
mkdirSync(SALIDA, { recursive: true });
const axe = readFileSync(resolve(WEB, 'node_modules/axe-core/axe.min.js'), 'utf8');

// Datos de demostración (no son incidentes reales).
const OPERADOR = { id: '6e7a1d55-1c61-4d3a-9d2a-0f4b5d1c2a11', nombre: 'Operador de demostración', correo: 'operador@ejemplo.test', rol: 'operador' };
const ADMIN = { id: '5482bbd9-ef53-4049-a095-19a9d0144eeb', nombre: 'Administrador de demostración', correo: 'admin@ejemplo.test', rol: 'administrador' };
const fila = (n, extra = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, referencia: `INC-DEM0${n}-AAAAA`, categoria: { id: 'robo', nombre: 'Robo' },
  distrito: { id: 'DIS-01', nombre: 'Ayacucho' }, estado: 'REGISTRADO', registradoEn: `2026-11-26T1${n}:00:00.000Z`,
  papel: 'principal', condicionMedicaPorConfirmar: false, prioridad: 'SIN_EVALUAR', ...extra,
});
const BANDEJA = [
  fila(1, { categoria: { id: 'accidente-transito', nombre: 'Accidente de tránsito' }, papel: 'simultanea', condicionMedicaPorConfirmar: true }),
  fila(2),
  fila(3, { categoria: { id: 'otra-emergencia', nombre: 'Otra emergencia' }, distrito: { id: 'DIS-05', nombre: 'Andrés Avelino Cáceres Dorregaray' } }),
];
const RESUMEN = {
  ...BANDEJA[0], descripcion: 'Choque de dos autos en la avenida principal; una persona no puede levantarse.',
  ocurrencia: { modo: 'ahora', instante: '2026-11-26T10:58:00.000Z' }, territorio: { estado: 'resuelto', distrito: { id: 'DIS-01', nombre: 'Ayacucho' } },
  respuestasCiudadano: { heridos: 'si', atencionMedica: 'no_se' }, otrasInstituciones: ['samu'],
};
const PENDIENTES = [
  { incidenteId: '11111111-1111-4111-8111-111111111111', referencia: 'INC-DEM04-PPPPP', categoria: { id: 'accidente-transito', nombre: 'Accidente de tránsito' },
    territorio: { estado: 'resuelto', distrito: { id: 'DIS-02', nombre: 'San Juan Bautista' } }, registradoEn: '2026-11-26T09:00:00.000Z',
    faltantes: [{ institucion: 'samu', papel: 'principal', motivo: 'sin_sede_elegible' }] },
  { incidenteId: '22222222-2222-4222-8222-222222222222', referencia: 'INC-DEM05-QQQQQ', categoria: { id: 'robo', nombre: 'Robo' },
    territorio: { estado: 'pendiente', motivo: 'fuera_area' }, registradoEn: '2026-11-26T09:30:00.000Z',
    faltantes: [{ institucion: 'pnp', papel: 'principal', motivo: 'sin_distrito' }] },
];
const SEDE = {
  id: '33333333-3333-4333-8333-333333333333', institucionId: 'samu', nombre: 'Base SAMU de demostración', distritoUbicacionId: 'DIS-01',
  direccion: null, contacto: null, verificacion: { estado: 'verificada', fuente: 'Dato de demostración', fecha: '2026-11-25' },
  habilitadaAtencion: true, activa: true, esDemostracion: true, distritos: ['DIS-01'], categorias: ['emergencia-medica'],
};
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 900, height: 900 }, { width: 360, height: 800 }];
const fichas = [];
let comprobaciones = 0;
function verificar(ok, mensaje) { comprobaciones++; if (!ok) throw new Error(mensaje); }

const browser = await chromium.launch({ executablePath: chrome, headless: true });
try {
  const page = await browser.newPage();
  const externos = [];
  let usuario = OPERADOR;
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== new URL(destino).origin) externos.push(u.origin);
  });
  await page.route('**/api/v1/**', async (route) => {
    const ruta = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, '');
    if (ruta === '/auth/institucional/sesion') return route.fulfill({ json: { usuario, expiresAt: '2026-12-01T00:00:00.000Z' } });
    if (ruta === '/operador/panel') return route.fulfill({ json: { usuario, secciones: secciones('operador') } });
    if (ruta === '/administrador/panel') return route.fulfill({ json: { usuario, secciones: secciones('administrador') } });
    if (ruta === '/operador/incidentes') return route.fulfill({ json: { elementos: BANDEJA, siguiente: null } });
    if (ruta === `/operador/incidentes/${RESUMEN.id}`) return route.fulfill({ json: RESUMEN });
    if (ruta === '/admin/enrutamientos-pendientes') return route.fulfill({ json: { elementos: PENDIENTES, siguiente: null } });
    if (ruta === '/administrador/organizacion/sedes') return route.fulfill({ json: { sedes: [SEDE] } });
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });

  const medir = () => page.evaluate(() => ({ anchoDocumento: document.documentElement.scrollWidth, anchoVentana: window.innerWidth }));
  async function auditar() {
    await page.addScriptTag({ content: axe });
    return page.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.length}`));
  }
  async function comprobar(nombre, viewport, extra = {}) {
    const medidas = await medir();
    const culpables = medidas.anchoDocumento > medidas.anchoVentana
      ? await page.evaluate(() => [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.parentElement?.closest('.table-wrap'))
        .slice(0, 6).map((e) => `${e.tagName}.${e.className}`).join(', '))
      : '';
    verificar(medidas.anchoDocumento <= medidas.anchoVentana, `${nombre} ${viewport.width}: desborda horizontalmente (${medidas.anchoDocumento} > ${medidas.anchoVentana}) ${culpables}`);
    const violaciones = await auditar();
    verificar(violaciones.length === 0, `${nombre} ${viewport.width}: axe ${violaciones.join(', ')}`);
    const archivo = `${nombre}-${viewport.width}${extra.sufijo ?? ''}.png`;
    await page.screenshot({ path: resolve(SALIDA, archivo), fullPage: true });
    fichas.push({ nombre, viewport, archivo, ...medidas, violacionesAxe: violaciones, ...extra });
  }

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    usuario = OPERADOR;
    await page.goto(`${destino}/panel/operador/incidentes`);
    await page.getByRole('heading', { name: 'Bandeja de incidentes', level: 1 }).waitFor();
    await page.getByRole('table').waitFor();
    await comprobar('bandeja', viewport);
    await page.getByRole('link', { name: /Accidente de tránsito/ }).click();
    await page.getByRole('heading', { name: 'Condición médica', level: 2 }).waitFor();
    await comprobar('resumen', viewport);
    usuario = ADMIN;
    await page.goto(`${destino}/panel/administrador`);
    await page.getByRole('heading', { name: 'Enrutamiento pendiente', level: 2 }).waitFor();
    await page.getByRole('table').waitFor();
    await comprobar('pendientes', viewport);
    await page.getByRole('button', { name: /Designar sede de SAMU/ }).click();
    await page.getByLabel('Sede habilitada').waitFor();
    await comprobar('designacion', viewport);
  }

  // Texto al 200 %: la página no se desplaza horizontalmente (la tabla puede desplazarse dentro de su marco).
  for (const [nombre, ruta, rol, listo] of [
    ['bandeja', '/panel/operador/incidentes', OPERADOR, 'table'],
    ['pendientes', '/panel/administrador', ADMIN, 'table'],
  ]) {
    usuario = rol;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${destino}${ruta}`);
    await page.getByRole(listo).waitFor();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await comprobar(nombre, { width: 1280, height: 900 }, { sufijo: '-texto200', texto: '200%' });
  }

  // Teclado: desde «Actualizar» se alcanza cada fila de la bandeja con Tab y el foco es visible.
  usuario = OPERADOR;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${destino}/panel/operador/incidentes`);
  await page.getByRole('table').waitFor();
  await page.getByRole('button', { name: 'Actualizar' }).focus();
  const recorrido = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    recorrido.push(await page.evaluate(() => {
      const el = document.activeElement;
      const anillo = el?.classList.contains('incident-list-link') ? getComputedStyle(el, '::after') : el ? getComputedStyle(el) : null;
      return { texto: el?.textContent?.trim().slice(0, 50), tag: el?.tagName, visible: !!anillo && (anillo.outlineStyle !== 'none' || anillo.boxShadow !== 'none') };
    }));
  }
  const filas = recorrido.filter((f) => f.tag === 'A' && /INC-DEM0/.test(f.texto ?? ''));
  verificar(filas.length === BANDEJA.length, `Solo ${filas.length} de ${BANDEJA.length} filas alcanzables con Tab`);
  verificar(filas.every((f) => f.visible), 'Alguna fila no muestra foco visible');
  // Enter abre el resumen.
  await page.getByRole('link', { name: /Accidente de tránsito/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Condición médica', level: 2 }).waitFor();
  verificar(true, 'Enter abre el resumen');
  verificar(externos.length === 0, `Peticiones a otros orígenes: ${[...new Set(externos)].join(', ')}`);

  writeFileSync(resolve(RAIZ, 'docs/validacion/p4/fichas-enrutamiento.json'), JSON.stringify({
    fecha: new Date().toISOString(), destino, navegador: chrome.split('/').pop(), comprobaciones, recorridoTeclado: recorrido, fichas,
    limites: 'API interceptada con datos de demostración; no acredita integración de backend. axe sin reglas desactivadas en navegador real. La composición se contrasta con Incidents.jsx del origen (efc1bce8) por lectura del código: no hay arnés del donante ni comparación automatizada de píxeles.',
  }, null, 2) + '\n');
  console.log(`incidentes-visual correcto: ${comprobaciones} comprobaciones, ${fichas.length} capturas.`);
} finally {
  await browser.close();
}
