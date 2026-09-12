create type public.rol_aplicacion as enum (
  'SISTEMA',
  'ADMINISTRADOR',
  'AUXILIAR',
  'COORDINADORA',
  'CONTABLE',
  'SUPERVISOR',
  'FREELANCE'
);

create type public.tipo_producto as enum ('INSTRUMENTAL', 'INSUMO', 'KIT');

create type public.estado_pieza as enum (
  'EN_BODEGA_CENTRAL',
  'EN_BODEGA_INSTRUMENTISTA',
  'ASIGNADA_A_MALETA',
  'EN_MALETA_ACTIVA',
  'USADA_PENDIENTE_VALORACION',
  'FACTURADA',
  'CONSUMIDA',
  'EN_REPROCESAMIENTO',
  'EN_CONFLICTO',
  'EXTRAVIADA'
);

create type public.estado_maleta as enum ('EN_ARMADO', 'EN_CIRUGIA', 'CERRADA', 'CANCELADA');
create type public.nivel_precio as enum ('BASE', 'HABITUAL', 'PROVINCIA', 'NOTA_CREDITO');
create type public.estado_aprobacion as enum ('PENDIENTE', 'APROBADO', 'RECHAZADO');
create type public.tipo_precio_aplicado as enum ('HABITUAL', 'PROVINCIA', 'NOTA_CREDITO', 'ALEATORIO');
create type public.estado_factura as enum ('BORRADOR', 'EMITIDA');
create type public.origen_datos as enum ('DEMO', 'PRODUCCION');
create type public.estado_lote_semilla as enum ('ACTIVO', 'PURGADO', 'FALLIDO');
create type public.ciclo_vida_sistema as enum ('DEMO', 'PURGANDO', 'LISTO_BOOTSTRAP', 'PRODUCCION');
create type public.tipo_bodega as enum ('CENTRAL', 'INSTRUMENTISTA');
create type public.resultado_item_maleta as enum (
  'RETIRADA_ANTES_SALIDA',
  'UTILIZADA',
  'REGRESO_SIN_USO',
  'EXTRAVIADA'
);
create type public.estado_reprocesamiento as enum ('ABIERTO', 'FINALIZADO', 'CANCELADO');
create type public.estado_conflicto as enum ('ABIERTO', 'RESUELTO');
create type public.estado_operacion_sync as enum ('RECIBIDA', 'APLICADA', 'RECHAZADA', 'CONFLICTO');
create type public.resultado_evento as enum ('ACEPTADO', 'RECHAZADO', 'CONFLICTO');
create type public.tipo_actor as enum ('USUARIO', 'SISTEMA', 'FREELANCE');

create table public.lotes_semilla (
  id uuid primary key default gen_random_uuid(),
  version_semilla text not null,
  estado public.estado_lote_semilla not null default 'ACTIVO',
  creado_en timestamptz not null default statement_timestamp(),
  purgado_en timestamptz,
  resumen_purga jsonb,
  constraint lotes_semilla_version_no_vacia check (btrim(version_semilla) <> ''),
  constraint lotes_semilla_purga_coherente check (
    (estado = 'PURGADO' and purgado_en is not null)
    or (estado <> 'PURGADO' and purgado_en is null)
  )
);

create table public.configuracion_sistema (
  singleton boolean primary key default true,
  ciclo_vida public.ciclo_vida_sistema not null,
  lote_demo_activo_id uuid references public.lotes_semilla(id) on delete restrict,
  reset_demo_habilitado boolean not null,
  epoca_handoff uuid not null default gen_random_uuid(),
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint configuracion_sistema_unica check (singleton),
  constraint configuracion_sistema_ciclo_coherente check (
    (ciclo_vida in ('DEMO', 'PURGANDO') and lote_demo_activo_id is not null and reset_demo_habilitado)
    or (ciclo_vida in ('LISTO_BOOTSTRAP', 'PRODUCCION') and lote_demo_activo_id is null and not reset_demo_habilitado)
  )
);

create table private.auditoria_administrativa (
  id uuid primary key default gen_random_uuid(),
  actor_usuario_id uuid references auth.users(id) on delete set null,
  actor_identificador text,
  accion text not null,
  objetivo_tipo text,
  objetivo_id uuid,
  resultado text not null,
  detalle jsonb not null default '{}'::jsonb,
  ip_hash text,
  creado_en timestamptz not null default statement_timestamp(),
  constraint auditoria_accion_no_vacia check (btrim(accion) <> ''),
  constraint auditoria_resultado_no_vacio check (btrim(resultado) <> '')
);

do $$
declare
  v_lote_id uuid;
begin
  insert into public.lotes_semilla (version_semilla)
  values ('demo-v1')
  returning id into v_lote_id;

  insert into public.configuracion_sistema (
    singleton,
    ciclo_vida,
    lote_demo_activo_id,
    reset_demo_habilitado
  ) values (true, 'DEMO', v_lote_id, true);
end;
$$;

comment on table public.configuracion_sistema is
  'Máquina de estados de handoff. Existe exactamente una fila; DEMO nunca se reactiva después de PRODUCCION.';
comment on table private.auditoria_administrativa is
  'Auditoría técnica preservada durante la purga; no contiene secretos ni payloads de tokens.';
