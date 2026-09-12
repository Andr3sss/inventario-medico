-- Actores freelance son sesiones acotadas, no identidades permanentes de Auth.
alter table public.operaciones_sync alter column actor_usuario_id drop not null;
alter table public.operaciones_sync
  add column actor_sesion_freelance_id uuid references public.sesiones_freelance(id) on delete restrict,
  add constraint operaciones_sync_actor_coherente check (
    (actor_usuario_id is not null and actor_sesion_freelance_id is null)
    or (actor_usuario_id is null and actor_sesion_freelance_id is not null)
  );

alter table public.maleta_items drop constraint maleta_items_uso_coherente;
alter table public.maleta_items
  add column usada_por_sesion_freelance_id uuid references public.sesiones_freelance(id) on delete restrict,
  add constraint maleta_items_uso_coherente check (
    (usada_en is null and usada_por is null and usada_por_sesion_freelance_id is null)
    or (
      usada_en is not null
      and ((usada_por is not null)::integer + (usada_por_sesion_freelance_id is not null)::integer) = 1
      and usada_en >= agregada_en
    )
  );

alter table public.ciclos_reprocesamiento alter column ingresada_por drop not null;
alter table public.ciclos_reprocesamiento
  add column ingresada_por_sesion_freelance_id uuid references public.sesiones_freelance(id) on delete restrict,
  add constraint ciclos_reproceso_actor_ingreso_coherente check (
    ((ingresada_por is not null)::integer + (ingresada_por_sesion_freelance_id is not null)::integer) = 1
  );

-- La purga elimina sesiones antes de estos historiales y los historiales más
-- adelante en la misma transacción; diferir evita un estado intermedio falso.
alter table public.maleta_items
  alter constraint maleta_items_usada_por_sesion_freelance_id_fkey
  deferrable initially deferred;
alter table public.ciclos_reprocesamiento
  alter constraint ciclos_reprocesamiento_ingresada_por_sesion_freelance_id_fkey
  deferrable initially deferred;

create index operaciones_sync_sesion_freelance_idx
  on public.operaciones_sync (actor_sesion_freelance_id) where actor_sesion_freelance_id is not null;
create index maleta_items_usada_sesion_freelance_idx
  on public.maleta_items (usada_por_sesion_freelance_id) where usada_por_sesion_freelance_id is not null;
create index ciclos_reproceso_ingreso_sesion_freelance_idx
  on public.ciclos_reprocesamiento (ingresada_por_sesion_freelance_id)
  where ingresada_por_sesion_freelance_id is not null;

create or replace function private.completar_maleta_evento_pieza()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pieza_id is not null and new.maleta_id is null then
    select mi.maleta_id into new.maleta_id
    from public.maleta_items mi
    where mi.pieza_id = new.pieza_id
    order by mi.agregada_en desc, mi.id
    limit 1;
  end if;
  return new;
end;
$$;

create trigger eventos_dominio_completar_maleta
before insert on public.eventos_dominio
for each row execute function private.completar_maleta_evento_pieza();

create or replace function private.exigir_rol_actor(
  p_actor_id uuid,
  p_roles public.rol_aplicacion[]
)
returns public.rol_aplicacion
language plpgsql
set search_path = ''
as $$
declare
  v_rol public.rol_aplicacion;
begin
  perform private.exigir_service_role();
  select p.rol into v_rol from public.perfiles p
  where p.id = p_actor_id and p.activo;
  if v_rol is null or v_rol <> all (p_roles) then
    raise exception using errcode = '42501', message = 'ROL_NO_AUTORIZADO';
  end if;
  if not exists (
    select 1 from public.configuracion_sistema c
    where c.singleton and c.ciclo_vida in ('DEMO', 'PRODUCCION')
  ) then
    raise exception using errcode = '55000', message = 'SISTEMA_NO_DISPONIBLE';
  end if;
  return v_rol;
end;
$$;

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

  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'ACTUALIZAR_PERFIL', 'PERFIL', p_usuario_id, 'OK',
    jsonb_build_object(
      'rolAnterior', v_anterior.rol, 'rolNuevo', v_nuevo.rol,
      'activoAnterior', v_anterior.activo, 'activoNuevo', v_nuevo.activo
    )
  );
  return v_nuevo;
end;
$$;

