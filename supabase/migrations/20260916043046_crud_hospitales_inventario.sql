-- CRUD administrativo de datos maestros. Las bajas son logicas: las filas
-- historicas siguen disponibles para facturas, eventos y auditoria, mientras
-- el change log retira la entidad de las replicas operativas.

create or replace function public.eliminar_hospital_central(
  p_actor_id uuid,
  p_hospital_id uuid,
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
  select h.* into v_fila from public.hospitales h
  where h.id = p_hospital_id and h.activo and h.eliminado_en is null
  for update;
  if v_fila.id is null then
    raise exception using errcode = 'P0002', message = 'HOSPITAL_NO_ENCONTRADO';
  end if;
  if p_version_esperada is not null and v_fila.version <> p_version_esperada then
    raise exception using errcode = '40001', message = 'HOSPITAL_CAMBIO_CONCURRENTE';
  end if;

  update public.hospitales
  set activo = false,
      eliminado_en = statement_timestamp(),
      version = version + 1,
      actualizado_en = statement_timestamp()
  where id = v_fila.id
  returning * into v_fila;

  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'HOSPITAL', v_fila.id, v_fila.version, true, to_jsonb(v_fila)
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'ELIMINAR_HOSPITAL', 'HOSPITAL', v_fila.id, 'OK',
    jsonb_build_object('commit', v_commit, 'version', v_fila.version)
  );
  return jsonb_build_object('hospital', to_jsonb(v_fila), 'secuenciaServidor', v_commit);
end;
$$;

create or replace function public.actualizar_producto_central(
  p_actor_id uuid,
  p_sku text,
  p_nombre text,
  p_tipo public.tipo_producto,
  p_costo_base_centavos bigint,
  p_version_esperada bigint default null
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
  if nullif(btrim(p_sku), '') is null
     or nullif(btrim(p_nombre), '') is null
     or p_costo_base_centavos is null
     or p_costo_base_centavos < 0 then
    raise exception using errcode = '22023', message = 'PRODUCTO_INVALIDO';
  end if;
  select p.* into v_fila from public.productos p
  where p.sku = btrim(p_sku)::extensions.citext
    and p.activo and p.eliminado_en is null
  for update;
  if v_fila.id is null then
    raise exception using errcode = 'P0002', message = 'PRODUCTO_NO_ENCONTRADO';
  end if;
  if p_version_esperada is not null and v_fila.version <> p_version_esperada then
    raise exception using errcode = '40001', message = 'PRODUCTO_CAMBIO_CONCURRENTE';
  end if;
  if v_fila.tipo <> p_tipo and exists (
    select 1 from public.piezas p
    where p.producto_id = v_fila.id and p.eliminado_en is null
  ) then
    raise exception using errcode = '23503', message = 'PRODUCTO_TIPO_CON_PIEZAS';
  end if;

  update public.productos
  set nombre = btrim(p_nombre),
      tipo = p_tipo,
      costo_base_centavos = p_costo_base_centavos,
      version = version + 1,
      actualizado_en = statement_timestamp()
  where id = v_fila.id
  returning * into v_fila;

  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'PRODUCTO', v_fila.id, v_fila.version, false, to_jsonb(v_fila)
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'ACTUALIZAR_PRODUCTO', 'PRODUCTO', v_fila.id, 'OK',
    jsonb_build_object('commit', v_commit, 'sku', v_fila.sku::text, 'version', v_fila.version)
  );
  return jsonb_build_object('producto', to_jsonb(v_fila), 'secuenciaServidor', v_commit);
end;
$$;

