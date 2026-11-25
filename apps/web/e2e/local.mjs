// Prueba de extremo a extremo LOCAL (no corre en CI: necesita PostgreSQL y un navegador).
//
// Levanta la API real contra la base aislada de pruebas, el servidor de desarrollo de Vite (que hace de
// "mismo origen" con su proxy) y controla Chrome con playwright-core. Recorre: bootstrap del administrador
// -> activacion -> acceso -> refrescar -> panel -> cierre -> ciudadano rechazado -> operador en el panel ajeno
// -> administrador suspendido, y comprueba cookies, ausencia de llamadas de origen cruzado y zoom al 200 %.
//
// Uso (desde apps/web):  node e2e/local.mjs
// Requiere: apps/api con dependencias instaladas y TEST_DATABASE_URL en apps/api/.env (base *_test), y Chrome.
// No imprime correos, tokens, contrasenas ni la cadena de conexion.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const AQUI = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(AQUI, '..');
const API = resolve(WEB, '../api');
const requiereApi = createRequire(join(API, 'package.json'));
const { Client } = requiereApi('pg');
const { hash, Algorithm } = requiereApi('@node-rs/argon2');

const CHROME = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!CHROME) throw new Error('No se encontro Chrome ni Edge (define CHROME_PATH).');

const PUERTO_API = 3100;
// Origin por defecto de la API en desarrollo; E2E_PUERTO_WEB permite ejecutarlo junto a un `npm run dev` abierto.
const PUERTO_WEB = Number(process.env.E2E_PUERTO_WEB ?? 5173);
const ORIGEN = `http://localhost:${PUERTO_WEB}`;
const CORREO_ADMIN = 'admin-e2e@ejemplo.com';
const CORREO_OPERADOR = 'operador-e2e@ejemplo.com';
const CORREO_CIUDADANO = 'ciudadano-e2e@ejemplo.com';
const CLAVE_ADMIN = 'contraseña-del-administrador-e2e-1';
const CLAVE_FIXTURE = 'contraseña-de-fixture-e2e-123';

function leerEnvApi() {
  const texto = readFileSync(join(API, '.env'), 'utf8');
  const env = {};
  for (const l of texto.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const envApi = leerEnvApi();
const URL_BD = envApi.TEST_DATABASE_URL;
if (!URL_BD || !new URL(URL_BD).pathname.endsWith('_test')) throw new Error('Falta TEST_DATABASE_URL (base *_test) en apps/api/.env');
const CARPETA_CORREOS = mkdtempSync(join(tmpdir(), 'ayni-e2e-correos-'));

const entornoApi = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  TEMP: process.env.TEMP,
  NODE_ENV: 'development',
  PORT: String(PUERTO_API),
  DATABASE_URL: URL_BD,
  RATE_LIMIT_HMAC_SECRET: 'secreto-e2e-local-de-al-menos-32-caracteres-xx',
  EMAIL_ADAPTER: 'archivo',
  EMAIL_ARCHIVO_DIR: CARPETA_CORREOS,
  WEB_ORIGIN: ORIGEN,
  WEB_PUBLIC_URL: ORIGEN,
  API_PUBLIC_URL: `http://127.0.0.1:${PUERTO_API}`,
};

const hijos = [];
function lanzar(nombre, cwd, args, env) {
  const h = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  h.stdout.on('data', () => undefined);
  h.stderr.on('data', () => undefined);
  hijos.push(h);
  h.on('exit', (c) => {
    if (c && c !== 0 && !cerrando) console.error(`[e2e] ${nombre} termino con codigo ${c}`);
  });
  return h;
}
let cerrando = false;
function matarTodo() {
  cerrando = true;
  for (const h of hijos) if (h.pid) spawnSync('taskkill', ['/pid', String(h.pid), '/T', '/F'], { stdio: 'ignore' });
}

async function esperar(url, ms = 60_000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* aun no */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No respondio a tiempo: ${url}`);
}

function ejecutarCliApi(script, args, extra = {}) {
  return spawnSync(process.execPath, [join(API, 'node_modules/tsx/dist/cli.mjs'), join(API, 'scripts', script), ...args], {
    cwd: API,
    env: { ...entornoApi, ...extra },
    encoding: 'utf8',
  });
}

let ultimoPaso = 'inicio';
const resultados = [];
function comprobar(nombre, condicion, detalle = '') {
  ultimoPaso = nombre;
  resultados.push({ nombre, ok: Boolean(condicion) });
  console.log(`${condicion ? 'OK   ' : 'FALLA'} ${nombre}${!condicion && detalle ? ` -> ${detalle}` : ''}`);
}

async function bd(sql, params = []) {
  const c = new Client({ connectionString: URL_BD });
  await c.connect();
  try {
    return await c.query(sql, params);
  } finally {
    await c.end();
  }
}

async function crearFixture(rol, correo, estado = 'activo') {
  const h = await hash(CLAVE_FIXTURE, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await bd(
    `INSERT INTO usuarios (nombre, correo_normalizado, password_hash, rol, estado, updated_at)
     VALUES ($1, $2, $3, $4::"RolUsuario", $5::"EstadoUsuario", now())`,
    [`Fixture ${rol}`, correo, h, rol, estado],
  );
}

/** Devuelve los elementos que se salen del ancho visible (vacio = sin desplazamiento horizontal). */
async function desbordes(pagina) {
  return pagina.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const fuera = [];
    for (const e of document.querySelectorAll('body *:not(.saltar)')) {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && (r.right > ancho + 1 || r.left < -1)) fuera.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`);
    }
    return [...new Set(fuera)].slice(0, 6).concat(document.documentElement.scrollWidth > ancho + 1 ? ['(scrollWidth)'] : []);
  });
}

