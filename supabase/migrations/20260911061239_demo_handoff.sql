create table private.desafios_handoff (
  id uuid primary key default gen_random_uuid(),
  actor_usuario_id uuid references auth.users(id) on delete set null,
  token_hash bytea not null,
  referencia_backup text not null,
  creado_en timestamptz not null default clock_timestamp(),
  expira_en timestamptz not null,
  usado_en timestamptz,
  constraint desafios_handoff_backup_no_vacio check (btrim(referencia_backup) <> ''),
  constraint desafios_handoff_expiracion check (expira_en > creado_en)
);

create table private.handoff_auth_pendientes (
  usuario_id uuid primary key,
  desafio_id uuid not null references private.desafios_handoff(id) on delete restrict,
  eliminado_en_auth timestamptz,
  creado_en timestamptz not null default clock_timestamp()
);

alter table private.desafios_handoff enable row level security;
alter table private.desafios_handoff force row level security;
alter table private.handoff_auth_pendientes enable row level security;
alter table private.handoff_auth_pendientes force row level security;
grant all on private.desafios_handoff, private.handoff_auth_pendientes to service_role;

create or replace function public.provisionar_perfil(
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
  v_ciclo public.ciclo_vida_sistema;
  v_perfil public.perfiles%rowtype;
begin
  perform private.exigir_service_role();
  if not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception using errcode = 'P0002', message = 'USUARIO_AUTH_NO_EXISTE';
  end if;
  if p_rol = 'SISTEMA' or nullif(btrim(p_nombre), '') is null then
    raise exception using errcode = '22023', message = 'PERFIL_INVALIDO';
  end if;

  select ciclo_vida into v_ciclo from public.configuracion_sistema where singleton for update;
  if v_ciclo = 'DEMO' then
    null;
  elsif v_ciclo = 'LISTO_BOOTSTRAP' then
    if p_rol <> 'ADMINISTRADOR'
       or exists (select 1 from public.perfiles where origen = 'PRODUCCION') then
      raise exception using errcode = '42501', message = 'SOLO_PRIMER_ADMINISTRADOR';
    end if;
  else
    raise exception using errcode = '55000', message = 'PROVISION_NO_PERMITIDO_EN_ESTE_CICLO';
  end if;

  insert into public.perfiles (id, nombre, rol, activo)
  values (p_usuario_id, btrim(p_nombre), p_rol, true)
  returning * into v_perfil;

  insert into private.auditoria_administrativa (
    actor_usuario_id, actor_identificador, accion, objetivo_tipo,
    objetivo_id, resultado, detalle
  ) values (
    p_usuario_id, 'self-bootstrap', 'PROVISIONAR_PERFIL', 'PERFIL',
    p_usuario_id, 'OK', jsonb_build_object('rol', p_rol, 'ciclo', v_ciclo)
  );
  return v_perfil;
end;
$$;

create or replace function public.registrar_dispositivo(
  p_actor_id uuid,
  p_dispositivo_id uuid,
  p_nombre text,
  p_plataforma text,
  p_clave_publica text,
  p_valido_hasta timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns public.dispositivos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_epoca uuid;
  v_dispositivo public.dispositivos%rowtype;
begin
  perform private.exigir_service_role();
  if not exists (select 1 from public.perfiles p where p.id = p_actor_id and p.activo) then
    raise exception using errcode = '42501', message = 'USUARIO_INACTIVO_O_INEXISTENTE';
  end if;
  if nullif(btrim(p_nombre), '') is null or p_valido_hasta <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'DATOS_DISPOSITIVO_INVALIDOS';
  end if;
  select epoca_handoff into v_epoca from public.configuracion_sistema
  where singleton and ciclo_vida in ('DEMO', 'PRODUCCION') for share;
  if v_epoca is null then
    raise exception using errcode = '55000', message = 'SISTEMA_NO_DISPONIBLE';
  end if;

  insert into public.dispositivos (
    id, nombre, plataforma, clave_publica, epoca_handoff, metadata
  ) values (
    p_dispositivo_id, btrim(p_nombre), nullif(btrim(p_plataforma), ''),
    nullif(btrim(p_clave_publica), ''), v_epoca, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (id) do update set
    nombre = excluded.nombre,
    plataforma = excluded.plataforma,
    clave_publica = excluded.clave_publica,
    metadata = excluded.metadata,
    activo = true,
    retirado_en = null
  where public.dispositivos.epoca_handoff = excluded.epoca_handoff
  returning * into v_dispositivo;

  if v_dispositivo.id is null then
    raise exception using errcode = '55000', message = 'DISPOSITIVO_DE_EPOCA_ANTERIOR';
  end if;

  insert into public.dispositivo_usuarios (
    dispositivo_id, usuario_id, habilitado, valido_hasta, verificado_en
  ) values (
    p_dispositivo_id, p_actor_id, true, p_valido_hasta, clock_timestamp()
  )
  on conflict (dispositivo_id, usuario_id) do update set
    habilitado = true,
    valido_hasta = excluded.valido_hasta,
    verificado_en = excluded.verificado_en;

  return v_dispositivo;
end;
$$;

create or replace function public.cargar_datos_demo(p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lote uuid;
  v_bodega uuid;
  v_hospital_1 uuid;
  v_hospital_2 uuid;
  v_producto_instrumental uuid;
  v_producto_insumo uuid;
  v_producto_kit uuid;
  v_producto_componente uuid;
  v_pieza_kit uuid;
  v_secuencia bigint;
  v_ordinal integer := 0;
  v_fila record;
begin
  perform private.exigir_service_role();
  if not exists (
    select 1 from public.perfiles p
    where p.id = p_actor_id and p.activo and p.rol = 'ADMINISTRADOR' and p.origen = 'DEMO'
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_DEMO_REQUERIDO';
  end if;

  select c.lote_demo_activo_id into v_lote
  from public.configuracion_sistema c
  where c.singleton and c.ciclo_vida = 'DEMO' and c.reset_demo_habilitado
  for update;
  if v_lote is null then
    raise exception using errcode = '55000', message = 'MODO_DEMO_NO_ACTIVO';
  end if;
  if exists (select 1 from public.productos where lote_semilla_id = v_lote) then
    raise exception using errcode = '23505', message = 'SEMILLA_DEMO_YA_CARGADA';
  end if;

  insert into public.bodegas (codigo, nombre, tipo)
  values ('BOD-DEMO-CENTRAL', 'Bodega Central DEMO', 'CENTRAL')
  returning id into v_bodega;

  insert into public.hospitales (codigo, nombre, ciudad, nivel_precio)
  values ('HOSP-DEMO-GYE', 'Hospital Ficticio Guayaquil', 'Guayaquil', 'HABITUAL')
  returning id into v_hospital_1;
  insert into public.hospitales (codigo, nombre, ciudad, nivel_precio)
  values ('HOSP-DEMO-CUE', 'Clínica Ficticia Cuenca', 'Cuenca', 'HABITUAL')
  returning id into v_hospital_2;

  v_producto_instrumental := gen_random_uuid();
  v_producto_insumo := gen_random_uuid();
  v_producto_kit := gen_random_uuid();
  v_producto_componente := gen_random_uuid();
  insert into public.productos (id, sku, nombre, tipo, costo_base_centavos) values
    (v_producto_instrumental, 'DEMO-PINZA-001', 'Pinza de demostración', 'INSTRUMENTAL', 4200),
    (v_producto_insumo, 'DEMO-GASA-001', 'Gasa de demostración', 'INSUMO', 95),
    (v_producto_kit, 'DEMO-KIT-001', 'Kit de demostración', 'KIT', 15000),
    (v_producto_componente, 'DEMO-COMP-001', 'Componente de kit de demostración', 'INSTRUMENTAL', 3500);

  insert into public.producto_componentes_kit (kit_producto_id, componente_producto_id, cantidad)
  values (v_producto_kit, v_producto_componente, 1);

  v_pieza_kit := gen_random_uuid();
  insert into public.piezas (
    id, codigo, producto_id, estado, bodega_retorno_id, version,
    ultimo_hlc, ultimo_hlc_milisegundos, ultimo_hlc_contador,
    ultimo_hlc_dispositivo_id
  ) values (
    gen_random_uuid(), 'DEMO-INS-000001', v_producto_instrumental,
    'EN_BODEGA_CENTRAL', v_bodega, 0,
    '000000000000000:00000:00000000-0000-0000-0000-000000000000', 0, 0,
    '00000000-0000-0000-0000-000000000000'
  ), (
    gen_random_uuid(), 'DEMO-INSUMO-000001', v_producto_insumo,
    'EN_BODEGA_CENTRAL', v_bodega, 0,
    '000000000000000:00000:00000000-0000-0000-0000-000000000000', 0, 0,
    '00000000-0000-0000-0000-000000000000'
  ), (
    v_pieza_kit, 'DEMO-KIT-000001', v_producto_kit,
    'EN_BODEGA_CENTRAL', v_bodega, 0,
    '000000000000000:00000:00000000-0000-0000-0000-000000000000', 0, 0,
    '00000000-0000-0000-0000-000000000000'
  ), (
    gen_random_uuid(), 'DEMO-COMP-000001', v_producto_componente,
    'EN_BODEGA_CENTRAL', v_bodega, 0,
    '000000000000000:00000:00000000-0000-0000-0000-000000000000', 0, 0,
    '00000000-0000-0000-0000-000000000000'
  );

  update public.piezas
  set kit_padre_id = v_pieza_kit
  where codigo = 'DEMO-COMP-000001'::extensions.citext;

  v_secuencia := private.reservar_commit(null);
  for v_fila in
    select 'PERFIL'::text as tipo, p.id, 0::bigint as version, to_jsonb(p) as payload
      from public.perfiles p where p.lote_semilla_id = v_lote
    union all
    select 'BODEGA', b.id, 0, to_jsonb(b) from public.bodegas b where b.lote_semilla_id = v_lote
    union all
    select 'HOSPITAL', h.id, h.version, to_jsonb(h) from public.hospitales h where h.lote_semilla_id = v_lote
    union all
    select 'PRODUCTO', p.id, p.version, to_jsonb(p) from public.productos p where p.lote_semilla_id = v_lote
    union all
    select 'PIEZA', p.id, p.version, private.snapshot_pieza(p.id) from public.piezas p where p.lote_semilla_id = v_lote
  loop
    perform private.registrar_cambio(v_secuencia, v_ordinal, v_fila.tipo, v_fila.id, v_fila.version, false, v_fila.payload);
    v_ordinal := v_ordinal + 1;
  end loop;

  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'CARGAR_DATOS_DEMO', 'LOTE_SEMILLA', v_lote, 'OK',
    jsonb_build_object('hospitales', 2, 'productos', 4, 'piezas', 4, 'commit', v_secuencia)
  );

  return jsonb_build_object(
    'loteSemillaId', v_lote,
    'hospitales', 2,
    'productos', 4,
    'piezas', 4,
    'secuenciaServidor', v_secuencia
  );
end;
$$;

create or replace function public.crear_desafio_handoff(
  p_actor_id uuid,
  p_referencia_backup text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  perform private.exigir_service_role();
  if nullif(btrim(p_referencia_backup), '') is null then
    raise exception using errcode = '22023', message = 'REFERENCIA_BACKUP_REQUERIDA';
  end if;
  if not exists (
    select 1 from public.perfiles p
    join public.configuracion_sistema c on c.singleton
    where p.id = p_actor_id and p.activo and p.rol = 'ADMINISTRADOR'
      and p.origen = 'DEMO' and c.ciclo_vida = 'DEMO' and c.reset_demo_habilitado
  ) then
    raise exception using errcode = '42501', message = 'HANDOFF_NO_AUTORIZADO';
  end if;

  insert into private.desafios_handoff (
    id, actor_usuario_id, token_hash, referencia_backup, expira_en
  ) values (
    v_id, p_actor_id, extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'),
    btrim(p_referencia_backup), clock_timestamp() + interval '10 minutes'
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'CREAR_DESAFIO_HANDOFF', 'DESAFIO_HANDOFF', v_id, 'OK',
    jsonb_build_object('referenciaBackup', btrim(p_referencia_backup))
  );
  return jsonb_build_object('desafioId', v_id, 'token', v_token, 'expiraEn', clock_timestamp() + interval '10 minutes');
end;
$$;

create or replace function private.conteo_demo(p_lote uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'perfiles', (select count(*) from public.perfiles where lote_semilla_id = p_lote),
    'dispositivos', (select count(*) from public.dispositivos where lote_semilla_id = p_lote),
    'hospitales', (select count(*) from public.hospitales where lote_semilla_id = p_lote),
    'bodegas', (select count(*) from public.bodegas where lote_semilla_id = p_lote),
    'productos', (select count(*) from public.productos where lote_semilla_id = p_lote),
    'piezas', (select count(*) from public.piezas where lote_semilla_id = p_lote),
    'maletas', (select count(*) from public.maletas where lote_semilla_id = p_lote),
    'facturas', (select count(*) from public.facturas where lote_semilla_id = p_lote),
    'eventos', (select count(*) from public.eventos_dominio where lote_semilla_id = p_lote),
    'conflictos', (select count(*) from public.conflictos where lote_semilla_id = p_lote),
    'reprocesamientos', (select count(*) from public.ciclos_reprocesamiento where lote_semilla_id = p_lote),
    'accesosFreelance', (select count(*) from public.accesos_freelance where lote_semilla_id = p_lote)
  );
$$;

create or replace function public.purgar_datos_demo(
  p_actor_id uuid,
  p_desafio_id uuid,
  p_token text,
  p_frase text,
  p_referencia_backup text,
  p_solo_simular boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_desafio private.desafios_handoff%rowtype;
  v_lote uuid;
  v_conteos jsonb;
begin
  perform private.exigir_service_role();
  perform pg_advisory_xact_lock(hashtextextended('CREARCOS_HANDOFF_DEMO', 0));

  select d.* into v_desafio from private.desafios_handoff d
  where d.id = p_desafio_id for update;
  if v_desafio.id is null
     or v_desafio.actor_usuario_id <> p_actor_id
     or v_desafio.usado_en is not null
     or v_desafio.expira_en <= clock_timestamp()
     or v_desafio.referencia_backup <> btrim(p_referencia_backup)
     or v_desafio.token_hash <> extensions.digest(convert_to(p_token, 'UTF8'), 'sha256') then
    raise exception using errcode = '42501', message = 'DESAFIO_HANDOFF_INVALIDO';
  end if;
  if p_frase <> 'ELIMINAR DATOS DEMO' then
    raise exception using errcode = '22023', message = 'FRASE_CONFIRMACION_INCORRECTA';
  end if;
  if not exists (
    select 1 from public.perfiles p where p.id = p_actor_id and p.activo
      and p.rol = 'ADMINISTRADOR' and p.origen = 'DEMO'
  ) then
    raise exception using errcode = '42501', message = 'ADMIN_DEMO_REQUERIDO';
  end if;

  select c.lote_demo_activo_id into v_lote
  from public.configuracion_sistema c
  where c.singleton and c.ciclo_vida = 'DEMO' and c.reset_demo_habilitado
  for update;
  if v_lote is null then
    raise exception using errcode = '55000', message = 'MODO_DEMO_NO_ACTIVO';
  end if;
  v_conteos := private.conteo_demo(v_lote);

  if p_solo_simular then
    insert into private.auditoria_administrativa (
      actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
    ) values (
      p_actor_id, 'PURGAR_DEMO_DRY_RUN', 'LOTE_SEMILLA', v_lote, 'SIMULADO',
      jsonb_build_object('backup', p_referencia_backup, 'conteos', v_conteos)
    );
    return jsonb_build_object('soloSimulacion', true, 'loteSemillaId', v_lote, 'conteos', v_conteos);
  end if;

  update public.configuracion_sistema
  set ciclo_vida = 'PURGANDO', actualizado_en = statement_timestamp()
  where singleton;

  insert into private.handoff_auth_pendientes (usuario_id, desafio_id)
  select p.id, p_desafio_id from public.perfiles p
  where p.lote_semilla_id = v_lote
  on conflict (usuario_id) do update set desafio_id = excluded.desafio_id;

  delete from public.cambios_sync cs using public.commits_sync c
    where cs.secuencia_servidor = c.secuencia_servidor and c.lote_semilla_id = v_lote;
  delete from public.conflicto_candidatos cc using public.conflictos c
    where cc.conflicto_id = c.id and c.lote_semilla_id = v_lote;
  delete from public.rechazos_sync r using public.operaciones_sync o
    where r.operacion_id = o.id and o.lote_semilla_id = v_lote;
  delete from public.eventos_dominio where lote_semilla_id = v_lote;
  delete from public.conflictos where lote_semilla_id = v_lote;
  delete from public.commits_sync where lote_semilla_id = v_lote;
  delete from public.operaciones_sync where lote_semilla_id = v_lote;
  delete from public.sesiones_freelance where lote_semilla_id = v_lote;
  delete from public.accesos_freelance where lote_semilla_id = v_lote;
  delete from public.factura_lineas where lote_semilla_id = v_lote;
  delete from public.facturas where lote_semilla_id = v_lote;
  delete from public.excepciones_precio where lote_semilla_id = v_lote;
  delete from public.ciclos_reprocesamiento where lote_semilla_id = v_lote;
  delete from public.maleta_participantes mp using public.maletas m
    where mp.maleta_id = m.id and m.lote_semilla_id = v_lote;
  delete from public.maleta_items where lote_semilla_id = v_lote;
  delete from public.membresias_kit_pieza where lote_semilla_id = v_lote;
  delete from public.piezas where lote_semilla_id = v_lote;
  delete from public.maletas where lote_semilla_id = v_lote;
  delete from public.producto_componentes_kit pck using public.productos p
    where pck.kit_producto_id = p.id and p.lote_semilla_id = v_lote;
  delete from public.productos where lote_semilla_id = v_lote;
  delete from public.hospitales where lote_semilla_id = v_lote;
  delete from public.bodegas where lote_semilla_id = v_lote;
  delete from public.dispositivo_usuarios du using public.dispositivos d
    where du.dispositivo_id = d.id and d.lote_semilla_id = v_lote;
  delete from public.dispositivos where lote_semilla_id = v_lote;
  delete from public.perfiles where lote_semilla_id = v_lote;

  update private.desafios_handoff set usado_en = clock_timestamp() where id = p_desafio_id;
  insert into private.auditoria_administrativa (
    actor_usuario_id, actor_identificador, accion, objetivo_tipo,
    objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'admin-demo-eliminado-despues', 'PURGAR_DATOS_DEMO',
    'LOTE_SEMILLA', v_lote, 'NEGOCIO_PURGADO_AUTH_PENDIENTE',
    jsonb_build_object('backup', p_referencia_backup, 'conteos', v_conteos)
  );

  return jsonb_build_object(
    'soloSimulacion', false,
    'estado', 'PURGANDO',
    'loteSemillaId', v_lote,
    'conteos', v_conteos,
    'usuariosAuthPendientes', (
      select coalesce(jsonb_agg(h.usuario_id), '[]'::jsonb)
      from private.handoff_auth_pendientes h where h.desafio_id = p_desafio_id
    )
  );
end;
$$;

create or replace function public.marcar_usuario_demo_auth_eliminado(
  p_desafio_id uuid,
  p_usuario_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.exigir_service_role();
  if exists (select 1 from auth.users where id = p_usuario_id) then
    raise exception using errcode = '55000', message = 'USUARIO_AUTH_TODAVIA_EXISTE';
  end if;
  update private.handoff_auth_pendientes
  set eliminado_en_auth = clock_timestamp()
  where desafio_id = p_desafio_id and usuario_id = p_usuario_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'USUARIO_NO_PERTENECE_AL_HANDOFF';
  end if;
end;
$$;

create or replace function public.confirmar_purga_auth(p_desafio_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lote uuid;
  v_resumen jsonb;
begin
  perform private.exigir_service_role();
  perform pg_advisory_xact_lock(hashtextextended('CREARCOS_HANDOFF_DEMO', 0));
  select c.lote_demo_activo_id into v_lote
  from public.configuracion_sistema c
  where c.singleton and c.ciclo_vida = 'PURGANDO' for update;
  if v_lote is null then
    raise exception using errcode = '55000', message = 'HANDOFF_NO_ESTA_PURGANDO';
  end if;
  if exists (
    select 1
    from private.handoff_auth_pendientes h
    left join auth.users u on u.id = h.usuario_id
    where h.desafio_id = p_desafio_id
      and (h.eliminado_en_auth is null or u.id is not null)
  ) then
    raise exception using errcode = '55000', message = 'USUARIOS_AUTH_DEMO_PENDIENTES';
  end if;

  select a.detalle -> 'conteos' into v_resumen
  from private.auditoria_administrativa a
  where a.accion = 'PURGAR_DATOS_DEMO' and a.objetivo_id = v_lote
  order by a.creado_en desc limit 1;

  update public.lotes_semilla
  set estado = 'PURGADO', purgado_en = clock_timestamp(), resumen_purga = v_resumen
  where id = v_lote;
  update public.configuracion_sistema
  set ciclo_vida = 'LISTO_BOOTSTRAP', lote_demo_activo_id = null,
      reset_demo_habilitado = false, epoca_handoff = gen_random_uuid(),
      actualizado_en = statement_timestamp()
  where singleton;
  insert into private.auditoria_administrativa (
    accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    'CONFIRMAR_PURGA_AUTH', 'LOTE_SEMILLA', v_lote, 'OK',
    jsonb_build_object('desafioId', p_desafio_id)
  );
  return jsonb_build_object('estado', 'LISTO_BOOTSTRAP', 'loteSemillaId', v_lote);
end;
$$;

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
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado
  ) values (
    p_primer_admin_id, 'ACTIVAR_PRODUCCION', 'CONFIGURACION_SISTEMA',
    p_primer_admin_id, 'OK'
  );
  return jsonb_build_object('estado', 'PRODUCCION', 'primerAdministradorId', p_primer_admin_id);
end;
$$;

revoke all on function public.provisionar_perfil(uuid, text, public.rol_aplicacion) from public, anon, authenticated;
revoke all on function public.registrar_dispositivo(uuid, uuid, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.cargar_datos_demo(uuid) from public, anon, authenticated;
revoke all on function public.crear_desafio_handoff(uuid, text) from public, anon, authenticated;
revoke all on function private.conteo_demo(uuid) from public;
revoke all on function public.purgar_datos_demo(uuid, uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.marcar_usuario_demo_auth_eliminado(uuid, uuid) from public, anon, authenticated;
revoke all on function public.confirmar_purga_auth(uuid) from public, anon, authenticated;
revoke all on function public.activar_produccion(uuid) from public, anon, authenticated;

grant execute on function public.provisionar_perfil(uuid, text, public.rol_aplicacion) to service_role;
grant execute on function public.registrar_dispositivo(uuid, uuid, text, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.cargar_datos_demo(uuid) to service_role;
grant execute on function public.crear_desafio_handoff(uuid, text) to service_role;
grant execute on function private.conteo_demo(uuid) to service_role;
grant execute on function public.purgar_datos_demo(uuid, uuid, text, text, text, boolean) to service_role;
grant execute on function public.marcar_usuario_demo_auth_eliminado(uuid, uuid) to service_role;
grant execute on function public.confirmar_purga_auth(uuid) to service_role;
grant execute on function public.activar_produccion(uuid) to service_role;

comment on function public.purgar_datos_demo(uuid, uuid, text, text, text, boolean) is
  'Paso PostgreSQL transaccional del handoff. Deja el sistema bloqueado en PURGANDO hasta confirmar la eliminación en Auth.';
comment on function public.activar_produccion(uuid) is
  'Transición irreversible desde LISTO_BOOTSTRAP. No existe camino de regreso a DEMO.';