create or replace function public.eliminar_producto_central(
  p_actor_id uuid,
  p_sku text,
  p_version_esperada bigint default null
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
  select p.* into v_fila from public.productos p
  where p.sku = btrim(p_sku)::extensions.citext
    and p.activo and p.eliminado_en is null
  for update;
  if v_fila.id is null then
    raise exception using errcode = 'P0002', message = 'PRODUCTO_NO_ENCONTRADO';
  end if;
  if p_version_esperada is not null and v_fila.version <> p_version_esperada then
    raise exception using errcode = '40001', message = 'PRODUCTO_CAMBIO_CONCURRENTE';
  end if;
  if exists (
    select 1 from public.piezas p
    where p.producto_id = v_fila.id and p.eliminado_en is null
  ) then
    raise exception using errcode = '23503', message = 'PRODUCTO_TIENE_PIEZAS';
  end if;
  if exists (
    select 1 from public.producto_componentes_kit c
    join public.productos k on k.id = c.kit_producto_id
    join public.productos p on p.id = c.componente_producto_id
    where (c.kit_producto_id = v_fila.id or c.componente_producto_id = v_fila.id)
      and k.activo and k.eliminado_en is null and p.activo and p.eliminado_en is null
  ) then
    raise exception using errcode = '23503', message = 'PRODUCTO_FORMA_PARTE_DE_KIT';
  end if;

  update public.productos
  set activo = false,
      eliminado_en = statement_timestamp(),
      version = version + 1,
      actualizado_en = statement_timestamp()
  where id = v_fila.id
  returning * into v_fila;

  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'PRODUCTO', v_fila.id, v_fila.version, true, to_jsonb(v_fila)
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'ELIMINAR_PRODUCTO', 'PRODUCTO', v_fila.id, 'OK',
    jsonb_build_object('commit', v_commit, 'sku', v_fila.sku::text, 'version', v_fila.version)
  );
  return jsonb_build_object('producto', to_jsonb(v_fila), 'secuenciaServidor', v_commit);
end;
$$;

create or replace function public.actualizar_pieza_central(
  p_actor_id uuid,
  p_dispositivo_id uuid,
  p_codigo text,
  p_sku text,
  p_kit_padre_codigo text default null,
  p_version_esperada bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fila public.piezas%rowtype;
  v_producto public.productos%rowtype;
  v_kit_padre_id uuid;
  v_commit bigint;
  v_milisegundos bigint;
begin
  perform private.exigir_rol_actor(p_actor_id, array['ADMINISTRADOR']::public.rol_aplicacion[]);
  if p_dispositivo_id is null or nullif(btrim(p_codigo), '') is null
     or nullif(btrim(p_sku), '') is null then
    raise exception using errcode = '22023', message = 'PIEZA_INVALIDA';
  end if;
  select p.* into v_fila from public.piezas p
  where p.codigo = btrim(p_codigo)::extensions.citext and p.eliminado_en is null
  for update;
  if v_fila.id is null then
    raise exception using errcode = 'P0002', message = 'PIEZA_NO_ENCONTRADA';
  end if;
  if v_fila.estado <> 'EN_BODEGA_CENTRAL' or v_fila.maleta_actual_id is not null then
    raise exception using errcode = '55000', message = 'PIEZA_NO_EDITABLE_EN_ESTADO_ACTUAL';
  end if;
  if p_version_esperada is not null and v_fila.version <> p_version_esperada then
    raise exception using errcode = '40001', message = 'PIEZA_CAMBIO_CONCURRENTE';
  end if;
  select p.* into v_producto from public.productos p
  where p.sku = btrim(p_sku)::extensions.citext and p.activo and p.eliminado_en is null;
  if v_producto.id is null then
    raise exception using errcode = 'P0002', message = 'PRODUCTO_NO_ENCONTRADO';
  end if;
  if v_producto.id <> v_fila.producto_id and (
    exists (select 1 from public.eventos_dominio e where e.pieza_id = v_fila.id)
    or exists (select 1 from public.maleta_items i where i.pieza_id = v_fila.id)
    or exists (select 1 from public.factura_lineas f where f.pieza_id = v_fila.id)
  ) then
    raise exception using errcode = '55000', message = 'PIEZA_CON_HISTORIAL_NO_CAMBIA_PRODUCTO';
  end if;

  if nullif(btrim(p_kit_padre_codigo), '') is not null then
    select p.id into v_kit_padre_id from public.piezas p
    join public.productos pr on pr.id = p.producto_id
    where p.codigo = btrim(p_kit_padre_codigo)::extensions.citext
      and p.id <> v_fila.id and p.eliminado_en is null
      and pr.activo and pr.eliminado_en is null and pr.tipo = 'KIT';
    if v_kit_padre_id is null then
      raise exception using errcode = 'P0002', message = 'KIT_PADRE_NO_ENCONTRADO';
    end if;
  end if;

  v_milisegundos := greatest(
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    v_fila.ultimo_hlc_milisegundos + 1
  );
  update public.piezas
  set producto_id = v_producto.id,
      kit_padre_id = v_kit_padre_id,
      version = version + 1,
      ultimo_hlc_milisegundos = v_milisegundos,
      ultimo_hlc_contador = 0,
      ultimo_hlc_dispositivo_id = p_dispositivo_id,
      ultimo_hlc = lpad(v_milisegundos::text, 15, '0') || ':00000:' || p_dispositivo_id::text,
      actualizado_en = statement_timestamp()
  where id = v_fila.id
  returning * into v_fila;

  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'PIEZA', v_fila.id, v_fila.version, false, private.snapshot_pieza(v_fila.id)
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'ACTUALIZAR_PIEZA', 'PIEZA', v_fila.id, 'OK',
    jsonb_build_object('commit', v_commit, 'codigo', v_fila.codigo::text, 'version', v_fila.version)
  );
  return jsonb_build_object(
    'pieza', private.snapshot_pieza(v_fila.id), 'secuenciaServidor', v_commit
  );
