-- Comandos de datos maestros. El navegador no recibe DML directo: una Edge
-- Function autentica al actor y estas funciones vuelven a validar su perfil.

create or replace function public.guardar_hospital_central(
  p_actor_id uuid,
  p_hospital_id uuid,
  p_codigo text,
  p_nombre text,
  p_ciudad text,
  p_nivel_precio public.nivel_precio,
  p_version_esperada bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fila public.hospitales%rowtype;
  v_commit bigint;
begin
  perform private.exigir_rol_actor(p_actor_id, array['ADMINISTRADOR']::public.rol_aplicacion[]);
  if p_hospital_id is null
     or nullif(btrim(p_codigo), '') is null
     or nullif(btrim(p_nombre), '') is null
     or nullif(btrim(p_ciudad), '') is null
     or p_nivel_precio = 'BASE' then
    raise exception using errcode = '22023', message = 'HOSPITAL_INVALIDO';
  end if;

  select h.* into v_fila from public.hospitales h
  where h.id = p_hospital_id for update;

  if v_fila.id is null then
    if p_version_esperada is not null then
      raise exception using errcode = '40001', message = 'HOSPITAL_CAMBIO_CONCURRENTE';
    end if;
    insert into public.hospitales (
      id, codigo, nombre, ciudad, nivel_precio, version
    ) values (
      p_hospital_id, btrim(p_codigo), btrim(p_nombre), btrim(p_ciudad), p_nivel_precio, 1
    ) returning * into v_fila;
  else
    if p_version_esperada is not null and v_fila.version <> p_version_esperada then
      raise exception using errcode = '40001', message = 'HOSPITAL_CAMBIO_CONCURRENTE';
    end if;
    update public.hospitales
    set nombre = btrim(p_nombre), ciudad = btrim(p_ciudad),
        nivel_precio = p_nivel_precio, activo = true, eliminado_en = null,
        version = version + 1, actualizado_en = statement_timestamp()
    where id = p_hospital_id returning * into v_fila;
  end if;

  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'HOSPITAL', v_fila.id, v_fila.version, false, to_jsonb(v_fila)
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'GUARDAR_HOSPITAL', 'HOSPITAL', v_fila.id, 'OK',
    jsonb_build_object('commit', v_commit, 'version', v_fila.version)
  );
  return jsonb_build_object(
    'hospital', to_jsonb(v_fila), 'secuenciaServidor', v_commit
  );
end;
$$;

create or replace function public.crear_producto_central(
  p_actor_id uuid,
  p_producto_id uuid,
  p_sku text,
  p_nombre text,
  p_tipo public.tipo_producto,
  p_costo_base_centavos bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fila public.productos%rowtype;
  v_commit bigint;
begin
  perform private.exigir_rol_actor(p_actor_id, array['ADMINISTRADOR']::public.rol_aplicacion[]);
  if p_producto_id is null
     or nullif(btrim(p_sku), '') is null
     or nullif(btrim(p_nombre), '') is null
     or p_costo_base_centavos < 0 then
    raise exception using errcode = '22023', message = 'PRODUCTO_INVALIDO';
  end if;
  insert into public.productos (
    id, sku, nombre, tipo, costo_base_centavos, version
  ) values (
    p_producto_id, btrim(p_sku), btrim(p_nombre), p_tipo,
    p_costo_base_centavos, 1
  ) returning * into v_fila;

  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'PRODUCTO', v_fila.id, v_fila.version, false, to_jsonb(v_fila)
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'CREAR_PRODUCTO', 'PRODUCTO', v_fila.id, 'OK',
    jsonb_build_object('commit', v_commit, 'sku', v_fila.sku::text)
  );
  return jsonb_build_object(
    'producto', to_jsonb(v_fila), 'secuenciaServidor', v_commit
  );
end;
$$;

