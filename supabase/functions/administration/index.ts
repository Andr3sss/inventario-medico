import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const MAX_BODY_BYTES = 128 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HUMAN_ROLES = new Set([
  'ADMINISTRADOR',
  'AUXILIAR',
  'COORDINADORA',
  'CONTABLE',
  'SUPERVISOR',
]);

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin') ?? '';
  const configured = (
    Deno.env.get('ALLOWED_ORIGINS') ??
    'http://localhost:5173,http://127.0.0.1:5173,http://[::1]:5173'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    'Access-Control-Allow-Origin': configured.includes(origin) ? origin : (configured[0] ?? ''),
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-application-name',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'METODO_NO_PERMITIDO' });

  const length = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return json(req, 413, { error: 'SOLICITUD_DEMASIADO_GRANDE' });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('authorization');
  if (!url || !anonKey || !serviceKey || !authorization) {
    return json(req, 401, { error: 'AUTENTICACION_REQUERIDA' });
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json(req, 401, { error: 'SESION_INVALIDA' });

  let body: Record<string, unknown>;
  try {
    body = record(await req.json()) ?? {};
  } catch {
    return json(req, 400, { error: 'JSON_INVALIDO' });
  }
  const action = text(body.accion);
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const actorId = authData.user.id;

  const fail = (error: { message: string; code?: string } | null): Response =>
    json(req, error?.code === '42501' ? 403 : 409, {
      error: error?.code ?? 'OPERACION_RECHAZADA',
      detalle: error?.message ?? 'Operación rechazada',
    });

  const requireAdmin = async (): Promise<Response | null> => {
    const { data, error } = await service
      .from('perfiles')
      .select('rol,activo')
      .eq('id', actorId)
      .maybeSingle();
    if (error || !data?.activo || data.rol !== 'ADMINISTRADOR') {
      return json(req, 403, { error: 'ROL_NO_AUTORIZADO' });
    }
    return null;
  };

  if (action === 'LISTAR_USUARIOS') {
    const denied = await requireAdmin();
    if (denied) return denied;
    const { data, error } = await service
      .from('perfiles')
      .select('id,nombre,rol,activo')
      .order('nombre');
    return error ? fail(error) : json(req, 200, { usuarios: data ?? [] });
  }

  if (action === 'CREAR_USUARIO') {
    const denied = await requireAdmin();
    if (denied) return denied;
    const email = text(body.correo).toLowerCase();
    const password = typeof body.contrasena === 'string' ? body.contrasena : '';
    const name = text(body.nombre);
    const role = text(body.rol);
    if (!email.includes('@') || password.length < 8 || !name || !HUMAN_ROLES.has(role)) {
      return json(req, 400, { error: 'USUARIO_INVALIDO' });
    }
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) return fail(createError);
    const { data: profile, error: profileError } = await service.rpc(
      'provisionar_usuario_por_admin',
      {
        p_actor_id: actorId,
        p_usuario_id: created.user.id,
        p_nombre: name,
        p_rol: role,
      },
    );
    if (profileError) {
      await service.auth.admin.deleteUser(created.user.id);
      return fail(profileError);
    }
    return json(req, 200, { usuario: profile });
  }

  if (action === 'ACTUALIZAR_USUARIO') {
    const userId = text(body.usuarioId);
    const name = text(body.nombre);
    const role = text(body.rol);
    if (!UUID.test(userId) || !name || !HUMAN_ROLES.has(role) || typeof body.activo !== 'boolean') {
      return json(req, 400, { error: 'USUARIO_INVALIDO' });
    }
    const { data, error } = await service.rpc('actualizar_perfil', {
      p_actor_id: actorId,
      p_usuario_id: userId,
      p_nombre: name,
      p_rol: role,
      p_activo: body.activo,
    });
    return error ? fail(error) : json(req, 200, { usuario: data });
  }

  if (action === 'RESTABLECER_CONTRASENA') {
    const denied = await requireAdmin();
    if (denied) return denied;
    const userId = text(body.usuarioId);
    const password = typeof body.contrasena === 'string' ? body.contrasena : '';
    if (!UUID.test(userId) || password.length < 8) {
      return json(req, 400, { error: 'CONTRASENA_INVALIDA' });
    }
    const { error } = await service.auth.admin.updateUserById(userId, { password });
    return error ? fail(error) : json(req, 200, { actualizado: true });
  }

  if (action === 'GUARDAR_HOSPITAL') {
    const id = text(body.hospitalId);
    const { data, error } = await service.rpc('guardar_hospital_central', {
      p_actor_id: actorId,
      p_hospital_id: id,
      p_codigo: text(body.codigo),
      p_nombre: text(body.nombre),
      p_ciudad: text(body.ciudad),
      p_nivel_precio: text(body.nivelPrecio),
      p_version_esperada: typeof body.versionEsperada === 'number' ? body.versionEsperada : null,
    });
    return error ? fail(error) : json(req, 200, data);
  }

  if (action === 'CREAR_PRODUCTO') {
    const { data, error } = await service.rpc('crear_producto_central', {
      p_actor_id: actorId,
      p_producto_id: text(body.productoId),
      p_sku: text(body.sku),
      p_nombre: text(body.nombre),
      p_tipo: text(body.tipo),
      p_costo_base_centavos: body.costoBaseCentavos,
    });
    return error ? fail(error) : json(req, 200, data);
  }

  if (action === 'REGISTRAR_PIEZA') {
    const deviceId = text(body.dispositivoId);
    if (!UUID.test(deviceId)) return json(req, 400, { error: 'DISPOSITIVO_INVALIDO' });
    const { error: deviceError } = await service.rpc('registrar_dispositivo', {
      p_actor_id: actorId,
      p_dispositivo_id: deviceId,
      p_nombre: text(body.nombreDispositivo) || 'Navegador web',
      p_plataforma: 'web',
      p_clave_publica: null,
      p_valido_hasta: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      p_metadata: { origen: 'administration' },
    });
    if (deviceError) return fail(deviceError);
    const { data, error } = await service.rpc('registrar_pieza_central', {
      p_actor_id: actorId,
      p_dispositivo_id: deviceId,
      p_pieza_id: text(body.piezaId),
      p_codigo: text(body.codigo),
      p_sku: text(body.sku),
      p_kit_padre_codigo: text(body.kitPadreCodigo) || null,
    });
    return error ? fail(error) : json(req, 200, data);
  }

  if (action === 'PROPONER_EXCEPCION') {
    const { data: product, error: productError } = await service
      .from('productos')
      .select('id')
      .eq('sku', text(body.sku))
      .eq('activo', true)
      .maybeSingle();
    if (productError || !product)
      return fail(productError ?? { message: 'PRODUCTO_NO_ENCONTRADO' });
    const { data, error } = await service.rpc('proponer_excepcion_precio', {
      p_actor_id: actorId,
      p_id: text(body.excepcionId),
      p_hospital_id: text(body.hospitalId),
      p_producto_id: product.id,
      p_precio_centavos: body.precioCentavos,
      p_vigente_desde: text(body.vigenteDesde),
      p_vigente_hasta: text(body.vigenteHasta) || null,
      p_motivo: text(body.motivo) || 'Precio negociado',
      p_observaciones: text(body.observaciones) || null,
    });
    return error ? fail(error) : json(req, 200, { excepcion: data });
  }

  if (action === 'DECIDIR_EXCEPCION') {
    const { data, error } = await service.rpc('decidir_excepcion_precio', {
      p_actor_id: actorId,
      p_excepcion_id: text(body.excepcionId),
      p_decision: text(body.decision),
      p_motivo_decision: text(body.motivo) || null,
    });
    return error ? fail(error) : json(req, 200, data);
  }

  if (action === 'CREAR_ACCESO_FREELANCE') {
    const { data, error } = await service.rpc('crear_acceso_freelance', {
      p_actor_id: actorId,
      p_maleta_id: text(body.maletaId),
      p_expira_en: text(body.expiraEn),
    });
    return error ? fail(error) : json(req, 200, data);
  }

  if (action === 'REVOCAR_ACCESO_FREELANCE') {
    const { data, error } = await service.rpc('revocar_acceso_freelance', {
      p_actor_id: actorId,
      p_acceso_id: text(body.accesoId),
      p_motivo: text(body.motivo) || 'Revocado por el responsable',
    });
    return error ? fail(error) : json(req, 200, data);
  }

  if (action === 'LISTAR_ACCESOS_FREELANCE') {
    const { data: profile } = await service
      .from('perfiles')
      .select('rol,activo')
      .eq('id', actorId)
      .maybeSingle();
    if (!profile?.activo || !['ADMINISTRADOR', 'CONTABLE'].includes(profile.rol)) {
      return json(req, 403, { error: 'ROL_NO_AUTORIZADO' });
    }
    const { data, error } = await service
      .from('accesos_freelance')
      .select('id,maleta_id,token_prefijo,creado_por,creado_en,expira_en,revocado_en')
      .eq('maleta_id', text(body.maletaId))
      .order('creado_en', { ascending: false });
    return error ? fail(error) : json(req, 200, { accesos: data ?? [] });
  }

  return json(req, 400, { error: 'ACCION_DESCONOCIDA' });
});