create or replace function public.proponer_excepcion_precio(
  p_actor_id uuid,
  p_id uuid,
  p_hospital_id uuid,
  p_producto_id uuid,
  p_precio_centavos bigint,
  p_vigente_desde timestamptz,
  p_vigente_hasta timestamptz,
  p_motivo text,
  p_observaciones text default null
)
returns public.excepciones_precio
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fila public.excepciones_precio%rowtype;
  v_commit bigint;
begin
  perform private.exigir_rol_actor(
    p_actor_id, array['ADMINISTRADOR', 'CONTABLE']::public.rol_aplicacion[]
  );
  if p_precio_centavos < 0 or p_vigente_hasta is not null and p_vigente_hasta <= p_vigente_desde
     or nullif(btrim(p_motivo), '') is null then
    raise exception using errcode = '22023', message = 'EXCEPCION_PRECIO_INVALIDA';
  end if;
  if not exists (select 1 from public.hospitales where id = p_hospital_id and activo)
     or not exists (select 1 from public.productos where id = p_producto_id and activo) then
    raise exception using errcode = 'P0002', message = 'HOSPITAL_O_PRODUCTO_NO_DISPONIBLE';
  end if;

  insert into public.excepciones_precio (
    id, hospital_id, producto_id, precio_centavos, vigente_desde,
    vigente_hasta, propuesta_por, propuesta_en, motivo, observaciones
  ) values (
    p_id, p_hospital_id, p_producto_id, p_precio_centavos,
    p_vigente_desde, p_vigente_hasta, p_actor_id, clock_timestamp(),
    btrim(p_motivo), nullif(btrim(p_observaciones), '')
  ) returning * into v_fila;

  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(v_commit, 0, 'EXCEPCION_PRECIO', v_fila.id, v_fila.version, false, to_jsonb(v_fila));
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado,
    detalle
  ) values (
    p_actor_id, 'PROPONER_EXCEPCION_PRECIO', 'EXCEPCION_PRECIO',
    v_fila.id, 'OK', jsonb_build_object('commit', v_commit)
  );
  return v_fila;
end;
$$;

create or replace function public.decidir_excepcion_precio(
  p_actor_id uuid,
  p_excepcion_id uuid,
  p_decision public.estado_aprobacion,
  p_motivo_decision text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_excepcion public.excepciones_precio%rowtype;
  v_factura_id uuid;
  v_facturas uuid[];
  v_commit bigint;
  v_ordinal integer := 0;
begin
  perform private.exigir_rol_actor(p_actor_id, array['ADMINISTRADOR']::public.rol_aplicacion[]);
  if p_decision not in ('APROBADO', 'RECHAZADO') then
    raise exception using errcode = '22023', message = 'DECISION_INVALIDA';
  end if;
  if p_decision = 'RECHAZADO' and nullif(btrim(p_motivo_decision), '') is null then
    raise exception using errcode = '22023', message = 'MOTIVO_RECHAZO_REQUERIDO';
  end if;

  select ep.* into v_excepcion from public.excepciones_precio ep
  where ep.id = p_excepcion_id for update;
  if v_excepcion.id is null then
    raise exception using errcode = 'P0002', message = 'EXCEPCION_NO_ENCONTRADA';
  end if;
  if v_excepcion.estado <> 'PENDIENTE' then
    raise exception using errcode = '55000', message = 'EXCEPCION_YA_DECIDIDA';
  end if;

  select coalesce(array_agg(distinct fl.factura_id), '{}'::uuid[]) into v_facturas
  from public.factura_lineas fl
  join public.facturas f on f.id = fl.factura_id and f.estado = 'BORRADOR'
  where fl.excepcion_precio_id = p_excepcion_id;

  update public.excepciones_precio
  set estado = p_decision, decidida_por = p_actor_id,
      decidida_en = clock_timestamp(),
      observaciones = case when p_decision = 'RECHAZADO'
        then concat_ws(E'\n', nullif(observaciones, ''), 'Rechazo: ' || btrim(p_motivo_decision))
        else observaciones end,
      version = version + 1,
      actualizado_en = statement_timestamp()
  where id = p_excepcion_id returning * into v_excepcion;

  foreach v_factura_id in array v_facturas
  loop
    if p_decision = 'APROBADO' then
      update public.factura_lineas
      set estado_aprobacion_snapshot = 'APROBADO', requiere_aprobacion = false,
          revision_precio = revision_precio + 1,
          actualizado_en = statement_timestamp()
      where factura_id = v_factura_id and excepcion_precio_id = p_excepcion_id;
      update public.facturas f
      set requiere_aprobacion = exists (
            select 1 from public.factura_lineas fl
            where fl.factura_id = f.id and fl.requiere_aprobacion
          ),
          version = version + 1,
          actualizado_en = statement_timestamp()
      where f.id = v_factura_id;
    else
      update public.facturas set requiere_recalculo = true
      where id = v_factura_id;
      perform private.reconstruir_borrador_factura(
        (select f.maleta_id from public.facturas f where f.id = v_factura_id),
        p_actor_id,
        v_factura_id
      );
    end if;
  end loop;

  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(v_commit, v_ordinal, 'EXCEPCION_PRECIO', v_excepcion.id, v_excepcion.version, false, to_jsonb(v_excepcion));
  v_ordinal := v_ordinal + 1;
  foreach v_factura_id in array v_facturas
  loop
    perform private.registrar_cambio(
      v_commit, v_ordinal, 'FACTURA', v_factura_id,
      (select f.version from public.facturas f where f.id = v_factura_id),
      false, private.snapshot_factura(v_factura_id)
    );
    v_ordinal := v_ordinal + 1;
  end loop;

  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'DECIDIR_EXCEPCION_PRECIO', 'EXCEPCION_PRECIO',
    p_excepcion_id, 'OK', jsonb_build_object(
      'decision', p_decision, 'facturasActualizadas', cardinality(v_facturas), 'commit', v_commit
    )
  );
  return jsonb_build_object(
    'excepcion', to_jsonb(v_excepcion),
    'facturasActualizadas', cardinality(v_facturas),
    'secuenciaServidor', v_commit
  );
