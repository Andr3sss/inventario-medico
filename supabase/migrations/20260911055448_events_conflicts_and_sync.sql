create table public.operaciones_sync (
  id uuid primary key,
  dispositivo_id uuid not null references public.dispositivos(id) on delete restrict,
  actor_usuario_id uuid not null references public.perfiles(id) on delete restrict,
  secuencia_cliente bigint not null,
  payload_hash bytea not null,
  estado public.estado_operacion_sync not null default 'RECIBIDA',
  codigo_resultado text,
  detalle_resultado jsonb not null default '{}'::jsonb,
  recibida_en timestamptz not null default clock_timestamp(),
  procesada_en timestamptz,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  constraint operaciones_sync_secuencia_valida check (secuencia_cliente >= 0),
  constraint operaciones_sync_resultado_coherente check (
    (estado = 'RECIBIDA' and procesada_en is null)
    or (estado <> 'RECIBIDA' and procesada_en is not null and codigo_resultado is not null)
  ),
  constraint operaciones_sync_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  ),
  unique (dispositivo_id, secuencia_cliente)
);

create table public.eventos_dominio (
  id uuid primary key,
  operacion_id uuid not null references public.operaciones_sync(id) on delete restrict,
  ordinal integer not null,
  tipo_agregado text not null,
  agregado_id uuid not null,
  pieza_id uuid references public.piezas(id) on delete restrict,
  maleta_id uuid references public.maletas(id) on delete restrict,
  tipo_evento text not null,
  actor_tipo public.tipo_actor not null,
  actor_usuario_id uuid references public.perfiles(id) on delete restrict,
  actor_sesion_freelance_id uuid references public.sesiones_freelance(id) on delete restrict,
  actor_rol public.rol_aplicacion not null,
  dispositivo_id uuid references public.dispositivos(id) on delete restrict,
  version_esperada bigint,
  version_resultante bigint,
  hlc text not null,
  hlc_milisegundos bigint not null,
  hlc_contador integer not null,
  hlc_dispositivo_id uuid not null,
  registrado_en_cliente timestamptz not null,
  recibido_en_servidor timestamptz not null default clock_timestamp(),
  estado_anterior text,
  estado_posterior text,
  payload jsonb not null,
  resultado public.resultado_evento not null,
  metadata jsonb not null default '{}'::jsonb,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  constraint eventos_dominio_ordinal_valido check (ordinal >= 0),
  constraint eventos_dominio_tipo_agregado check (tipo_agregado in ('PIEZA', 'MALETA', 'FACTURA', 'PRECIO', 'CONFLICTO')),
  constraint eventos_dominio_tipo_evento_no_vacio check (btrim(tipo_evento) <> ''),
  constraint eventos_dominio_actor_coherente check (
    (actor_tipo = 'SISTEMA' and actor_usuario_id is null and actor_sesion_freelance_id is null and actor_rol = 'SISTEMA')
    or (actor_tipo = 'USUARIO' and actor_usuario_id is not null and actor_sesion_freelance_id is null and actor_rol <> 'SISTEMA')
    or (actor_tipo = 'FREELANCE' and actor_usuario_id is null and actor_sesion_freelance_id is not null and actor_rol = 'FREELANCE')
  ),
  constraint eventos_dominio_version_valida check (
    (version_esperada is null or version_esperada >= 0)
    and (version_resultante is null or version_resultante >= 0)
  ),
  constraint eventos_dominio_hlc_valido check (
    hlc ~ '^[0-9]{15}:[0-9]{5}:[0-9a-fA-F-]{36}$'
    and hlc_milisegundos >= 0
    and hlc_contador >= 0
  ),
  constraint eventos_dominio_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  ),
  unique (operacion_id, ordinal)
);

