import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/preparar-bd.ts'],
    // Las pruebas de integracion comparten una sola base aislada.
    fileParallelism: false,
    testTimeout: 30000,
  },
});
