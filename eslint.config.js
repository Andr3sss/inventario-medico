import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Los archivos de configuracion no se analizan con reglas que necesitan tipos.
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'seeds/salida/**',
      '**/*.config.ts',
      '**/*.config.js',
      '**/dist-tipos/**',
      'vitest.setup.ts',
      'apps/web/public/sw.js',
      'scripts/supabase/**',
      'scripts/security/**',
      // Deno/JSR usa su propio runtime y no pertenece a los tsconfig Node/Vite.
      'supabase/functions/**',
      // Generado por Supabase CLI/MCP; no se edita manualmente.
      'packages/data/src/supabase/database.types.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // El dominio no puede mutar piezas: cada evento devuelve un objeto nuevo.
      'no-param-reassign': 'error',
      // Prohibido leer el reloj dentro del dominio, el tiempo siempre se inyecta.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'No leas el reloj dentro del dominio, inyecta la fecha como parametro',
        },
        {
          // Solo se prohibe leer la hora actual. Convertir una marca de tiempo ya
          // inyectada, como new Date(relojPared), es legitimo.
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'No leas la hora actual, inyectala como parametro',
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // La raiz de composicion es el unico lugar donde el tiempo entra al sistema.
    // De ahi hacia adentro se inyecta como parametro.
    files: ['apps/web/src/datos/contexto.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.test.ts', 'seeds/**/*.ts', 'packages/core/src/pruebas/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
);