end;
$$;

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
  v_rol public.rol_aplicacion;
  v_factura public.facturas%rowtype;
  v_existente public.operaciones_sync%rowtype;
  v_hash bytea;
  v_evento jsonb;
  v_resultado jsonb;
  v_commit bigint;
  v_ordinal_evento integer := 0;
  v_ordinal_cambio integer := 0;
begin
  v_rol := private.validar_contexto_sync(p_actor_id, p_dispositivo_id);
  if v_rol <> 'CONTABLE' then
    raise exception using errcode = '42501', message = 'SOLO_CONTABLE_EMITE_FACTURA';
  end if;
  if nullif(btrim(p_numero), '') is null or jsonb_typeof(p_eventos) <> 'array' then
    raise exception using errcode = '22023', message = 'DATOS_EMISION_INVALIDOS';
  end if;

  v_hash := extensions.digest(convert_to(jsonb_build_object(
    'facturaId', p_factura_id, 'numero', btrim(p_numero), 'eventos', p_eventos
  )::text, 'UTF8'), 'sha256');
  select o.* into v_existente from public.operaciones_sync o where o.id = p_operacion_id;
  if v_existente.id is not null then
    if v_existente.actor_usuario_id <> p_actor_id
       or v_existente.dispositivo_id <> p_dispositivo_id
       or v_existente.payload_hash <> v_hash
       or v_existente.estado <> 'APLICADA' then
      raise exception using errcode = '23505', message = 'OPERACION_EMISION_REUTILIZADA';
    end if;
    return jsonb_build_object('idempotente', true, 'factura', private.snapshot_factura(p_factura_id));
  end if;

  select f.* into v_factura from public.facturas f where f.id = p_factura_id for update;
  if v_factura.id is null then
    raise exception using errcode = 'P0002', message = 'FACTURA_NO_ENCONTRADA';
  end if;
  if v_factura.estado <> 'BORRADOR' then
    raise exception using errcode = '55000', message = 'FACTURA_YA_EMITIDA';
  end if;
  if v_factura.requiere_aprobacion or v_factura.requiere_recalculo then
    raise exception using errcode = '55000', message = 'FACTURA_BLOQUEADA_POR_PRECIO';
  end if;
  if (select count(*) from public.factura_lineas where factura_id = p_factura_id) = 0 then
    raise exception using errcode = '55000', message = 'FACTURA_SIN_LINEAS';
  end if;
  if jsonb_array_length(p_eventos) <> (
    select count(*) from public.factura_lineas where factura_id = p_factura_id
  ) or exists (
    select 1
    from public.factura_lineas fl
    where fl.factura_id = p_factura_id
      and not exists (
        select 1 from jsonb_array_elements(p_eventos) e
        where e #>> '{cuerpo,tipo}' = 'CONFIRMAR_FACTURA'
          and e #>> '{cuerpo,codigo}' = fl.codigo_pieza_snapshot
      )
  ) then
    raise exception using errcode = '22023', message = 'EVENTOS_FACTURA_NO_COINCIDEN_CON_LINEAS';
  end if;

  insert into public.operaciones_sync (
    id, dispositivo_id, actor_usuario_id, secuencia_cliente, payload_hash
  ) values (
    p_operacion_id, p_dispositivo_id, p_actor_id, p_secuencia_cliente, v_hash
  );
  v_commit := private.reservar_commit(p_operacion_id);

  for v_evento in select value from jsonb_array_elements(p_eventos)
  loop
    if v_evento #>> '{cuerpo,tipo}' <> 'CONFIRMAR_FACTURA' then
      raise exception using errcode = '22023', message = 'EVENTO_EMISION_INVALIDO';
    end if;
    v_resultado := private.aplicar_evento_pieza(
      p_operacion_id, v_ordinal_evento, p_actor_id, v_rol,
      p_dispositivo_id, v_evento, v_commit, v_ordinal_cambio
    );
    if v_resultado ? 'conflictoId' then
      raise exception using errcode = '55000', message = 'CONFLICTO_DURANTE_EMISION';
    end if;
    v_ordinal_cambio := (v_resultado ->> 'siguienteOrdinal')::integer;
    v_ordinal_evento := v_ordinal_evento + 1;
  end loop;

  update public.facturas
  set estado = 'EMITIDA', numero = btrim(p_numero), emitida_por = p_actor_id,
      emitida_en = clock_timestamp(), version = version + 1,
      actualizado_en = statement_timestamp()
  where id = p_factura_id returning * into v_factura;

  perform private.registrar_cambio(
    v_commit, v_ordinal_cambio, 'FACTURA', v_factura.id, v_factura.version,
    false, private.snapshot_factura(v_factura.id)
  );
  update public.operaciones_sync
  set estado = 'APLICADA', codigo_resultado = 'OK',
      detalle_resultado = jsonb_build_object('secuenciaServidor', v_commit, 'facturaId', p_factura_id),
      procesada_en = clock_timestamp()
  where id = p_operacion_id;
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'EMITIR_FACTURA', 'FACTURA', p_factura_id, 'OK',
    jsonb_build_object('numero', btrim(p_numero), 'commit', v_commit)
  );
  return jsonb_build_object(
    'idempotente', false,
    'secuenciaServidor', v_commit,
    'factura', private.snapshot_factura(p_factura_id)
  );
