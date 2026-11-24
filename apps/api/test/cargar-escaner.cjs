// Puente sin transpilar: conserva el import dinamico nativo al compilar los tests TS a CommonJS.
module.exports = () => import('../../../scripts/escanear-secretos.mjs');
