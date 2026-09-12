create table public.maletas (
  id uuid primary key,
  responsable_id uuid not null references public.perfiles(id) on delete restrict,
  procedimiento text,
  hospital_id uuid references public.hospitales(id) on delete restrict,
  estado public.estado_maleta not null default 'EN_ARMADO',
  abierta_en timestamptz not null,
  salio_en timestamptz,
  cerrada_en timestamptz,
  cancelada_en timestamptz,
  version bigint not null default 0,
  ultimo_hlc text not null,
  eliminado_en timestamptz,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint maletas_procedimiento_valido check (procedimiento is null or btrim(procedimiento) <> ''),
  constraint maletas_version_valida check (version >= 0),
  constraint maletas_hlc_valido check (ultimo_hlc ~ '^[0-9]{15}:[0-9]{5}:[0-9a-fA-F-]{36}$'),
  constraint maletas_estado_fechas_coherentes check (
    (estado = 'EN_ARMADO' and salio_en is null and cerrada_en is null and cancelada_en is null and hospital_id is null)
    or (estado = 'EN_CIRUGIA' and salio_en is not null and cerrada_en is null and cancelada_en is null and hospital_id is null)
    or (estado = 'CERRADA' and salio_en is not null and cerrada_en is not null and cancelada_en is null and hospital_id is not null)
    or (estado = 'CANCELADA' and salio_en is null and cerrada_en is null and cancelada_en is not null and hospital_id is null)
  ),
  constraint maletas_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

alter table public.piezas
  add column maleta_actual_id uuid references public.maletas(id) on delete restrict;

alter table public.piezas
  add constraint piezas_maleta_estado_coherente check (
    (estado in ('ASIGNADA_A_MALETA', 'EN_MALETA_ACTIVA', 'USADA_PENDIENTE_VALORACION') and maleta_actual_id is not null)
    or (estado not in ('ASIGNADA_A_MALETA', 'EN_MALETA_ACTIVA', 'USADA_PENDIENTE_VALORACION') and maleta_actual_id is null)
  );

create table public.maleta_participantes (
  maleta_id uuid not null references public.maletas(id) on delete restrict,
  usuario_id uuid not null references public.perfiles(id) on delete restrict,
  funcion text not null,
  agregado_por uuid not null references public.perfiles(id) on delete restrict,
  agregado_en timestamptz not null default statement_timestamp(),
  retirado_en timestamptz,
  primary key (maleta_id, usuario_id, funcion),
  constraint maleta_participantes_funcion_no_vacia check (btrim(funcion) <> ''),
  constraint maleta_participantes_retiro_valido check (retirado_en is null or retirado_en >= agregado_en)
);

create table public.maleta_items (
  id uuid primary key,
  maleta_id uuid not null references public.maletas(id) on delete restrict,
  pieza_id uuid not null references public.piezas(id) on delete restrict,
  agregada_por uuid not null references public.perfiles(id) on delete restrict,
  agregada_en timestamptz not null,
  retirada_por uuid references public.perfiles(id) on delete restrict,
  retirada_en timestamptz,
  usada_por uuid references public.perfiles(id) on delete restrict,
  usada_en timestamptz,
  resultado public.resultado_item_maleta,
  finalizada_en timestamptz,
  version bigint not null default 0,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint maleta_items_version_valida check (version >= 0),
  constraint maleta_items_retiro_coherente check (
    (retirada_en is null and retirada_por is null)
    or (retirada_en is not null and retirada_por is not null and retirada_en >= agregada_en)
  ),
  constraint maleta_items_uso_coherente check (
    (usada_en is null and usada_por is null)
    or (usada_en is not null and usada_por is not null and usada_en >= agregada_en)
  ),
  constraint maleta_items_resultado_coherente check (
    (resultado is null and finalizada_en is null)
    or (resultado is not null and finalizada_en is not null and finalizada_en >= agregada_en)
  ),
  constraint maleta_items_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create table public.ciclos_reprocesamiento (
  id uuid primary key,
  pieza_id uuid not null references public.piezas(id) on delete restrict,
  maleta_origen_id uuid references public.maletas(id) on delete restrict,
  motivo text not null,
  estado public.estado_reprocesamiento not null default 'ABIERTO',
  ingresada_por uuid not null references public.perfiles(id) on delete restrict,
  ingreso_en timestamptz not null,
  finalizada_por uuid references public.perfiles(id) on delete restrict,
  finalizada_en timestamptz,
  bodega_destino_id uuid references public.bodegas(id) on delete restrict,
  cancelada_por uuid references public.perfiles(id) on delete restrict,
  cancelada_en timestamptz,
  observacion text,
  version bigint not null default 0,
  origen public.origen_datos not null,
  lote_semilla_id uuid references public.lotes_semilla(id) on delete restrict,
  creado_en timestamptz not null default statement_timestamp(),
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint ciclos_reproceso_motivo_no_vacio check (btrim(motivo) <> ''),
  constraint ciclos_reproceso_version_valida check (version >= 0),
  constraint ciclos_reproceso_estado_coherente check (
    (estado = 'ABIERTO' and finalizada_por is null and finalizada_en is null and bodega_destino_id is null and cancelada_por is null and cancelada_en is null)
    or (estado = 'FINALIZADO' and finalizada_por is not null and finalizada_en is not null and bodega_destino_id is not null and cancelada_por is null and cancelada_en is null)
    or (estado = 'CANCELADO' and finalizada_por is null and finalizada_en is null and bodega_destino_id is null and cancelada_por is not null and cancelada_en is not null)
  ),
  constraint ciclos_reproceso_proveniencia check (
    (origen = 'DEMO' and lote_semilla_id is not null)
    or (origen = 'PRODUCCION' and lote_semilla_id is null)
  )
);

create trigger maletas_proveniencia
before insert on public.maletas
for each row execute function private.aplicar_proveniencia();
create trigger maleta_items_proveniencia
before insert on public.maleta_items
for each row execute function private.aplicar_proveniencia();
create trigger ciclos_reprocesamiento_proveniencia
before insert on public.ciclos_reprocesamiento
for each row execute function private.aplicar_proveniencia();

comment on table public.maleta_items is
  'Historial de contenido: una fila permanece aunque la pieza ya no apunte a la maleta.';
comment on table public.ciclos_reprocesamiento is
  'Cada paso por reproceso es un ciclo independiente; nunca se reduce a un booleano.';
