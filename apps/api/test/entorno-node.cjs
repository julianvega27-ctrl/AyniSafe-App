const { TestEnvironment } = require('jest-environment-node');

/** Los errores de fetch/AbortSignal nacen en Node, fuera del contexto VM de Jest. */
module.exports = class EntornoNode extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    // Reproduce el instanceof Error de produccion sin modificar adaptadores o fixtures.
    this.global.Error = Error;
  }
};
