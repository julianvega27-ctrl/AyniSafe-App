// Recorrido P4.2 con API real, PostgreSQL *_test y navegador. Ejecutar sin otras suites de BD.
// Desde apps/web: node e2e/enrutamiento-local.mjs
// Recrea SOLO datos de la base TEST_DATABASE_URL. No usa proveedores externos.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = resolve(WEB, '../api');
const RAIZ = resolve(WEB, '../..');
const SALIDA = resolve(RAIZ, 'docs/validacion/p4/capturas-api-local');
const req = createRequire(join(API, 'package.json'));
const { parse } = req('dotenv');
const { Client } = req('pg');
const { hash, Algorithm } = req('@node-rs/argon2');
const config = parse(readFileSync(join(API, '.env')));
const url = process.env.TEST_DATABASE_URL ?? config.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Se requiere TEST_DATABASE_URL local y aislada.');
const ORIGEN = 'http://localhost:5176';
const PUERTO_API = 3116;
const clave = 'contraseña-de-fixture-p4-local-123';
const env = { ...process.env, NODE_ENV: 'development', DATABASE_URL: url, PORT: String(PUERTO_API),
  EMAIL_ADAPTER: 'prueba', WEB_ORIGIN: ORIGEN, WEB_PUBLIC_URL: ORIGEN, API_PUBLIC_URL: `http://127.0.0.1:${PUERTO_API}`,
  RATE_LIMIT_HMAC_SECRET: 'secreto-p4-local-de-al-menos-32-caracteres', TRACKING_CODE_HMAC_SECRET: 'seguimiento-p4-local-de-al-menos-32-caracteres' };
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!chrome) throw new Error('Configura CHROME_PATH.');
const hijos = [];
let browser;
const fichas = [];
const pasos = [];
const bd = new Client({ connectionString: url });
const axe = readFileSync(join(WEB, 'node_modules/axe-core/axe.min.js'), 'utf8');
function verificar(ok, paso) { if (!ok) throw new Error(paso); pasos.push(paso); }
function lanzar(cwd, args, ambiente) {
  const h = spawn(process.execPath, args, { cwd, env: ambiente, stdio: 'ignore', windowsHide: true });
  hijos.push(h);
}
async function esperar(direccion) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(direccion)).status < 500) return; } catch { /* arranque */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('El servidor local no inició.');
}
async function cuenta(rol, sufijo) {
  const correo = `${sufijo}-p4@ejemplo.test`;
  const password = await hash(clave, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const r = await bd.query(`INSERT INTO usuarios(nombre,correo_normalizado,password_hash,rol,estado,updated_at) VALUES($1,$2,$3,$4,'activo',now()) RETURNING id`, [`Prueba local ${sufijo}`, correo, password, rol]);
  return { id: r.rows[0].id, correo };
}
async function sede(institucion, operador, admin, categorias, distritos) {
  const r = await bd.query(`INSERT INTO sedes(institucion_id,nombre,nombre_normalizado,verificacion,fuente_verificacion,verificada_en,habilitada_atencion,es_demostracion,creado_por) VALUES($1,$2,$2,'verificada','Fixture local sintético',CURRENT_DATE,true,true,$3) RETURNING id`, [institucion, `Sede de prueba ${institucion}`, admin.id]);
  const id = r.rows[0].id;
  await bd.query('INSERT INTO pertenencias_operador(usuario_id,sede_id,es_demostracion) VALUES($1,$2,true)', [operador.id, id]);
  for (const d of distritos) await bd.query('INSERT INTO coberturas_sede(sede_id,distrito_id) VALUES($1,$2)', [id, d]);
  for (const c of categorias) await bd.query('INSERT INTO competencias_sede(sede_id,categoria_id) VALUES($1,$2)', [id, c]);
  return id;
}
async function registrar(punto, heridos, categoriaId = 'accidente-transito') {
  const r = await fetch(`${ORIGEN}/api/v1/incidentes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ categoriaId, descripcion: categoriaId === 'otra-emergencia' ? 'Prueba sintética: enjambre de abejas bloquea el ingreso de una vivienda.' : 'Prueba local sintética: choque de dos autos, sin operación real.', ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60000).toISOString() }, punto: { ...punto, origen: 'manual' }, telefonoContacto: '987654321', ...(categoriaId === 'accidente-transito' ? { heridos, atencionMedica: 'no_se' } : {}) }) });
  verificar(r.status === 201, `Registro HTTP confirmado (estado ${r.status})`);
  const datos = await r.json();
  const id = (await bd.query('SELECT id FROM incidentes WHERE referencia=$1', [datos.referencia])).rows[0].id;
  for (let i = 0; i < 120; i++) {
    if ((await bd.query('SELECT 1 FROM enrutamientos_incidente WHERE incidente_id=$1', [id])).rowCount) return { ...datos, id };
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('No se procesó el evento de registro.');
}
async function ingresar(identidad) {
  const contexto = await browser.newContext({ locale: 'es-PE', viewport: { width: 1440, height: 900 } });
  const page = await contexto.newPage();
  await page.goto(`${ORIGEN}/acceso`);
  await page.getByLabel('Correo').fill(identidad.correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/panel/**');
  return page;
}
async function capturar(page, nombre, ancho, texto = false) {
  await page.setViewportSize({ width: ancho, height: 900 });
  await page.evaluate(t => { document.documentElement.style.fontSize = t ? '200%' : ''; }, texto);
  await page.evaluate(() => document.fonts.ready);
  const medidas = await page.evaluate(() => ({ documento: document.documentElement.scrollWidth, ventana: innerWidth }));
  verificar(medidas.documento <= medidas.ventana, `${nombre} ${ancho}${texto ? ' texto200' : ''}: sin desborde de página`);
  await page.addScriptTag({ content: axe });
  const violaciones = await page.evaluate(async () => (await axe.run(document)).violations.map(v => ({ id: v.id, nodos: v.nodes.length })));
  verificar(!violaciones.length, `${nombre} ${ancho}: axe sin infracciones`);
  const archivo = `${nombre}-${ancho}${texto ? '-texto200' : ''}.png`;
  await page.screenshot({ path: join(SALIDA, archivo), fullPage: true });
  fichas.push({ nombre, ancho, texto200: texto, archivo, ...medidas, violaciones });
}
try {
  mkdirSync(SALIDA, { recursive: true });
  const migrar = spawnSync(process.execPath, [req.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { cwd: API, env, stdio: 'pipe' });
  if (migrar.status !== 0) throw new Error('Falló la migración de la base _test.');
  const preparar = spawnSync(process.execPath, [join(API, 'node_modules/tsx/dist/cli.mjs'), 'test/fixtures/preparar-p4-local.ts'], { cwd: API, env, stdio: 'pipe' });
  if (preparar.status !== 0) throw new Error('Falló la preparación de datos sintéticos.');
  await bd.connect();
  const admin = await cuenta('administrador', 'admin');
  const samu = await cuenta('operador', 'samu');
  const pnp = await cuenta('operador', 'pnp');
  const sedeSamu = await sede('samu', samu, admin, ['accidente-transito'], ['DIS-01']);
  await sede('pnp', pnp, admin, ['accidente-transito'], ['DIS-01', 'DIS-02']);
  lanzar(API, [join(API, 'node_modules/tsx/dist/cli.mjs'), 'src/main.ts'], env);
  lanzar(WEB, [join(WEB, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port', '5176'], { ...process.env, API_DEV_URL: `http://127.0.0.1:${PUERTO_API}` });
  await esperar(`${ORIGEN}/api/v1/publico/contenido`);
  const accidente = await registrar({ latitud: 1, longitud: 1 }, 'si');
  const pendiente = await registrar({ latitud: 1, longitud: 5 }, 'si');
  const desconocida = await registrar({ latitud: 1, longitud: 1 }, 'no_se');
  browser = await chromium.launch({ executablePath: chrome, headless: true });
  const pageSamu = await ingresar(samu);
  await pageSamu.goto(`${ORIGEN}/panel/operador/incidentes`);
  await pageSamu.getByRole('link', { name: new RegExp(accidente.referencia) }).waitFor();
  verificar((await pageSamu.getByRole('table').textContent()).includes('Principal'), 'SAMU ve el accidente como principal');
  const pagePnp = await ingresar(pnp);
  await pagePnp.goto(`${ORIGEN}/panel/operador/incidentes`);
  await pagePnp.getByRole('link', { name: new RegExp(desconocida.referencia) }).waitFor();
  verificar((await pagePnp.getByRole('table').textContent()).includes('Simultánea'), 'PNP ve el accidente como simultánea');
  for (const ancho of [1440, 900, 360]) await capturar(pagePnp, 'bandeja', ancho);
  await capturar(pagePnp, 'bandeja', 1280, true);
  await pagePnp.evaluate(() => { document.documentElement.style.fontSize = ''; });
  const recorrido = [];
  await pagePnp.getByRole('button', { name: 'Actualizar', exact: true }).focus();
  for (let i = 0; i < 3; i++) {
    await pagePnp.keyboard.press('Tab');
    recorrido.push(await pagePnp.evaluate(() => { const el = document.activeElement; const css = getComputedStyle(el, '::after'); return { enlace: el.classList.contains('incident-list-link'), foco: css.outlineStyle !== 'none' || css.boxShadow !== 'none' }; }));
  }
  verificar(recorrido.every(r => r.enlace && r.foco), 'Bandeja: tres filas alcanzables con Tab y foco visible');
  await pagePnp.getByRole('link', { name: new RegExp(accidente.referencia) }).focus();
  await pagePnp.keyboard.press('Enter');
  await pagePnp.getByRole('heading', { name: 'Condición médica' }).waitFor();
  for (const ancho of [1440, 360]) await capturar(pagePnp, 'resumen', ancho);
  await capturar(pagePnp, 'resumen', 1280, true);
  const seguimiento = await fetch(`${ORIGEN}/api/v1/publico/seguimiento`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referencia: accidente.referencia, codigo: accidente.codigoSeguimiento }) });
  verificar((await seguimiento.json()).institucionResponsable?.institucion?.id === 'samu', 'Seguimiento real muestra SAMU');
  const pageAdmin = await ingresar(admin);
  await pageAdmin.getByRole('button', { name: /Designar sede de SAMU/ }).waitFor();
  for (const ancho of [1440, 360]) await capturar(pageAdmin, 'pendientes', ancho);
  await capturar(pageAdmin, 'pendientes', 1280, true);
  await pageAdmin.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await pageAdmin.getByRole('button', { name: /Designar sede de SAMU/ }).focus();
  await pageAdmin.keyboard.press('Enter');
  await pageAdmin.getByLabel('Sede habilitada').waitFor();
  verificar(await pageAdmin.getByRole('dialog').isVisible(), 'Designación en diálogo modal nativo');
  await pageAdmin.keyboard.press('Escape');
  verificar(await pageAdmin.getByRole('button', { name: /Designar sede de SAMU/ }).evaluate(e => e === document.activeElement), 'Escape cierra el diálogo y devuelve el foco');
  await pageAdmin.keyboard.press('Enter');
  await pageAdmin.getByLabel('Sede habilitada').waitFor();
  for (const ancho of [1440, 360]) await capturar(pageAdmin, 'designacion', ancho);
  await pageAdmin.getByLabel('Sede habilitada').focus();
  await pageAdmin.keyboard.press('Shift+Tab');
  verificar(await pageAdmin.getByRole('dialog').evaluate(e => e.contains(document.activeElement)), 'Shift+Tab conserva el foco dentro del diálogo');
  await pageAdmin.getByLabel('Sede habilitada').focus();
  await pageAdmin.getByLabel('Sede habilitada').selectOption(sedeSamu);
  await pageAdmin.keyboard.press('Tab');
  verificar(await pageAdmin.getByLabel('Motivo de la designación').evaluate(e => e === document.activeElement), 'Designación: Tab pasa del selector al motivo');
  await pageAdmin.getByLabel('Motivo de la designación').fill('Prueba local: designación fuera de cobertura distrital.');
  await pageAdmin.keyboard.press('Tab');
  await pageAdmin.keyboard.press('Enter');
  await pageAdmin.getByText(`Sede designada para ${pendiente.referencia}`).waitFor();
  const resuelto = await bd.query('SELECT resultado FROM enrutamientos_incidente WHERE incidente_id=$1', [pendiente.id]);
  verificar(resuelto.rows[0].resultado === 'ENRUTADO', 'Pendiente resuelto mediante designación desde la web');
  const auditado = await bd.query("SELECT 1 FROM participaciones_incidente WHERE incidente_id=$1 AND sede_id=$2 AND origen='designacion' AND designado_por=$3 AND motivo IS NOT NULL", [pendiente.id, sedeSamu, admin.id]);
  verificar(auditado.rowCount === 1, 'Designación persistida con administrador y motivo');
  await pageSamu.reload();
  await pageSamu.getByRole('link', { name: new RegExp(pendiente.referencia) }).waitFor();
  verificar(true, 'SAMU ve el caso designado fuera de su cobertura');
  // EQ-19: Otra emergencia sin distrito permanece pendiente y solo recibe la sede designada.
  const serenazgo = await cuenta('operador', 'serenazgo');
  const sedeSerenazgo = await sede('serenazgo', serenazgo, admin, ['otra-emergencia'], []);
  const otra = await registrar({ latitud: 1, longitud: 3 }, 'no', 'otra-emergencia');
  await pageAdmin.reload();
  await pageAdmin.getByRole('button', { name: /Designar sede de Serenazgo/ }).click();
  await pageAdmin.getByLabel('Sede habilitada').selectOption(sedeSerenazgo);
  await pageAdmin.getByLabel('Motivo de la designación').fill('Prueba local: punto fuera del catálogo, designación de Serenazgo.');
  await pageAdmin.getByRole('button', { name: 'Designar sede', exact: true }).click();
  await pageAdmin.getByText(`Sede designada para ${otra.referencia}`).waitFor();
  const estadoOtra = await bd.query('SELECT resultado FROM enrutamientos_incidente WHERE incidente_id=$1', [otra.id]);
  verificar(estadoOtra.rows[0].resultado === 'ENRUTADO', 'EQ-19: Otra emergencia sin distrito resuelta designando Serenazgo');
  const pageSerenazgo = await ingresar(serenazgo);
  await pageSerenazgo.goto(`${ORIGEN}/panel/operador/incidentes`);
  await pageSerenazgo.getByRole('link', { name: new RegExp(otra.referencia) }).waitFor();
  verificar(true, 'EQ-19: Serenazgo ve el caso designado sin cobertura distrital');
  writeFileSync(join(RAIZ, 'docs/validacion/p4/recorrido-api-local.json'), JSON.stringify({ fecha: new Date().toISOString(), revision: 'estado local sin commit sobre e0f6694', navegador: await browser.version(), entorno: 'API real (main.ts), PostgreSQL local *_test, Vite y Chrome; correo en memoria, datos y geometrías sintéticos', pasos, recorridoTeclado: recorrido, fichas }, null, 2) + '\n');
  console.log(`P4.2 local: ${pasos.length} comprobaciones aprobadas, ${fichas.length} capturas.`);
} finally {
  await browser?.close();
  await bd.end();
  for (const h of hijos) if (h.pid) spawnSync('taskkill', ['/pid', String(h.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
}
