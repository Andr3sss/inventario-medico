import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Se resuelve al codigo fuente y no al enlace de node_modules, para que
      // las pruebas ejecuten exactamente los archivos que se editan.
      '@crearcos/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@crearcos/data': fileURLToPath(new URL('./packages/data/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'seeds/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    reporters: ['default'],
  },
});
