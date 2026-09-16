import assert from 'node:assert/strict';
import test from 'node:test';
import { leerConfiguracionDespliegue } from './environment.mjs';

const valida = {
  CREARCOS_DEPLOY_ENV: 'staging',
  PUBLIC_APP_URL: 'https://staging.inventario.crearcos.test',
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_prueba_no_secreta',
  VITE_ENABLE_LOCAL_DEMO: 'false',
  VITE_LOCAL_DEMO_PASSWORD: '',
  ALLOWED_ORIGINS: 'https://staging.inventario.crearcos.test',
  SUPABASE_PROJECT_ID: 'abcdefghijklmnopqrst',
  CLOUDFLARE_PAGES_PROJECT: 'crearcos-inventario',
};

test('acepta un entorno aislado y HTTPS', () => {
  const resultado = leerConfiguracionDespliegue(valida);
  assert.equal(resultado.entorno, 'staging');
  assert.equal(resultado.origenes[0], valida.PUBLIC_APP_URL);
});

test('rechaza demo local y claves privilegiadas', () => {
  assert.throws(
    () => leerConfiguracionDespliegue({ ...valida, VITE_ENABLE_LOCAL_DEMO: 'true' }),
    /debe ser false/,
  );
  assert.throws(
    () =>
      leerConfiguracionDespliegue({
        ...valida,
        VITE_SUPABASE_PUBLISHABLE_KEY: ['sb', 'secret', 'no_debe_llegar_al_frontend'].join('_'),
      }),
    /privilegiada/,
  );
  const payloadPrivilegiado = Buffer.from(JSON.stringify({ role: 'service_role' })).toString(
    'base64url',
  );
  assert.throws(
    () =>
      leerConfiguracionDespliegue({
        ...valida,
        VITE_SUPABASE_PUBLISHABLE_KEY: `cabecera.${payloadPrivilegiado}.firma`,
      }),
    /no es publishable ni JWT anon/,
  );
});

test('rechaza HTTP y varios origenes', () => {
  assert.throws(
    () => leerConfiguracionDespliegue({ ...valida, PUBLIC_APP_URL: 'http://inventario.test' }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      leerConfiguracionDespliegue({
        ...valida,
        ALLOWED_ORIGINS: `${valida.PUBLIC_APP_URL},https://otro.test`,
      }),
    /solo PUBLIC_APP_URL/,
  );
});
