module.exports = class SinPruebasReporter {
  onRunComplete(_contexts, result) {
    if (result.numPassedTests + result.numFailedTests === 0) {
      this.error = new Error('No se ejecutaron pruebas: una seleccion vacia no acredita validacion.');
    }
  }
  getLastError() { return this.error; }
};