create table public.conflictos (
  id uuid primary key,
  pieza_id uuid not null references public.piezas(id) on delete restrict,
  estado public.estado_conflicto not null default 'ABIERTO',
  estado_pieza_previo public.estado_pieza not null,
  detectado_en timestamptz not null default clock_timestamp(),
  resuelto_en timestamptz,
  resuelto_por uuid references public.perfiles(id) on delete restrict,
  estado_adjudicado public.estado_pieza,
  resolucion text,
  metadata jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  constraint conflictos_version_valida check (version >= 0),
  constraint conflictos_resolucion_coherente check (
    (estado = 'ABIERTO' and resuelto_en is null and resuelto_por is null and estado_adjudicado is null and resolucion is null)
    or (estado = 'RESUELTO' and resuelto_en is not null and resuelto_por is not null and estado_adjudicado is not null and resolucion is not null and btrim(resolucion) <> '')
  ),
  constraint conflictos_estado_adjudicable check (
    estado_adjudicado is null or estado_adjudicado in (
      'EN_BODEGA_CENTRAL',
      'EN_BODEGA_INSTRUMENTISTA',
      'EN_MALETA_ACTIVA',
      'USADA_PENDIENTE_VALORACION',
      'EN_REPROCESAMIENTO',
      'EXTRAVIADA'
    )
  ),
  constraint conflictos_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create table public.conflicto_candidatos (
  id uuid primary key,
  conflicto_id uuid not null references public.conflictos(id) on delete restrict,
  operacion_id uuid not null references public.operaciones_sync(id) on delete restrict,
  evento_id uuid references public.eventos_dominio(id) on delete restrict,
  dispositivo_id uuid not null references public.dispositivos(id) on delete restrict,
  usuario_id uuid not null references public.perfiles(id) on delete restrict,
  maleta_id uuid references public.maletas(id) on delete restrict,
  estado_propuesto public.estado_pieza not null,
  hlc text not null,
  evidencia jsonb not null,
  creado_en timestamptz not null default clock_timestamp(),
  constraint conflicto_candidatos_hlc_valido check (hlc ~ '^[0-9]{15}:[0-9]{5}:[0-9a-fA-F-]{36}$'),
  unique (conflicto_id, operacion_id, evento_id)
);

create table private.cabeza_sync (
  singleton boolean primary key default true,
  siguiente_secuencia bigint not null default 1,
  constraint cabeza_sync_unica check (singleton),
  constraint cabeza_sync_secuencia_valida check (siguiente_secuencia > 0)
);

insert into private.cabeza_sync (singleton, siguiente_secuencia) values (true, 1);

create table public.commits_sync (
  secuencia_servidor bigint primary key,
  id uuid not null unique default gen_random_uuid(),
  operacion_id uuid references public.operaciones_sync(id) on delete restrict,
  creado_en timestamptz not null default clock_timestamp(),
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  constraint commits_sync_secuencia_valida check (secuencia_servidor > 0),
  constraint commits_sync_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create table public.cambios_sync (
  secuencia_servidor bigint not null references public.commits_sync(secuencia_servidor) on delete restrict,
  ordinal integer not null,
  entidad_tipo text not null,
  entidad_id uuid not null,
  entidad_version bigint not null,
  eliminado boolean not null default false,
  payload jsonb not null,
  primary key (secuencia_servidor, ordinal),
  constraint cambios_sync_ordinal_valido check (ordinal >= 0),
  constraint cambios_sync_version_valida check (entidad_version >= 0),
  constraint cambios_sync_entidad_tipo_no_vacio check (btrim(entidad_tipo) <> '')
);

create table public.rechazos_sync (
  id uuid primary key default gen_random_uuid(),
  operacion_id uuid not null references public.operaciones_sync(id) on delete restrict,
  evento_id uuid,
  codigo text not null,
  motivo text not null,
  detalle jsonb not null default '{}'::jsonb,
  rechazado_en timestamptz not null default clock_timestamp(),
  constraint rechazos_sync_texto_no_vacio check (btrim(codigo) <> '' and btrim(motivo) <> '')
);

create trigger operaciones_sync_proveniencia
before insert on public.operaciones_sync
for each row execute function private.aplicar_proveniencia();
create trigger eventos_dominio_proveniencia
before insert on public.eventos_dominio
for each row execute function private.aplicar_proveniencia();
create trigger conflictos_proveniencia
before insert on public.conflictos
for each row execute function private.aplicar_proveniencia();
create trigger commits_sync_proveniencia
before insert on public.commits_sync
for each row execute function private.aplicar_proveniencia();

comment on table public.operaciones_sync is
  'Unidad atómica e idempotente de PUSH. El UUID y hash impiden reusar una identidad con otro contenido.';
comment on table public.commits_sync is
  'Cursor global asignado bajo lock; una secuencia representa un commit completo y nunca se pagina por la mitad.';
comment on table public.conflicto_candidatos is
  'Evidencia normalizada de todos los candidatos; no se limita artificialmente a dos dispositivos.';