async function main() {
  console.log(`[e2e] navegador: ${CHROME.includes('chrome') ? 'Chrome' : 'Edge'}`);
  await bd('TRUNCATE envios_correo, tokens_cuenta, sesiones, usuarios, ventanas_intentos CASCADE');

  lanzar('api', API, [join(API, 'node_modules/tsx/dist/cli.mjs'), 'src/main.ts'], entornoApi);
  lanzar('web', WEB, [join(WEB, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port', String(PUERTO_WEB)], {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    API_DEV_URL: `http://127.0.0.1:${PUERTO_API}`,
  });
  await esperar(`http://127.0.0.1:${PUERTO_API}/api/v1/publico/contenido`);
  await esperar(`${ORIGEN}/`);
  await esperar(`${ORIGEN}/api/v1/publico/contenido`); // a traves del proxy

  // 1. Bootstrap del administrador por el procedimiento controlado (sin contrasena en ningun lado).
  const b = ejecutarCliApi('admin-bootstrap.ts', ['--correo', CORREO_ADMIN, '--nombre', 'Admin E2E']);
  comprobar('bootstrap: termina bien y entrega el correo', b.status === 0 && /resultado=creada/.test(b.stdout) && /envio=enviado/.test(b.stdout), b.stdout);
  const salida = `${b.stdout}\n${b.stderr}`;
  comprobar('bootstrap: la salida no contiene correo, contrasena ni cadena de conexion', ![CORREO_ADMIN, CLAVE_ADMIN, URL_BD, 'postgresql://'].some((s) => salida.includes(s)));
  const archivos = readdirSync(CARPETA_CORREOS).sort();
  const enlace = /http:\/\/\S+/.exec(readFileSync(join(CARPETA_CORREOS, archivos.at(-1)), 'utf8'))?.[0] ?? '';
  comprobar('el correo de activacion apunta a la web (/activar) con el token en el fragmento', enlace.startsWith(`${ORIGEN}/activar#t=`), enlace.replace(/#t=.*/, '#t=<oculto>'));

  await crearFixture('operador', CORREO_OPERADOR);
  await crearFixture('ciudadano', CORREO_CIUDADANO);

  const navegador = await chromium.launch({ executablePath: CHROME, headless: true });
  const contexto = await navegador.newContext({ viewport: { width: 1100, height: 800 }, locale: 'es-PE' });
  const solicitudes = [];
  contexto.on('request', (r) => solicitudes.push(r.url()));
  const respuestasApi = [];
  contexto.on('response', (r) => {
    if (r.url().includes('/api/')) respuestasApi.push(r);
  });
  const pagina = await contexto.newPage();

  try {
    // 2. Portada sin sesion.
    await pagina.goto(`${ORIGEN}/`);
    await pagina.getByRole('heading', { name: 'Finalidad' }).waitFor();
    comprobar('portada sin sesion: finalidad y acceso institucional visibles', await pagina.getByRole('link', { name: 'Acceso institucional' }).isVisible());
    comprobar('portada: el alcance del piloto pendiente se declara no disponible', (await pagina.locator('#piloto').locator('..').textContent())?.includes('Aún no disponible'));

    // 3. Activacion con el enlace del correo.
    await pagina.goto(enlace);
    await pagina.getByLabel('Contraseña nueva').waitFor();
    comprobar('activacion: el fragmento con el token desaparece de la direccion', !pagina.url().includes('#t=') && !pagina.url().includes('t='));
    await pagina.getByLabel('Contraseña nueva').fill(CLAVE_ADMIN);
    await pagina.getByRole('button', { name: 'Activar cuenta' }).click();
    await pagina.getByText('Tu cuenta quedó activa').waitFor();
    comprobar('activacion: la cuenta queda activa sin iniciar sesion', (await bd(`SELECT count(*)::int AS n FROM sesiones`)).rows[0].n === 0);
    await pagina.getByRole('link', { name: 'Ir al acceso institucional' }).click();

    // 4. Acceso del administrador.
    await pagina.getByLabel('Correo').fill(CORREO_ADMIN);
    await pagina.getByLabel('Contraseña').fill(CLAVE_ADMIN);
    await pagina.getByRole('button', { name: 'Ingresar' }).click();
    await pagina.getByRole('heading', { name: 'Panel del administrador' }).waitFor();
    comprobar('acceso: el administrador llega a su panel', pagina.url().endsWith('/panel/administrador'));
    await pagina.getByText('Instituciones y sedes').waitFor();

    const cookies = await contexto.cookies(ORIGEN);
    const sesion = cookies.find((c) => c.name === 'ayni_inst');
    comprobar('cookie: HttpOnly, SameSite=Strict, Path=/ (http local: sin Secure ni prefijo)', sesion && sesion.httpOnly && sesion.sameSite === 'Strict' && sesion.path === '/' && sesion.secure === false, JSON.stringify(sesion && { ...sesion, value: '<oculto>' }));
    comprobar('cookie: la pagina no puede leerla (document.cookie vacio)', (await pagina.evaluate(() => document.cookie)) === '');
    const almacenado = await pagina.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
    comprobar('el navegador no guarda sesion, token ni contrasena (almacenamiento vacio)', almacenado === '[[],[]]');
    const cuerpoLogin = await respuestasApi.find((r) => r.url().endsWith('/institucional/sesiones'))?.text();
    comprobar('el cuerpo del acceso no contiene el token', cuerpoLogin && !cuerpoLogin.includes(sesion.value));
    const setCookie = (await respuestasApi.find((r) => r.url().endsWith('/institucional/sesiones'))?.headerValue('set-cookie')) ?? '';
    comprobar('Set-Cookie sin Domain y con SameSite=Strict', !/domain=/i.test(setCookie) && /SameSite=Strict/i.test(setCookie) && /HttpOnly/i.test(setCookie));

    // 5. Refrescar el navegador conserva la sesion.
    await pagina.reload();
    await pagina.getByRole('heading', { name: 'Panel del administrador' }).waitFor();
    comprobar('refrescar: la sesion se restaura sin pedir credenciales', true);

    // 6. El administrador no entra al panel del operador (la API responde 403).
    await pagina.goto(`${ORIGEN}/panel/operador`);
    await pagina.getByText('No tienes permiso para ver este panel').waitFor();
    comprobar('rol ajeno: la web no muestra el panel y la API respondio 403', respuestasApi.some((r) => r.url().endsWith('/operador/panel') && r.status() === 403));

    // 7. Sin CORS y sin llamadas de origen cruzado.
    const cabecerasCors = (
      await Promise.all(respuestasApi.map(async (r) => [r.url(), Object.keys(await r.allHeaders()).filter((k) => k.startsWith('access-control-'))]))
    ).filter(([, k]) => k.length > 0);
    comprobar('ninguna respuesta de la API lleva Access-Control-*', cabecerasCors.length === 0, JSON.stringify(cabecerasCors.slice(0, 2)));
    comprobar('todas las solicitudes del navegador son del mismo origen', solicitudes.filter((u) => u.startsWith('http')).every((u) => u.startsWith(ORIGEN)), solicitudes.find((u) => !u.startsWith(ORIGEN)));

    // 8. Un Origin ajeno directo contra la API es rechazado (CSRF).
    const ajeno = await fetch(`http://127.0.0.1:${PUERTO_API}/api/v1/auth/institucional/sesiones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://sitio-malicioso.test' },
      body: JSON.stringify({ correo: CORREO_ADMIN, contrasena: CLAVE_ADMIN }),
    });
    comprobar('CSRF: un Origin ajeno recibe 403 y ninguna cookie', ajeno.status === 403 && !ajeno.headers.get('set-cookie'));

    // 9. Cierre de sesion y Atras.
    await pagina.goto(`${ORIGEN}/panel/administrador`);
    await pagina.getByRole('button', { name: /^Cuenta de / }).click();
    await pagina.getByRole('button', { name: 'Cerrar sesión' }).click();
    await pagina.getByRole('heading', { name: 'Finalidad' }).waitFor();
    comprobar('cierre: vuelve a la portada y revoca la sesion en el servidor', (await bd(`SELECT count(*)::int AS n FROM sesiones WHERE revoked_at IS NULL`)).rows[0].n === 0);
    await pagina.goBack();
    await pagina.waitForTimeout(800);
    const textoTrasAtras = (await pagina.locator('body').textContent()) ?? '';
    comprobar('Atras tras cerrar sesion no reabre contenido privado', !textoTrasAtras.includes('Instituciones y sedes') && !textoTrasAtras.includes('Admin E2E'));

    // 10. Ciudadano rechazado con el mismo mensaje general.
    await pagina.goto(`${ORIGEN}/acceso`);
    await pagina.getByLabel('Correo').fill(CORREO_CIUDADANO);
    await pagina.getByLabel('Contraseña').fill(CLAVE_FIXTURE);
    await pagina.getByRole('button', { name: 'Ingresar' }).click();
    await pagina.getByRole('alert').waitFor();
    const mensajeCiudadano = await pagina.getByRole('alert').textContent();
    await pagina.getByLabel('Contraseña').fill('contraseña-incorrecta-123');
    await pagina.getByRole('button', { name: 'Ingresar' }).click();
    await pagina.waitForTimeout(500);
    const mensajeIncorrecta = await pagina.getByRole('alert').textContent();
    comprobar('ciudadano: mismo mensaje general que una contrasena incorrecta, sin sesion', mensajeCiudadano === mensajeIncorrecta && (await bd(`SELECT count(*)::int AS n FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE u.correo_normalizado = $1`, [CORREO_CIUDADANO])).rows[0].n === 0, `${mensajeCiudadano} | ${mensajeIncorrecta}`);
    await pagina.goto(`${ORIGEN}/panel/administrador`);
    await pagina.getByText('Tu sesión no es válida o venció').waitFor();
    comprobar('ciudadano (sin sesion de panel): el panel lleva al acceso con aviso', true);

    // 11. Operador (fixture) en su panel y en el del administrador.
    await pagina.goto(`${ORIGEN}/acceso`);
    await pagina.getByLabel('Correo').fill(CORREO_OPERADOR);
    await pagina.getByLabel('Contraseña').fill(CLAVE_FIXTURE);
    await pagina.getByRole('button', { name: 'Ingresar' }).click();
    await pagina.getByRole('heading', { name: 'Panel del operador' }).waitFor();
    const destinosOperador = pagina.getByRole('navigation', { name: 'Secciones del panel del operador' }).getByRole('link');
    await destinosOperador.first().waitFor();
    comprobar('operador de prueba: llega a su panel con Inicio, Incidentes, Mapa, Indicadores e Historial pendientes',
      (await destinosOperador.count()) === 5 && (await pagina.locator('.nav-pending').count()) === 5);
    await pagina.goto(`${ORIGEN}/panel/administrador`);
    await pagina.getByText('No tienes permiso para ver este panel').waitFor();
    comprobar('operador en el panel del administrador: sin secciones y con 403 de la API', (await pagina.getByText('Instituciones y sedes').count()) === 0 && respuestasApi.some((r) => r.url().endsWith('/administrador/panel') && r.status() === 403));

    // 12. Administrador suspendido: pierde el acceso en la siguiente peticion.
    await bd(`UPDATE usuarios SET estado = 'suspendido' WHERE correo_normalizado = $1`, [CORREO_OPERADOR]);
    await pagina.goto(`${ORIGEN}/panel/operador`);
    await pagina.getByText('Tu sesión no es válida o venció').waitFor();
    comprobar('cuenta suspendida durante la sesion: vuelve al acceso al refrescar', true);

    // 13. Reinicio de emergencia del administrador: la contrasena anterior deja de valer.
    const r = ejecutarCliApi('admin-reiniciar.ts', ['--correo', CORREO_ADMIN]);
    comprobar('reiniciar: termina bien', r.status === 0 && /resultado=reiniciada/.test(r.stdout), r.stdout);
    await pagina.goto(`${ORIGEN}/acceso`);
    await pagina.getByLabel('Correo').fill(CORREO_ADMIN);
    await pagina.getByLabel('Contraseña').fill(CLAVE_ADMIN);
    await pagina.getByRole('button', { name: 'Ingresar' }).click();
    await pagina.getByRole('alert').waitFor();
    comprobar('reiniciar: la contrasena anterior ya no autentica', (await pagina.getByRole('alert').textContent())?.includes('incorrectos'));

    // 14. Texto al 200 % y reflujo en ancho de movil (sin desplazamiento horizontal).
    await pagina.setViewportSize({ width: 360, height: 740 });
    for (const [nombre, ruta] of [['portada', '/'], ['acceso', '/acceso']]) {
      await pagina.goto(`${ORIGEN}${ruta}`);
      await pagina.waitForLoadState('networkidle');
      await pagina.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      const fuera = await desbordes(pagina);
      comprobar(`texto al 200 % en 360 px (${nombre}): sin desplazamiento horizontal`, fuera.length === 0, fuera.join(', '));
      const boton = pagina.getByRole('button', { name: 'Ingresar' });
      if (await boton.count()) {
        const caja = await boton.boundingBox();
        comprobar('texto al 200 %: el boton principal sigue completo y visible', caja && caja.width > 0 && caja.x >= 0 && caja.x + caja.width <= 360 + 1);
      }
    }
    await pagina.setViewportSize({ width: 360, height: 740 });
    await pagina.goto(`${ORIGEN}/acceso`);
    const alturaBoton = (await pagina.getByRole('button', { name: 'Ingresar' }).boundingBox())?.height ?? 0;
    comprobar('el boton principal mide al menos 48 px de alto', alturaBoton >= 48, String(alturaBoton));
  } catch (e) {
    // Diagnostico antes de cerrar el navegador: direccion y texto visible (la pagina no contiene secretos).
    const t = await pagina.locator('body').innerText({ timeout: 2000 }).catch(() => '');
    console.error(`[e2e] pagina: ${pagina.url()} | ${t.replace(/\s+/g, ' ').slice(0, 300)}`);
    throw e;
  } finally {
    await navegador.close();
  }
}

main()
  .catch((e) => {
    console.error(`[e2e] error tras «${ultimoPaso}»: ${e instanceof Error ? e.message.split('\n')[0] : 'desconocido'}`);
    // Un error imprevisto cuenta como fallo: el script nunca sale con exito si no termino el recorrido.
    resultados.push({ nombre: 'ejecucion completa sin errores', ok: false });
  })
  .finally(() => {
    matarTodo();
    rmSync(CARPETA_CORREOS, { recursive: true, force: true });
    const fallas = resultados.filter((r) => !r.ok);
    console.log(`\n[e2e] ${resultados.length - fallas.length}/${resultados.length} comprobaciones correctas`);
    process.exit(fallas.length === 0 ? 0 : 1);
  });