end;
$$;

create or replace function public.crear_acceso_freelance(
  p_actor_id uuid,
  p_maleta_id uuid,
  p_expira_en timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_acceso public.accesos_freelance%rowtype;
begin
  perform private.exigir_rol_actor(
    p_actor_id, array['ADMINISTRADOR', 'CONTABLE']::public.rol_aplicacion[]
  );
  if p_expira_en <= clock_timestamp() or p_expira_en > clock_timestamp() + interval '7 days' then
    raise exception using errcode = '22023', message = 'EXPIRACION_FREELANCE_INVALIDA';
  end if;
  if not exists (
    select 1 from public.maletas m
    where m.id = p_maleta_id and m.estado in ('EN_ARMADO', 'EN_CIRUGIA')
  ) then
    raise exception using errcode = '55000', message = 'MALETA_NO_ADMITE_FREELANCE';
  end if;

  insert into public.accesos_freelance (
    id, maleta_id, token_hash, token_prefijo, creado_por, expira_en
  ) values (
    gen_random_uuid(), p_maleta_id,
    extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
    left(v_token, 10), p_actor_id, p_expira_en
  ) returning * into v_acceso;

  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado,
    detalle
  ) values (
    p_actor_id, 'CREAR_ACCESO_FREELANCE', 'ACCESO_FREELANCE',
    v_acceso.id, 'OK', jsonb_build_object('maletaId', p_maleta_id, 'expiraEn', p_expira_en)
  );
  return jsonb_build_object(
    'id', v_acceso.id, 'maletaId', v_acceso.maleta_id,
    'token', v_token, 'tokenPrefijo', v_acceso.token_prefijo,
    'expiraEn', v_acceso.expira_en
  );
end;
$$;

