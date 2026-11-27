// Recorrido P5.1 con API real, PostgreSQL *_test y navegador. Ejecutar sin otras suites de BD.
// Desde apps/web: node e2e/evaluacion-local.mjs
// Recrea SOLO datos de la base TEST_DATABASE_URL. No usa proveedores externos. El registro se hace
// por la API con una cuenta ciudadana sintética (el recorrido Flutter se documenta aparte).
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
const SALIDA = resolve(RAIZ, 'docs/validacion/p5/capturas-api-local');
const req = createRequire(join(API, 'package.json'));
const { parse } = req('dotenv');
const { Client } = req('pg');
const { hash, Algorithm } = req('@node-rs/argon2');
const config = parse(readFileSync(join(API, '.env')));
const url = process.env.TEST_DATABASE_URL ?? config.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Se requiere TEST_DATABASE_URL local y aislada.');
const ORIGEN = 'http://localhost:5177';
const PUERTO_API = 3117;
const clave = 'contraseña-de-fixture-p5-local-123';
const env = { ...process.env, NODE_ENV: 'development', DATABASE_URL: url, PORT: String(PUERTO_API),
  EMAIL_ADAPTER: 'prueba', WEB_ORIGIN: ORIGEN, WEB_PUBLIC_URL: ORIGEN, API_PUBLIC_URL: `http://127.0.0.1:${PUERTO_API}`,
  RATE_LIMIT_HMAC_SECRET: 'secreto-p5-local-de-al-menos-32-caracteres', TRACKING_CODE_HMAC_SECRET: 'seguimiento-p5-local-de-al-menos-32-caracteres' };
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!chrome) throw new Error('Configura CHROME_PATH.');
const hijos = [];
let browser;
const fichas = [];
const pasos = [];
const bd = new Client({ connectionString: url });
const axe = readFileSync(join(WEB, 'node_modules/axe-core/axe.min.js'), 'utf8');
const SANITARIO = /Signos de vida|consciente|sangrado|Informe de la unidad/i;
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
  const correo = `${sufijo}-p5@ejemplo.test`;
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
async function esperarEnrutado(id) {
  for (let i = 0; i < 120; i++) {
    if ((await bd.query('SELECT 1 FROM enrutamientos_incidente WHERE incidente_id=$1', [id])).rowCount) return;
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
  verificar(!violaciones.length, `${nombre} ${ancho}${texto ? ' texto200' : ''}: axe sin infracciones (${JSON.stringify(violaciones)})`);
  const archivo = `${nombre}-${ancho}${texto ? '-texto200' : ''}.png`;
  await page.screenshot({ path: join(SALIDA, archivo), fullPage: true });
  fichas.push({ nombre, ancho, texto200: texto, archivo, ...medidas, violaciones });
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.setViewportSize({ width: 1440, height: 900 });
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
  const autor = await cuenta('ciudadano', 'autor');
  await sede('samu', samu, admin, ['accidente-transito'], ['DIS-01']);
  await sede('pnp', pnp, admin, ['accidente-transito'], ['DIS-01']);
  lanzar(API, [join(API, 'node_modules/tsx/dist/cli.mjs'), 'src/main.ts'], env);
  lanzar(WEB, [join(WEB, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port', '5177'], { ...process.env, API_DEV_URL: `http://127.0.0.1:${PUERTO_API}` });
  await esperar(`${ORIGEN}/api/v1/publico/contenido`);

  // 1. El autor con cuenta registra un accidente con heridos «No sé».
  const token = (await (await fetch(`${ORIGEN}/api/v1/auth/ciudadanos/sesiones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: autor.correo, contrasena: clave }) })).json()).token;
  const alta = await fetch(`${ORIGEN}/api/v1/incidentes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ categoriaId: 'accidente-transito', descripcion: 'Prueba local sintética: choque de dos autos, sin operación real.', ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60000).toISOString() }, punto: { latitud: 1, longitud: 1, origen: 'manual' }, heridos: 'no_se' }) });
  verificar(alta.status === 201, `Registro con cuenta confirmado (estado ${alta.status})`);
  const { referencia } = await alta.json();
  const id = (await bd.query('SELECT id FROM incidentes WHERE referencia=$1', [referencia])).rows[0].id;
  await esperarEnrutado(id);

  // 2. Llega a PNP con la revisión pendiente.
  browser = await chromium.launch({ executablePath: chrome, headless: true });
  const pagePnp = await ingresar(pnp);
  await pagePnp.goto(`${ORIGEN}/panel/operador/incidentes`);
  await pagePnp.getByRole('link', { name: new RegExp(referencia) }).waitFor();
  const filaPnp = await pagePnp.getByRole('table').textContent();
  verificar(filaPnp.includes('Principal') && filaPnp.includes('Condición médica por confirmar'), 'PNP recibe el accidente como principal con la condición por confirmar');

  // 3. PNP precisa heridos Sí con motivo, solo con teclado dentro del diálogo.
  await pagePnp.getByRole('link', { name: new RegExp(referencia) }).click();
  await pagePnp.getByRole('heading', { name: 'Condición médica' }).waitFor();
  for (const ancho of [1440, 360]) await capturar(pagePnp, 'resumen-pnp-antes', ancho);
  await pagePnp.getByRole('button', { name: 'Precisar condición médica' }).focus();
  await pagePnp.keyboard.press('Enter');
  const dialogo = pagePnp.getByRole('dialog');
  await dialogo.waitFor();
  const grupoHeridos = dialogo.getByRole('group', { name: '¿Hay personas heridas?' });
  await grupoHeridos.getByRole('radio', { name: 'Sí' }).focus();
  await pagePnp.keyboard.press('Space');
  verificar(await grupoHeridos.getByRole('radio', { name: 'Sí' }).isChecked(), 'Teclado: Espacio marca «Sí» en el grupo de heridos');
  await dialogo.getByRole('radio', { name: '2', exact: true }).check();
  await dialogo.getByLabel('Motivo').fill('Prueba local: confirmado por llamada al lugar.');
  for (const ancho of [1440, 360]) await capturar(pagePnp, 'dialogo-precisar', ancho);
  await dialogo.getByLabel('Motivo').focus();
  await pagePnp.keyboard.press('Shift+Tab');
  verificar(await dialogo.evaluate(e => e.contains(document.activeElement)), 'Shift+Tab conserva el foco dentro del diálogo');
  await dialogo.getByRole('button', { name: 'Guardar' }).click();
  await pagePnp.getByText('Condición precisada. SAMU fue incorporado al caso.').waitFor();
  verificar(true, 'La web informa que SAMU fue incorporado');

  // 4. SAMU aparece como principal y PNP como simultánea.
  await pagePnp.getByText('Simultánea').first().waitFor();
  verificar(true, 'El resumen PNP muestra su papel actualizado a simultánea');
  const samuPrincipal = await bd.query("SELECT institucion, papel FROM participaciones_incidente WHERE incidente_id=$1 ORDER BY institucion", [id]);
  verificar(JSON.stringify(samuPrincipal.rows) === JSON.stringify([{ institucion: 'pnp', papel: 'simultanea' }, { institucion: 'samu', papel: 'principal' }]), 'Persistido: SAMU principal y PNP simultánea');
  const pageSamu = await ingresar(samu);
  await pageSamu.goto(`${ORIGEN}/panel/operador/incidentes`);
  await pageSamu.getByRole('link', { name: new RegExp(referencia) }).waitFor();
  verificar((await pageSamu.getByRole('table').textContent()).includes('Principal'), 'SAMU ve el accidente como principal en su bandeja');

  // 5. El autor ve SAMU como responsable y la solicitud de completar.
  const detalle = await (await fetch(`${ORIGEN}/api/v1/ciudadano/incidentes/${referencia}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  verificar(detalle.institucionResponsable?.institucion?.id === 'samu', 'El autor ve SAMU como institución responsable');
  verificar(detalle.evaluacion?.solicitudCompletar === true && !JSON.stringify(detalle).includes('confirmado por llamada'), 'El autor recibe la solicitud de completar sin la precisión ni el motivo');

  // 6. El autor completa la evaluación.
  const aclaracion = await fetch(`${ORIGEN}/api/v1/ciudadano/incidentes/${referencia}/evaluacion`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ personaPrincipal: { consciente: 'no_se', signosVida: 'observados' } }) });
  verificar(aclaracion.status === 200, 'El autor completa la evaluación (200)');

  // 7. SAMU ve las tres versiones y registra una aclaración.
  await pageSamu.getByRole('link', { name: new RegExp(referencia) }).click();
  const seccion = pageSamu.getByRole('region', { name: 'Evaluación rápida' });
  await seccion.getByText(/Versión 3 · informada el/).waitFor();
  verificar((await seccion.locator('ol.linea-tiempo > li').count()) === 3, 'SAMU ve el historial con tres versiones');
  for (const ancho of [1440, 360]) await capturar(pageSamu, 'resumen-samu', ancho);
  await capturar(pageSamu, 'resumen-samu', 1280, true);
  await seccion.getByRole('button', { name: 'Registrar aclaración' }).click();
  const dialogoSamu = pageSamu.getByRole('dialog');
  await dialogoSamu.getByRole('group', { name: '¿Hay sangrado visible?' }).getByRole('radio', { name: 'Sí' }).check();
  await dialogoSamu.getByLabel('Motivo').fill('Informe de la unidad en el lugar.');
  await capturar(pageSamu, 'dialogo-aclaracion-samu', 1440);
  await dialogoSamu.getByRole('button', { name: 'Guardar' }).click();
  await pageSamu.getByText('Aclaración registrada.').waitFor();
  await seccion.getByText(/Versión 4 · informada el/).waitFor();
  verificar(true, 'SAMU registra la aclaración (versión 4)');

  // 8. PNP sigue sin ver las observaciones.
  await pagePnp.reload();
  await pagePnp.getByRole('heading', { name: 'Condición médica' }).waitFor();
  const textoPnp = await pagePnp.locator('main').textContent();
  verificar(!SANITARIO.test(textoPnp), 'PNP no ve observaciones de la persona principal ni motivos');
  verificar((await pagePnp.getByRole('region', { name: 'Evaluación rápida' }).count()) === 0, 'PNP no tiene la sección de evaluación');
  for (const ancho of [1440, 360]) await capturar(pagePnp, 'resumen-pnp-despues', ancho);
  await capturar(pagePnp, 'resumen-pnp-despues', 1280, true);

  const versiones = await bd.query('SELECT version, origen, institucion FROM versiones_evaluacion WHERE incidente_id=$1 ORDER BY version', [id]);
  verificar(versiones.rows.map(v => `${v.version}:${v.origen}:${v.institucion ?? '-'}`).join(',') === '1:ciudadano:-,2:operador:pnp,3:ciudadano:-,4:operador:samu', 'Versiones persistidas 1 a 4 con su origen');
  writeFileSync(join(RAIZ, 'docs/validacion/p5/recorrido-api-local.json'), JSON.stringify({ fecha: new Date().toISOString(), revision: 'estado local sin commit sobre 24a33f6', navegador: await browser.version(), entorno: 'API real (main.ts), PostgreSQL local *_test, Vite y Chrome; correo en memoria, datos y geometrías sintéticos; registro por API con cuenta ciudadana', pasos, fichas }, null, 2) + '\n');
  console.log(`P5.1 local: ${pasos.length} comprobaciones aprobadas, ${fichas.length} capturas.`);
} finally {
  await browser?.close();
  await bd.end();
  for (const h of hijos) if (h.pid) spawnSync('taskkill', ['/pid', String(h.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
}
