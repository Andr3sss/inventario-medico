/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string | undefined;
  readonly VITE_ENABLE_LOCAL_DEMO: string | undefined;
  readonly VITE_LOCAL_DEMO_PASSWORD: string | undefined;
}

declare const __CREARCOS_BUILD__: {
  readonly version: string;
  readonly entorno: string;
  readonly commit: string;
};
