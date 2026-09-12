import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin') ?? '';
  const allowed = (
    Deno.env.get('ALLOWED_ORIGINS') ??
    'http://localhost:5173,http://127.0.0.1:5173,http://[::1]:5173'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-application-name',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function response(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return response(req, 405, { error: 'METODO_NO_PERMITIDO' });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('authorization');
  if (!url || !anonKey || !serviceKey || !authorization) {
    return response(req, 401, { error: 'AUTENTICACION_REQUERIDA' });
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response(req, 401, { error: 'SESION_INVALIDA' });

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile } = await service
    .from('perfiles')
    .select('rol,activo,origen')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (!profile?.activo || profile.rol !== 'ADMINISTRADOR' || profile.origen !== 'DEMO') {
    return response(req, 403, { error: 'ADMIN_DEMO_REQUERIDO' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return response(req, 400, { error: 'JSON_INVALIDO' });
  }
  const action = String(body.accion ?? '');

  if (action === 'cargar-demo') {
    const { data, error } = await service.rpc('cargar_datos_demo', {
      p_actor_id: authData.user.id,
    });
    return error
      ? response(req, 409, { error: 'SEED_DEMO_FALLO', detalle: error.message })
      : response(req, 200, data);
  }

  if (action === 'crear-desafio') {
    const backup = String(body.referenciaBackup ?? '').trim();
    const { data, error } = await service.rpc('crear_desafio_handoff', {
      p_actor_id: authData.user.id,
      p_referencia_backup: backup,
    });
    return error
      ? response(req, 409, { error: 'DESAFIO_FALLO', detalle: error.message })
      : response(req, 200, data);
  }

  if (action !== 'purgar') return response(req, 400, { error: 'ACCION_INVALIDA' });
  const dryRun = body.soloSimular !== false;
  const challengeId = String(body.desafioId ?? '');
  const { data: purge, error: purgeError } = await service.rpc('purgar_datos_demo', {
    p_actor_id: authData.user.id,
    p_desafio_id: challengeId,
    p_token: String(body.token ?? ''),
    p_frase: String(body.frase ?? ''),
    p_referencia_backup: String(body.referenciaBackup ?? ''),
    p_solo_simular: dryRun,
  });
  if (purgeError) return response(req, 409, { error: 'PURGA_FALLO', detalle: purgeError.message });
  if (dryRun) return response(req, 200, purge);

  const pending = Array.isArray(
    (purge as { usuariosAuthPendientes?: unknown[] }).usuariosAuthPendientes,
  )
    ? (purge as { usuariosAuthPendientes: unknown[] }).usuariosAuthPendientes.map(String)
    : [];
  for (const userId of pending) {
    const { error: deleteError } = await service.auth.admin.deleteUser(userId);
    if (deleteError) {
      return response(req, 500, {
        error: 'PURGA_AUTH_PENDIENTE',
        detalle: deleteError.message,
        estado: 'PURGANDO',
      });
    }
    const { error: markError } = await service.rpc('marcar_usuario_demo_auth_eliminado', {
      p_desafio_id: challengeId,
      p_usuario_id: userId,
    });
    if (markError) return response(req, 500, { error: 'MARCA_AUTH_FALLO', estado: 'PURGANDO' });
  }

  const { data: finalized, error: finalError } = await service.rpc('confirmar_purga_auth', {
    p_desafio_id: challengeId,
  });
  return finalError
    ? response(req, 500, {
        error: 'CONFIRMACION_HANDOFF_FALLO',
        detalle: finalError.message,
        estado: 'PURGANDO',
      })
    : response(req, 200, finalized);
});
