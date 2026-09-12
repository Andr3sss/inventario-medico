create or replace function public.procesar_lote_sync(
  p_actor_id uuid,
  p_dispositivo_id uuid,
  p_operaciones jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rol public.rol_aplicacion;
  v_operacion jsonb;
  v_operacion_id uuid;
  v_secuencia_cliente bigint;
  v_payload_hash bytea;
  v_existente public.operaciones_sync%rowtype;
  v_evento jsonb;
  v_resultado_evento jsonb;
  v_secuencia_servidor bigint;
  v_ordinal_evento integer;
  v_ordinal_cambio integer;
  v_tuvo_conflicto boolean;
  v_rechazados jsonb := '[]'::jsonb;
  v_resultados jsonb := '[]'::jsonb;
  v_aceptados jsonb;
  v_conflictos jsonb;
  v_codigo_error text;
  v_mensaje_error text;
begin
  v_rol := private.validar_contexto_sync(p_actor_id, p_dispositivo_id);
  if jsonb_typeof(p_operaciones) <> 'array' then
    raise exception using errcode = '22023', message = 'OPERACIONES_DEBE_SER_ARRAY';
  end if;
  if jsonb_array_length(p_operaciones) > 500 then
    raise exception using errcode = '22023', message = 'LOTE_SUPERA_500_OPERACIONES';
  end if;

  for v_operacion in select value from jsonb_array_elements(p_operaciones)
  loop
    v_operacion_id := null;
    begin
      if jsonb_typeof(v_operacion -> 'eventos') <> 'array'
         or jsonb_array_length(v_operacion -> 'eventos') = 0
         or jsonb_array_length(v_operacion -> 'eventos') > 200 then
        raise exception using errcode = '22023', message = 'OPERACION_EVENTOS_INVALIDOS';
      end if;
      v_operacion_id := nullif(v_operacion ->> 'operacionId', '')::uuid;
      v_secuencia_cliente := nullif(v_operacion ->> 'secuenciaCliente', '')::bigint;
      if v_secuencia_cliente is null or v_secuencia_cliente < 0 then
        raise exception using errcode = '22023', message = 'SECUENCIA_CLIENTE_INVALIDA';
      end if;
      v_payload_hash := extensions.digest(convert_to(v_operacion::text, 'UTF8'), 'sha256');

      v_existente := null;
      select o.* into v_existente from public.operaciones_sync o where o.id = v_operacion_id;
      if v_existente.id is not null then
        if v_existente.dispositivo_id <> p_dispositivo_id
           or v_existente.actor_usuario_id is distinct from p_actor_id
           or v_existente.payload_hash <> v_payload_hash then
          raise exception using errcode = '23505', message = 'OPERACION_ID_REUTILIZADO_CON_OTRO_CONTENIDO';
        end if;
        v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
          'operacionId', v_operacion_id,
          'estado', v_existente.estado,
          'codigo', v_existente.codigo_resultado,
          'idempotente', true
        ));
        if v_existente.estado = 'RECHAZADA' then
          v_rechazados := v_rechazados || coalesce((
            select jsonb_agg(jsonb_build_object(
              'eventoId', r.evento_id,
              'codigo', r.codigo,
              'motivo', r.motivo
            ))
            from public.rechazos_sync r where r.operacion_id = v_operacion_id
          ), '[]'::jsonb);
        end if;
        continue;
      end if;

      if exists (
        select 1 from public.operaciones_sync o
        where o.dispositivo_id = p_dispositivo_id
          and o.secuencia_cliente = v_secuencia_cliente
          and o.id <> v_operacion_id
      ) then
        raise exception using errcode = '23505', message = 'SECUENCIA_CLIENTE_REUTILIZADA';
      end if;

      insert into public.operaciones_sync (
        id, dispositivo_id, actor_usuario_id, secuencia_cliente, payload_hash
      ) values (
        v_operacion_id, p_dispositivo_id, p_actor_id,
        v_secuencia_cliente, v_payload_hash
      );

      begin
        v_secuencia_servidor := private.reservar_commit(v_operacion_id);
        v_ordinal_evento := 0;
        v_ordinal_cambio := 0;
        v_tuvo_conflicto := false;

        for v_evento in select value from jsonb_array_elements(v_operacion -> 'eventos')
        loop
          if (v_evento #>> '{cuerpo,tipo}') like 'MALETA_%' then
            v_resultado_evento := private.aplicar_evento_maleta(
              v_operacion_id, v_ordinal_evento, p_actor_id, v_rol,
              p_dispositivo_id, v_evento, v_secuencia_servidor, v_ordinal_cambio
            );
          else
            v_resultado_evento := private.aplicar_evento_pieza(
              v_operacion_id, v_ordinal_evento, p_actor_id, v_rol,
              p_dispositivo_id, v_evento, v_secuencia_servidor, v_ordinal_cambio
            );
          end if;
          v_ordinal_cambio := (v_resultado_evento ->> 'siguienteOrdinal')::integer;
          v_tuvo_conflicto := v_tuvo_conflicto or (v_resultado_evento ? 'conflictoId');
          v_ordinal_evento := v_ordinal_evento + 1;
        end loop;

        update public.operaciones_sync
        set estado = (case when v_tuvo_conflicto then 'CONFLICTO' else 'APLICADA' end)::public.estado_operacion_sync,
            codigo_resultado = case when v_tuvo_conflicto then 'CONFLICTO_DETECTADO' else 'OK' end,
            detalle_resultado = jsonb_build_object('secuenciaServidor', v_secuencia_servidor),
            procesada_en = clock_timestamp()
        where id = v_operacion_id;

        v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
          'operacionId', v_operacion_id,
          'estado', case when v_tuvo_conflicto then 'CONFLICTO' else 'APLICADA' end,
          'secuenciaServidor', v_secuencia_servidor,
          'idempotente', false
        ));
      exception when others then
        get stacked diagnostics
          v_codigo_error = returned_sqlstate,
          v_mensaje_error = message_text;
        update public.operaciones_sync
        set estado = 'RECHAZADA', codigo_resultado = v_codigo_error,
            detalle_resultado = jsonb_build_object('motivo', v_mensaje_error),
            procesada_en = clock_timestamp()
        where id = v_operacion_id;
        insert into public.rechazos_sync (operacion_id, codigo, motivo)
        values (v_operacion_id, v_codigo_error, v_mensaje_error);
        for v_evento in select value from jsonb_array_elements(v_operacion -> 'eventos')
        loop
          v_rechazados := v_rechazados || jsonb_build_array(jsonb_build_object(
            'eventoId', v_evento #>> '{sobre,eventoId}',
            'codigo', v_codigo_error,
            'motivo', v_mensaje_error
          ));
        end loop;
        v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
          'operacionId', v_operacion_id,
          'estado', 'RECHAZADA',
          'codigo', v_codigo_error,
          'idempotente', false
        ));
      end;
    exception when others then
      get stacked diagnostics
        v_codigo_error = returned_sqlstate,
        v_mensaje_error = message_text;
      v_rechazados := v_rechazados || jsonb_build_array(jsonb_build_object(
        'operacionId', v_operacion_id,
        'codigo', v_codigo_error,
        'motivo', v_mensaje_error
      ));
      v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
        'operacionId', v_operacion_id,
        'estado', 'RECHAZADA',
        'codigo', v_codigo_error,
        'idempotente', false
      ));
    end;
  end loop;

  select coalesce(jsonb_agg(ed.id order by o.recibida_en, ed.ordinal), '[]'::jsonb)
  into v_aceptados
  from public.eventos_dominio ed
  join public.operaciones_sync o on o.id = ed.operacion_id
  where ed.resultado = 'ACEPTADO'
    and exists (
      select 1 from jsonb_array_elements(p_operaciones) entrada
      where entrada ->> 'operacionId' = o.id::text
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'eventoId', ed.id,
    'codigo', p.codigo::text,
    'conflictoId', cc.conflicto_id,
    'detalle', jsonb_build_object(
      'motivo', 'ASIGNACION_CONCURRENTE',
      'estado', c.estado,
      'candidatos', (select count(*) from public.conflicto_candidatos cct where cct.conflicto_id = c.id)
    )
  ) order by o.recibida_en, ed.ordinal), '[]'::jsonb)
  into v_conflictos
  from public.eventos_dominio ed
  join public.operaciones_sync o on o.id = ed.operacion_id
  join public.piezas p on p.id = ed.pieza_id
  join public.conflicto_candidatos cc on cc.evento_id = ed.id
  join public.conflictos c on c.id = cc.conflicto_id
  where ed.resultado = 'CONFLICTO'
    and exists (
      select 1 from jsonb_array_elements(p_operaciones) entrada
      where entrada ->> 'operacionId' = o.id::text
    );

  update public.dispositivos set ultimo_sync_en = clock_timestamp()
  where id = p_dispositivo_id;
  return jsonb_build_object(
    'operaciones', v_resultados,
    'aceptados', v_aceptados,
    'rechazados', v_rechazados,
    'conflictos', v_conflictos
  );
end;
$$;

revoke all on function public.procesar_lote_sync(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.procesar_lote_sync(uuid, uuid, jsonb) to service_role;

comment on function public.procesar_lote_sync(uuid, uuid, jsonb) is
  'PUSH corregido: el enum se tipa explícitamente y los ACK se reconstruyen solo desde eventos que sobrevivieron al commit.';