create or replace function public.registrar_pieza_central(
  p_actor_id uuid,
  p_dispositivo_id uuid,
  p_pieza_id uuid,
  p_codigo text,
  p_sku text,
  p_kit_padre_codigo text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_producto public.productos%rowtype;
  v_bodega_id uuid;
  v_kit_padre_id uuid;
  v_fila public.piezas%rowtype;
  v_commit bigint;
  v_hlc text;
begin
  perform private.exigir_rol_actor(p_actor_id, array['ADMINISTRADOR']::public.rol_aplicacion[]);
  if p_pieza_id is null or p_dispositivo_id is null
     or nullif(btrim(p_codigo), '') is null or nullif(btrim(p_sku), '') is null then
    raise exception using errcode = '22023', message = 'PIEZA_INVALIDA';
  end if;
  if not exists (
    select 1 from public.dispositivo_usuarios du
    join public.dispositivos d on d.id = du.dispositivo_id
    where du.dispositivo_id = p_dispositivo_id and du.usuario_id = p_actor_id
      and du.habilitado and du.valido_hasta > clock_timestamp() and d.activo
  ) then
    raise exception using errcode = '42501', message = 'DISPOSITIVO_NO_HABILITADO';
  end if;

  select p.* into v_producto from public.productos p
  where p.sku = btrim(p_sku)::extensions.citext and p.activo and p.eliminado_en is null;
  if v_producto.id is null then
    raise exception using errcode = 'P0002', message = 'PRODUCTO_NO_ENCONTRADO';
  end if;
  select b.id into v_bodega_id from public.bodegas b
  where b.tipo = 'CENTRAL' and b.activa for update;
  if v_bodega_id is null then
    raise exception using errcode = 'P0002', message = 'BODEGA_CENTRAL_NO_CONFIGURADA';
  end if;

  if nullif(btrim(p_kit_padre_codigo), '') is not null then
    select p.id into v_kit_padre_id from public.piezas p
    join public.productos pr on pr.id = p.producto_id
    where p.codigo = btrim(p_kit_padre_codigo)::extensions.citext
      and p.eliminado_en is null and pr.tipo = 'KIT';
    if v_kit_padre_id is null then
      raise exception using errcode = 'P0002', message = 'KIT_PADRE_NO_ENCONTRADO';
    end if;
  end if;

  v_hlc := format('000000000000000:00000:%s', p_dispositivo_id);
  insert into public.piezas (
    id, codigo, producto_id, estado, bodega_retorno_id, kit_padre_id,
    version, ultimo_hlc, ultimo_hlc_milisegundos, ultimo_hlc_contador,
    ultimo_hlc_dispositivo_id
  ) values (
    p_pieza_id, btrim(p_codigo), v_producto.id, 'EN_BODEGA_CENTRAL',
    v_bodega_id, v_kit_padre_id, 1, v_hlc, 0, 0, p_dispositivo_id
  ) returning * into v_fila;

  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'PIEZA', v_fila.id, v_fila.version, false,
    private.snapshot_pieza(v_fila.id)
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'REGISTRAR_PIEZA', 'PIEZA', v_fila.id, 'OK',
    jsonb_build_object('commit', v_commit, 'codigo', v_fila.codigo::text)
  );
  return jsonb_build_object(
    'pieza', private.snapshot_pieza(v_fila.id), 'secuenciaServidor', v_commit
  );
end;
$$;

-- Los cambios de perfil forman parte del change log para converger sin
-- esperar un nuevo inicio de sesión.
create or replace function public.actualizar_perfil(
  p_actor_id uuid,
  p_usuario_id uuid,
  p_nombre text,
  p_rol public.rol_aplicacion,
  p_activo boolean
)
returns public.perfiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_anterior public.perfiles%rowtype;
  v_nuevo public.perfiles%rowtype;
  v_commit bigint;
begin
  perform private.exigir_rol_actor(p_actor_id, array['ADMINISTRADOR']::public.rol_aplicacion[]);
  if p_rol = 'SISTEMA' or nullif(btrim(p_nombre), '') is null then
    raise exception using errcode = '22023', message = 'PERFIL_INVALIDO';
  end if;
  select p.* into v_anterior from public.perfiles p where p.id = p_usuario_id for update;
  if v_anterior.id is null then
    raise exception using errcode = 'P0002', message = 'PERFIL_NO_ENCONTRADO';
  end if;
  if v_anterior.origen = 'PRODUCCION' and v_anterior.rol = 'ADMINISTRADOR'
     and (p_rol <> 'ADMINISTRADOR' or not p_activo)
     and not exists (
       select 1 from public.perfiles p
       where p.origen = 'PRODUCCION' and p.rol = 'ADMINISTRADOR'
         and p.activo and p.id <> p_usuario_id
     ) then
    raise exception using errcode = '55000', message = 'NO_SE_PUEDE_DESACTIVAR_ULTIMO_ADMIN';
  end if;

  update public.perfiles
  set nombre = btrim(p_nombre), rol = p_rol, activo = p_activo,
      actualizado_en = statement_timestamp()
  where id = p_usuario_id returning * into v_nuevo;
  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'PERFIL', v_nuevo.id, 0, false, to_jsonb(v_nuevo)
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'ACTUALIZAR_PERFIL', 'PERFIL', p_usuario_id, 'OK',
    jsonb_build_object(
      'rolAnterior', v_anterior.rol, 'rolNuevo', v_nuevo.rol,
      'activoAnterior', v_anterior.activo, 'activoNuevo', v_nuevo.activo,
      'commit', v_commit
    )
  );
  return v_nuevo;
