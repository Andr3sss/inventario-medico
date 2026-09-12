create table public.productos (
  id uuid primary key,
  sku citext not null unique,
  nombre text not null,
  tipo public.tipo_producto not null,
  costo_base_centavos bigint not null,
  activo boolean not null default true,
  atributos jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  eliminado_en timestamptz,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint productos_texto_no_vacio check (btrim(sku::text) <> '' and btrim(nombre) <> ''),
  constraint productos_costo_valido check (costo_base_centavos >= 0),
  constraint productos_version_valida check (version >= 0),
  constraint productos_eliminacion_coherente check ((activo and eliminado_en is null) or not activo),
  constraint productos_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create table public.producto_componentes_kit (
  kit_producto_id uuid not null references public.productos(id) on delete restrict,
  componente_producto_id uuid not null references public.productos(id) on delete restrict,
  cantidad integer not null default 1,
  creado_en timestamptz not null default statement_timestamp(),
  primary key (kit_producto_id, componente_producto_id),
  constraint producto_componentes_sin_autorreferencia check (kit_producto_id <> componente_producto_id),
  constraint producto_componentes_cantidad_positiva check (cantidad > 0)
);

create table public.piezas (
  id uuid primary key,
  codigo citext not null unique,
  producto_id uuid not null references public.productos(id) on delete restrict,
  estado public.estado_pieza not null,
  bodega_retorno_id uuid not null references public.bodegas(id) on delete restrict,
  kit_padre_id uuid references public.piezas(id) on delete restrict,
  version bigint not null default 0,
  ultimo_hlc text not null,
  ultimo_hlc_milisegundos bigint not null,
  ultimo_hlc_contador integer not null,
  ultimo_hlc_dispositivo_id uuid not null,
  eliminado_en timestamptz,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint piezas_codigo_no_vacio check (btrim(codigo::text) <> ''),
  constraint piezas_sin_autorreferencia check (kit_padre_id is null or kit_padre_id <> id),
  constraint piezas_version_valida check (version >= 0),
  constraint piezas_hlc_valido check (
    ultimo_hlc ~ '^[0-9]{15}:[0-9]{5}:[0-9a-fA-F-]{36}$'
    and ultimo_hlc_milisegundos >= 0
    and ultimo_hlc_contador >= 0
  ),
  constraint piezas_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create table public.membresias_kit_pieza (
  id uuid primary key,
  kit_pieza_id uuid not null references public.piezas(id) on delete restrict,
  componente_pieza_id uuid not null references public.piezas(id) on delete restrict,
  agregado_por uuid not null references public.perfiles(id) on delete restrict,
  agregado_en timestamptz not null,
  retirado_por uuid references public.perfiles(id) on delete restrict,
  retirado_en timestamptz,
  motivo_retiro text,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  constraint membresias_kit_sin_autorreferencia check (kit_pieza_id <> componente_pieza_id),
  constraint membresias_kit_retiro_coherente check (
    (retirado_en is null and retirado_por is null and motivo_retiro is null)
    or (retirado_en is not null and retirado_por is not null and btrim(motivo_retiro) <> '')
  ),
  constraint membresias_kit_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create trigger productos_proveniencia
before insert on public.productos
for each row execute function private.aplicar_proveniencia();
create trigger piezas_proveniencia
before insert on public.piezas
for each row execute function private.aplicar_proveniencia();
create trigger membresias_kit_proveniencia
before insert on public.membresias_kit_pieza
for each row execute function private.aplicar_proveniencia();

comment on table public.productos is 'Catálogo lógico; no representa unidades físicas.';
comment on table public.piezas is 'Estado materializado autoritativo de cada unidad física.';
comment on table public.membresias_kit_pieza is 'Historial temporal de composición física de kits; no se sobrescribe.';