end;
$$;

create or replace function public.eliminar_pieza_central(
  p_actor_id uuid,
  p_dispositivo_id uuid,
  p_codigo text,
  p_version_esperada bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fila public.piezas%rowtype;
  v_commit bigint;
  v_milisegundos bigint;
begin
  perform private.exigir_rol_actor(p_actor_id, array['ADMINISTRADOR']::public.rol_aplicacion[]);
  if p_dispositivo_id is null or nullif(btrim(p_codigo), '') is null then
    raise exception using errcode = '22023', message = 'PIEZA_INVALIDA';
  end if;
  select p.* into v_fila from public.piezas p
  where p.codigo = btrim(p_codigo)::extensions.citext and p.eliminado_en is null
  for update;
  if v_fila.id is null then
    raise exception using errcode = 'P0002', message = 'PIEZA_NO_ENCONTRADA';
  end if;
  if v_fila.estado <> 'EN_BODEGA_CENTRAL' or v_fila.maleta_actual_id is not null then
    raise exception using errcode = '55000', message = 'PIEZA_NO_ELIMINABLE_EN_ESTADO_ACTUAL';
  end if;
  if p_version_esperada is not null and v_fila.version <> p_version_esperada then
    raise exception using errcode = '40001', message = 'PIEZA_CAMBIO_CONCURRENTE';
  end if;
  if exists (
    select 1 from public.piezas h
    where h.kit_padre_id = v_fila.id and h.eliminado_en is null
  ) or exists (
    select 1 from public.membresias_kit_pieza m
    where (m.kit_pieza_id = v_fila.id or m.componente_pieza_id = v_fila.id)
      and m.retirado_en is null
  ) then
    raise exception using errcode = '23503', message = 'PIEZA_FORMA_PARTE_DE_KIT';
  end if;

  v_milisegundos := greatest(
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    v_fila.ultimo_hlc_milisegundos + 1
  );
  update public.piezas
  set eliminado_en = statement_timestamp(),
      version = version + 1,
      ultimo_hlc_milisegundos = v_milisegundos,
      ultimo_hlc_contador = 0,
      ultimo_hlc_dispositivo_id = p_dispositivo_id,
      ultimo_hlc = lpad(v_milisegundos::text, 15, '0') || ':00000:' || p_dispositivo_id::text,
      actualizado_en = statement_timestamp()
  where id = v_fila.id
  returning * into v_fila;

  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'PIEZA', v_fila.id, v_fila.version, true, private.snapshot_pieza(v_fila.id)
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'ELIMINAR_PIEZA', 'PIEZA', v_fila.id, 'OK',
    jsonb_build_object('commit', v_commit, 'codigo', v_fila.codigo::text, 'version', v_fila.version)
  );
  return jsonb_build_object(
    'pieza', private.snapshot_pieza(v_fila.id), 'secuenciaServidor', v_commit
  );
