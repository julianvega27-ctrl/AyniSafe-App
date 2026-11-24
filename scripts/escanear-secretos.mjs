// Escaner de secretos del repositorio (integracion continua). Falla si un archivo VERSIONADO contiene una
// credencial reconocible. Es autonomo (sin dependencias de terceros) y nunca imprime el valor encontrado:
// solo archivo, linea y tipo de hallazgo.
//
// Uso:  node scripts/escanear-secretos.mjs            (escanea `git ls-files`)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HOST_LOCAL = /^(127\.0\.0\.1|localhost|::1|\[::1\]|0\.0\.0\.0)$/i;
const MARCADORES = /^(contrasena|contraseña|password|passwd|usuario|user|pass|secret|secreto|clave|cambia|ejemplo|example|xxx+|\*+|<[^>]*>|\$\{[^}]*\}|%[^%]*%|u|p|x)$/i;

/** Reglas por patron. `validar` (opcional) descarta falsos positivos evidentes (marcadores, hosts locales). */
export const REGLAS = [
  { id: 'clave-privada', patron: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'google-client-secret', patron: /GOCSPX-[A-Za-z0-9_-]{20,}/ },
  { id: 'google-refresh-token', patron: /\b1\/\/[0-9A-Za-z_-]{40,}/ },
  { id: 'aws-access-key', patron: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'token-github', patron: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { id: 'token-slack', patron: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  {
    id: 'cadena-de-conexion-con-contrasena',
    patron: /\bpostgres(?:ql)?:\/\/([^:\s/@'"`]+):([^@\s'"`]+)@([^/\s:'"`]+)/i,
    validar: (m) => !MARCADORES.test(m[2]) && !HOST_LOCAL.test(m[3]),
  },
];

/** Archivos que nunca deben versionarse (entornos locales con secretos). */
export function esArchivoDeEntorno(ruta) {
  const nombre = ruta.split('/').at(-1) ?? '';
  return /^\.env(\..+)?$/.test(nombre) && nombre !== '.env.example';
}

/** Devuelve los hallazgos de un texto como `{ regla, linea }` (sin el valor). */
export function escanearTexto(texto) {
  const hallazgos = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    for (const r of REGLAS) {
      const m = r.patron.exec(linea);
      if (m && (r.validar ? r.validar(m) : true)) hallazgos.push({ regla: r.id, linea: i + 1 });
    }
  });
  return hallazgos;
}

function listarVersionados() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
}

const BINARIOS = /\.(png|jpe?g|gif|webp|ico|jar|keystore|jks|so|dll|exe|zip|gz|ttf|otf|woff2?|pdf)$/i;

export function escanearRepositorio(archivos = listarVersionados()) {
  const hallazgos = [];
  for (const ruta of archivos) {
    if (esArchivoDeEntorno(ruta)) hallazgos.push({ ruta, regla: 'archivo-de-entorno-versionado', linea: 0 });
    if (BINARIOS.test(ruta) || ruta.includes('/.pgdata/')) continue;
    let texto;
    try {
      texto = readFileSync(ruta, 'utf8');
    } catch {
      continue;
    }
    if (texto.includes('\0')) continue; // binario
    for (const h of escanearTexto(texto)) hallazgos.push({ ruta, ...h });
  }
  return hallazgos;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const hallazgos = escanearRepositorio();
  for (const h of hallazgos) console.error(`SECRETO ${h.regla}: ${h.ruta}${h.linea ? `:${h.linea}` : ''}`);
  if (hallazgos.length > 0) {
    console.error(`Escaneo de secretos fallo: ${hallazgos.length} hallazgo(s). No se imprime ningun valor.`);
    process.exit(1);
  }
  console.log('Escaneo de secretos correcto: ningun archivo versionado contiene credenciales reconocibles.');
}
