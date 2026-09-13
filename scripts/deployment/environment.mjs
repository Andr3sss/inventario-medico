const ENTORNOS = new Set(['staging', 'production']);
const MARCADORES = /replace|example|project[_-]?ref|cambiar|pendiente/i;

function obligatorio(env, nombre) {
  const valor = env[nombre]?.trim();
  if (!valor || MARCADORES.test(valor)) throw new Error(`${nombre} no esta configurada`);
  return valor;
}

function urlHttpsExacta(valor, nombre, permiteRuta = false) {
  let url;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`${nombre} no es una URL valida`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    (!permiteRuta && url.pathname !== '/')
  ) {
    throw new Error(`${nombre} debe ser una URL HTTPS exacta`);
  }
  return permiteRuta ? url.href.replace(/\/$/, '') : url.origin;
}

export function leerConfiguracionDespliegue(env = process.env) {
  const entorno = obligatorio(env, 'CREARCOS_DEPLOY_ENV');
  if (!ENTORNOS.has(entorno)) throw new Error('CREARCOS_DEPLOY_ENV debe ser staging o production');

  const appUrl = urlHttpsExacta(obligatorio(env, 'PUBLIC_APP_URL'), 'PUBLIC_APP_URL');
  const supabaseUrl = urlHttpsExacta(obligatorio(env, 'VITE_SUPABASE_URL'), 'VITE_SUPABASE_URL');
  if (appUrl === supabaseUrl) throw new Error('El host web y Supabase deben ser distintos');

  const clavePublicable = obligatorio(env, 'VITE_SUPABASE_PUBLISHABLE_KEY');
  if (/service_role|sb_secret_/i.test(clavePublicable)) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY contiene una clave privilegiada');
  }
  if (!clavePublicable.startsWith('sb_publishable_')) {
    const partes = clavePublicable.split('.');
    try {
      const payload = JSON.parse(Buffer.from(partes[1] ?? '', 'base64url').toString('utf8'));
      if (partes.length !== 3 || payload.role !== 'anon') throw new Error();
    } catch {
      throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY no es publishable ni JWT anon');
    }
  }

  if (env.VITE_ENABLE_LOCAL_DEMO?.trim() !== 'false') {
    throw new Error('VITE_ENABLE_LOCAL_DEMO debe ser false fuera de desarrollo');
  }
  if ((env.VITE_LOCAL_DEMO_PASSWORD ?? '').trim() !== '') {
    throw new Error('VITE_LOCAL_DEMO_PASSWORD debe estar vacia fuera de desarrollo');
  }

  const redirectAuth = urlHttpsExacta(
    obligatorio(env, 'AUTH_REDIRECT_URL'),
    'AUTH_REDIRECT_URL',
    true,
  );
  const redirectEsperado = `${appUrl}/actualizar-contrasena`;
  if (redirectAuth !== redirectEsperado) {
    throw new Error(`AUTH_REDIRECT_URL debe ser ${redirectEsperado}`);
  }

  const origenes = obligatorio(env, 'ALLOWED_ORIGINS')
    .split(',')
    .map((valor) => urlHttpsExacta(valor.trim(), 'ALLOWED_ORIGINS'));
  if (origenes.length !== 1 || origenes[0] !== appUrl) {
    throw new Error('ALLOWED_ORIGINS debe contener solo PUBLIC_APP_URL en cada entorno');
  }

  const projectRef = obligatorio(env, 'SUPABASE_PROJECT_ID');
  if (!/^[a-z]{20}$/.test(projectRef)) throw new Error('SUPABASE_PROJECT_ID no es valido');

  return {
    entorno,
    appUrl,
    supabaseUrl,
    clavePublicable,
    redirectAuth,
    origenes,
    projectRef,
    cloudflareProject: obligatorio(env, 'CLOUDFLARE_PAGES_PROJECT'),
  };
}
