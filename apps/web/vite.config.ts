import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@crearcos/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@crearcos/data': fileURLToPath(new URL('../../packages/data/src/index.ts', import.meta.url)),
      '@crearcos/seeds': fileURLToPath(new URL('../../seeds/src/generar.ts', import.meta.url)),
    },
  },
  server: { port: 5173 },
});
