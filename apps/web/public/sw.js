const CACHE_PREFIX = 'crearcos-app-shell-';
// El postbuild reemplaza el marcador. Cada compilacion invalida el shell anterior.
const CACHE_NAME = `${CACHE_PREFIX}__CREARCOS_CACHE_VERSION__`;
const SCOPE_URL = self.registration.scope;
const INDEX_URL = new URL('index.html', SCOPE_URL).href;
const CORE_URLS = [
  new URL('manifest.webmanifest', SCOPE_URL).href,
  new URL('icons/crearcos-192.svg', SCOPE_URL).href,
  new URL('icons/crearcos-512.svg', SCOPE_URL).href,
];

async function descargarYGuardar(cache, url) {
  const respuesta = await fetch(url, { cache: 'reload' });
  if (!respuesta.ok) throw new Error(`No se pudo precargar ${url}`);
  await cache.put(url, respuesta.clone());
  return respuesta;
}

function recursosDeHtml(html) {
  const urls = new Set();
  for (const coincidencia of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const valor = coincidencia[1];
    if (valor === undefined || valor.startsWith('data:')) continue;
    const url = new URL(valor, SCOPE_URL);
    if (url.origin === self.location.origin) urls.add(url.href);
  }
  return [...urls];
}

function recursosDeCss(css, base) {
  const urls = new Set();
  for (const coincidencia of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    const valor = coincidencia[1];
    if (valor === undefined || valor.startsWith('data:')) continue;
    const url = new URL(valor, base);
    if (url.origin === self.location.origin) urls.add(url.href);
  }
  return [...urls];
}

async function precargarShell() {
  const cache = await caches.open(CACHE_NAME);
  const respuestaHtml = await descargarYGuardar(cache, INDEX_URL);
  const html = await respuestaHtml.text();
  const recursos = [...new Set([...CORE_URLS, ...recursosDeHtml(html)])];

  await Promise.all(
    recursos.map(async (url) => {
      const respuesta = await descargarYGuardar(cache, url);
      if (respuesta.headers.get('content-type')?.includes('text/css') !== true) return;
      const css = await respuesta.text();
      await Promise.all(
        recursosDeCss(css, url).map(async (recurso) => descargarYGuardar(cache, recurso)),
      );
    }),
  );
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(precargarShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre.startsWith(CACHE_PREFIX) && nombre !== CACHE_NAME)
            .map(async (nombre) => caches.delete(nombre)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request)
        .then(async (respuesta) => {
          if (respuesta.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(INDEX_URL, respuesta.clone());
          }
          return respuesta;
        })
        .catch(async () => {
          const respuesta = await caches.match(INDEX_URL);
          if (respuesta === undefined)
            throw new Error('El app shell no está disponible sin conexión');
          return respuesta;
        }),
    );
    return;
  }

  evento.respondWith(
    caches.match(request).then(async (respuesta) => {
      if (respuesta !== undefined) return respuesta;
      const red = await fetch(request);
      if (red.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, red.clone());
      }
      return red;
    }),
  );
});
