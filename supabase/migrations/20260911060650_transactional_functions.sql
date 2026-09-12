-- Ajustes detectados al llevar las máquinas de estado puras a constraints.
-- EN_CONFLICTO conserva la maleta previa como evidencia hasta la resolución.
alter table public.piezas drop constraint piezas_maleta_estado_coherente;
alter table public.piezas add constraint piezas_maleta_estado_coherente check (
  (estado in ('ASIGNADA_A_MALETA', 'EN_MALETA_ACTIVA', 'USADA_PENDIENTE_VALORACION') and maleta_actual_id is not null)
  or (estado = 'EN_CONFLICTO')
  or (estado not in ('ASIGNADA_A_MALETA', 'EN_MALETA_ACTIVA', 'USADA_PENDIENTE_VALORACION', 'EN_CONFLICTO') and maleta_actual_id is null)
);

alter table public.configuracion_sistema
  add column ciudad_base text not null default 'Guayaquil',
  add constraint configuracion_ciudad_base_no_vacia check (btrim(ciudad_base) <> '');

alter table public.facturas
  add column requiere_recalculo boolean not null default false;

alter table public.facturas drop constraint facturas_emision_coherente;
alter table public.facturas add constraint facturas_emision_coherente check (
  (estado = 'BORRADOR' and numero is null and emitida_por is null and emitida_en is null)
  or (
    estado = 'EMITIDA' and numero is not null and emitida_por is not null
    and emitida_en is not null and not requiere_aprobacion and not requiere_recalculo
  )
);

create or replace function private.es_service_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' = 'service_role',
    false
  );
$$;

create or replace function private.exigir_service_role()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.es_service_role() then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUERIDO';
  end if;
end;
$$;

create or replace function private.validar_contexto_sync(
  p_actor_id uuid,
  p_dispositivo_id uuid
)
returns public.rol_aplicacion
language plpgsql
set search_path = ''
as $$
declare
  v_rol public.rol_aplicacion;
begin
  perform private.exigir_service_role();

  if not exists (
    select 1 from public.configuracion_sistema c
    where c.singleton and c.ciclo_vida in ('DEMO', 'PRODUCCION')
  ) then
    raise exception using errcode = '55000', message = 'SISTEMA_NO_DISPONIBLE';
  end if;

  select p.rol into v_rol
  from public.perfiles p
  where p.id = p_actor_id and p.activo;

  if v_rol is null then
    raise exception using errcode = '42501', message = 'USUARIO_INACTIVO_O_INEXISTENTE';
  end if;

  if not exists (
    select 1
    from public.dispositivos d
    join public.dispositivo_usuarios du on du.dispositivo_id = d.id
    join public.configuracion_sistema c on c.singleton
    where d.id = p_dispositivo_id
      and d.activo
      and d.epoca_handoff = c.epoca_handoff
      and du.usuario_id = p_actor_id
      and du.habilitado
      and du.valido_hasta > clock_timestamp()
  ) then
    raise exception using errcode = '42501', message = 'DISPOSITIVO_NO_HABILITADO';
  end if;

  return v_rol;
end;
$$;

create or replace function private.hlc_milisegundos(p_hlc text)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if p_hlc !~ '^[0-9]{15}:[0-9]{5}:[0-9a-fA-F-]{36}$' then
    raise exception using errcode = '22023', message = 'HLC_MAL_FORMADO';
  end if;
  return split_part(p_hlc, ':', 1)::bigint;
end;
$$;

create or replace function private.hlc_contador(p_hlc text)
returns integer
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if p_hlc !~ '^[0-9]{15}:[0-9]{5}:[0-9a-fA-F-]{36}$' then
    raise exception using errcode = '22023', message = 'HLC_MAL_FORMADO';
  end if;
  return split_part(p_hlc, ':', 2)::integer;
end;
$$;

create or replace function private.hlc_dispositivo(p_hlc text)
returns uuid
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  if p_hlc !~ '^[0-9]{15}:[0-9]{5}:[0-9a-fA-F-]{36}$' then
    raise exception using errcode = '22023', message = 'HLC_MAL_FORMADO';
  end if;
  return split_part(p_hlc, ':', 3)::uuid;
end;
$$;