create or replace function public.revocar_acceso_freelance(
  p_actor_id uuid,
  p_acceso_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_acceso public.accesos_freelance%rowtype;
begin
  perform private.exigir_rol_actor(
    p_actor_id, array['ADMINISTRADOR', 'CONTABLE']::public.rol_aplicacion[]
  );
  if nullif(btrim(p_motivo), '') is null then
    raise exception using errcode = '22023', message = 'MOTIVO_REQUERIDO';
  end if;
  select a.* into v_acceso from public.accesos_freelance a
  where a.id = p_acceso_id for update;
  if v_acceso.id is null then
    raise exception using errcode = 'P0002', message = 'ACCESO_NO_ENCONTRADO';
  end if;
  if v_acceso.revocado_en is null then
    update public.accesos_freelance
    set revocado_por = p_actor_id, revocado_en = clock_timestamp(),
        motivo_revocacion = btrim(p_motivo)
    where id = p_acceso_id returning * into v_acceso;
    update public.sesiones_freelance set revocada_en = clock_timestamp()
    where acceso_id = p_acceso_id and revocada_en is null;
  end if;
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'REVOCAR_ACCESO_FREELANCE', 'ACCESO_FREELANCE',
    p_acceso_id, 'OK', jsonb_build_object('motivo', btrim(p_motivo))
  );
  return jsonb_build_object('id', v_acceso.id, 'revocadoEn', v_acceso.revocado_en);
end;
$$;

