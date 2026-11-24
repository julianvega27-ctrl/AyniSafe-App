// Comprueba que el artefacto compilado no filtra URLs de la API ni secretos: la web solo debe usar rutas
// relativas del mismo origen (la reescritura de Vercel apunta a la API; el navegador nunca la ve).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../dist', import.meta.url));
const PROHIBIDOS = [
  { patron: /onrender\.com/i, motivo: 'URL de Render' },
  { patron: /\.invalid\b/i, motivo: 'marcador de destino pendiente' },
  { patron: /https?:\/\/(?:127\.0\.0\.1|localhost):3000/i, motivo: 'URL local de la API' },
  { patron: /\/api\/v1\/auth\/ciudadanos/i, motivo: 'ruta ciudadana (la web no es un cliente ciudadano)' },
  { patron: /(?:localStorage|sessionStorage|indexedDB)\s*[.[]\s*(?:setItem|getItem|open)/i, motivo: 'uso de almacenamiento del navegador' },
  { patron: /document\.cookie/i, motivo: 'acceso a cookies desde JavaScript' },
];

function archivos(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

let fallos = 0;
for (const ruta of archivos(RAIZ)) {
  if (!/\.(js|css|html|json|map|txt)$/.test(ruta)) continue;
  const texto = readFileSync(ruta, 'utf8');
  for (const { patron, motivo } of PROHIBIDOS) {
    if (patron.test(texto)) {
      console.error(`PROHIBIDO en ${ruta}: ${motivo}`);
      fallos++;
    }
  }
}
if (fallos > 0) {
  console.error(`verificar:dist fallo (${fallos}).`);
  process.exit(1);
}
console.log('verificar:dist correcto: sin URLs de la API, almacenamiento ni cookies en el artefacto.');
