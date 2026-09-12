create table public.excepciones_precio (
  id uuid primary key,
  hospital_id uuid not null references public.hospitales(id) on delete restrict,
  producto_id uuid not null references public.productos(id) on delete restrict,
  precio_centavos bigint not null,
  vigente_desde timestamptz not null,
  vigente_hasta timestamptz,
  estado public.estado_aprobacion not null default 'PENDIENTE',
  propuesta_por uuid not null references public.perfiles(id) on delete restrict,
  propuesta_en timestamptz not null,
  decidida_por uuid references public.perfiles(id) on delete restrict,
  decidida_en timestamptz,
  motivo text not null,
  observaciones text,
  version bigint not null default 0,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint excepciones_precio_precio_valido check (precio_centavos >= 0),
  constraint excepciones_precio_vigencia_valida check (vigente_hasta is null or vigente_hasta > vigente_desde),
  constraint excepciones_precio_motivo_no_vacio check (btrim(motivo) <> ''),
  constraint excepciones_precio_decision_coherente check (
    (estado = 'PENDIENTE' and decidida_por is null and decidida_en is null)
    or (estado in ('APROBADO', 'RECHAZADO') and decidida_por is not null and decidida_en is not null)
  ),
  constraint excepciones_precio_version_valida check (version >= 0),
  constraint excepciones_precio_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create table public.facturas (
  id uuid primary key,
  maleta_id uuid not null unique references public.maletas(id) on delete restrict,
  hospital_id uuid not null references public.hospitales(id) on delete restrict,
  numero citext unique,
  estado public.estado_factura not null default 'BORRADOR',
  hospital_nombre_snapshot text not null,
  hospital_ciudad_snapshot text not null,
  nivel_precio_snapshot public.nivel_precio not null,
  total_centavos bigint not null default 0,
  requiere_aprobacion boolean not null default false,
  revision_precios bigint not null default 0,
  creada_por uuid not null references public.perfiles(id) on delete restrict,
  emitida_por uuid references public.perfiles(id) on delete restrict,
  emitida_en timestamptz,
  version bigint not null default 0,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint facturas_snapshot_no_vacio check (
    btrim(hospital_nombre_snapshot) <> '' and btrim(hospital_ciudad_snapshot) <> ''
  ),
  constraint facturas_total_valido check (total_centavos >= 0),
  constraint facturas_revision_valida check (revision_precios >= 0 and version >= 0),
  constraint facturas_emision_coherente check (
    (estado = 'BORRADOR' and numero is null and emitida_por is null and emitida_en is null)
    or (estado = 'EMITIDA' and numero is not null and emitida_por is not null and emitida_en is not null and not requiere_aprobacion)
  ),
  constraint facturas_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create table public.factura_lineas (
  id uuid primary key,
  factura_id uuid not null references public.facturas(id) on delete restrict,
  pieza_id uuid references public.piezas(id) on delete restrict,
  producto_id uuid references public.productos(id) on delete restrict,
  excepcion_precio_id uuid references public.excepciones_precio(id) on delete restrict,
  sku_snapshot text not null,
  producto_nombre_snapshot text not null,
  codigo_pieza_snapshot text,
  cantidad integer not null,
  precio_unitario_centavos bigint not null,
  tipo_precio public.tipo_precio_aplicado not null,
  subtotal_centavos bigint generated always as (cantidad::bigint * precio_unitario_centavos) stored,
  explicacion text not null,
  estado_aprobacion_snapshot public.estado_aprobacion,
  requiere_aprobacion boolean not null default false,
  revision_precio bigint not null default 0,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint factura_lineas_snapshot_no_vacio check (
    btrim(sku_snapshot) <> '' and btrim(producto_nombre_snapshot) <> '' and btrim(explicacion) <> ''
  ),
  constraint factura_lineas_cantidad_positiva check (cantidad > 0),
  constraint factura_lineas_precio_valido check (precio_unitario_centavos >= 0),
  constraint factura_lineas_revision_valida check (revision_precio >= 0),
  constraint factura_lineas_aprobacion_coherente check (
    (tipo_precio = 'ALEATORIO' and excepcion_precio_id is not null and estado_aprobacion_snapshot is not null)
    or (tipo_precio <> 'ALEATORIO' and excepcion_precio_id is null and estado_aprobacion_snapshot is null and not requiere_aprobacion)
  ),
  constraint factura_lineas_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  ),
  unique (factura_id, pieza_id)
);

create table public.accesos_freelance (
  id uuid primary key,
  maleta_id uuid not null references public.maletas(id) on delete restrict,
  token_hash bytea not null unique,
  token_prefijo text not null,
  creado_por uuid not null references public.perfiles(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  expira_en timestamptz not null,
  revocado_por uuid references public.perfiles(id) on delete restrict,
  revocado_en timestamptz,
  motivo_revocacion text,
  ultimo_uso_en timestamptz,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  constraint accesos_freelance_prefijo_valido check (char_length(token_prefijo) between 6 and 16),
  constraint accesos_freelance_expiracion check (expira_en > creado_en),
  constraint accesos_freelance_revocacion_coherente check (
    (revocado_en is null and revocado_por is null and motivo_revocacion is null)
    or (revocado_en is not null and revocado_por is not null and motivo_revocacion is not null and btrim(motivo_revocacion) <> '')
  ),
  constraint accesos_freelance_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create table public.sesiones_freelance (
  id uuid primary key default gen_random_uuid(),
  acceso_id uuid not null references public.accesos_freelance(id) on delete restrict,
  dispositivo_id uuid not null references public.dispositivos(id) on delete restrict,
  nombre_snapshot text not null,
  iniciada_en timestamptz not null default clock_timestamp(),
  expira_en timestamptz not null,
  ultima_actividad_en timestamptz not null default clock_timestamp(),
  revocada_en timestamptz,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  constraint sesiones_freelance_nombre_no_vacio check (btrim(nombre_snapshot) <> ''),
  constraint sesiones_freelance_vigencia check (expira_en > iniciada_en),
  constraint sesiones_freelance_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create trigger excepciones_precio_proveniencia
before insert on public.excepciones_precio
for each row execute function private.aplicar_proveniencia();
create trigger facturas_proveniencia
before insert on public.facturas
for each row execute function private.aplicar_proveniencia();
create trigger factura_lineas_proveniencia
before insert on public.factura_lineas
for each row execute function private.aplicar_proveniencia();
create trigger accesos_freelance_proveniencia
before insert on public.accesos_freelance
for each row execute function private.aplicar_proveniencia();
create trigger sesiones_freelance_proveniencia
before insert on public.sesiones_freelance
for each row execute function private.aplicar_proveniencia();

comment on table public.factura_lineas is
  'Líneas normalizadas con snapshots históricos; una factura emitida no depende del catálogo actual.';
comment on column public.accesos_freelance.token_hash is
  'SHA-256 del token de alta entropía. El valor en claro se entrega una sola vez y nunca se persiste.';