create or replace function public.redimir_acceso_freelance(
  p_token text,
  p_dispositivo_id uuid,
  p_nombre_dispositivo text,
  p_plataforma text,
  p_nombre_freelance text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_acceso public.accesos_freelance%rowtype;
  v_sesion public.sesiones_freelance%rowtype;
  v_epoca uuid;
begin
  perform private.exigir_service_role();
  if nullif(btrim(p_token), '') is null
     or nullif(btrim(p_nombre_dispositivo), '') is null
     or nullif(btrim(p_nombre_freelance), '') is null then
    raise exception using errcode = '22023', message = 'DATOS_FREELANCE_INVALIDOS';
  end if;
  select a.* into v_acceso from public.accesos_freelance a
  join public.maletas m on m.id = a.maleta_id
  where a.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
    and a.revocado_en is null and a.expira_en > clock_timestamp()
    and m.estado in ('EN_ARMADO', 'EN_CIRUGIA')
  for update of a;
  if v_acceso.id is null then
    raise exception using errcode = '42501', message = 'TOKEN_FREELANCE_INVALIDO';
  end if;
  select epoca_handoff into v_epoca from public.configuracion_sistema
  where singleton and ciclo_vida in ('DEMO', 'PRODUCCION');

  insert into public.dispositivos (id, nombre, plataforma, epoca_handoff)
  values (p_dispositivo_id, btrim(p_nombre_dispositivo), nullif(btrim(p_plataforma), ''), v_epoca)
  on conflict (id) do update set
    nombre = excluded.nombre, plataforma = excluded.plataforma,
    activo = true, retirado_en = null
  where public.dispositivos.epoca_handoff = excluded.epoca_handoff;

  insert into public.sesiones_freelance (
    acceso_id, dispositivo_id, nombre_snapshot, expira_en
  ) values (
    v_acceso.id, p_dispositivo_id, btrim(p_nombre_freelance),
    least(v_acceso.expira_en, clock_timestamp() + interval '12 hours')
  ) returning * into v_sesion;
  update public.accesos_freelance set ultimo_uso_en = clock_timestamp() where id = v_acceso.id;
  return jsonb_build_object(
    'sesionId', v_sesion.id,
    'maletaId', v_acceso.maleta_id,
    'expiraEn', v_sesion.expira_en,
    'nombre', v_sesion.nombre_snapshot
  );
end;
$$;

create or replace function public.procesar_operacion_freelance(
  p_sesion_id uuid,
  p_dispositivo_id uuid,
  p_operacion jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sesion public.sesiones_freelance%rowtype;
  v_acceso public.accesos_freelance%rowtype;
  v_operacion_id uuid;
  v_secuencia_cliente bigint;
  v_hash bytea;
  v_existente public.operaciones_sync%rowtype;
  v_commit bigint;
  v_evento jsonb;
  v_sobre jsonb;
  v_cuerpo jsonb;
  v_evento_id uuid;
  v_tipo text;
  v_hlc text;
  v_registrado_en timestamptz;
  v_version_esperada bigint;
  v_pieza public.piezas%rowtype;
  v_estado_anterior public.estado_pieza;
  v_item_id uuid;
  v_item_version bigint;
  v_ciclo_id uuid;
  v_evento_guardado public.eventos_dominio%rowtype;
  v_ordinal_evento integer := 0;
  v_ordinal_cambio integer := 0;
  v_aceptados jsonb := '[]'::jsonb;
begin
  perform private.exigir_service_role();
  select sf.* into v_sesion
  from public.sesiones_freelance sf
  join public.accesos_freelance a on a.id = sf.acceso_id
  join public.maletas m on m.id = a.maleta_id
  join public.configuracion_sistema c on c.singleton
  where sf.id = p_sesion_id and sf.dispositivo_id = p_dispositivo_id
    and sf.revocada_en is null and sf.expira_en > clock_timestamp()
    and a.revocado_en is null and a.expira_en > clock_timestamp()
    and m.estado in ('EN_ARMADO', 'EN_CIRUGIA')
    and c.ciclo_vida in ('DEMO', 'PRODUCCION')
  for update of sf;
  if v_sesion.id is null then
    raise exception using errcode = '42501', message = 'SESION_FREELANCE_INVALIDA';
  end if;
  select a.* into v_acceso from public.accesos_freelance a where a.id = v_sesion.acceso_id;

  if jsonb_typeof(p_operacion -> 'eventos') <> 'array'
     or jsonb_array_length(p_operacion -> 'eventos') = 0
     or jsonb_array_length(p_operacion -> 'eventos') > 200 then
    raise exception using errcode = '22023', message = 'OPERACION_EVENTOS_INVALIDOS';
  end if;
  v_operacion_id := nullif(p_operacion ->> 'operacionId', '')::uuid;
  v_secuencia_cliente := nullif(p_operacion ->> 'secuenciaCliente', '')::bigint;
  if v_secuencia_cliente is null or v_secuencia_cliente < 0 then
    raise exception using errcode = '22023', message = 'SECUENCIA_CLIENTE_INVALIDA';
  end if;
  v_hash := extensions.digest(convert_to(p_operacion::text, 'UTF8'), 'sha256');

  select o.* into v_existente from public.operaciones_sync o where o.id = v_operacion_id;
  if v_existente.id is not null then
    if v_existente.actor_sesion_freelance_id <> p_sesion_id
       or v_existente.dispositivo_id <> p_dispositivo_id
       or v_existente.payload_hash <> v_hash
       or v_existente.estado <> 'APLICADA' then
      raise exception using errcode = '23505', message = 'OPERACION_ID_REUTILIZADO';
    end if;
    return jsonb_build_object(
      'idempotente', true,
      'aceptados', coalesce((
        select jsonb_agg(ed.id order by ed.ordinal)
        from public.eventos_dominio ed where ed.operacion_id = v_operacion_id
      ), '[]'::jsonb)
    );
  end if;

  insert into public.operaciones_sync (
    id, dispositivo_id, actor_sesion_freelance_id,
    secuencia_cliente, payload_hash
  ) values (
    v_operacion_id, p_dispositivo_id, p_sesion_id,
    v_secuencia_cliente, v_hash
  );
  v_commit := private.reservar_commit(v_operacion_id);

  for v_evento in select value from jsonb_array_elements(p_operacion -> 'eventos')
  loop
    v_sobre := v_evento -> 'sobre';
    v_cuerpo := v_evento -> 'cuerpo';
    v_evento_id := nullif(v_sobre ->> 'eventoId', '')::uuid;
    v_tipo := v_cuerpo ->> 'tipo';
    v_hlc := v_sobre ->> 'hlc';
    v_registrado_en := (v_sobre ->> 'registradoEn')::timestamptz;
    v_version_esperada := nullif(v_evento ->> 'versionEsperada', '')::bigint;

    if (v_sobre ->> 'dispositivoId')::uuid <> p_dispositivo_id
       or v_sobre ->> 'rol' <> 'FREELANCE'
       or v_tipo not in ('ESCANEO_USO', 'CIERRE_MALETA_SIN_USO')
       or (v_cuerpo ->> 'maletaId')::uuid <> v_acceso.maleta_id then
      raise exception using errcode = '42501', message = 'EVENTO_FREELANCE_NO_AUTORIZADO';
    end if;
    perform private.validar_hlc(v_hlc, p_dispositivo_id);
    if exists (select 1 from public.eventos_dominio where id = v_evento_id) then
      raise exception using errcode = '23505', message = 'EVENTO_ID_REUTILIZADO';
    end if;

    select p.* into v_pieza from public.piezas p
    where p.codigo = (v_cuerpo ->> 'codigo')::extensions.citext
      and p.maleta_actual_id = v_acceso.maleta_id
      and p.eliminado_en is null
    for update;
    if v_pieza.id is null or v_pieza.estado <> 'EN_MALETA_ACTIVA' then
      raise exception using errcode = '55000', message = 'PIEZA_NO_DISPONIBLE_EN_MALETA';
    end if;
    if v_version_esperada is not null and v_version_esperada <> v_pieza.version then
      raise exception using errcode = '40001', message = 'VERSION_DESACTUALIZADA';
    end if;
    v_estado_anterior := v_pieza.estado;

    select mi.id into v_item_id from public.maleta_items mi
    where mi.pieza_id = v_pieza.id and mi.maleta_id = v_acceso.maleta_id
      and mi.resultado is null
    order by mi.agregada_en desc limit 1 for update;
    if v_item_id is null then
      raise exception using errcode = 'P0002', message = 'ITEM_MALETA_ACTIVO_NO_ENCONTRADO';
    end if;

    if v_tipo = 'ESCANEO_USO' then
      update public.maleta_items
      set usada_por_sesion_freelance_id = p_sesion_id,
          usada_en = v_registrado_en, version = version + 1,
          actualizado_en = statement_timestamp()
      where id = v_item_id returning version into v_item_version;
      update public.piezas
      set estado = 'USADA_PENDIENTE_VALORACION', version = version + 1,
          ultimo_hlc = v_hlc,
          ultimo_hlc_milisegundos = private.hlc_milisegundos(v_hlc),
          ultimo_hlc_contador = private.hlc_contador(v_hlc),
          ultimo_hlc_dispositivo_id = p_dispositivo_id,
          actualizado_en = statement_timestamp()
      where id = v_pieza.id returning * into v_pieza;
    else
      update public.maleta_items
      set resultado = 'REGRESO_SIN_USO', finalizada_en = v_registrado_en,
          version = version + 1, actualizado_en = statement_timestamp()
      where id = v_item_id returning version into v_item_version;
      v_ciclo_id := gen_random_uuid();
      insert into public.ciclos_reprocesamiento (
        id, pieza_id, maleta_origen_id, motivo,
        ingresada_por_sesion_freelance_id, ingreso_en
      ) values (
        v_ciclo_id, v_pieza.id, v_acceso.maleta_id,
        'Regreso de maleta sin uso', p_sesion_id, v_registrado_en
      );
      update public.piezas
      set estado = 'EN_REPROCESAMIENTO', maleta_actual_id = null,
          version = version + 1, ultimo_hlc = v_hlc,
          ultimo_hlc_milisegundos = private.hlc_milisegundos(v_hlc),
          ultimo_hlc_contador = private.hlc_contador(v_hlc),
          ultimo_hlc_dispositivo_id = p_dispositivo_id,
          actualizado_en = statement_timestamp()
      where id = v_pieza.id returning * into v_pieza;
    end if;

    insert into public.eventos_dominio (
      id, operacion_id, ordinal, tipo_agregado, agregado_id, pieza_id,
      maleta_id, tipo_evento, actor_tipo, actor_sesion_freelance_id,
      actor_rol, dispositivo_id, version_esperada, version_resultante,
      hlc, hlc_milisegundos, hlc_contador, hlc_dispositivo_id,
      registrado_en_cliente, estado_anterior, estado_posterior,
      payload, resultado
    ) values (
      v_evento_id, v_operacion_id, v_ordinal_evento, 'PIEZA', v_pieza.id,
      v_pieza.id, v_acceso.maleta_id, v_tipo, 'FREELANCE', p_sesion_id,
      'FREELANCE', p_dispositivo_id, v_version_esperada, v_pieza.version,
      v_hlc, private.hlc_milisegundos(v_hlc), private.hlc_contador(v_hlc),
      p_dispositivo_id, v_registrado_en, v_estado_anterior::text,
      v_pieza.estado::text, v_evento, 'ACEPTADO'
    ) returning * into v_evento_guardado;

    perform private.registrar_cambio(
      v_commit, v_ordinal_cambio, 'PIEZA', v_pieza.id, v_pieza.version,
      false, private.snapshot_pieza(v_pieza.id)
    );
    v_ordinal_cambio := v_ordinal_cambio + 1;
    perform private.registrar_cambio(
      v_commit, v_ordinal_cambio, 'MALETA_ITEM', v_item_id, v_item_version,
      false, (select to_jsonb(mi) from public.maleta_items mi where mi.id = v_item_id)
    );
    v_ordinal_cambio := v_ordinal_cambio + 1;
    if v_ciclo_id is not null then
      perform private.registrar_cambio(
        v_commit, v_ordinal_cambio, 'CICLO_REPROCESAMIENTO', v_ciclo_id, 0,
        false, (select to_jsonb(cr) from public.ciclos_reprocesamiento cr where cr.id = v_ciclo_id)
      );
      v_ordinal_cambio := v_ordinal_cambio + 1;
      v_ciclo_id := null;
    end if;
    perform private.registrar_cambio(
      v_commit, v_ordinal_cambio, 'EVENTO_DOMINIO', v_evento_id,
      v_pieza.version, false, to_jsonb(v_evento_guardado)
    );
    v_ordinal_cambio := v_ordinal_cambio + 1;
    v_ordinal_evento := v_ordinal_evento + 1;
    v_aceptados := v_aceptados || jsonb_build_array(v_evento_id);
  end loop;

  update public.operaciones_sync
  set estado = 'APLICADA', codigo_resultado = 'OK',
      detalle_resultado = jsonb_build_object('secuenciaServidor', v_commit),
      procesada_en = clock_timestamp()
  where id = v_operacion_id;
  update public.sesiones_freelance set ultima_actividad_en = clock_timestamp()
  where id = p_sesion_id;
  update public.dispositivos set ultimo_sync_en = clock_timestamp()
  where id = p_dispositivo_id;
  return jsonb_build_object(
    'idempotente', false,
    'aceptados', v_aceptados,
    'secuenciaServidor', v_commit
  );
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
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'PROVISIONAR_USUARIO', 'PERFIL', p_usuario_id, 'OK',
    jsonb_build_object('rol', p_rol)
  );
  return v_perfil;
end;
$$;

revoke all on function private.completar_maleta_evento_pieza() from public;
revoke all on function private.exigir_rol_actor(uuid, public.rol_aplicacion[]) from public;
revoke all on function public.actualizar_perfil(uuid, uuid, text, public.rol_aplicacion, boolean) from public, anon, authenticated;
revoke all on function public.proponer_excepcion_precio(uuid, uuid, uuid, uuid, bigint, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.decidir_excepcion_precio(uuid, uuid, public.estado_aprobacion, text) from public, anon, authenticated;
revoke all on function public.emitir_factura_central(uuid, uuid, uuid, bigint, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.crear_acceso_freelance(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.revocar_acceso_freelance(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.redimir_acceso_freelance(text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.procesar_operacion_freelance(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.provisionar_usuario_por_admin(uuid, uuid, text, public.rol_aplicacion) from public, anon, authenticated;

grant execute on function private.exigir_rol_actor(uuid, public.rol_aplicacion[]) to service_role;
grant execute on function public.actualizar_perfil(uuid, uuid, text, public.rol_aplicacion, boolean) to service_role;
grant execute on function public.proponer_excepcion_precio(uuid, uuid, uuid, uuid, bigint, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.decidir_excepcion_precio(uuid, uuid, public.estado_aprobacion, text) to service_role;
grant execute on function public.emitir_factura_central(uuid, uuid, uuid, bigint, uuid, text, jsonb) to service_role;
grant execute on function public.crear_acceso_freelance(uuid, uuid, timestamptz) to service_role;
grant execute on function public.revocar_acceso_freelance(uuid, uuid, text) to service_role;
grant execute on function public.redimir_acceso_freelance(text, uuid, text, text, text) to service_role;
grant execute on function public.procesar_operacion_freelance(uuid, uuid, jsonb) to service_role;
grant execute on function public.provisionar_usuario_por_admin(uuid, uuid, text, public.rol_aplicacion) to service_role;

comment on function public.emitir_factura_central(uuid, uuid, uuid, bigint, uuid, text, jsonb) is
  'Emite factura y aplica todos los eventos CONFIRMAR_FACTURA en una sola transacción.';
comment on function public.decidir_excepcion_precio(uuid, uuid, public.estado_aprobacion, text) is
  'Aprobación explícita: desbloquea borradores; rechazo reconstruye cada borrador con la siguiente regla vigente.';
comment on function public.redimir_acceso_freelance(text, uuid, text, text, text) is
  'Canje server-side de token por sesión acotada; el token en claro no se almacena.';
