-- Incluye en el PULL freelance los eventos de dominio que pertenecen a la
-- maleta autorizada. La fila se resuelve por su PK y se comprueba maleta_id;
-- no se amplian los privilegios ni el alcance de la sesion.
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
            or (cs.entidad_tipo = 'EVENTO_DOMINIO' and exists (
              select 1 from public.eventos_dominio ed
              where ed.id = cs.entidad_id and ed.maleta_id = v_maleta_id
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

revoke all on function public.obtener_cambios_freelance(uuid, uuid, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.obtener_cambios_freelance(uuid, uuid, bigint, integer)
  to service_role;

comment on function public.obtener_cambios_freelance(uuid, uuid, bigint, integer) is
  'PULL freelance paginado: limita agregados y eventos de dominio a la maleta autorizada.';