create or replace function private.validar_hlc(p_hlc text, p_dispositivo_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_milisegundos bigint;
begin
  v_milisegundos := private.hlc_milisegundos(p_hlc);
  if private.hlc_dispositivo(p_hlc) <> p_dispositivo_id then
    raise exception using errcode = '22023', message = 'HLC_DISPOSITIVO_NO_COINCIDE';
  end if;
  if v_milisegundos > floor(extract(epoch from clock_timestamp()) * 1000)::bigint + 3600000 then
    raise exception using errcode = '22023', message = 'HLC_DERIVA_EXCESIVA';
  end if;
end;
$$;

create or replace function private.rol_permite_evento(
  p_rol public.rol_aplicacion,
  p_tipo_evento text
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case p_tipo_evento
    when 'ESCANEO_ARMADO' then p_rol in ('AUXILIAR', 'COORDINADORA', 'ADMINISTRADOR')
    when 'ESCANEO_ARMADO_REVERSO' then p_rol in ('AUXILIAR', 'COORDINADORA', 'ADMINISTRADOR')
    when 'CONFIRMAR_SALIDA' then p_rol in ('AUXILIAR', 'COORDINADORA')
    when 'ESCANEO_USO' then p_rol in ('AUXILIAR', 'COORDINADORA', 'FREELANCE')
    when 'CIERRE_MALETA_SIN_USO' then p_rol in ('AUXILIAR', 'COORDINADORA', 'FREELANCE')
    when 'CONFIRMAR_FACTURA' then p_rol = 'CONTABLE'
    when 'INGRESO_REPROCESO' then p_rol in ('COORDINADORA', 'AUXILIAR')
    when 'FIN_REPROCESO' then p_rol = 'COORDINADORA'
    when 'CONFLICTO_SYNC' then p_rol = 'SISTEMA'
    when 'RESOLUCION_MANUAL' then p_rol = 'COORDINADORA'
    when 'MARCAR_EXTRAVIADA' then p_rol = 'COORDINADORA'
    when 'MALETA_ABIERTA' then p_rol in ('AUXILIAR', 'COORDINADORA', 'ADMINISTRADOR')
    when 'MALETA_SALIO' then p_rol in ('AUXILIAR', 'COORDINADORA')
    when 'MALETA_CERRADA' then p_rol in ('AUXILIAR', 'COORDINADORA')
    when 'MALETA_CANCELADA' then p_rol in ('AUXILIAR', 'COORDINADORA')
    else false
  end;
$$;

create or replace function private.reservar_commit(p_operacion_id uuid)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_secuencia bigint;
begin
  update private.cabeza_sync
  set siguiente_secuencia = siguiente_secuencia + 1
  where singleton
  returning siguiente_secuencia - 1 into v_secuencia;

  if v_secuencia is null then
    raise exception using errcode = '55000', message = 'CABEZA_SYNC_INEXISTENTE';
  end if;

  insert into public.commits_sync (secuencia_servidor, operacion_id)
  values (v_secuencia, p_operacion_id);
  return v_secuencia;
end;
$$;

create or replace function private.registrar_cambio(
  p_secuencia bigint,
  p_ordinal integer,
  p_entidad_tipo text,
  p_entidad_id uuid,
  p_entidad_version bigint,
  p_eliminado boolean,
  p_payload jsonb
)
returns void
language sql
set search_path = ''
as $$
  insert into public.cambios_sync (
    secuencia_servidor, ordinal, entidad_tipo, entidad_id,
    entidad_version, eliminado, payload
  ) values (
    p_secuencia, p_ordinal, p_entidad_tipo, p_entidad_id,
    p_entidad_version, p_eliminado, p_payload
  );
$$;

create or replace function private.snapshot_pieza(p_pieza_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'codigo', p.codigo::text,
    'sku', pr.sku::text,
    'tipo', pr.tipo,
    'estado', p.estado,
    'ubicacion', case
      when b.tipo = 'CENTRAL' then jsonb_build_object('clase', 'BODEGA_CENTRAL')
      else jsonb_build_object('clase', 'BODEGA_INSTRUMENTISTA', 'usuarioId', b.responsable_id)
    end,
    'maletaId', p.maleta_actual_id,
    'parentCodigo', padre.codigo::text,
    'version', p.version,
    'hlc', p.ultimo_hlc,
    'eliminadoEn', p.eliminado_en
  )
  from public.piezas p
  join public.productos pr on pr.id = p.producto_id
  join public.bodegas b on b.id = p.bodega_retorno_id
  left join public.piezas padre on padre.id = p.kit_padre_id
  where p.id = p_pieza_id;
$$;

create or replace function private.snapshot_maleta(p_maleta_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id,
    'responsableId', m.responsable_id,
    'procedimiento', m.procedimiento,
    'hospitalId', m.hospital_id,
    'estado', m.estado,
    'creadaEn', m.abierta_en,
    'salioEn', m.salio_en,
    'cerradaEn', m.cerrada_en,
    'canceladaEn', m.cancelada_en,
    'version', m.version,
    'hlc', m.ultimo_hlc,
    'eliminadoEn', m.eliminado_en
  )
  from public.maletas m
  where m.id = p_maleta_id;
$$;

revoke all on function private.es_service_role() from public;
revoke all on function private.exigir_service_role() from public;
revoke all on function private.validar_contexto_sync(uuid, uuid) from public;
revoke all on function private.hlc_milisegundos(text) from public;
revoke all on function private.hlc_contador(text) from public;
revoke all on function private.hlc_dispositivo(text) from public;
revoke all on function private.validar_hlc(text, uuid) from public;
revoke all on function private.rol_permite_evento(public.rol_aplicacion, text) from public;
revoke all on function private.reservar_commit(uuid) from public;
revoke all on function private.registrar_cambio(bigint, integer, text, uuid, bigint, boolean, jsonb) from public;
revoke all on function private.snapshot_pieza(uuid) from public;
revoke all on function private.snapshot_maleta(uuid) from public;

grant execute on function private.es_service_role() to service_role;
grant execute on function private.exigir_service_role() to service_role;
grant execute on function private.validar_contexto_sync(uuid, uuid) to service_role;
grant execute on function private.hlc_milisegundos(text) to service_role;
grant execute on function private.hlc_contador(text) to service_role;
grant execute on function private.hlc_dispositivo(text) to service_role;
grant execute on function private.validar_hlc(text, uuid) to service_role;
grant execute on function private.rol_permite_evento(public.rol_aplicacion, text) to service_role;
grant execute on function private.reservar_commit(uuid) to service_role;
grant execute on function private.registrar_cambio(bigint, integer, text, uuid, bigint, boolean, jsonb) to service_role;
grant execute on function private.snapshot_pieza(uuid) to service_role;
grant execute on function private.snapshot_maleta(uuid) to service_role;

create or replace function private.aplicar_evento_pieza(
  p_operacion_id uuid,
  p_ordinal_evento integer,
  p_actor_id uuid,
  p_rol public.rol_aplicacion,
  p_dispositivo_id uuid,
  p_evento jsonb,
  p_secuencia_servidor bigint,
  p_ordinal_cambio integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_sobre jsonb := p_evento -> 'sobre';
  v_cuerpo jsonb := p_evento -> 'cuerpo';
  v_evento_id uuid;
  v_tipo_evento text;
  v_codigo text;
  v_hlc text;
  v_registrado_en timestamptz;
  v_version_esperada bigint;
  v_pieza public.piezas%rowtype;
  v_tipo_producto public.tipo_producto;
  v_estado_anterior public.estado_pieza;
  v_estado_nuevo public.estado_pieza;
  v_maleta_nueva uuid;
  v_bodega_nueva uuid;
  v_maleta public.maletas%rowtype;
  v_bodega public.bodegas%rowtype;
  v_item_id uuid;
  v_item_version bigint;
  v_ciclo_id uuid;
  v_ciclo_version bigint;
  v_conflicto_id uuid;
  v_evento_previo public.eventos_dominio%rowtype;
  v_evento_guardado public.eventos_dominio%rowtype;
  v_payload_relacionado jsonb;
  v_tipo_relacionado text;
  v_id_relacionado uuid;
  v_version_relacionada bigint;
begin
  v_evento_id := nullif(v_sobre ->> 'eventoId', '')::uuid;
  v_tipo_evento := v_cuerpo ->> 'tipo';
  v_codigo := v_cuerpo ->> 'codigo';
  v_hlc := v_sobre ->> 'hlc';
  v_registrado_en := (v_sobre ->> 'registradoEn')::timestamptz;
  v_version_esperada := nullif(p_evento ->> 'versionEsperada', '')::bigint;

  if (v_sobre ->> 'dispositivoId')::uuid <> p_dispositivo_id then
    raise exception using errcode = '22023', message = 'EVENTO_DISPOSITIVO_NO_COINCIDE';
  end if;
  if (v_sobre ->> 'usuarioId')::uuid <> p_actor_id then
    raise exception using errcode = '42501', message = 'EVENTO_USUARIO_NO_COINCIDE';
  end if;
  if (v_sobre ->> 'rol')::public.rol_aplicacion <> p_rol then
    raise exception using errcode = '42501', message = 'EVENTO_ROL_NO_COINCIDE';
  end if;
  if not private.rol_permite_evento(p_rol, v_tipo_evento) or v_tipo_evento = 'CONFLICTO_SYNC' then
    raise exception using errcode = '42501', message = 'ROL_NO_AUTORIZADO';
  end if;
  perform private.validar_hlc(v_hlc, p_dispositivo_id);

  if exists (select 1 from public.eventos_dominio where id = v_evento_id) then
    raise exception using errcode = '23505', message = 'EVENTO_ID_REUTILIZADO';
  end if;

  select p.* into v_pieza
  from public.piezas p
  where p.codigo = v_codigo::extensions.citext and p.eliminado_en is null
  for update;

  if v_pieza.id is null then
    raise exception using errcode = 'P0002', message = 'PIEZA_NO_ENCONTRADA';
  end if;

  select pr.tipo into v_tipo_producto
  from public.productos pr
  where pr.id = v_pieza.producto_id and pr.activo;

  if v_tipo_producto is null then
    raise exception using errcode = '55000', message = 'PRODUCTO_INACTIVO_O_INEXISTENTE';
  end if;

  v_estado_anterior := v_pieza.estado;
  v_estado_nuevo := v_pieza.estado;
  v_maleta_nueva := v_pieza.maleta_actual_id;
  v_bodega_nueva := v_pieza.bodega_retorno_id;

  -- Dos asignaciones offline incompatibles no se resuelven por último escritor.
  if v_tipo_evento = 'ESCANEO_ARMADO'
     and v_pieza.estado in ('ASIGNADA_A_MALETA', 'EN_MALETA_ACTIVA', 'USADA_PENDIENTE_VALORACION', 'EN_CONFLICTO')
     and v_pieza.maleta_actual_id is distinct from (v_cuerpo ->> 'maletaId')::uuid then

    select c.id into v_conflicto_id
    from public.conflictos c
    where c.pieza_id = v_pieza.id and c.estado = 'ABIERTO'
    for update;

    if v_conflicto_id is null then
      v_conflicto_id := gen_random_uuid();
      insert into public.conflictos (id, pieza_id, estado_pieza_previo)
      values (v_conflicto_id, v_pieza.id, v_pieza.estado);

      select ed.* into v_evento_previo
      from public.eventos_dominio ed
      where ed.pieza_id = v_pieza.id
        and ed.resultado = 'ACEPTADO'
        and ed.tipo_evento in ('ESCANEO_ARMADO', 'CONFIRMAR_SALIDA', 'ESCANEO_USO')
      order by ed.recibido_en_servidor desc, ed.ordinal desc
      limit 1;

      if v_evento_previo.id is not null and v_evento_previo.actor_usuario_id is not null then
        insert into public.conflicto_candidatos (
          id, conflicto_id, operacion_id, evento_id, dispositivo_id,
          usuario_id, maleta_id, estado_propuesto, hlc, evidencia
        ) values (
          gen_random_uuid(), v_conflicto_id, v_evento_previo.operacion_id,
          v_evento_previo.id, v_evento_previo.dispositivo_id,
          v_evento_previo.actor_usuario_id, v_pieza.maleta_actual_id,
          v_pieza.estado, v_evento_previo.hlc, v_evento_previo.payload
        );
      end if;
    end if;

    update public.piezas
    set estado = 'EN_CONFLICTO',
        version = version + 1,
        ultimo_hlc = v_hlc,
        ultimo_hlc_milisegundos = private.hlc_milisegundos(v_hlc),
        ultimo_hlc_contador = private.hlc_contador(v_hlc),
        ultimo_hlc_dispositivo_id = p_dispositivo_id,
        actualizado_en = statement_timestamp()
    where id = v_pieza.id
    returning * into v_pieza;

    insert into public.eventos_dominio (
      id, operacion_id, ordinal, tipo_agregado, agregado_id, pieza_id,
      maleta_id, tipo_evento, actor_tipo, actor_usuario_id, actor_rol,
      dispositivo_id, version_esperada, version_resultante, hlc,
      hlc_milisegundos, hlc_contador, hlc_dispositivo_id,
      registrado_en_cliente, estado_anterior, estado_posterior,
      payload, resultado
    ) values (
      v_evento_id, p_operacion_id, p_ordinal_evento, 'PIEZA', v_pieza.id,
      v_pieza.id, (v_cuerpo ->> 'maletaId')::uuid, v_tipo_evento,
      'USUARIO', p_actor_id, p_rol, p_dispositivo_id, v_version_esperada,
      v_pieza.version, v_hlc, private.hlc_milisegundos(v_hlc),
      private.hlc_contador(v_hlc), p_dispositivo_id, v_registrado_en,
      v_estado_anterior::text, 'EN_CONFLICTO', p_evento, 'CONFLICTO'
    ) returning * into v_evento_guardado;

    insert into public.conflicto_candidatos (
      id, conflicto_id, operacion_id, evento_id, dispositivo_id,
      usuario_id, maleta_id, estado_propuesto, hlc, evidencia
    ) values (
      gen_random_uuid(), v_conflicto_id, p_operacion_id, v_evento_id,
      p_dispositivo_id, p_actor_id, (v_cuerpo ->> 'maletaId')::uuid,
      'ASIGNADA_A_MALETA', v_hlc, p_evento
    );

    perform private.registrar_cambio(
      p_secuencia_servidor, p_ordinal_cambio, 'PIEZA', v_pieza.id,
      v_pieza.version, false, private.snapshot_pieza(v_pieza.id)
    );
    perform private.registrar_cambio(
      p_secuencia_servidor, p_ordinal_cambio + 1, 'CONFLICTO', v_conflicto_id,
      0, false, (select to_jsonb(c) from public.conflictos c where c.id = v_conflicto_id)
    );
    perform private.registrar_cambio(
      p_secuencia_servidor, p_ordinal_cambio + 2, 'EVENTO_DOMINIO', v_evento_id,
      v_pieza.version, false, to_jsonb(v_evento_guardado)
    );

    return jsonb_build_object(
      'siguienteOrdinal', p_ordinal_cambio + 3,
      'eventoId', v_evento_id,
      'conflictoId', v_conflicto_id,
      'codigo', v_codigo
    );
  end if;

  if v_version_esperada is not null and v_version_esperada <> v_pieza.version then
    raise exception using errcode = '40001', message = 'VERSION_DESACTUALIZADA';
  end if;
  if v_pieza.estado in ('CONSUMIDA', 'EXTRAVIADA') then
    raise exception using errcode = '55000', message = 'PIEZA_EN_ESTADO_TERMINAL';
  end if;
  if v_pieza.estado = 'EN_CONFLICTO' and v_tipo_evento <> 'RESOLUCION_MANUAL' then
    raise exception using errcode = '55000', message = 'PIEZA_CONGELADA';
  end if;

  case v_tipo_evento
    when 'ESCANEO_ARMADO' then
      if v_pieza.estado not in ('EN_BODEGA_CENTRAL', 'EN_BODEGA_INSTRUMENTISTA') then
        raise exception using errcode = '55000', message = 'TRANSICION_ILEGAL';
      end if;
      select m.* into v_maleta from public.maletas m
      where m.id = (v_cuerpo ->> 'maletaId')::uuid and m.estado = 'EN_ARMADO'
      for update;
      if v_maleta.id is null then
        raise exception using errcode = 'P0002', message = 'MALETA_NO_DISPONIBLE';
      end if;
      v_estado_nuevo := 'ASIGNADA_A_MALETA';
      v_maleta_nueva := v_maleta.id;
      v_item_id := v_evento_id;
      insert into public.maleta_items (
        id, maleta_id, pieza_id, agregada_por, agregada_en
      ) values (v_item_id, v_maleta.id, v_pieza.id, p_actor_id, v_registrado_en);
      v_item_version := 0;

    when 'ESCANEO_ARMADO_REVERSO' then
      if v_pieza.estado <> 'ASIGNADA_A_MALETA' then
        raise exception using errcode = '55000', message = 'TRANSICION_ILEGAL';
      end if;
      select mi.id into v_item_id from public.maleta_items mi
      where mi.pieza_id = v_pieza.id and mi.resultado is null
      order by mi.agregada_en desc limit 1 for update;
      if v_item_id is null then
        raise exception using errcode = 'P0002', message = 'ITEM_MALETA_ACTIVO_NO_ENCONTRADO';
      end if;
      update public.maleta_items
      set retirada_por = p_actor_id, retirada_en = v_registrado_en,
          resultado = 'RETIRADA_ANTES_SALIDA', finalizada_en = v_registrado_en,
          version = version + 1, actualizado_en = statement_timestamp()
      where id = v_item_id returning version into v_item_version;
      select * into v_bodega from public.bodegas where id = v_pieza.bodega_retorno_id;
      v_estado_nuevo := case when v_bodega.tipo = 'CENTRAL'
        then 'EN_BODEGA_CENTRAL'::public.estado_pieza
        else 'EN_BODEGA_INSTRUMENTISTA'::public.estado_pieza end;
      v_maleta_nueva := null;

    when 'CONFIRMAR_SALIDA' then
      if v_pieza.estado <> 'ASIGNADA_A_MALETA'
         or v_pieza.maleta_actual_id is distinct from (v_cuerpo ->> 'maletaId')::uuid then
        raise exception using errcode = '55000', message = 'MALETA_NO_COINCIDE';
      end if;
      v_estado_nuevo := 'EN_MALETA_ACTIVA';

    when 'ESCANEO_USO' then
      if v_pieza.estado <> 'EN_MALETA_ACTIVA'
         or v_pieza.maleta_actual_id is distinct from (v_cuerpo ->> 'maletaId')::uuid then
        raise exception using errcode = '55000', message = 'MALETA_NO_COINCIDE';
      end if;
      select mi.id into v_item_id from public.maleta_items mi
      where mi.pieza_id = v_pieza.id and mi.maleta_id = v_pieza.maleta_actual_id and mi.resultado is null
      order by mi.agregada_en desc limit 1 for update;
      if v_item_id is null then
        raise exception using errcode = 'P0002', message = 'ITEM_MALETA_ACTIVO_NO_ENCONTRADO';
      end if;
      update public.maleta_items
      set usada_por = p_actor_id, usada_en = v_registrado_en,
          version = version + 1, actualizado_en = statement_timestamp()
      where id = v_item_id returning version into v_item_version;
      v_estado_nuevo := 'USADA_PENDIENTE_VALORACION';

    when 'CIERRE_MALETA_SIN_USO' then
      if v_pieza.estado <> 'EN_MALETA_ACTIVA'
         or v_pieza.maleta_actual_id is distinct from (v_cuerpo ->> 'maletaId')::uuid then
        raise exception using errcode = '55000', message = 'MALETA_NO_COINCIDE';
      end if;
      select mi.id into v_item_id from public.maleta_items mi
      where mi.pieza_id = v_pieza.id and mi.maleta_id = v_pieza.maleta_actual_id and mi.resultado is null
      order by mi.agregada_en desc limit 1 for update;
      update public.maleta_items
      set resultado = 'REGRESO_SIN_USO', finalizada_en = v_registrado_en,
          version = version + 1, actualizado_en = statement_timestamp()
      where id = v_item_id returning version into v_item_version;
      if v_item_version is null then
        raise exception using errcode = 'P0002', message = 'ITEM_MALETA_ACTIVO_NO_ENCONTRADO';
      end if;
      v_ciclo_id := gen_random_uuid();
      insert into public.ciclos_reprocesamiento (
        id, pieza_id, maleta_origen_id, motivo, ingresada_por, ingreso_en
      ) values (
        v_ciclo_id, v_pieza.id, v_pieza.maleta_actual_id,
        'Regreso de maleta sin uso', p_actor_id, v_registrado_en
      );
      v_ciclo_version := 0;
      v_estado_nuevo := 'EN_REPROCESAMIENTO';
      v_maleta_nueva := null;

    when 'CONFIRMAR_FACTURA' then
      if v_pieza.estado <> 'USADA_PENDIENTE_VALORACION' then
        raise exception using errcode = '55000', message = 'TRANSICION_ILEGAL';
      end if;
      select mi.id into v_item_id from public.maleta_items mi
      where mi.pieza_id = v_pieza.id and mi.maleta_id = v_pieza.maleta_actual_id and mi.resultado is null
      order by mi.agregada_en desc limit 1 for update;
      update public.maleta_items
      set resultado = 'UTILIZADA', finalizada_en = v_registrado_en,
          version = version + 1, actualizado_en = statement_timestamp()
      where id = v_item_id returning version into v_item_version;
      if v_item_version is null then
        raise exception using errcode = 'P0002', message = 'ITEM_MALETA_ACTIVO_NO_ENCONTRADO';
      end if;
      v_estado_nuevo := case when v_tipo_producto = 'INSUMO'
        then 'CONSUMIDA'::public.estado_pieza else 'FACTURADA'::public.estado_pieza end;
      v_maleta_nueva := null;

    when 'INGRESO_REPROCESO' then
      if v_pieza.estado <> 'FACTURADA' then
        raise exception using errcode = '55000', message = 'TRANSICION_ILEGAL';
      end if;
      v_ciclo_id := gen_random_uuid();
      insert into public.ciclos_reprocesamiento (
        id, pieza_id, motivo, ingresada_por, ingreso_en
      ) values (v_ciclo_id, v_pieza.id, 'Instrumental facturado', p_actor_id, v_registrado_en);
      v_ciclo_version := 0;
      v_estado_nuevo := 'EN_REPROCESAMIENTO';

    when 'FIN_REPROCESO' then
      if v_pieza.estado <> 'EN_REPROCESAMIENTO' then
        raise exception using errcode = '55000', message = 'TRANSICION_ILEGAL';
      end if;
      if v_cuerpo #>> '{destino,clase}' = 'BODEGA_CENTRAL' then
        select b.* into v_bodega from public.bodegas b
        where b.tipo = 'CENTRAL' and b.activa order by b.creado_en limit 1;
      elsif v_cuerpo #>> '{destino,clase}' = 'BODEGA_INSTRUMENTISTA' then
        select b.* into v_bodega from public.bodegas b
        where b.tipo = 'INSTRUMENTISTA' and b.activa
          and b.responsable_id = (v_cuerpo #>> '{destino,usuarioId}')::uuid
        order by b.creado_en limit 1;
      else
        raise exception using errcode = '22023', message = 'DESTINO_INVALIDO';
      end if;
      if v_bodega.id is null then
        raise exception using errcode = 'P0002', message = 'BODEGA_DESTINO_NO_ENCONTRADA';
      end if;
      select cr.id into v_ciclo_id from public.ciclos_reprocesamiento cr
      where cr.pieza_id = v_pieza.id and cr.estado = 'ABIERTO'
      order by cr.ingreso_en desc limit 1 for update;
      if v_ciclo_id is null then
        raise exception using errcode = 'P0002', message = 'CICLO_REPROCESO_ABIERTO_NO_ENCONTRADO';
      end if;
      update public.ciclos_reprocesamiento
      set estado = 'FINALIZADO', finalizada_por = p_actor_id,
          finalizada_en = v_registrado_en, bodega_destino_id = v_bodega.id,
          version = version + 1, actualizado_en = statement_timestamp()
      where id = v_ciclo_id returning version into v_ciclo_version;
      v_bodega_nueva := v_bodega.id;
      v_estado_nuevo := case when v_bodega.tipo = 'CENTRAL'
        then 'EN_BODEGA_CENTRAL'::public.estado_pieza
        else 'EN_BODEGA_INSTRUMENTISTA'::public.estado_pieza end;
      v_maleta_nueva := null;

    when 'MARCAR_EXTRAVIADA' then
      if nullif(btrim(v_cuerpo ->> 'motivo'), '') is null then
        raise exception using errcode = '22023', message = 'MOTIVO_REQUERIDO';
      end if;
      select mi.id into v_item_id from public.maleta_items mi
      where mi.pieza_id = v_pieza.id and mi.resultado is null
      order by mi.agregada_en desc limit 1 for update;
      if v_item_id is not null then
        update public.maleta_items
        set resultado = 'EXTRAVIADA', finalizada_en = v_registrado_en,
            version = version + 1, actualizado_en = statement_timestamp()
        where id = v_item_id returning version into v_item_version;
      end if;
      v_estado_nuevo := 'EXTRAVIADA';
      v_maleta_nueva := null;

    when 'RESOLUCION_MANUAL' then
      if v_pieza.estado <> 'EN_CONFLICTO' then
        raise exception using errcode = '55000', message = 'TRANSICION_ILEGAL';
      end if;
      v_estado_nuevo := (v_cuerpo ->> 'estadoAdjudicado')::public.estado_pieza;
      if v_estado_nuevo not in (
        'EN_BODEGA_CENTRAL', 'EN_BODEGA_INSTRUMENTISTA', 'EN_MALETA_ACTIVA',
        'USADA_PENDIENTE_VALORACION', 'EN_REPROCESAMIENTO', 'EXTRAVIADA'
      ) then
        raise exception using errcode = '22023', message = 'ESTADO_ADJUDICADO_INVALIDO';
      end if;
      if v_cuerpo #>> '{ubicacion,clase}' = 'BODEGA_CENTRAL' then
        select b.* into v_bodega from public.bodegas b
        where b.tipo = 'CENTRAL' and b.activa order by b.creado_en limit 1;
      elsif v_cuerpo #>> '{ubicacion,clase}' = 'BODEGA_INSTRUMENTISTA' then
        select b.* into v_bodega from public.bodegas b
        where b.tipo = 'INSTRUMENTISTA' and b.activa
          and b.responsable_id = (v_cuerpo #>> '{ubicacion,usuarioId}')::uuid
        order by b.creado_en limit 1;
      else
        raise exception using errcode = '22023', message = 'UBICACION_INVALIDA';
      end if;
      if v_bodega.id is null then
        raise exception using errcode = 'P0002', message = 'BODEGA_NO_ENCONTRADA';
      end if;
      v_bodega_nueva := v_bodega.id;
      v_maleta_nueva := nullif(v_cuerpo ->> 'maletaId', '')::uuid;
      if v_estado_nuevo in ('EN_MALETA_ACTIVA', 'USADA_PENDIENTE_VALORACION') and v_maleta_nueva is null then
        raise exception using errcode = '22023', message = 'MALETA_REQUERIDA';
      end if;
      if v_estado_nuevo not in ('EN_MALETA_ACTIVA', 'USADA_PENDIENTE_VALORACION') then
        v_maleta_nueva := null;
      end if;
      select c.id into v_conflicto_id from public.conflictos c
      where c.pieza_id = v_pieza.id and c.estado = 'ABIERTO' for update;
      if v_conflicto_id is null then
        raise exception using errcode = 'P0002', message = 'CONFLICTO_ABIERTO_NO_ENCONTRADO';
      end if;
      update public.conflictos
      set estado = 'RESUELTO', resuelto_en = clock_timestamp(),
          resuelto_por = p_actor_id, estado_adjudicado = v_estado_nuevo,
          resolucion = v_cuerpo ->> 'motivo', version = version + 1
      where id = v_conflicto_id;

    else
      raise exception using errcode = '22023', message = 'TIPO_EVENTO_DESCONOCIDO';
  end case;

  update public.piezas
  set estado = v_estado_nuevo,
      bodega_retorno_id = v_bodega_nueva,
      maleta_actual_id = v_maleta_nueva,
      version = version + 1,
      ultimo_hlc = v_hlc,
      ultimo_hlc_milisegundos = private.hlc_milisegundos(v_hlc),
      ultimo_hlc_contador = private.hlc_contador(v_hlc),
      ultimo_hlc_dispositivo_id = p_dispositivo_id,
      actualizado_en = statement_timestamp()
  where id = v_pieza.id
  returning * into v_pieza;

  insert into public.eventos_dominio (
    id, operacion_id, ordinal, tipo_agregado, agregado_id, pieza_id,
    maleta_id, tipo_evento, actor_tipo, actor_usuario_id, actor_rol,
    dispositivo_id, version_esperada, version_resultante, hlc,
    hlc_milisegundos, hlc_contador, hlc_dispositivo_id,
    registrado_en_cliente, estado_anterior, estado_posterior,
    payload, resultado
  ) values (
    v_evento_id, p_operacion_id, p_ordinal_evento, 'PIEZA', v_pieza.id,
    v_pieza.id, coalesce(nullif(v_cuerpo ->> 'maletaId', '')::uuid, v_maleta_nueva),
    v_tipo_evento, 'USUARIO', p_actor_id, p_rol, p_dispositivo_id,
    v_version_esperada, v_pieza.version, v_hlc,
    private.hlc_milisegundos(v_hlc), private.hlc_contador(v_hlc),
    p_dispositivo_id, v_registrado_en, v_estado_anterior::text,
    v_estado_nuevo::text, p_evento, 'ACEPTADO'
  ) returning * into v_evento_guardado;

  perform private.registrar_cambio(
    p_secuencia_servidor, p_ordinal_cambio, 'PIEZA', v_pieza.id,
    v_pieza.version, false, private.snapshot_pieza(v_pieza.id)
  );
  p_ordinal_cambio := p_ordinal_cambio + 1;

  if v_item_id is not null then
    select to_jsonb(mi) into v_payload_relacionado from public.maleta_items mi where mi.id = v_item_id;
    perform private.registrar_cambio(
      p_secuencia_servidor, p_ordinal_cambio, 'MALETA_ITEM', v_item_id,
      coalesce(v_item_version, 0), false, v_payload_relacionado
    );
    p_ordinal_cambio := p_ordinal_cambio + 1;
  end if;

  if v_ciclo_id is not null then
    select to_jsonb(cr) into v_payload_relacionado from public.ciclos_reprocesamiento cr where cr.id = v_ciclo_id;
    perform private.registrar_cambio(
      p_secuencia_servidor, p_ordinal_cambio, 'CICLO_REPROCESAMIENTO', v_ciclo_id,
      coalesce(v_ciclo_version, 0), false, v_payload_relacionado
    );
    p_ordinal_cambio := p_ordinal_cambio + 1;
  end if;

  if v_conflicto_id is not null then
    perform private.registrar_cambio(
      p_secuencia_servidor, p_ordinal_cambio, 'CONFLICTO', v_conflicto_id,
      1, false, (select to_jsonb(c) from public.conflictos c where c.id = v_conflicto_id)
    );
    p_ordinal_cambio := p_ordinal_cambio + 1;
  end if;

  perform private.registrar_cambio(
    p_secuencia_servidor, p_ordinal_cambio, 'EVENTO_DOMINIO', v_evento_id,
    v_pieza.version, false, to_jsonb(v_evento_guardado)
  );

  return jsonb_build_object(
    'siguienteOrdinal', p_ordinal_cambio + 1,
    'eventoId', v_evento_id
  );
end;
$$;

revoke all on function private.aplicar_evento_pieza(uuid, integer, uuid, public.rol_aplicacion, uuid, jsonb, bigint, integer) from public;
grant execute on function private.aplicar_evento_pieza(uuid, integer, uuid, public.rol_aplicacion, uuid, jsonb, bigint, integer) to service_role;

create or replace function private.reconstruir_borrador_factura(
  p_maleta_id uuid,
  p_actor_id uuid,
  p_factura_id uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_maleta public.maletas%rowtype;
  v_hospital public.hospitales%rowtype;
  v_factura public.facturas%rowtype;
  v_item record;
  v_excepcion public.excepciones_precio%rowtype;
  v_nivel public.nivel_precio;
  v_tipo_precio public.tipo_precio_aplicado;
  v_precio bigint;
  v_requiere boolean;
  v_explicacion text;
  v_total bigint := 0;
  v_lineas integer := 0;
  v_ciudad_base text;
begin
  select m.* into v_maleta from public.maletas m
  where m.id = p_maleta_id for update;
  if v_maleta.id is null or v_maleta.estado <> 'CERRADA' or v_maleta.hospital_id is null then
    raise exception using errcode = '55000', message = 'MALETA_NO_CERRADA';
  end if;

  select h.* into v_hospital from public.hospitales h
  where h.id = v_maleta.hospital_id and h.activo;
  if v_hospital.id is null then
    raise exception using errcode = 'P0002', message = 'HOSPITAL_NO_DISPONIBLE';
  end if;

  select c.ciudad_base into v_ciudad_base
  from public.configuracion_sistema c where c.singleton;

  select f.* into v_factura from public.facturas f
  where f.maleta_id = p_maleta_id for update;

  if v_factura.id is not null and v_factura.estado = 'EMITIDA' then
    raise exception using errcode = '55000', message = 'FACTURA_EMITIDA_INMUTABLE';
  end if;

  if v_factura.id is null then
    v_factura.id := coalesce(p_factura_id, gen_random_uuid());
    insert into public.facturas (
      id, maleta_id, hospital_id, hospital_nombre_snapshot,
      hospital_ciudad_snapshot, nivel_precio_snapshot, creada_por
    ) values (
      v_factura.id, p_maleta_id, v_hospital.id, v_hospital.nombre,
      v_hospital.ciudad, v_hospital.nivel_precio, p_actor_id
    );
  else
    delete from public.factura_lineas where factura_id = v_factura.id;
  end if;

  for v_item in
    select mi.pieza_id, p.codigo, p.producto_id, pr.sku, pr.nombre, pr.costo_base_centavos
    from public.maleta_items mi
    join public.piezas p on p.id = mi.pieza_id
    join public.productos pr on pr.id = p.producto_id
    where mi.maleta_id = p_maleta_id
      and mi.resultado = 'UTILIZADA'
    order by p.id
  loop
    if v_item.costo_base_centavos <= 0 then
      raise exception using errcode = '22023', message = 'COSTO_BASE_NO_DEFINIDO';
    end if;

    v_excepcion := null;
    select ep.* into v_excepcion
    from public.excepciones_precio ep
    where ep.hospital_id = v_hospital.id
      and ep.producto_id = v_item.producto_id
      and ep.estado in ('PENDIENTE', 'APROBADO')
      and ep.vigente_desde <= statement_timestamp()
      and (ep.vigente_hasta is null or ep.vigente_hasta >= statement_timestamp())
    order by ep.vigente_desde desc, ep.propuesta_en desc, ep.id
    limit 1;

    if v_excepcion.id is not null then
      v_precio := v_excepcion.precio_centavos;
      v_tipo_precio := 'ALEATORIO';
      v_requiere := v_excepcion.estado = 'PENDIENTE';
      v_explicacion := case when v_requiere
        then 'Precio aleatorio pendiente de aprobación de gerencia'
        else 'Precio aleatorio aprobado por gerencia' end;
    else
      v_nivel := v_hospital.nivel_precio;
      if lower(btrim(v_hospital.ciudad)) <> lower(btrim(v_ciudad_base))
         and v_nivel = 'HABITUAL' then
        v_nivel := 'PROVINCIA';
      end if;
      v_tipo_precio := v_nivel::text::public.tipo_precio_aplicado;
      v_precio := (v_item.costo_base_centavos * case v_nivel
        when 'HABITUAL' then 110
        when 'PROVINCIA' then 120
        when 'NOTA_CREDITO' then 130
        else 100 end + 50) / 100;
      v_requiere := false;
      v_explicacion := format(
        'Nivel %s (costo + %s%%)',
        v_nivel::text,
        case v_nivel when 'HABITUAL' then 10 when 'PROVINCIA' then 20 when 'NOTA_CREDITO' then 30 else 0 end
      );
    end if;

    insert into public.factura_lineas (
      id, factura_id, pieza_id, producto_id, excepcion_precio_id,
      sku_snapshot, producto_nombre_snapshot, codigo_pieza_snapshot,
      cantidad, precio_unitario_centavos, tipo_precio, explicacion,
      estado_aprobacion_snapshot, requiere_aprobacion, revision_precio
    ) values (
      gen_random_uuid(), v_factura.id, v_item.pieza_id, v_item.producto_id,
      v_excepcion.id, v_item.sku::text, v_item.nombre, v_item.codigo::text,
      1, v_precio, v_tipo_precio, v_explicacion,
      v_excepcion.estado, v_requiere, coalesce(v_factura.revision_precios, 0) + 1
    );
    v_total := v_total + v_precio;
    v_lineas := v_lineas + 1;
  end loop;

  if v_lineas = 0 then
    delete from public.facturas where id = v_factura.id and estado = 'BORRADOR';
    return null;
  end if;

  update public.facturas f
  set total_centavos = v_total,
      requiere_aprobacion = exists (
        select 1 from public.factura_lineas fl
        where fl.factura_id = f.id and fl.requiere_aprobacion
      ),
      requiere_recalculo = false,
      revision_precios = revision_precios + 1,
      version = version + 1,
      actualizado_en = statement_timestamp()
  where f.id = v_factura.id;

  return v_factura.id;
end;
$$;

create or replace function private.snapshot_factura(p_factura_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', f.id,
    'maletaId', f.maleta_id,
    'hospitalId', f.hospital_id,
    'numero', f.numero::text,
    'estado', f.estado,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fl.id,
        'codigoPieza', fl.codigo_pieza_snapshot,
        'sku', fl.sku_snapshot,
        'nombre', fl.producto_nombre_snapshot,
        'cantidad', fl.cantidad,
        'precio', jsonb_build_object(
          'valor', fl.precio_unitario_centavos,
          'tipo', fl.tipo_precio,
          'requiereAprobacion', fl.requiere_aprobacion,
          'explicacion', fl.explicacion
        ),
        'subtotal', fl.subtotal_centavos
      ) order by fl.id)
      from public.factura_lineas fl where fl.factura_id = f.id
    ), '[]'::jsonb),
    'total', f.total_centavos,
    'requiereAprobacion', f.requiere_aprobacion,
    'requiereRecalculo', f.requiere_recalculo,
    'creadaEn', f.creado_en,
    'emitidaEn', f.emitida_en,
    'version', f.version
  )
  from public.facturas f
  where f.id = p_factura_id;
$$;

revoke all on function private.reconstruir_borrador_factura(uuid, uuid, uuid) from public;
revoke all on function private.snapshot_factura(uuid) from public;
grant execute on function private.reconstruir_borrador_factura(uuid, uuid, uuid) to service_role;
grant execute on function private.snapshot_factura(uuid) to service_role;

create or replace function private.aplicar_evento_maleta(
  p_operacion_id uuid,
  p_ordinal_evento integer,
  p_actor_id uuid,
  p_rol public.rol_aplicacion,
  p_dispositivo_id uuid,
  p_evento jsonb,
  p_secuencia_servidor bigint,
  p_ordinal_cambio integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_sobre jsonb := p_evento -> 'sobre';
  v_cuerpo jsonb := p_evento -> 'cuerpo';
  v_evento_id uuid := nullif(v_sobre ->> 'eventoId', '')::uuid;
  v_tipo_evento text := v_cuerpo ->> 'tipo';
  v_maleta_id uuid := nullif(v_cuerpo ->> 'maletaId', '')::uuid;
  v_hlc text := v_sobre ->> 'hlc';
  v_registrado_en timestamptz := (v_sobre ->> 'registradoEn')::timestamptz;
  v_version_esperada bigint := nullif(p_evento ->> 'versionEsperada', '')::bigint;
  v_maleta public.maletas%rowtype;
  v_estado_anterior public.estado_maleta;
  v_factura_id uuid;
  v_evento_guardado public.eventos_dominio%rowtype;
begin
  if (v_sobre ->> 'dispositivoId')::uuid <> p_dispositivo_id
     or (v_sobre ->> 'usuarioId')::uuid <> p_actor_id then
    raise exception using errcode = '42501', message = 'SOBRE_EVENTO_NO_COINCIDE';
  end if;
  if (v_sobre ->> 'rol')::public.rol_aplicacion <> p_rol
     or not private.rol_permite_evento(p_rol, v_tipo_evento) then
    raise exception using errcode = '42501', message = 'ROL_NO_AUTORIZADO';
  end if;
  perform private.validar_hlc(v_hlc, p_dispositivo_id);
  if exists (select 1 from public.eventos_dominio where id = v_evento_id) then
    raise exception using errcode = '23505', message = 'EVENTO_ID_REUTILIZADO';
  end if;

  if v_tipo_evento = 'MALETA_ABIERTA' then
    if exists (select 1 from public.maletas where id = v_maleta_id) then
      raise exception using errcode = '23505', message = 'MALETA_ID_REUTILIZADO';
    end if;
    insert into public.maletas (
      id, responsable_id, procedimiento, estado, abierta_en,
      version, ultimo_hlc
    ) values (
      v_maleta_id, p_actor_id, nullif(btrim(v_cuerpo ->> 'procedimiento'), ''),
      'EN_ARMADO', v_registrado_en, 1, v_hlc
    ) returning * into v_maleta;
    v_estado_anterior := null;
  else
    select m.* into v_maleta from public.maletas m
    where m.id = v_maleta_id for update;
    if v_maleta.id is null then
      raise exception using errcode = 'P0002', message = 'MALETA_NO_ENCONTRADA';
    end if;
    if v_version_esperada is not null and v_version_esperada <> v_maleta.version then
      raise exception using errcode = '40001', message = 'VERSION_DESACTUALIZADA';
    end if;
    if v_maleta.estado in ('CERRADA', 'CANCELADA') then
      raise exception using errcode = '55000', message = 'MALETA_EN_ESTADO_TERMINAL';
    end if;
    v_estado_anterior := v_maleta.estado;

    case v_tipo_evento
      when 'MALETA_SALIO' then
        if v_maleta.estado <> 'EN_ARMADO' then
          raise exception using errcode = '55000', message = 'TRANSICION_ILEGAL';
        end if;
        if not exists (
          select 1 from public.maleta_items mi
          where mi.maleta_id = v_maleta.id and mi.resultado is null
        ) then
          raise exception using errcode = '55000', message = 'MALETA_VACIA';
        end if;
        update public.maletas set
          estado = 'EN_CIRUGIA', salio_en = v_registrado_en,
          version = version + 1, ultimo_hlc = v_hlc,
          actualizado_en = statement_timestamp()
        where id = v_maleta.id returning * into v_maleta;

      when 'MALETA_CERRADA' then
        if v_maleta.estado <> 'EN_CIRUGIA' then
          raise exception using errcode = '55000', message = 'TRANSICION_ILEGAL';
        end if;
        if exists (
          select 1 from public.piezas p
          where p.maleta_actual_id = v_maleta.id and p.estado = 'EN_MALETA_ACTIVA'
        ) then
          raise exception using errcode = '55000', message = 'PIEZAS_SIN_CIERRE';
        end if;
        if not exists (
          select 1 from public.hospitales h
          where h.id = (v_cuerpo ->> 'hospitalId')::uuid and h.activo
        ) then
          raise exception using errcode = 'P0002', message = 'HOSPITAL_NO_ENCONTRADO';
        end if;
        update public.maleta_items mi set
          resultado = 'UTILIZADA', finalizada_en = v_registrado_en,
          version = version + 1, actualizado_en = statement_timestamp()
        where mi.maleta_id = v_maleta.id
          and mi.usada_en is not null and mi.resultado is null;
        update public.maletas set
          estado = 'CERRADA', hospital_id = (v_cuerpo ->> 'hospitalId')::uuid,
          cerrada_en = v_registrado_en, version = version + 1,
          ultimo_hlc = v_hlc, actualizado_en = statement_timestamp()
        where id = v_maleta.id returning * into v_maleta;
        update public.accesos_freelance set
          revocado_por = p_actor_id, revocado_en = clock_timestamp(),
          motivo_revocacion = 'Maleta cerrada'
        where maleta_id = v_maleta.id and revocado_en is null;
        v_factura_id := private.reconstruir_borrador_factura(
          v_maleta.id, p_actor_id, nullif(v_cuerpo ->> 'facturaId', '')::uuid
        );

      when 'MALETA_CANCELADA' then
        if v_maleta.estado <> 'EN_ARMADO' then
          raise exception using errcode = '55000', message = 'TRANSICION_ILEGAL';
        end if;
        if exists (
          select 1 from public.piezas p where p.maleta_actual_id = v_maleta.id
        ) then
          raise exception using errcode = '55000', message = 'MALETA_TIENE_PIEZAS_ACTIVAS';
        end if;
        if nullif(btrim(v_cuerpo ->> 'motivo'), '') is null then
          raise exception using errcode = '22023', message = 'MOTIVO_REQUERIDO';
        end if;
        update public.maletas set
          estado = 'CANCELADA', cancelada_en = v_registrado_en,
          version = version + 1, ultimo_hlc = v_hlc,
          actualizado_en = statement_timestamp()
        where id = v_maleta.id returning * into v_maleta;
        update public.accesos_freelance set
          revocado_por = p_actor_id, revocado_en = clock_timestamp(),
          motivo_revocacion = 'Maleta cancelada'
        where maleta_id = v_maleta.id and revocado_en is null;

      else
        raise exception using errcode = '22023', message = 'TIPO_EVENTO_MALETA_DESCONOCIDO';
    end case;
  end if;

  insert into public.eventos_dominio (
    id, operacion_id, ordinal, tipo_agregado, agregado_id, maleta_id,
    tipo_evento, actor_tipo, actor_usuario_id, actor_rol, dispositivo_id,
    version_esperada, version_resultante, hlc, hlc_milisegundos,
    hlc_contador, hlc_dispositivo_id, registrado_en_cliente,
    estado_anterior, estado_posterior, payload, resultado
  ) values (
    v_evento_id, p_operacion_id, p_ordinal_evento, 'MALETA', v_maleta.id,
    v_maleta.id, v_tipo_evento, 'USUARIO', p_actor_id, p_rol,
    p_dispositivo_id, v_version_esperada, v_maleta.version, v_hlc,
    private.hlc_milisegundos(v_hlc), private.hlc_contador(v_hlc),
    p_dispositivo_id, v_registrado_en, v_estado_anterior::text,
    v_maleta.estado::text, p_evento, 'ACEPTADO'
  ) returning * into v_evento_guardado;

  perform private.registrar_cambio(
    p_secuencia_servidor, p_ordinal_cambio, 'MALETA', v_maleta.id,
    v_maleta.version, false, private.snapshot_maleta(v_maleta.id)
  );
  p_ordinal_cambio := p_ordinal_cambio + 1;

  if v_factura_id is not null then
    perform private.registrar_cambio(
      p_secuencia_servidor, p_ordinal_cambio, 'FACTURA', v_factura_id,
      (select f.version from public.facturas f where f.id = v_factura_id),
      false, private.snapshot_factura(v_factura_id)
    );
    p_ordinal_cambio := p_ordinal_cambio + 1;
  end if;

  perform private.registrar_cambio(
    p_secuencia_servidor, p_ordinal_cambio, 'EVENTO_DOMINIO', v_evento_id,
    v_maleta.version, false, to_jsonb(v_evento_guardado)
  );

  return jsonb_build_object(
    'siguienteOrdinal', p_ordinal_cambio + 1,
    'eventoId', v_evento_id,
    'facturaId', v_factura_id
  );
end;
$$;

revoke all on function private.aplicar_evento_maleta(uuid, integer, uuid, public.rol_aplicacion, uuid, jsonb, bigint, integer) from public;
grant execute on function private.aplicar_evento_maleta(uuid, integer, uuid, public.rol_aplicacion, uuid, jsonb, bigint, integer) to service_role;

grant select, update on private.cabeza_sync to service_role;
grant insert, select on private.auditoria_administrativa to service_role;

create or replace function private.puede_recibir_entidad(
  p_rol public.rol_aplicacion,
  p_entidad_tipo text
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when p_entidad_tipo in ('FACTURA', 'FACTURA_LINEA', 'EXCEPCION_PRECIO')
      then p_rol in ('ADMINISTRADOR', 'CONTABLE', 'SUPERVISOR')
    when p_entidad_tipo in ('CONFLICTO', 'CONFLICTO_CANDIDATO')
      then p_rol in ('ADMINISTRADOR', 'COORDINADORA', 'SUPERVISOR')
    when p_entidad_tipo = 'CICLO_REPROCESAMIENTO'
      then p_rol in ('ADMINISTRADOR', 'AUXILIAR', 'COORDINADORA', 'SUPERVISOR')
    else p_rol <> 'FREELANCE'
  end;
$$;

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
  v_aceptados jsonb := '[]'::jsonb;
  v_rechazados jsonb := '[]'::jsonb;
  v_conflictos jsonb := '[]'::jsonb;
  v_resultados jsonb := '[]'::jsonb;
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
    v_codigo_error := null;
    v_mensaje_error := null;
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
      select o.* into v_existente from public.operaciones_sync o
      where o.id = v_operacion_id;

      if v_existente.id is not null then
        if v_existente.dispositivo_id <> p_dispositivo_id
           or v_existente.actor_usuario_id <> p_actor_id
           or v_existente.payload_hash <> v_payload_hash then
          raise exception using errcode = '23505', message = 'OPERACION_ID_REUTILIZADO_CON_OTRO_CONTENIDO';
        end if;

        v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
          'operacionId', v_operacion_id,
          'estado', v_existente.estado,
          'codigo', v_existente.codigo_resultado,
          'idempotente', true
        ));

        if v_existente.estado in ('APLICADA', 'CONFLICTO') then
          v_aceptados := v_aceptados || coalesce((
            select jsonb_agg(ed.id order by ed.ordinal)
            from public.eventos_dominio ed
            where ed.operacion_id = v_operacion_id and ed.resultado = 'ACEPTADO'
          ), '[]'::jsonb);
          v_conflictos := v_conflictos || coalesce((
            select jsonb_agg(jsonb_build_object(
              'eventoId', ed.id,
              'codigo', p.codigo::text,
              'conflictoId', cc.conflicto_id,
              'detalle', jsonb_build_object('estado', c.estado, 'candidatos', (
                select count(*) from public.conflicto_candidatos cct where cct.conflicto_id = c.id
              ))
            ) order by ed.ordinal)
            from public.eventos_dominio ed
            join public.piezas p on p.id = ed.pieza_id
            join public.conflicto_candidatos cc on cc.evento_id = ed.id
            join public.conflictos c on c.id = cc.conflicto_id
            where ed.operacion_id = v_operacion_id and ed.resultado = 'CONFLICTO'
          ), '[]'::jsonb);
        else
          v_rechazados := v_rechazados || coalesce((
            select jsonb_agg(jsonb_build_object(
              'eventoId', coalesce(r.evento_id, ed.id),
              'codigo', r.codigo,
              'motivo', r.motivo
            ))
            from public.rechazos_sync r
            left join public.eventos_dominio ed on ed.operacion_id = r.operacion_id
            where r.operacion_id = v_operacion_id
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
          if v_resultado_evento ? 'conflictoId' then
            v_tuvo_conflicto := true;
            v_conflictos := v_conflictos || jsonb_build_array(jsonb_build_object(
              'eventoId', v_resultado_evento ->> 'eventoId',
              'codigo', v_resultado_evento ->> 'codigo',
              'conflictoId', v_resultado_evento ->> 'conflictoId',
              'detalle', jsonb_build_object('motivo', 'ASIGNACION_CONCURRENTE')
            ));
          else
            v_aceptados := v_aceptados || jsonb_build_array(v_resultado_evento ->> 'eventoId');
          end if;
          v_ordinal_evento := v_ordinal_evento + 1;
        end loop;

        update public.operaciones_sync
        set estado = case when v_tuvo_conflicto then 'CONFLICTO' else 'APLICADA' end,
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

  update public.dispositivos
  set ultimo_sync_en = clock_timestamp()
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

create or replace function public.obtener_cambios_sync(
  p_actor_id uuid,
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
  v_rol public.rol_aplicacion;
  v_cursor_actual bigint;
  v_cursor_nuevo bigint;
  v_commits jsonb;
begin
  v_rol := private.validar_contexto_sync(p_actor_id, p_dispositivo_id);
  v_cursor_actual := coalesce(p_cursor, 0);
  if v_cursor_actual < 0 then
    raise exception using errcode = '22023', message = 'CURSOR_INVALIDO';
  end if;
  if p_max_commits not between 1 and 100 then
    raise exception using errcode = '22023', message = 'LIMITE_COMMITS_INVALIDO';
  end if;
  if v_cursor_actual > (select siguiente_secuencia - 1 from private.cabeza_sync where singleton) then
    raise exception using errcode = '22023', message = 'CURSOR_ADELANTADO';
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
          'ordinal', cs.ordinal,
          'entidadTipo', cs.entidad_tipo,
          'entidadId', cs.entidad_id,
          'version', cs.entidad_version,
          'eliminado', cs.eliminado,
          'payload', cs.payload
        ) order by cs.ordinal)
        from public.cambios_sync cs
        where cs.secuencia_servidor = s.secuencia_servidor
          and private.puede_recibir_entidad(v_rol, cs.entidad_tipo)
      ), '[]'::jsonb)
    ) order by s.secuencia_servidor), '[]'::jsonb)
  into v_cursor_nuevo, v_commits
  from seleccionados s;

  -- p_cursor es el ACK durable que el cliente ya había persistido. El cursor
  -- devuelto no se confirma hasta la siguiente llamada.
  update public.dispositivos
  set ultimo_cursor = greatest(ultimo_cursor, v_cursor_actual),
      ultimo_sync_en = clock_timestamp()
  where id = p_dispositivo_id;

  return jsonb_build_object(
    'cursorAnterior', v_cursor_actual,
    'cursorServidor', v_cursor_nuevo,
    'commits', v_commits,
    'hayMas', exists (
      select 1 from public.commits_sync c where c.secuencia_servidor > v_cursor_nuevo
    )
  );
end;
$$;

revoke all on function public.obtener_cambios_sync(uuid, uuid, bigint, integer) from public, anon, authenticated;
grant execute on function public.obtener_cambios_sync(uuid, uuid, bigint, integer) to service_role;

comment on function public.procesar_lote_sync(uuid, uuid, jsonb) is
  'PUSH server-side: valida identidad/rol, procesa cada operación atómicamente y deduplica por UUID+hash.';
comment on function public.obtener_cambios_sync(uuid, uuid, bigint, integer) is
  'PULL incremental: pagina commits completos y trata el cursor recibido como ACK durable.';
