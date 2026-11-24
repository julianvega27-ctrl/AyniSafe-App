const { parse } = require('dotenv');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

/** Se valida antes de cargar Jest o abrir una conexion; los errores nunca incluyen la URL. */
function validarUrlPruebas(value) {
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !decodeURIComponent(url.pathname).endsWith('_test')) {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error('TEST_DATABASE_URL debe identificar una base PostgreSQL aislada cuyo nombre termine en _test.');
  }
}

function prepararEntorno(mode, inherited, root) {
  if (!['completo', 'unidad', 'integracion', 'cobertura'].includes(mode)) {
    throw new Error('Modo de pruebas no admitido.');
  }
  const env = { ...inherited, AYNI_TEST_MODE: mode };
  if (mode === 'unidad') return env;
  const file = join(root, '.env');
  const local = existsSync(file) ? parse(readFileSync(file)) : {};
  const url = validarUrlPruebas(env.TEST_DATABASE_URL ?? local.TEST_DATABASE_URL);
  // El valor vacio explicito tambien es invalido; no se recurre a DATABASE_URL.
  return { ...local, ...env, TEST_DATABASE_URL: url, DATABASE_URL: url };
}

module.exports = { prepararEntorno, validarUrlPruebas };
