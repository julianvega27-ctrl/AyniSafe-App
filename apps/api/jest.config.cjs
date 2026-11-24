const mode = process.env.AYNI_TEST_MODE || 'completo';

module.exports = {
  rootDir: __dirname,
  testEnvironment: require.resolve('./test/entorno-node.cjs'),
  testMatch: mode === 'unidad'
    ? ['<rootDir>/test/unidad/**/*.test.ts']
    : mode === 'integracion'
      ? ['<rootDir>/test/integracion/**/*.test.ts']
      : ['<rootDir>/test/**/*.test.ts', '<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: { module: 'CommonJS', moduleResolution: 'Node', target: 'ES2022', esModuleInterop: true, isolatedModules: false, sourceMap: true },
      // Los tipos se comprueban por separado con tsconfig.test.json (Node16 estricto).
      diagnostics: false,
    }],
  },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  globalSetup: mode === 'unidad' ? undefined : '<rootDir>/test/preparar-bd.ts',
  maxWorkers: 1,
  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true,
  reporters: ['default', require.resolve('./test/sin-pruebas.reporter.cjs')],
  coverageProvider: 'v8',
  collectCoverageFrom: [
    'src/**/*.ts',
    'scripts/**/*.{ts,cjs,mjs}',
    '!src/generated/**',
    '!**/*.d.ts',
    '!**/*.test.ts',
    // Herramientas desechables de experimentos anteriores, no comandos de la API.
    '!scripts/spike-render/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text-summary', 'html', 'lcovonly', 'json-summary'],
};
