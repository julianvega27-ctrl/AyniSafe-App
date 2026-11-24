const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { prepararEntorno } = require('./modo-pruebas.cjs');

function main(args = process.argv.slice(2)) {
  const [mode = 'completo', ...extra] = args;
  try {
    const root = resolve(__dirname, '..');
    const env = prepararEntorno(mode, process.env, root);
    const result = spawnSync(process.execPath, [
      '--experimental-vm-modules', require.resolve('jest/bin/jest'),
      '--config', resolve(root, 'jest.config.cjs'), '--runInBand',
      ...(mode === 'cobertura' ? ['--coverage'] : []), ...extra,
    ], { cwd: root, env, stdio: 'inherit' });
    return result.error ? 1 : (result.status ?? 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'No se pudieron preparar las pruebas.');
    return 1;
  }
}

if (require.main === module) process.exitCode = main();
module.exports = { main };
