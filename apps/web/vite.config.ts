import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const raizRepositorio = fileURLToPath(new URL('../..', import.meta.url));
const paquete = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { readonly version: string };

export default defineConfig(({ mode }) => {
  const entorno = loadEnv(mode, raizRepositorio, '');
  const commit = entorno.CREARCOS_COMMIT_SHA?.trim() || 'local';
  return {
    envDir: raizRepositorio,
    plugins: [react()],
    define: {
      __CREARCOS_BUILD__: JSON.stringify({
        version: paquete.version,
        entorno: entorno.CREARCOS_DEPLOY_ENV?.trim() || mode,
        commit,
      }),
    },
    resolve: {
      alias: {
        '@crearcos/core': fileURLToPath(
          new URL('../../packages/core/src/index.ts', import.meta.url),
        ),
        '@crearcos/data': fileURLToPath(
          new URL('../../packages/data/src/index.ts', import.meta.url),
        ),
        '@crearcos/seeds': fileURLToPath(new URL('../../seeds/src/generar.ts', import.meta.url)),
      },
    },
    server: { port: 5173 },
  };
});
