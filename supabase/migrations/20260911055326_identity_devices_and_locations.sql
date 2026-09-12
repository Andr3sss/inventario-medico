-- Identidad de negocio, dispositivos autorizados y ubicaciones centrales.
-- Las credenciales pertenecen exclusivamente a Supabase Auth; perfiles solo
-- conserva autorización y datos mínimos de presentación.

create or replace function private.aplicar_proveniencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ciclo public.ciclo_vida_sistema;
  v_lote uuid;
  v_rol_jwt text;
begin
  select ciclo_vida, lote_demo_activo_id
    into v_ciclo, v_lote
  from public.configuracion_sistema
  where singleton = true;

  if v_ciclo = 'DEMO' then
    new.origen := 'DEMO';
    new.lote_semilla_id := v_lote;
  elsif v_ciclo = 'PRODUCCION' then
    new.origen := 'PRODUCCION';
    new.lote_semilla_id := null;
  elsif v_ciclo = 'LISTO_BOOTSTRAP' and tg_table_name = 'perfiles' then
    v_rol_jwt := coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      ''
    );
    if current_user not in ('postgres', 'supabase_admin') and v_rol_jwt <> 'service_role' then
      raise exception using errcode = '42501', message = 'BOOTSTRAP_REQUIERE_SERVICE_ROLE';
    end if;
    new.origen := 'PRODUCCION';
    new.lote_semilla_id := null;
  else
    raise exception using errcode = '55000', message = 'SISTEMA_NO_ACEPTA_NUEVOS_DATOS';
  end if;

  return new;
end;
$$;

revoke all on function private.aplicar_proveniencia() from public, anon, authenticated;

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete restrict,
  nombre text not null,
  rol public.rol_aplicacion not null,
  activo boolean not null default true,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint perfiles_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint perfiles_rol_humano check (rol <> 'SISTEMA'),
  constraint perfiles_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create table public.dispositivos (
  id uuid primary key,
  nombre text not null,
  plataforma text,
  clave_publica text,
  activo boolean not null default true,
  epoca_handoff uuid not null,
  primer_contacto_en timestamptz not null default statement_timestamp(),
  ultimo_sync_en timestamptz,
  ultimo_cursor bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  retirado_en timestamptz,
  constraint dispositivos_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint dispositivos_cursor_valido check (ultimo_cursor >= 0),
  constraint dispositivos_retiro_coherente check (
    (activo and retirado_en is null) or not activo
  ),
  constraint dispositivos_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create table public.dispositivo_usuarios (
  dispositivo_id uuid not null references public.dispositivos(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete restrict,
  habilitado boolean not null default true,
  valido_hasta timestamptz not null,
  verificado_en timestamptz not null default statement_timestamp(),
  creado_en timestamptz not null default statement_timestamp(),
  primary key (dispositivo_id, usuario_id),
  constraint dispositivo_usuarios_vigencia check (valido_hasta > creado_en)
);

create table public.bodegas (
  id uuid primary key default gen_random_uuid(),
  codigo citext not null unique,
  nombre text not null,
  tipo public.tipo_bodega not null,
  responsable_id uuid references public.perfiles(id) on delete restrict,
  activa boolean not null default true,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint bodegas_texto_no_vacio check (btrim(codigo::text) <> '' and btrim(nombre) <> ''),
  constraint bodegas_responsable_coherente check (
    (tipo = 'CENTRAL' and responsable_id is null)
    or (tipo = 'INSTRUMENTISTA' and responsable_id is not null)
  ),
  constraint bodegas_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create table public.hospitales (
  id uuid primary key default gen_random_uuid(),
  codigo citext not null unique,
  nombre text not null,
  ciudad text not null,
  nivel_precio public.nivel_precio not null,
  activo boolean not null default true,
  version bigint not null default 0,
  eliminado_en timestamptz,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint hospitales_texto_no_vacio check (
    btrim(codigo::text) <> '' and btrim(nombre) <> '' and btrim(ciudad) <> ''
  ),
  constraint hospitales_nivel_facturable check (nivel_precio <> 'BASE'),
  constraint hospitales_version_valida check (version >= 0),
  constraint hospitales_eliminacion_coherente check (
    (activo and eliminado_en is null) or not activo
  ),
  constraint hospitales_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create trigger perfiles_proveniencia
before insert on public.perfiles
for each row execute function private.aplicar_proveniencia();
create trigger dispositivos_proveniencia
before insert on public.dispositivos
for each row execute function private.aplicar_proveniencia();
create trigger bodegas_proveniencia
before insert on public.bodegas
for each row execute function private.aplicar_proveniencia();
create trigger hospitales_proveniencia
before insert on public.hospitales
for each row execute function private.aplicar_proveniencia();

comment on table public.dispositivo_usuarios is
  'Habilitación offline acotada por fecha. No contiene contraseñas ni sustituye la sesión central de Supabase Auth.';