end;
$$;

-- Frontera idempotente para comandos creados sin conexion. El payload se
-- conserva en operaciones_sync mediante hash; reutilizar un UUID con otro
-- contenido se rechaza y reenviar el mismo comando devuelve su resultado.
create or replace function public.aplicar_comando_maestro_offline(
  p_actor_id uuid,
  p_dispositivo_id uuid,
  p_operacion_id uuid,
  p_secuencia_cliente bigint,
  p_tipo text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rol public.rol_aplicacion;
  v_cuerpo jsonb;
  v_hash bytea;
  v_operacion public.operaciones_sync%rowtype;
  v_resultado jsonb;
  v_secuencia bigint;
  v_codigo_error text;
  v_mensaje_error text;
begin
  v_rol := private.validar_contexto_sync(p_actor_id, p_dispositivo_id);
  if v_rol <> 'ADMINISTRADOR' then
    raise exception using errcode = '42501', message = 'ROL_NO_AUTORIZADO';
  end if;
  if p_operacion_id is null or p_secuencia_cliente is null or p_secuencia_cliente < 0
     or p_tipo is null or p_tipo not in (
       'ELIMINAR_HOSPITAL', 'CREAR_PRODUCTO', 'ACTUALIZAR_PRODUCTO',
       'ELIMINAR_PRODUCTO', 'REGISTRAR_PIEZA', 'ACTUALIZAR_PIEZA', 'ELIMINAR_PIEZA'
     ) or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'COMANDO_MAESTRO_INVALIDO';
  end if;

  v_cuerpo := jsonb_build_object('tipo', p_tipo, 'payload', p_payload);
  v_hash := extensions.digest(convert_to(v_cuerpo::text, 'UTF8'), 'sha256');
  insert into public.operaciones_sync (
    id, dispositivo_id, actor_usuario_id, secuencia_cliente, payload_hash
  ) values (
    p_operacion_id, p_dispositivo_id, p_actor_id, p_secuencia_cliente, v_hash
  ) on conflict (id) do nothing;

  select o.* into v_operacion from public.operaciones_sync o
  where o.id = p_operacion_id for update;
  if v_operacion.id is null
     or v_operacion.dispositivo_id <> p_dispositivo_id
     or v_operacion.actor_usuario_id <> p_actor_id
     or v_operacion.secuencia_cliente <> p_secuencia_cliente
     or v_operacion.payload_hash <> v_hash then
    raise exception using errcode = '23505', message = 'OPERACION_ID_REUTILIZADO_CON_OTRO_CONTENIDO';
  end if;
  if v_operacion.estado <> 'RECIBIDA' then
    return jsonb_build_object(
      'operacionId', p_operacion_id,
      'estado', v_operacion.estado,
      'codigo', v_operacion.codigo_resultado,
      'secuenciaServidor', v_operacion.detalle_resultado ->> 'secuenciaServidor',
      'idempotente', true
    );
  end if;

  begin
    case p_tipo
      when 'ELIMINAR_HOSPITAL' then
        v_resultado := public.eliminar_hospital_central(
          p_actor_id,
          (p_payload ->> 'hospitalId')::uuid,
          nullif(p_payload ->> 'versionEsperada', '')::bigint
        );
      when 'CREAR_PRODUCTO' then
        v_resultado := public.crear_producto_central(
          p_actor_id,
          (p_payload ->> 'productoId')::uuid,
          p_payload ->> 'sku',
          p_payload ->> 'nombre',
          (p_payload ->> 'tipoProducto')::public.tipo_producto,
          (p_payload ->> 'costoBaseCentavos')::bigint
        );
      when 'ACTUALIZAR_PRODUCTO' then
        v_resultado := public.actualizar_producto_central(
          p_actor_id,
          p_payload ->> 'sku',
          p_payload ->> 'nombre',
          (p_payload ->> 'tipoProducto')::public.tipo_producto,
          (p_payload ->> 'costoBaseCentavos')::bigint,
          nullif(p_payload ->> 'versionEsperada', '')::bigint
        );
      when 'ELIMINAR_PRODUCTO' then
        v_resultado := public.eliminar_producto_central(
          p_actor_id,
          p_payload ->> 'sku',
          nullif(p_payload ->> 'versionEsperada', '')::bigint
        );
      when 'REGISTRAR_PIEZA' then
        v_resultado := public.registrar_pieza_central(
          p_actor_id,
          p_dispositivo_id,
          (p_payload ->> 'piezaId')::uuid,
          p_payload ->> 'codigo',
          p_payload ->> 'sku',
          nullif(p_payload ->> 'kitPadreCodigo', '')
        );
      when 'ACTUALIZAR_PIEZA' then
        v_resultado := public.actualizar_pieza_central(
          p_actor_id,
          p_dispositivo_id,
          p_payload ->> 'codigo',
          p_payload ->> 'sku',
          nullif(p_payload ->> 'kitPadreCodigo', ''),
          nullif(p_payload ->> 'versionEsperada', '')::bigint
        );
      when 'ELIMINAR_PIEZA' then
        v_resultado := public.eliminar_pieza_central(
          p_actor_id,
          p_dispositivo_id,
          p_payload ->> 'codigo',
          nullif(p_payload ->> 'versionEsperada', '')::bigint
        );
    end case;
    v_secuencia := (v_resultado ->> 'secuenciaServidor')::bigint;
    update public.operaciones_sync
    set estado = 'APLICADA', codigo_resultado = 'OK',
        detalle_resultado = jsonb_build_object('secuenciaServidor', v_secuencia),
        procesada_en = clock_timestamp()
    where id = p_operacion_id;
    return jsonb_build_object(
      'operacionId', p_operacion_id, 'estado', 'APLICADA',
      'secuenciaServidor', v_secuencia, 'idempotente', false
    );
  exception when others then
    get stacked diagnostics v_codigo_error = returned_sqlstate, v_mensaje_error = message_text;
    update public.operaciones_sync
    set estado = 'RECHAZADA', codigo_resultado = v_codigo_error,
        detalle_resultado = jsonb_build_object('motivo', v_mensaje_error),
        procesada_en = clock_timestamp()
    where id = p_operacion_id;
    insert into public.rechazos_sync (operacion_id, codigo, motivo)
    values (p_operacion_id, v_codigo_error, v_mensaje_error);
    return jsonb_build_object(
      'operacionId', p_operacion_id, 'estado', 'RECHAZADA',
      'codigo', v_codigo_error, 'motivo', v_mensaje_error, 'idempotente', false
    );
  end;
end;
$$;

revoke all on function public.eliminar_hospital_central(uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.actualizar_producto_central(uuid, text, text, public.tipo_producto, bigint, bigint) from public, anon, authenticated;
revoke all on function public.eliminar_producto_central(uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.actualizar_pieza_central(uuid, uuid, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.eliminar_pieza_central(uuid, uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.aplicar_comando_maestro_offline(uuid, uuid, uuid, bigint, text, jsonb) from public, anon, authenticated;

grant execute on function public.eliminar_hospital_central(uuid, uuid, bigint) to service_role;
grant execute on function public.actualizar_producto_central(uuid, text, text, public.tipo_producto, bigint, bigint) to service_role;
grant execute on function public.eliminar_producto_central(uuid, text, bigint) to service_role;
grant execute on function public.actualizar_pieza_central(uuid, uuid, text, text, text, bigint) to service_role;
grant execute on function public.eliminar_pieza_central(uuid, uuid, text, bigint) to service_role;
grant execute on function public.aplicar_comando_maestro_offline(uuid, uuid, uuid, bigint, text, jsonb) to service_role;
