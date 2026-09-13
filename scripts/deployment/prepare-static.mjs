import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const raiz = resolve(import.meta.dirname, '../..');
const destino = resolve(raiz, 'apps/web/dist');
const supabase = process.env.VITE_SUPABASE_URL?.trim();
let connectSrc = "'self'";
if (supabase) {
  const url = new URL(supabase);
  if (url.protocol !== 'https:' || url.pathname !== '/') {
    throw new Error('VITE_SUPABASE_URL debe ser un origen HTTPS exacto');
  }
  const realtime = new URL(url.origin);
  realtime.protocol = 'wss:';
  connectSrc += ` ${url.origin} ${realtime.origin}`;
}

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  `connect-src ${connectSrc}`,
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ');
const noIndex = process.env.CREARCOS_DEPLOY_ENV === 'staging' ? '  X-Robots-Tag: noindex\n' : '';

const headers = `/*
  Content-Security-Policy: ${csp}
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()
  Referrer-Policy: no-referrer
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
${noIndex}

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/sw.js
  Cache-Control: no-store, max-age=0

/index.html
  Cache-Control: public, max-age=0, must-revalidate

/*.webmanifest
  Cache-Control: public, max-age=0, must-revalidate
`;

await writeFile(resolve(destino, '_headers'), headers, 'utf8');

const packageJson = JSON.parse(await readFile(resolve(raiz, 'package.json'), 'utf8'));
const commit = (process.env.CREARCOS_COMMIT_SHA?.trim() || 'local').slice(0, 12);
const versionCache = `${packageJson.version}-${commit}`.replace(/[^a-zA-Z0-9._-]/g, '-');
const rutaSw = resolve(destino, 'sw.js');
const sw = await readFile(rutaSw, 'utf8');
if (!sw.includes('__CREARCOS_CACHE_VERSION__')) {
  throw new Error('El service worker no contiene el marcador de version esperado');
}
await writeFile(rutaSw, sw.replaceAll('__CREARCOS_CACHE_VERSION__', versionCache), 'utf8');
process.stdout.write(`Artefacto web preparado para cache ${versionCache}.\n`);
