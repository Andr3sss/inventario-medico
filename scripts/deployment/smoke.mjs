import { leerConfiguracionDespliegue } from './environment.mjs';

const configuracion = leerConfiguracionDespliegue();
const base = new URL(process.env.SMOKE_BASE_URL?.trim() || configuracion.appUrl);
if (base.protocol !== 'https:') throw new Error('SMOKE_BASE_URL debe usar HTTPS');

const obtener = async (ruta, opciones = {}) => {
  const respuesta = await fetch(new URL(ruta, base), {
    signal: AbortSignal.timeout(15_000),
    redirect: 'follow',
    ...opciones,
  });
  if (!respuesta.ok) throw new Error(`${ruta}: HTTP ${respuesta.status}`);
  return respuesta;
};

for (const ruta of ['/', '/ingreso']) {
  const respuesta = await obtener(ruta);
  const html = await respuesta.text();
  if (!html.includes('id="raiz"')) throw new Error(`${ruta}: no devolvio el app shell`);
  if (ruta === '/') {
    const esperadas = {
      'content-security-policy': ["frame-ancestors 'none'", configuracion.supabaseUrl],
      'permissions-policy': ['camera=()'],
      'referrer-policy': ['no-referrer'],
      'strict-transport-security': ['max-age='],
      'x-content-type-options': ['nosniff'],
      'x-frame-options': ['DENY'],
    };
    for (const [nombre, fragmentos] of Object.entries(esperadas)) {
      const valor = respuesta.headers.get(nombre) ?? '';
      if (!fragmentos.every((fragmento) => valor.includes(fragmento))) {
        throw new Error(`/: cabecera ${nombre} ausente o incompleta`);
      }
    }
    if (
      configuracion.entorno === 'staging' &&
      respuesta.headers.get('x-robots-tag') !== 'noindex'
    ) {
      throw new Error('/: staging debe impedir indexacion');
    }
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    if (assets.length === 0) throw new Error('/: no se encontraron assets versionados');
    for (const asset of assets) {
      const recurso = await obtener(asset);
      if (!recurso.headers.get('cache-control')?.includes('immutable')) {
        throw new Error(`${asset}: no tiene cache inmutable`);
      }
    }
  }
}

const sw = await obtener('/sw.js');
if (!(sw.headers.get('cache-control') ?? '').includes('no-store')) {
  throw new Error('/sw.js: debe impedir cache HTTP');
}
if ((await sw.text()).includes('__CREARCOS_CACHE_VERSION__')) {
  throw new Error('/sw.js: conserva el marcador de compilacion');
}
await obtener('/manifest.webmanifest');

const authHealth = await fetch(`${configuracion.supabaseUrl}/auth/v1/health`, {
  headers: { apikey: configuracion.clavePublicable },
  signal: AbortSignal.timeout(15_000),
});
if (!authHealth.ok) throw new Error(`Supabase Auth: HTTP ${authHealth.status}`);

for (const funcion of ['sync', 'administration', 'freelance-access', 'prepare-production']) {
  const endpoint = `${configuracion.supabaseUrl}/functions/v1/${funcion}`;
  const permitida = await fetch(endpoint, {
    method: 'OPTIONS',
    headers: { Origin: configuracion.appUrl, apikey: configuracion.clavePublicable },
    signal: AbortSignal.timeout(15_000),
  });
  if (
    permitida.status !== 204 ||
    permitida.headers.get('access-control-allow-origin') !== configuracion.appUrl
  ) {
    throw new Error(`${funcion}: CORS no permite exactamente el host del entorno`);
  }
  const rechazada = await fetch(endpoint, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://origen-no-permitido.invalid',
      apikey: configuracion.clavePublicable,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (rechazada.status !== 403 || rechazada.headers.has('access-control-allow-origin')) {
    throw new Error(`${funcion}: CORS no rechazo el origen hostil`);
  }
}

process.stdout.write(`Smoke ${configuracion.entorno} aprobado en ${base.origin}.\n`);
