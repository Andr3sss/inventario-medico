import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { corsHeaders, origenPermitido, responderPreflight } from '../_shared/http.ts';
import { validarPerfilActivoServidor } from '../_shared/auth.ts';

const MAX_BODY_BYTES = 128 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HUMAN_ROLES = new Set([
  'ADMINISTRADOR',
  'AUXILIAR',
  'COORDINADORA',
  'CONTABLE',
  'SUPERVISOR',
]);

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

function contrasenaValida(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 12 &&
    value.length <= 72 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return responderPreflight(req);
  if (!origenPermitido(req)) return json(req, 403, { error: 'ORIGEN_NO_PERMITIDO' });
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
  const perfilError = await validarPerfilActivoServidor(service, actorId);
  if (perfilError !== null) return json(req, 403, { error: perfilError });

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

  const requireAdminPin = async (value: unknown): Promise<Response | null> => {
    const adminPin = text(value);
    if (!/^[0-9]{8}$/.test(adminPin)) {
      return json(req, 400, { error: 'PIN_ADMIN_DEBIL' });
    }
    let { data: pinCheck, error: pinError } = await service.rpc('verificar_pin_administrador', {
      p_actor_id: actorId,
      p_pin: adminPin,
    });
    if (pinError) return fail(pinError);
    if (record(pinCheck)?.codigo === 'PIN_ADMIN_NO_CONFIGURADO') {
      const { error: setupError } = await service.rpc('configurar_pin_administrador', {
        p_actor_id: actorId,
        p_pin: adminPin,
      });
      if (setupError) return fail(setupError);
      const retry = await service.rpc('verificar_pin_administrador', {
        p_actor_id: actorId,
        p_pin: adminPin,
      });
      pinCheck = retry.data;
      pinError = retry.error;
      if (pinError) return fail(pinError);
    }
    const pin = record(pinCheck);
    return pin?.ok === true
      ? null
      : json(req, 403, {
          error: typeof pin?.codigo === 'string' ? pin.codigo : 'PIN_ADMIN_INVALIDO',
          esperaSegundos: typeof pin?.esperaSegundos === 'number' ? pin.esperaSegundos : null,
        });
  };

  if (action === 'LISTAR_USUARIOS') {
    const denied = await requireAdmin();
    if (denied) return denied;
    const { data: perfiles, error } = await service
      .from('perfiles')
      .select('id,nombre,rol,activo')
      .is('eliminado_en', null)
      .order('nombre');
    if (error) return fail(error);

    const correos = new Map<string, string>();
    let pagina = 1;
    for (;;) {
      const { data: auth, error: authError } = await service.auth.admin.listUsers({
        page: pagina,
        perPage: 1000,
      });
      if (authError) return fail(authError);
      for (const usuario of auth.users) {
        if (usuario.email) correos.set(usuario.id, usuario.email.toLowerCase());
      }
      if (auth.nextPage === null) break;
      pagina = auth.nextPage;
    }

    return json(req, 200, {
      usuarios: (perfiles ?? []).map((perfil) => ({
        ...perfil,
        correo: correos.get(perfil.id) ?? null,
      })),
    });
  }

  if (action === 'LISTAR_DISPOSITIVOS') {
    const denied = await requireAdmin();
    if (denied) return denied;
    const { data, error } = await service
      .from('dispositivos')
      .select('id,nombre,plataforma,activo,ultimo_sync_en,retirado_en')
      .order('ultimo_sync_en', { ascending: false, nullsFirst: false });
    return error ? fail(error) : json(req, 200, { dispositivos: data ?? [] });
  }

  if (action === 'CONFIGURAR_PIN_ADMIN') {
    const denied = await requireAdmin();
    if (denied) return denied;
    const pinDenied = await requireAdminPin(body.pinAdministrador);
    return pinDenied ?? json(req, 200, { configurado: true });
  }

  if (action === 'REVOCAR_DISPOSITIVO') {
    const deviceId = text(body.dispositivoId);
    if (!UUID.test(deviceId) || !text(body.motivo)) {
      return json(req, 400, { error: 'REVOCACION_INVALIDA' });
    }
    const { data, error } = await service.rpc('revocar_dispositivo', {
      p_actor_id: actorId,
      p_dispositivo_id: deviceId,
      p_motivo: text(body.motivo),
    });
    return error ? fail(error) : json(req, 200, { dispositivo: data });
  }

  if (action === 'CREAR_USUARIO') {
    const denied = await requireAdmin();
    if (denied) return denied;
    const pinDenied = await requireAdminPin(body.pinAdministrador);
    if (pinDenied) return pinDenied;
    const email = text(body.correo).toLowerCase();
    const name = text(body.nombre);
    const role = text(body.rol);
    const password = body.contrasena;
    if (
      !EMAIL.test(email) ||
      email.length > 254 ||
      !name ||
      name.length > 160 ||
      !HUMAN_ROLES.has(role) ||
      !contrasenaValida(password)
    ) {
      return json(req, 400, { error: 'USUARIO_INVALIDO' });
    }
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: name },
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
    return json(req, 200, {
      usuario: { ...profile, correo: created.user.email?.toLowerCase() ?? email },
    });
  }

  if (action === 'EDITAR_USUARIO') {
    const denied = await requireAdmin();
    if (denied) return denied;
    const userId = text(body.usuarioId);
    const email = text(body.correo).toLowerCase();
    const name = text(body.nombre);
    const role = text(body.rol);
    if (
      !UUID.test(userId) ||
      !EMAIL.test(email) ||
      email.length > 254 ||
      !name ||
      name.length > 160 ||
      !HUMAN_ROLES.has(role)
    ) {
      return json(req, 400, { error: 'USUARIO_INVALIDO' });
    }

    const { data: previousProfile, error: profileReadError } = await service
      .from('perfiles')
      .select('id,nombre,rol,activo,eliminado_en')
      .eq('id', userId)
      .maybeSingle();
    if (profileReadError || !previousProfile || previousProfile.eliminado_en !== null) {
      return fail(profileReadError ?? { message: 'PERFIL_NO_ENCONTRADO', code: 'P0002' });
    }
    if (userId === actorId && role !== previousProfile.rol) {
      return json(req, 409, { error: 'NO_SE_PUEDE_MODIFICAR_PROPIO_ACCESO' });
    }

    const { data: previousAuth, error: authReadError } =
      await service.auth.admin.getUserById(userId);
    if (authReadError || !previousAuth.user.email) return fail(authReadError);
    const previousEmail = previousAuth.user.email;
    const previousMetadata = previousAuth.user.user_metadata;
    const { data: updatedAuth, error: authUpdateError } = await service.auth.admin.updateUserById(
      userId,
      {
        email,
        user_metadata: { ...previousMetadata, nombre: name },
      },
    );
    if (authUpdateError) return fail(authUpdateError);

    const { data: profile, error: profileError } = await service.rpc('actualizar_perfil', {
      p_actor_id: actorId,
      p_usuario_id: userId,
      p_nombre: name,
      p_rol: role,
      p_activo: previousProfile.activo,
    });
    if (profileError) {
      const { error: rollbackError } = await service.auth.admin.updateUserById(userId, {
        email: previousEmail,
        user_metadata: previousMetadata,
      });
      if (rollbackError) {
        console.error('No se pudo revertir Auth despues de fallar el perfil', {
          userId,
          profileError: profileError.message,
          rollbackError: rollbackError.message,
        });
        return json(req, 500, {
          error: 'ACTUALIZACION_AUTH_PARCIAL',
          detalle: 'El correo cambio, pero el perfil no pudo actualizarse. Reintente la edicion.',
        });
      }
      return fail(profileError);
    }
    return json(req, 200, {
      usuario: {
        ...profile,
        correo: updatedAuth.user.email?.toLowerCase() ?? email,
      },
    });
  }

  if (action === 'ACTUALIZAR_USUARIO') {
    const denied = await requireAdmin();
    if (denied) return denied;
    const userId = text(body.usuarioId);
    const name = text(body.nombre);
    const role = text(body.rol);
    if (!UUID.test(userId) || !name || !HUMAN_ROLES.has(role) || typeof body.activo !== 'boolean') {
      return json(req, 400, { error: 'USUARIO_INVALIDO' });
    }
    if (body.activo === true) {
      const { error: unbanError } = await service.auth.admin.updateUserById(userId, {
        ban_duration: 'none',
      });
      if (unbanError) return fail(unbanError);
    }
    const { data, error } = await service.rpc('actualizar_perfil', {
      p_actor_id: actorId,
      p_usuario_id: userId,
      p_nombre: name,
      p_rol: role,
      p_activo: body.activo,
    });
    if (error) return fail(error);
    if (body.activo === false) {
      const { error: banError } = await service.auth.admin.updateUserById(userId, {
        ban_duration: '876000h',
      });
      if (banError) {
        return json(req, 500, {
          error: 'REVOCACION_AUTH_PARCIAL',
          detalle:
            'El perfil y sus dispositivos quedaron inactivos, pero Supabase Auth no pudo bloquear la cuenta.',
        });
      }
    }
    const { data: auth } = await service.auth.admin.getUserById(userId);
    return json(req, 200, {
      usuario: { ...data, correo: auth.user?.email?.toLowerCase() ?? null },
    });
  }

  if (action === 'CAMBIAR_CONTRASENA_USUARIO') {
    const denied = await requireAdmin();
    if (denied) return denied;
    const userId = text(body.usuarioId);
    const password = body.contrasena;
    if (!UUID.test(userId) || !contrasenaValida(password)) {
      return json(req, 400, { error: 'CAMBIO_CONTRASENA_INVALIDO' });
    }
    const pinDenied = await requireAdminPin(body.pinAdministrador);
    if (pinDenied) return pinDenied;

    const { data: profile, error: profileError } = await service
      .from('perfiles')
      .select('id,nombre,rol,activo,eliminado_en')
      .eq('id', userId)
      .maybeSingle();
    if (
      profileError ||
      !profile ||
      profile.eliminado_en !== null ||
      !HUMAN_ROLES.has(profile.rol)
    ) {
      return json(req, 409, { error: 'USUARIO_NO_ADMITE_CONTRASENA' });
    }
    const { data: auth, error: authError } = await service.auth.admin.updateUserById(userId, {
      password,
    });
    if (authError) return fail(authError);
    const { error: auditError } = await service.rpc('registrar_cambio_contrasena_admin', {
      p_actor_id: actorId,
      p_usuario_id: userId,
    });
    if (auditError) {
      console.error('Contraseña actualizada pero no se pudo completar la revocación', {
        actorId,
        userId,
        error: auditError.message,
      });
      return json(req, 500, {
        error: 'CAMBIO_CONTRASENA_PARCIAL',
        detalle:
          'La contraseña cambió, pero no se pudieron revocar todos los accesos offline. Reintente la operación.',
      });
    }
    return json(req, 200, {
      usuario: { ...profile, correo: auth.user.email?.toLowerCase() ?? null },
    });
  }

  if (action === 'ELIMINAR_USUARIO') {
    const denied = await requireAdmin();
    if (denied) return denied;
    const userId = text(body.usuarioId);
    if (!UUID.test(userId) || text(body.confirmacion) !== 'ELIMINAR') {
      return json(req, 400, { error: 'CONFIRMACION_ELIMINACION_INVALIDA' });
    }
    if (userId === actorId) {
      return json(req, 409, { error: 'NO_SE_PUEDE_ELIMINAR_PROPIA_CUENTA' });
    }

    const { data: authAnterior, error: authReadError } =
      await service.auth.admin.getUserById(userId);
    if (authReadError && authReadError.status !== 404) return fail(authReadError);

    const { data, error } = await service.rpc('eliminar_perfil_por_admin', {
      p_actor_id: actorId,
      p_usuario_id: userId,
    });
    if (error) return fail(error);

    if (authAnterior.user) {
      const { error: deleteError } = await service.auth.admin.deleteUser(userId, false);
      if (deleteError) {
        console.error('Perfil anonimizado pero Auth no pudo eliminarse', {
          userId,
          error: deleteError.message,
        });
        return json(req, 500, {
          error: 'ELIMINACION_AUTH_PARCIAL',
          detalle:
            'El acceso quedo revocado y anonimizado, pero Auth no pudo eliminarse. Reintente la eliminacion.',
        });
      }
    }
    return json(req, 200, { eliminado: true, resultado: data });
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

  if (action === 'ELIMINAR_HOSPITAL') {
    const { data, error } = await service.rpc('eliminar_hospital_central', {
      p_actor_id: actorId,
      p_hospital_id: text(body.hospitalId),
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

  if (action === 'ACTUALIZAR_PRODUCTO') {
    const { data, error } = await service.rpc('actualizar_producto_central', {
      p_actor_id: actorId,
      p_sku: text(body.sku),
      p_nombre: text(body.nombre),
      p_tipo: text(body.tipo),
      p_costo_base_centavos: body.costoBaseCentavos,
      p_version_esperada: typeof body.versionEsperada === 'number' ? body.versionEsperada : null,
    });
    return error ? fail(error) : json(req, 200, data);
  }

  if (action === 'ELIMINAR_PRODUCTO') {
    const { data, error } = await service.rpc('eliminar_producto_central', {
      p_actor_id: actorId,
      p_sku: text(body.sku),
      p_version_esperada: typeof body.versionEsperada === 'number' ? body.versionEsperada : null,
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

  if (action === 'ACTUALIZAR_PIEZA' || action === 'ELIMINAR_PIEZA') {
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
    if (action === 'ACTUALIZAR_PIEZA') {
      const { data, error } = await service.rpc('actualizar_pieza_central', {
        p_actor_id: actorId,
        p_dispositivo_id: deviceId,
        p_codigo: text(body.codigo),
        p_sku: text(body.sku),
        p_kit_padre_codigo: text(body.kitPadreCodigo) || null,
        p_version_esperada: typeof body.versionEsperada === 'number' ? body.versionEsperada : null,
      });
      return error ? fail(error) : json(req, 200, data);
    }
    const { data, error } = await service.rpc('eliminar_pieza_central', {
      p_actor_id: actorId,
      p_dispositivo_id: deviceId,
      p_codigo: text(body.codigo),
      p_version_esperada: typeof body.versionEsperada === 'number' ? body.versionEsperada : null,
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
