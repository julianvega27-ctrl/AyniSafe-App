// Script de UN SOLO USO: obtiene el refresh token de la Gmail API para la cuenta dedicada y lo guarda
// en apps/api/.env como GMAIL_REFRESH_TOKEN. No imprime secretos ni el token.
//
// Requisitos previos (ver README, "Gmail API"): proyecto de Google Cloud con la Gmail API habilitada,
// cliente OAuth de tipo "Aplicacion web" con la URI de redireccionamiento
// http://localhost:8787/callback, y GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET en .env.
//
// Uso:  node scripts/obtener-refresh-token.mjs
// Abre la pantalla de autorizacion de Google: inicia sesion con la cuenta DEDICADA (la que enviara los
// correos) y acepta el unico permiso solicitado (enviar correo).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_ENV = path.join(RAIZ, '.env');
const PUERTO = 8787;
const REDIRECCION = `http://localhost:${PUERTO}/callback`;
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const TIEMPO_MAXIMO_MS = 10 * 60 * 1000;

function leerEnv() {
  const env = {};
  for (const linea of fs.readFileSync(RUTA_ENV, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_0-9]+)=(.*)$/.exec(linea.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function guardarToken(token) {
  const lineas = fs.readFileSync(RUTA_ENV, 'utf8').split(/\r?\n/);
  const nueva = `GMAIL_REFRESH_TOKEN=${token}`;
  const i = lineas.findIndex((l) => /^GMAIL_REFRESH_TOKEN=/.test(l.trim()));
  if (i >= 0) lineas[i] = nueva;
  else {
    while (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();
    lineas.push(nueva, '');
  }
  fs.writeFileSync(RUTA_ENV, lineas.join('\n'), 'utf8');
}

const env = leerEnv();
for (const k of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET']) {
  if (!env[k]) {
    console.error(`Falta ${k} en apps/api/.env`);
    process.exit(1);
  }
}

const estado = crypto.randomBytes(16).toString('hex');
const parametros = new URLSearchParams({
  client_id: env.GMAIL_CLIENT_ID,
  redirect_uri: REDIRECCION,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline', // pide el refresh token
  prompt: 'consent', // fuerza que Google lo entregue aunque ya se haya autorizado antes
  state: estado,
});
if (env.SMTP_USUARIO) parametros.set('login_hint', env.SMTP_USUARIO); // sugiere la cuenta dedicada
const urlAutorizacion = `https://accounts.google.com/o/oauth2/v2/auth?${parametros}`;

function pagina(res, codigo, titulo, texto) {
  res.writeHead(codigo, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><meta charset="utf-8"><title>${titulo}</title><body style="font:16px system-ui;max-width:32rem;margin:3rem auto"><h1>${titulo}</h1><p>${texto}</p></body>`);
}

let terminado = false;
function terminar(codigoSalida) {
  if (terminado) return;
  terminado = true;
  setTimeout(() => process.exit(codigoSalida), 300);
}

const manejador = async (req, res) => {
  const url = new URL(req.url ?? '/', REDIRECCION);
  if (url.pathname !== '/callback') return pagina(res, 404, 'No encontrado', 'Ruta no valida.');
  if (url.searchParams.get('state') !== estado) {
    pagina(res, 400, 'Solicitud no valida', 'El parametro state no coincide. Vuelve a ejecutar el script.');
    console.error('El parametro state no coincide: se descarta la respuesta.');
    return terminar(1);
  }
  const error = url.searchParams.get('error');
  if (error) {
    pagina(res, 400, 'Autorizacion rechazada', `Google devolvio: ${error}. Puedes cerrar esta pestana.`);
    console.error(`Google devolvio el error: ${error}`);
    return terminar(1);
  }
  const codigo = url.searchParams.get('code');
  if (!codigo) {
    pagina(res, 400, 'Falta el codigo', 'Google no devolvio un codigo de autorizacion.');
    return terminar(1);
  }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: codigo,
        client_id: env.GMAIL_CLIENT_ID,
        client_secret: env.GMAIL_CLIENT_SECRET,
        redirect_uri: REDIRECCION,
        grant_type: 'authorization_code',
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) {
      pagina(res, 502, 'No se obtuvo el token', 'Revisa la terminal. Puedes cerrar esta pestana.');
      console.error(`Intercambio fallido: HTTP ${r.status}, error=${j.error ?? 'desconocido'}, sin refresh token=${!j.refresh_token}`);
      return terminar(1);
    }
    if (typeof j.scope === 'string' && j.scope.split(' ').some((s) => s !== SCOPE)) {
      console.warn('Aviso: Google concedio permisos distintos al solicitado.');
    }
    guardarToken(j.refresh_token);
    pagina(res, 200, 'Listo', 'El refresh token se guardo en tu .env. Ya puedes cerrar esta pestana.');
    console.log(`Refresh token guardado en .env como GMAIL_REFRESH_TOKEN (${j.refresh_token.length} caracteres). No se imprimio.`);
    console.log(`Permiso concedido: ${j.scope ?? '(no informado)'}`);
    return terminar(0);
  } catch (e) {
    pagina(res, 500, 'Error', 'Fallo de red al contactar a Google.');
    console.error(`Fallo de red: ${e instanceof Error ? e.name : 'desconocido'}`);
    return terminar(1);
  }
};

// Solo en loopback (IPv4 e IPv6): nada fuera de esta maquina puede alcanzar el servidor.
for (const host of ['127.0.0.1', '::1']) {
  const servidor = http.createServer(manejador);
  servidor.on('error', (e) => {
    if (host === '127.0.0.1') {
      console.error(`No se pudo escuchar en el puerto ${PUERTO}: ${e.code}`);
      terminar(1);
    }
  });
  servidor.listen(PUERTO, host);
}

console.log('Abre esta direccion e inicia sesion con la cuenta DEDICADA de Gmail:');
console.log(urlAutorizacion);
// Intenta abrir el navegador predeterminado en Windows; si falla, basta con copiar la direccion.
try {
  spawn('cmd', ['/c', 'start', '', urlAutorizacion.replace(/&/g, '^&')], { stdio: 'ignore', detached: true }).unref();
} catch {
  /* se usa la direccion impresa */
}
setTimeout(() => {
  console.error('Tiempo agotado (10 minutos) sin recibir la autorizacion.');
  terminar(1);
}, TIEMPO_MAXIMO_MS);
