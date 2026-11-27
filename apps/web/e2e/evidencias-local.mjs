// Recorrido P5.2 con API real, PostgreSQL *_test y navegador. Ejecutar sin otras suites de BD.
// Desde apps/web: node e2e/evidencias-local.mjs [--memoria]
// Por defecto usa Cloudinary real (EVIDENCIAS_ADAPTADOR=cloudinary con las credenciales del .env, nunca
// impresas): solo imagenes sinteticas bajo aynisafe/. Al terminar marca las fotos del recorrido para
// eliminacion y reinicia la API para que la limpieza real las borre por su public_id registrado.
// Con --memoria usa el doble y no toca ningun proveedor externo.
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
const SALIDA = resolve(RAIZ, 'docs/validacion/p5/capturas-evidencias');
const req = createRequire(join(API, 'package.json'));
const { parse } = req('dotenv');
const { Client } = req('pg');
const sharp = req('sharp');
const { hash, Algorithm } = req('@node-rs/argon2');
const config = parse(readFileSync(join(API, '.env')));
const url = process.env.TEST_DATABASE_URL ?? config.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Se requiere TEST_DATABASE_URL local y aislada.');
const MEMORIA = process.argv.includes('--memoria');
const ORIGEN = 'http://localhost:5178';
const PUERTO_API = 3118;
const clave = 'contraseña-de-fixture-p52-local-123';
const env = { ...process.env, NODE_ENV: 'development', DATABASE_URL: url, PORT: String(PUERTO_API),
  EMAIL_ADAPTER: 'prueba', WEB_ORIGIN: ORIGEN, WEB_PUBLIC_URL: ORIGEN, API_PUBLIC_URL: `http://127.0.0.1:${PUERTO_API}`,
  RATE_LIMIT_HMAC_SECRET: 'secreto-p52-local-de-al-menos-32-caracteres', TRACKING_CODE_HMAC_SECRET: 'seguimiento-p52-local-de-al-menos-32-caracteres',
  EVIDENCIAS_ADAPTADOR: MEMORIA ? 'memoria' : 'cloudinary',
  ...(MEMORIA ? {} : { CLOUDINARY_CLOUD_NAME: config.CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY: config.CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET: config.CLOUDINARY_API_SECRET }) };
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!chrome) throw new Error('Configura CHROME_PATH.');
let api;
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
  return h;
}
function detener(h) { if (h?.pid) spawnSync('taskkill', ['/pid', String(h.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); }
const iniciarApi = () => (api = lanzar(API, [join(API, 'node_modules/tsx/dist/cli.mjs'), 'src/main.ts'], env));
async function esperar(direccion) {
  for (let i = 0; i < 160; i++) {
    try { if ((await fetch(direccion)).status < 500) return; } catch { /* arranque */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('El servidor local no inició.');
}
async function cuenta(rol, sufijo) {
  const correo = `${sufijo}-p52@ejemplo.test`;
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
/**
 * Retira del proveedor todo lo registrado en esta BD de prueba y aún no eliminado: lo marca para
 * eliminación y reinicia la API, cuya limpieza borra solo por public_id registrado. También corre si el
 * recorrido falla, para no dejar objetos en la cuenta compartida.
 */
async function retirarDelProveedor() {
  await bd.query("UPDATE evidencias_incidente SET estado='eliminacion_pendiente', motivo_eliminacion=coalesce(motivo_eliminacion,'plazo'), proximo_intento_en=now() WHERE estado IN ('disponible','pendiente') AND creada_en > now() - interval '15 minutes'");
  await bd.query("UPDATE evidencias_incidente SET proximo_intento_en=now() WHERE estado='eliminacion_pendiente'");
  detener(api);
  iniciarApi();
  await esperar(`http://127.0.0.1:${PUERTO_API}/api/v1/publico/contenido`);
  for (let i = 0; i < 120; i++) {
    const quedan = (await bd.query("SELECT count(*)::int n FROM evidencias_incidente WHERE estado <> 'eliminada'")).rows[0].n;
    if (!quedan) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}
/** Foto sintética: degradado con un texto de prueba y EXIF GPS ficticio (no son datos reales). */
async function foto(n) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><defs><linearGradient id="g"><stop offset="0" stop-color="#${['2b6e64', '365cc9', 'b64930'][n]}"/><stop offset="1" stop-color="#eff6f7"/></linearGradient></defs><rect width="960" height="640" fill="url(#g)"/><text x="40" y="120" font-size="64" font-family="sans-serif" fill="#fff">Foto sintética ${n + 1}</text></svg>`;
  return sharp(Buffer.from(svg)).withExif({ IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '13/1 9/1 30/1' } }).jpeg({ quality: 82 }).toBuffer();
}
async function subir(referencia, bytes, cred) {
  const fd = new FormData();
  fd.append('foto', new Blob([bytes], { type: 'image/jpeg' }), 'foto.jpg');
  return fetch(`${ORIGEN}/api/v1/incidentes/${referencia}/evidencias`, { method: 'POST', body: fd, headers: { 'Idempotency-Key': randomUUID(), ...cred } });
}
async function registrar(cuerpo, token) {
  const r = await fetch(`${ORIGEN}/api/v1/incidentes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(cuerpo) });
  verificar(r.status === 201, `Registro ${token ? 'con cuenta' : 'de invitado'} confirmado (${r.status})`);
  return r.json();
}
const resumenCuerpo = (extra = {}) => ({ categoriaId: 'robo', descripcion: 'Prueba local sintética de P5.2: robo sin operación real.', ocurrencia: { modo: 'ahora', instante: new Date(Date.now() - 60000).toISOString() }, punto: { latitud: 1, longitud: 1, origen: 'manual' }, ...extra });
let resumen = { proveedor: MEMORIA ? 'memoria (doble, no valida Cloudinary)' : 'cloudinary (cuenta real, entorno de prueba)' };
if (process.argv.includes('--limpiar')) {
  await bd.connect();
  try {
    const ok = await retirarDelProveedor();
    console.log(ok ? 'Objetos registrados retirados del proveedor.' : 'QUEDAN objetos registrados sin retirar.');
  } finally {
    await bd.end();
    for (const h of hijos) detener(h);
  }
  process.exit(0);
}
try {
  mkdirSync(SALIDA, { recursive: true });
  const migrar = spawnSync(process.execPath, [req.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { cwd: API, env, stdio: 'pipe' });
  if (migrar.status !== 0) throw new Error('Falló la migración de la base _test.');
  const preparar = spawnSync(process.execPath, [join(API, 'node_modules/tsx/dist/cli.mjs'), 'test/fixtures/preparar-p4-local.ts'], { cwd: API, env, stdio: 'pipe' });
  if (preparar.status !== 0) throw new Error('Falló la preparación de datos sintéticos.');
  await bd.connect();
  const admin = await cuenta('administrador', 'admin');
  const pnp = await cuenta('operador', 'pnp');
  const bomberos = await cuenta('operador', 'bomberos');
  const autor = await cuenta('ciudadano', 'autor');
  await sede('pnp', pnp, admin, ['robo'], ['DIS-01']);
  await sede('bomberos', bomberos, admin, ['incendio'], ['DIS-01']);
  iniciarApi();
  lanzar(WEB, [join(WEB, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port', '5178'], { ...process.env, API_DEV_URL: `http://127.0.0.1:${PUERTO_API}` });
  await esperar(`${ORIGEN}/api/v1/publico/contenido`);

  // 1. Cuenta: registro y tres fotos; la cuarta se rechaza.
  const token = (await (await fetch(`${ORIGEN}/api/v1/auth/ciudadanos/sesiones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: autor.correo, contrasena: clave }) })).json()).token;
  const conCuenta = await registrar(resumenCuerpo(), token);
  const fotos = [await foto(0), await foto(1), await foto(2)];
  for (let i = 0; i < 3; i++) {
    const r = await subir(conCuenta.referencia, fotos[i], { Authorization: `Bearer ${token}` });
    verificar(r.status === 201, `Cuenta: foto ${i + 1} adjuntada (${r.status})`);
  }
  verificar((await subir(conCuenta.referencia, fotos[0], { Authorization: `Bearer ${token}` })).status === 409, 'Cuenta: la cuarta foto se rechaza con 409');

  // 2. Invitado: registro con permiso y tres fotos.
  const invitado = await registrar(resumenCuerpo({ telefonoContacto: '987654321' }));
  verificar(typeof invitado.permisoEvidencias?.valor === 'string', 'Invitado: el comprobante trae el permiso de carga');
  for (let i = 0; i < 3; i++) {
    const r = await subir(invitado.referencia, fotos[i], { 'X-Permiso-Evidencias': invitado.permisoEvidencias.valor });
    verificar(r.status === 201, `Invitado: foto ${i + 1} adjuntada (${r.status})`);
  }

  const idCuenta = (await bd.query('SELECT id FROM incidentes WHERE referencia=$1', [conCuenta.referencia])).rows[0].id;
  await esperarEnrutado(idCuenta);
  const filas = (await bd.query("SELECT public_id, estado, proveedor FROM evidencias_incidente ORDER BY creada_en")).rows;
  verificar(filas.length === 6 && filas.every(f => f.estado === 'disponible' && /^aynisafe\//.test(f.public_id) && f.proveedor === (MEMORIA ? 'memoria' : 'cloudinary')), 'Seis evidencias disponibles bajo aynisafe/ en el proveedor configurado');

  // 3. El autor obtiene su foto, sin EXIF.
  const detalle = await (await fetch(`${ORIGEN}/api/v1/ciudadano/incidentes/${conCuenta.referencia}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  verificar(detalle.evidencias?.length === 3, 'El autor ve los metadatos de sus 3 fotos');
  const propia = await fetch(`${ORIGEN}/api/v1/ciudadano/incidentes/${conCuenta.referencia}/evidencias/${detalle.evidencias[0].id}/contenido`, { headers: { Authorization: `Bearer ${token}` } });
  const bytesPropios = Buffer.from(await propia.arrayBuffer());
  verificar(propia.status === 200 && propia.headers.get('cache-control') === 'no-store', 'El autor obtiene su foto con no-store');
  verificar(!(await sharp(bytesPropios).metadata()).exif, 'La foto entregada no tiene EXIF');
  verificar(!JSON.stringify([...propia.headers]).match(/cloudinary|res\.|aynisafe\//), 'La entrega no expone URLs ni identificadores del proveedor');

  // 4. Bomberos (no participa) recibe 404 por URL directa.
  browser = await chromium.launch({ executablePath: chrome, headless: true });
  const pageBomberos = await ingresar(bomberos);
  const directa = await pageBomberos.evaluate(async ([id, ev]) => (await fetch(`/api/v1/operador/incidentes/${id}/evidencias/${ev}/contenido`)).status, [idCuenta, detalle.evidencias[0].id]);
  verificar(directa === 404, 'Bomberos sin participación recibe 404 por URL directa');

  // 5. PNP (participante) ve «Fotografías» en el panel y la amplía con teclado.
  const pagePnp = await ingresar(pnp);
  await pagePnp.goto(`${ORIGEN}/panel/operador/incidentes/${idCuenta}`);
  const seccion = pagePnp.getByRole('region', { name: 'Fotografías' });
  await seccion.getByRole('img', { name: 'Fotografía 3 enviada por el ciudadano' }).waitFor();
  verificar(await seccion.getByRole('img').count() === 3, 'PNP ve las 3 fotografías en el resumen');
  const html = await seccion.innerHTML();
  // Las imágenes usan URL de objeto (blob:) del propio navegador; ninguna otra URL ni identificador del proveedor.
  verificar(!/cloudinary|aynisafe\//.test(html) && !/src="(?!blob:)/.test(html), 'El panel no contiene URLs ni identificadores del proveedor');
  for (const ancho of [1440, 360]) await capturar(pagePnp, 'resumen-fotografias', ancho);
  await capturar(pagePnp, 'resumen-fotografias', 1280, true);
  const boton = seccion.getByRole('button', { name: 'Ampliar fotografía 1 enviada por el ciudadano' });
  await boton.focus();
  await pagePnp.keyboard.press('Enter');
  const dialogo = pagePnp.getByRole('dialog', { name: 'Fotografía 1 enviada por el ciudadano' });
  await dialogo.waitFor();
  for (const ancho of [1440, 360]) await capturar(pagePnp, 'fotografia-ampliada', ancho);
  await pagePnp.keyboard.press('Escape');
  await dialogo.waitFor({ state: 'detached' });
  verificar(await boton.evaluate(e => e === document.activeElement), 'Escape cierra la ampliación y el foco vuelve a la miniatura');
  const almacenado = await pagePnp.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  verificar(!/blob:|foto|evidenc/i.test(almacenado), 'El navegador no guarda las fotos en su almacenamiento');
  const accesos = (await bd.query("SELECT count(*)::int n FROM accesos_evidencia WHERE rol='operador'")).rows[0].n;
  verificar(accesos >= 3, `Lecturas del operador auditadas (${accesos})`);

  // 6. Huérfana provocada y limpieza tras reiniciar la API: también borra las 6 del recorrido por su public_id.
  // Huérfana: una carga que nunca se confirmó, en un incidente sin fotos (simula una caída entre fases).
  const sinFotos = await registrar(resumenCuerpo(), token);
  await bd.query(`INSERT INTO evidencias_incidente(id,incidente_id,ranura,public_id,proveedor,estado,tipo_medio,bytes,ancho,alto,sha256,huella_carga,clave_idempotencia,modalidad,autor_usuario_id,creada_en)
    SELECT gen_random_uuid(), i.id, 1, 'aynisafe/' || gen_random_uuid(), $2, 'pendiente', 'image/jpeg', 10, 1, 1, repeat('a',64), repeat('b',64), gen_random_uuid(), 'cuenta', $3, now() - interval '20 minutes'
    FROM incidentes i WHERE i.referencia = $1`, [sinFotos.referencia, MEMORIA ? 'memoria' : 'cloudinary', autor.id]);
  // Las del recorrido se retiran al terminar (motivo plazo, como lo hará P9) para no dejar objetos en la cuenta compartida.
  await bd.query("UPDATE evidencias_incidente SET estado='eliminacion_pendiente', motivo_eliminacion='plazo', proximo_intento_en=now() WHERE estado='disponible'");
  detener(api);
  iniciarApi();
  await esperar(`${ORIGEN}/api/v1/publico/contenido`);
  let estados = [];
  for (let i = 0; i < 120; i++) {
    estados = (await bd.query('SELECT estado, motivo_eliminacion FROM evidencias_incidente')).rows;
    if (estados.every(e => e.estado === 'eliminada')) break;
    await new Promise(r => setTimeout(r, 500));
  }
  verificar(estados.length === 7 && estados.every(e => e.estado === 'eliminada'), 'Al reiniciar, la limpieza elimina la huérfana y las 6 fotos por su public_id registrado');
  verificar(estados.filter(e => e.motivo_eliminacion === 'huerfana').length === 1, 'La pendiente de más de 15 min se elimina como huérfana');
  const tras = await fetch(`${ORIGEN}/api/v1/ciudadano/incidentes/${conCuenta.referencia}/evidencias/${detalle.evidencias[0].id}/contenido`, { headers: { Authorization: `Bearer ${token}` } });
  verificar(tras.status === 404, 'Tras la eliminación la foto ya no se entrega (404)');

  resumen = { ...resumen, evidenciasCreadas: 6, huerfanasProvocadas: 1, eliminadasAlFinal: estados.length };
  writeFileSync(join(RAIZ, 'docs/validacion/p5/recorrido-evidencias-local.json'), JSON.stringify({ fecha: new Date().toISOString(), revision: 'estado local sin commit sobre ecbaea7', navegador: await browser.version(), entorno: 'API real (main.ts), PostgreSQL local *_test, Vite y Chrome; correo en memoria; datos, geometrías e imágenes sintéticos', ...resumen, pasos, fichas }, null, 2) + '\n');
  console.log(`P5.2 local (${resumen.proveedor}): ${pasos.length} comprobaciones aprobadas, ${fichas.length} capturas.`);
} catch (e) {
  // Recorrido fallido: primero se retiran los objetos del proveedor y después se informa el fallo.
  if (!MEMORIA) {
    const ok = await retirarDelProveedor().catch(() => false);
    console.error(ok ? 'Recorrido fallido; objetos del recorrido retirados del proveedor.' : 'Recorrido fallido; QUEDAN objetos registrados sin retirar.');
  }
  throw e;
} finally {
  await browser?.close();
  await bd.end();
  for (const h of hijos) detener(h);
}