end;
$$;

create or replace function public.provisionar_usuario_por_admin(
  p_actor_id uuid,
  p_usuario_id uuid,
  p_nombre text,
  p_rol public.rol_aplicacion
)
returns public.perfiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_commit bigint;
begin
  perform private.exigir_rol_actor(p_actor_id, array['ADMINISTRADOR']::public.rol_aplicacion[]);
  if not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception using errcode = 'P0002', message = 'USUARIO_AUTH_NO_EXISTE';
  end if;
  if p_rol = 'SISTEMA' or nullif(btrim(p_nombre), '') is null then
    raise exception using errcode = '22023', message = 'PERFIL_INVALIDO';
  end if;
  insert into public.perfiles (id, nombre, rol, activo)
  values (p_usuario_id, btrim(p_nombre), p_rol, true)
  returning * into v_perfil;
  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'PERFIL', v_perfil.id, 0, false, to_jsonb(v_perfil)
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'PROVISIONAR_USUARIO', 'PERFIL', p_usuario_id, 'OK',
    jsonb_build_object('rol', p_rol, 'commit', v_commit)
  );
  return v_perfil;
end;
$$;

create or replace function public.validar_acceso_freelance(p_token text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_maleta_id uuid;
  v_procedimiento text;
  v_estado public.estado_maleta;
  v_expira_en timestamptz;
begin
  perform private.exigir_service_role();
  if nullif(btrim(p_token), '') is null then
    raise exception using errcode = '42501', message = 'TOKEN_FREELANCE_INVALIDO';
  end if;
  select m.id, m.procedimiento, m.estado, a.expira_en
    into v_maleta_id, v_procedimiento, v_estado, v_expira_en
  from public.accesos_freelance a
  join public.maletas m on m.id = a.maleta_id
  where a.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and a.revocado_en is null and a.expira_en > clock_timestamp()
    and m.estado in ('EN_ARMADO', 'EN_CIRUGIA');
  if v_maleta_id is null then
    raise exception using errcode = '42501', message = 'TOKEN_FREELANCE_INVALIDO';
  end if;
  return jsonb_build_object(
    'maletaId', v_maleta_id, 'procedimiento', v_procedimiento,
    'estado', v_estado, 'expiraEn', v_expira_en
  );
end;
$$;

create or replace function public.obtener_cambios_freelance(
  p_sesion_id uuid,
  p_dispositivo_id uuid,
  p_cursor bigint,
  p_max_commits integer default 100
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_maleta_id uuid;
  v_cursor_actual bigint := coalesce(p_cursor, 0);
  v_cursor_nuevo bigint;
  v_commits jsonb;
begin
  perform private.exigir_service_role();
  select a.maleta_id into v_maleta_id
  from public.sesiones_freelance sf
  join public.accesos_freelance a on a.id = sf.acceso_id
  join public.maletas m on m.id = a.maleta_id
  join public.configuracion_sistema c on c.singleton
  where sf.id = p_sesion_id and sf.dispositivo_id = p_dispositivo_id
    and sf.revocada_en is null and sf.expira_en > clock_timestamp()
    and a.revocado_en is null and a.expira_en > clock_timestamp()
    and m.estado in ('EN_ARMADO', 'EN_CIRUGIA')
    and c.ciclo_vida in ('DEMO', 'PRODUCCION');
  if v_maleta_id is null then
    raise exception using errcode = '42501', message = 'SESION_FREELANCE_INVALIDA';
  end if;
  if v_cursor_actual < 0
     or p_max_commits not between 1 and 100
     or v_cursor_actual > (select siguiente_secuencia - 1 from private.cabeza_sync where singleton) then
    raise exception using errcode = '22023', message = 'CURSOR_INVALIDO';
  end if;

  with seleccionados as materialized (
    select c.secuencia_servidor, c.id, c.creado_en
    from public.commits_sync c
    where c.secuencia_servidor > v_cursor_actual
    order by c.secuencia_servidor
    limit p_max_commits
  )
  select
    coalesce(max(s.secuencia_servidor), v_cursor_actual),
    coalesce(jsonb_agg(jsonb_build_object(
      'secuenciaServidor', s.secuencia_servidor,
      'commitId', s.id,
      'creadoEn', s.creado_en,
      'cambios', coalesce((
        select jsonb_agg(jsonb_build_object(
          'ordinal', cs.ordinal, 'entidadTipo', cs.entidad_tipo,
          'entidadId', cs.entidad_id, 'version', cs.entidad_version,
          'eliminado', cs.eliminado, 'payload', cs.payload
        ) order by cs.ordinal)
        from public.cambios_sync cs
        where cs.secuencia_servidor = s.secuencia_servidor
          and (
            (cs.entidad_tipo = 'MALETA' and cs.entidad_id = v_maleta_id)
            or (cs.entidad_tipo = 'PIEZA' and exists (
              select 1 from public.maleta_items mi
              where mi.maleta_id = v_maleta_id and mi.pieza_id = cs.entidad_id
            ))
            or (cs.entidad_tipo = 'MALETA_ITEM' and exists (
              select 1 from public.maleta_items mi
              where mi.maleta_id = v_maleta_id and mi.id = cs.entidad_id
            ))
            or (cs.entidad_tipo = 'CICLO_REPROCESAMIENTO' and exists (
              select 1 from public.ciclos_reprocesamiento cr
              where cr.maleta_origen_id = v_maleta_id and cr.id = cs.entidad_id
            ))
            or (cs.entidad_tipo = 'PRODUCTO' and exists (
              select 1 from public.piezas p
              join public.maleta_items mi on mi.pieza_id = p.id
              where mi.maleta_id = v_maleta_id and p.producto_id = cs.entidad_id
            ))
          )
      ), '[]'::jsonb)
    ) order by s.secuencia_servidor), '[]'::jsonb)
  into v_cursor_nuevo, v_commits
  from seleccionados s;

  update public.dispositivos
  set ultimo_cursor = greatest(ultimo_cursor, v_cursor_actual),
      ultimo_sync_en = clock_timestamp()
  where id = p_dispositivo_id;
  return jsonb_build_object(
    'cursorAnterior', v_cursor_actual, 'cursorServidor', v_cursor_nuevo,
    'commits', v_commits,
    'hayMas', exists (
      select 1 from public.commits_sync c where c.secuencia_servidor > v_cursor_nuevo
    )
  );
end;
$$;

-- La primera ubicación productiva se crea en el mismo commit irreversible
-- que activa producción; así la primera pieza real nunca queda sin destino.
create or replace function public.activar_produccion(p_primer_admin_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.exigir_service_role();
  if not exists (
    select 1 from public.perfiles p
    join public.configuracion_sistema c on c.singleton
    where p.id = p_primer_admin_id and p.activo and p.rol = 'ADMINISTRADOR'
      and p.origen = 'PRODUCCION' and c.ciclo_vida = 'LISTO_BOOTSTRAP'
  ) then
    raise exception using errcode = '42501', message = 'PRIMER_ADMIN_PRODUCTIVO_REQUERIDO';
  end if;
  if exists (
    select 1 from private.handoff_auth_pendientes h
    join auth.users u on u.id = h.usuario_id
  ) then
    raise exception using errcode = '55000', message = 'USUARIOS_DEMO_AUTH_REMANENTES';
  end if;

  update public.configuracion_sistema
  set ciclo_vida = 'PRODUCCION', actualizado_en = statement_timestamp()
  where singleton and ciclo_vida = 'LISTO_BOOTSTRAP';
  if not found then
    raise exception using errcode = '55000', message = 'TRANSICION_A_PRODUCCION_INVALIDA';
  end if;
  insert into public.bodegas (codigo, nombre, tipo)
  values ('CENTRAL', 'Bodega central', 'CENTRAL')
  on conflict (codigo) do nothing;
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado
  ) values (
    p_primer_admin_id, 'ACTIVAR_PRODUCCION', 'CONFIGURACION_SISTEMA',
    p_primer_admin_id, 'OK'
  );
  return jsonb_build_object('estado', 'PRODUCCION', 'primerAdministradorId', p_primer_admin_id);
end;
$$;

revoke all on function public.guardar_hospital_central(uuid, uuid, text, text, text, public.nivel_precio, bigint) from public, anon, authenticated;
revoke all on function public.crear_producto_central(uuid, uuid, text, text, public.tipo_producto, bigint) from public, anon, authenticated;
revoke all on function public.registrar_pieza_central(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.validar_acceso_freelance(text) from public, anon, authenticated;
revoke all on function public.obtener_cambios_freelance(uuid, uuid, bigint, integer) from public, anon, authenticated;

grant execute on function public.guardar_hospital_central(uuid, uuid, text, text, text, public.nivel_precio, bigint) to service_role;
grant execute on function public.crear_producto_central(uuid, uuid, text, text, public.tipo_producto, bigint) to service_role;
grant execute on function public.registrar_pieza_central(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.validar_acceso_freelance(text) to service_role;
grant execute on function public.obtener_cambios_freelance(uuid, uuid, bigint, integer) to service_role;

comment on function public.obtener_cambios_freelance(uuid, uuid, bigint, integer) is
  'PULL incremental restringido al agregado de la maleta autorizado por una sesión freelance.';
