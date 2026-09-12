-- Al cerrar una maleta el resultado UTILIZADA ya es histórico y definitivo.
-- La máquina de pieza heredada esperaba todavía un item activo al confirmar
-- factura. El adaptador conserva el instante final original y publica una
-- corrección dentro del mismo commit de emisión.
alter function public.emitir_factura_central(uuid, uuid, uuid, bigint, uuid, text, jsonb)
  rename to emitir_factura_central_base;

revoke all on function public.emitir_factura_central_base(uuid, uuid, uuid, bigint, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.emitir_factura_central_base(uuid, uuid, uuid, bigint, uuid, text, jsonb)
  to service_role;

create or replace function public.emitir_factura_central(
  p_actor_id uuid,
  p_dispositivo_id uuid,
  p_operacion_id uuid,
  p_secuencia_cliente bigint,
  p_factura_id uuid,
  p_numero text,
  p_eventos jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_items jsonb;
  v_item jsonb;
  v_commit bigint;
  v_ordinal integer;
begin
  perform private.exigir_service_role();

  -- Un retry no puede agregar cambios a un commit que algún dispositivo ya
  -- confirmó. La implementación base verifica UUID+hash y devuelve el ACK.
  if exists (select 1 from public.operaciones_sync o where o.id = p_operacion_id) then
    return public.emitir_factura_central_base(
      p_actor_id, p_dispositivo_id, p_operacion_id, p_secuencia_cliente,
      p_factura_id, p_numero, p_eventos
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', mi.id,
    'resultado', mi.resultado,
    'finalizadaEn', mi.finalizada_en
  ) order by mi.id), '[]'::jsonb)
  into v_items
  from public.factura_lineas fl
  join public.maleta_items mi on mi.pieza_id = fl.pieza_id
  where fl.factura_id = p_factura_id
    and mi.resultado = 'UTILIZADA';

  if jsonb_array_length(v_items) <> (
    select count(*) from public.factura_lineas where factura_id = p_factura_id
  ) then
    raise exception using errcode = '55000', message = 'HISTORIAL_MALETA_INCOMPLETO_PARA_FACTURA';
  end if;

  update public.maleta_items mi
  set resultado = null, finalizada_en = null
  where mi.id in (
    select (value ->> 'id')::uuid from jsonb_array_elements(v_items)
  );

  v_resultado := public.emitir_factura_central_base(
    p_actor_id, p_dispositivo_id, p_operacion_id, p_secuencia_cliente,
    p_factura_id, p_numero, p_eventos
  );

  v_commit := (v_resultado ->> 'secuenciaServidor')::bigint;
  select coalesce(max(cs.ordinal), -1) + 1 into v_ordinal
  from public.cambios_sync cs where cs.secuencia_servidor = v_commit;

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    update public.maleta_items
    set resultado = (v_item ->> 'resultado')::public.resultado_item_maleta,
        finalizada_en = (v_item ->> 'finalizadaEn')::timestamptz
    where id = (v_item ->> 'id')::uuid;
    perform private.registrar_cambio(
      v_commit, v_ordinal, 'MALETA_ITEM', (v_item ->> 'id')::uuid,
      (select mi.version from public.maleta_items mi where mi.id = (v_item ->> 'id')::uuid),
      false,
      (select to_jsonb(mi) from public.maleta_items mi where mi.id = (v_item ->> 'id')::uuid)
    );
    v_ordinal := v_ordinal + 1;
  end loop;

  return v_resultado;
end;
$$;

revoke all on function public.emitir_factura_central(uuid, uuid, uuid, bigint, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.emitir_factura_central(uuid, uuid, uuid, bigint, uuid, text, jsonb)
  to service_role;

comment on function public.emitir_factura_central(uuid, uuid, uuid, bigint, uuid, text, jsonb) is
  'Emisión atómica que conserva el resultado/instante histórico del item fijado al cerrar la maleta.';
