const ORIGENES_LOCALES = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:5173',
] as const;

const CABECERAS_PERMITIDAS =
  'authorization, apikey, content-type, x-client-info, x-application-name';

function origenExacto(valor: string): string | null {
  try {
    const url = new URL(valor);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function leerOrigenesPermitidos(configuracion?: string): readonly string[] {
  const valores =
    configuracion === undefined || configuracion.trim() === ''
      ? ORIGENES_LOCALES
      : configuracion.split(',').map((valor) => valor.trim());
  const origenes = valores.filter(Boolean).map(origenExacto);
  if (origenes.length === 0 || origenes.some((origen) => origen === null)) {
    throw new Error('ALLOWED_ORIGINS_INVALIDO');
  }
  return [...new Set(origenes as string[])];
}

export function origenPermitido(req: Request, configuracion?: string): boolean {
  const origen = req.headers.get('origin');
  return origen === null || leerOrigenesPermitidos(configuracion).includes(origen);
}

export function corsHeaders(req: Request, configuracion?: string): Record<string, string> {
  const origen = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': CABECERAS_PERMITIDAS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origen !== null && leerOrigenesPermitidos(configuracion).includes(origen)) {
    headers['Access-Control-Allow-Origin'] = origen;
  }
  return headers;
}

export function responderPreflight(req: Request, configuracion?: string): Response {
  return origenPermitido(req, configuracion)
    ? new Response(null, { status: 204, headers: corsHeaders(req, configuracion) })
    : new Response(null, {
        status: 403,
        headers: { Vary: 'Origin', 'Cache-Control': 'no-store' },
      });
}
