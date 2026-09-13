import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const resultado = spawnSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    encoding: 'utf8',
  },
);
if (resultado.status !== 0) {
  process.stderr.write(resultado.stderr || 'No se pudieron enumerar los archivos versionados.\n');
  process.exit(2);
}

const archivos = resultado.stdout.split('\0').filter(Boolean);
const hallazgos = [];
const extensionesTexto = new Set([
  '',
  '.css',
  '.env',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

function registrar(archivo, regla, detalle) {
  hallazgos.push(`${archivo}: ${regla} (${detalle})`);
}

function decodificarPayloadJwt(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalizado = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(normalizado, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

for (const archivo of archivos) {
  if (!extensionesTexto.has(extname(archivo).toLowerCase())) continue;
  let contenido;
  try {
    contenido = readFileSync(archivo, 'utf8');
  } catch {
    continue;
  }

  if (/sb_secret_[A-Za-z0-9_-]{20,}/g.test(contenido)) {
    registrar(archivo, 'SUPABASE_SECRET_KEY', 'clave moderna de servidor versionada');
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contenido)) {
    registrar(archivo, 'PRIVATE_KEY', 'clave privada PEM versionada');
  }

  for (const token of contenido.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ??
    []) {
    const payload = decodificarPayloadJwt(token);
    if (payload?.role === 'service_role') {
      registrar(archivo, 'SUPABASE_SERVICE_ROLE_JWT', 'JWT privilegiado versionado');
      break;
    }
  }

  if (/(^|\/)\.env(?:\.[^/]+)?$/i.test(archivo)) {
    for (const [indice, linea] of contenido.split(/\r?\n/).entries()) {
      const asignacion = linea.match(
        /^\s*(?:export\s+)?(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_PASSWORD|VITE_LOCAL_DEMO_PASSWORD|DEMO_ADMIN_PASSWORD|SMTP_PASSWORD|SENDGRID_API_KEY)\s*=\s*(.+?)\s*$/,
      );
      if (!asignacion) continue;
      const valor = asignacion[2].replace(/^['"]|['"]$/g, '').trim();
      if (valor && !/^env\([A-Z0-9_]+\)$/.test(valor)) {
        registrar(archivo, 'DOTENV_SECRET', `variable sensible con valor en linea ${indice + 1}`);
      }
    }
  }
}

if (hallazgos.length > 0) {
  process.stderr.write('Se encontraron secretos potenciales en archivos versionados:\n');
  for (const hallazgo of hallazgos) process.stderr.write(`- ${hallazgo}\n`);
  process.exit(1);
}

process.stdout.write(
  `Revision de secretos aprobada (${archivos.length} archivos versionados o listos para versionar).\n`,
);
