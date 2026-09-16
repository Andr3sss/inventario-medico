-- Convierte el alta/edicion local de un hospital en una operacion de sync
-- durable. La operacion y el cambio maestro se confirman en la misma
-- transaccion; reenviar el mismo UUID nunca duplica el hospital ni el commit.

create or replace function public.guardar_hospital_offline(
  p_actor_id uuid,
  p_dispositivo_id uuid,
  p_operacion_id uuid,
  p_secuencia_cliente bigint,
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
  v_rol public.rol_aplicacion;
  v_payload jsonb;
  v_payload_hash bytea;
  v_operacion public.operaciones_sync%rowtype;
  v_hospital public.hospitales%rowtype;
  v_commit bigint;
  v_codigo_error text;
  v_mensaje_error text;
begin
  v_rol := private.validar_contexto_sync(p_actor_id, p_dispositivo_id);
  if v_rol <> 'ADMINISTRADOR' then
    raise exception using errcode = '42501', message = 'ROL_NO_AUTORIZADO';
  end if;
  if p_operacion_id is null
     or p_hospital_id is null
     or p_secuencia_cliente is null
     or p_secuencia_cliente < 0
     or nullif(btrim(p_codigo), '') is null
     or nullif(btrim(p_nombre), '') is null
     or nullif(btrim(p_ciudad), '') is null
     or p_nivel_precio = 'BASE' then
    raise exception using errcode = '22023', message = 'HOSPITAL_OFFLINE_INVALIDO';
  end if;

  v_payload := jsonb_build_object(
    'tipo', 'GUARDAR_HOSPITAL',
    'hospitalId', p_hospital_id,
    'codigo', btrim(p_codigo),
    'nombre', btrim(p_nombre),
    'ciudad', btrim(p_ciudad),
    'nivelPrecio', p_nivel_precio,
    'versionEsperada', p_version_esperada
  );
  v_payload_hash := extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256');

  insert into public.operaciones_sync (
    id, dispositivo_id, actor_usuario_id, secuencia_cliente, payload_hash
  ) values (
    p_operacion_id, p_dispositivo_id, p_actor_id, p_secuencia_cliente, v_payload_hash
  ) on conflict (id) do nothing;

  select o.* into v_operacion
  from public.operaciones_sync o
  where o.id = p_operacion_id
  for update;

  if v_operacion.id is null
     or v_operacion.dispositivo_id <> p_dispositivo_id
     or v_operacion.actor_usuario_id <> p_actor_id
     or v_operacion.secuencia_cliente <> p_secuencia_cliente
     or v_operacion.payload_hash <> v_payload_hash then
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
    select h.* into v_hospital
    from public.hospitales h
    where h.id = p_hospital_id
    for update;

    if v_hospital.id is null then
      if p_version_esperada is not null then
        raise exception using errcode = '40001', message = 'HOSPITAL_CAMBIO_CONCURRENTE';
      end if;
      insert into public.hospitales (
        id, codigo, nombre, ciudad, nivel_precio, version
      ) values (
        p_hospital_id, btrim(p_codigo), btrim(p_nombre), btrim(p_ciudad), p_nivel_precio, 1
      ) returning * into v_hospital;
    else
      if p_version_esperada is not null and v_hospital.version <> p_version_esperada then
        raise exception using errcode = '40001', message = 'HOSPITAL_CAMBIO_CONCURRENTE';
      end if;
      update public.hospitales
      set nombre = btrim(p_nombre),
          ciudad = btrim(p_ciudad),
          nivel_precio = p_nivel_precio,
          activo = true,
          eliminado_en = null,
          version = version + 1,
          actualizado_en = statement_timestamp()
      where id = p_hospital_id
      returning * into v_hospital;
    end if;

    v_commit := private.reservar_commit(p_operacion_id);
    perform private.registrar_cambio(
      v_commit, 0, 'HOSPITAL', v_hospital.id, v_hospital.version, false, to_jsonb(v_hospital)
    );
    insert into private.auditoria_administrativa (
      actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
    ) values (
      p_actor_id, 'GUARDAR_HOSPITAL_OFFLINE', 'HOSPITAL', v_hospital.id, 'OK',
      jsonb_build_object('commit', v_commit, 'version', v_hospital.version, 'dispositivoId', p_dispositivo_id)
    );
    update public.operaciones_sync
    set estado = 'APLICADA',
        codigo_resultado = 'OK',
        detalle_resultado = jsonb_build_object('secuenciaServidor', v_commit),
        procesada_en = clock_timestamp()
    where id = p_operacion_id;

    return jsonb_build_object(
      'operacionId', p_operacion_id,
      'estado', 'APLICADA',
      'secuenciaServidor', v_commit,
      'idempotente', false
    );
  exception when others then
    get stacked diagnostics
      v_codigo_error = returned_sqlstate,
      v_mensaje_error = message_text;
    update public.operaciones_sync
    set estado = 'RECHAZADA',
        codigo_resultado = v_codigo_error,
        detalle_resultado = jsonb_build_object('motivo', v_mensaje_error),
        procesada_en = clock_timestamp()
    where id = p_operacion_id;
    insert into public.rechazos_sync (operacion_id, codigo, motivo)
    values (p_operacion_id, v_codigo_error, v_mensaje_error);
    return jsonb_build_object(
      'operacionId', p_operacion_id,
      'estado', 'RECHAZADA',
      'codigo', v_codigo_error,
      'motivo', v_mensaje_error,
      'idempotente', false
    );
  end;
end;
$$;

revoke all on function public.guardar_hospital_offline(
  uuid, uuid, uuid, bigint, uuid, text, text, text, public.nivel_precio, bigint
) from public, anon, authenticated;
grant execute on function public.guardar_hospital_offline(
  uuid, uuid, uuid, bigint, uuid, text, text, text, public.nivel_precio, bigint
) to service_role;

comment on function public.guardar_hospital_offline(
  uuid, uuid, uuid, bigint, uuid, text, text, text, public.nivel_precio, bigint
) is 'Aplica de forma idempotente un alta o edicion de hospital creada por un Administrador sin conexion.';
