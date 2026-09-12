-- Índices de FK y rutas críticas de consulta/sincronización.
create index perfiles_lote_semilla_idx on public.perfiles (lote_semilla_id);
create index dispositivos_lote_semilla_idx on public.dispositivos (lote_semilla_id);
create index dispositivo_usuarios_usuario_idx on public.dispositivo_usuarios (usuario_id, dispositivo_id);
create index bodegas_responsable_idx on public.bodegas (responsable_id) where responsable_id is not null;
create index bodegas_lote_semilla_idx on public.bodegas (lote_semilla_id);
create unique index bodegas_central_unica_idx on public.bodegas ((tipo)) where tipo = 'CENTRAL' and activa;
create index hospitales_lote_semilla_idx on public.hospitales (lote_semilla_id);
create index productos_lote_semilla_idx on public.productos (lote_semilla_id);
create index producto_componentes_componente_idx on public.producto_componentes_kit (componente_producto_id);
create index piezas_producto_idx on public.piezas (producto_id);
create index piezas_bodega_retorno_idx on public.piezas (bodega_retorno_id);
create index piezas_kit_padre_idx on public.piezas (kit_padre_id) where kit_padre_id is not null;
create index piezas_maleta_actual_idx on public.piezas (maleta_actual_id) where maleta_actual_id is not null;
create index piezas_estado_idx on public.piezas (estado) where eliminado_en is null;
create index piezas_lote_semilla_idx on public.piezas (lote_semilla_id);
create index membresias_kit_kit_idx on public.membresias_kit_pieza (kit_pieza_id);
create index membresias_kit_componente_idx on public.membresias_kit_pieza (componente_pieza_id);
create index membresias_kit_agregado_por_idx on public.membresias_kit_pieza (agregado_por);
create index membresias_kit_retirado_por_idx on public.membresias_kit_pieza (retirado_por) where retirado_por is not null;
create index membresias_kit_lote_semilla_idx on public.membresias_kit_pieza (lote_semilla_id);
create unique index membresias_kit_componente_activo_uidx
  on public.membresias_kit_pieza (componente_pieza_id) where retirado_en is null;

create index maletas_responsable_idx on public.maletas (responsable_id);
create index maletas_hospital_idx on public.maletas (hospital_id) where hospital_id is not null;
create index maletas_estado_idx on public.maletas (estado) where eliminado_en is null;
create index maletas_lote_semilla_idx on public.maletas (lote_semilla_id);
create index maleta_participantes_usuario_idx on public.maleta_participantes (usuario_id);
create index maleta_participantes_agregado_por_idx on public.maleta_participantes (agregado_por);
create index maleta_items_maleta_idx on public.maleta_items (maleta_id, agregada_en);
create index maleta_items_pieza_idx on public.maleta_items (pieza_id, agregada_en desc);
create index maleta_items_agregada_por_idx on public.maleta_items (agregada_por);
create index maleta_items_retirada_por_idx on public.maleta_items (retirada_por) where retirada_por is not null;
create index maleta_items_usada_por_idx on public.maleta_items (usada_por) where usada_por is not null;
create index maleta_items_lote_semilla_idx on public.maleta_items (lote_semilla_id);
create unique index maleta_items_pieza_activa_uidx
  on public.maleta_items (pieza_id) where resultado is null;

create index ciclos_reproceso_pieza_idx on public.ciclos_reprocesamiento (pieza_id, ingreso_en desc);
create index ciclos_reproceso_maleta_idx on public.ciclos_reprocesamiento (maleta_origen_id) where maleta_origen_id is not null;
create index ciclos_reproceso_ingresada_por_idx on public.ciclos_reprocesamiento (ingresada_por);
create index ciclos_reproceso_finalizada_por_idx on public.ciclos_reprocesamiento (finalizada_por) where finalizada_por is not null;
create index ciclos_reproceso_cancelada_por_idx on public.ciclos_reprocesamiento (cancelada_por) where cancelada_por is not null;
create index ciclos_reproceso_destino_idx on public.ciclos_reprocesamiento (bodega_destino_id) where bodega_destino_id is not null;
create index ciclos_reproceso_lote_semilla_idx on public.ciclos_reprocesamiento (lote_semilla_id);
create unique index ciclos_reproceso_abierto_uidx
  on public.ciclos_reprocesamiento (pieza_id) where estado = 'ABIERTO';

create index excepciones_precio_hospital_producto_idx
  on public.excepciones_precio (hospital_id, producto_id, vigente_desde desc, propuesta_en desc)
  where estado in ('PENDIENTE', 'APROBADO');
create index excepciones_precio_producto_idx on public.excepciones_precio (producto_id);
create index excepciones_precio_propuesta_por_idx on public.excepciones_precio (propuesta_por);
create index excepciones_precio_decidida_por_idx on public.excepciones_precio (decidida_por) where decidida_por is not null;
create index excepciones_precio_lote_semilla_idx on public.excepciones_precio (lote_semilla_id);
create index facturas_hospital_idx on public.facturas (hospital_id, creado_en desc);
create index facturas_creada_por_idx on public.facturas (creada_por);
create index facturas_emitida_por_idx on public.facturas (emitida_por) where emitida_por is not null;
create index facturas_estado_idx on public.facturas (estado, creado_en desc);
create index facturas_lote_semilla_idx on public.facturas (lote_semilla_id);
create index factura_lineas_factura_idx on public.factura_lineas (factura_id);
create index factura_lineas_pieza_idx on public.factura_lineas (pieza_id) where pieza_id is not null;
create index factura_lineas_producto_idx on public.factura_lineas (producto_id) where producto_id is not null;
create index factura_lineas_excepcion_idx on public.factura_lineas (excepcion_precio_id) where excepcion_precio_id is not null;
create index factura_lineas_lote_semilla_idx on public.factura_lineas (lote_semilla_id);
create index accesos_freelance_maleta_idx on public.accesos_freelance (maleta_id);
create index accesos_freelance_creado_por_idx on public.accesos_freelance (creado_por);
create index accesos_freelance_revocado_por_idx on public.accesos_freelance (revocado_por) where revocado_por is not null;
create index accesos_freelance_lote_semilla_idx on public.accesos_freelance (lote_semilla_id);
create index sesiones_freelance_acceso_idx on public.sesiones_freelance (acceso_id);
create index sesiones_freelance_dispositivo_idx on public.sesiones_freelance (dispositivo_id);
create index sesiones_freelance_lote_semilla_idx on public.sesiones_freelance (lote_semilla_id);

create index operaciones_sync_actor_idx on public.operaciones_sync (actor_usuario_id, recibida_en desc);
create index operaciones_sync_lote_semilla_idx on public.operaciones_sync (lote_semilla_id);
create index eventos_dominio_operacion_idx on public.eventos_dominio (operacion_id, ordinal);
create index eventos_dominio_pieza_idx on public.eventos_dominio (pieza_id, hlc_milisegundos, hlc_contador, hlc_dispositivo_id, id)
  where pieza_id is not null;
create index eventos_dominio_maleta_idx on public.eventos_dominio (maleta_id, hlc_milisegundos, hlc_contador, hlc_dispositivo_id, id)
  where maleta_id is not null;
create index eventos_dominio_actor_idx on public.eventos_dominio (actor_usuario_id) where actor_usuario_id is not null;
create index eventos_dominio_sesion_freelance_idx on public.eventos_dominio (actor_sesion_freelance_id) where actor_sesion_freelance_id is not null;
create index eventos_dominio_dispositivo_idx on public.eventos_dominio (dispositivo_id) where dispositivo_id is not null;
create index eventos_dominio_lote_semilla_idx on public.eventos_dominio (lote_semilla_id);
create index conflictos_pieza_idx on public.conflictos (pieza_id, detectado_en desc);
create index conflictos_resuelto_por_idx on public.conflictos (resuelto_por) where resuelto_por is not null;
create index conflictos_lote_semilla_idx on public.conflictos (lote_semilla_id);
create unique index conflictos_pieza_abierto_uidx on public.conflictos (pieza_id) where estado = 'ABIERTO';
create index conflicto_candidatos_operacion_idx on public.conflicto_candidatos (operacion_id);
create index conflicto_candidatos_evento_idx on public.conflicto_candidatos (evento_id) where evento_id is not null;
create index conflicto_candidatos_dispositivo_idx on public.conflicto_candidatos (dispositivo_id);
create index conflicto_candidatos_usuario_idx on public.conflicto_candidatos (usuario_id);
create index conflicto_candidatos_maleta_idx on public.conflicto_candidatos (maleta_id) where maleta_id is not null;
create index commits_sync_operacion_idx on public.commits_sync (operacion_id) where operacion_id is not null;
create index commits_sync_lote_semilla_idx on public.commits_sync (lote_semilla_id);
create index cambios_sync_entidad_idx on public.cambios_sync (entidad_tipo, entidad_id, secuencia_servidor desc);
create index rechazos_sync_operacion_idx on public.rechazos_sync (operacion_id);

create or replace function private.purga_demo_en_curso()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.configuracion_sistema c
    where c.singleton and c.ciclo_vida = 'PURGANDO'
  ) and (private.es_service_role() or current_user in ('postgres', 'supabase_admin'));
$$;

create or replace function private.impedir_mutacion_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.purga_demo_en_curso() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception using errcode = '55000', message = format('%s_ES_INMUTABLE', tg_table_name);
end;
$$;

create or replace function private.proteger_operacion_final()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.purga_demo_en_curso() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'RECIBIDA' and new.estado in ('APLICADA', 'RECHAZADA', 'CONFLICTO') then
    return new;
  end if;
  raise exception using errcode = '55000', message = 'OPERACION_SYNC_FINAL_INMUTABLE';
end;
$$;

create or replace function private.proteger_factura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.purga_demo_en_curso() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if old.estado = 'EMITIDA' then
    raise exception using errcode = '55000', message = 'FACTURA_EMITIDA_INMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.proteger_linea_factura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_factura_id uuid := case when tg_op = 'DELETE' then old.factura_id else new.factura_id end;
begin
  if private.purga_demo_en_curso() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.facturas f where f.id = v_factura_id and f.estado = 'EMITIDA') then
    raise exception using errcode = '55000', message = 'LINEA_FACTURA_EMITIDA_INMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.validar_componente_catalogo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.productos p where p.id = new.kit_producto_id and p.tipo = 'KIT'
  ) then
    raise exception using errcode = '23514', message = 'PRODUCTO_PADRE_NO_ES_KIT';
  end if;
  return new;
end;
$$;

create or replace function private.validar_kit_padre_pieza()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kit_padre_id is not null and not exists (
    select 1
    from public.piezas pk
    join public.productos pr on pr.id = pk.producto_id
    where pk.id = new.kit_padre_id and pr.tipo = 'KIT'
  ) then
    raise exception using errcode = '23514', message = 'PIEZA_PADRE_NO_ES_KIT';
  end if;
  return new;
end;
$$;

create trigger eventos_dominio_inmutables
before update or delete on public.eventos_dominio
for each row execute function private.impedir_mutacion_inmutable();
create trigger commits_sync_inmutables
before update or delete on public.commits_sync
for each row execute function private.impedir_mutacion_inmutable();
create trigger cambios_sync_inmutables
before update or delete on public.cambios_sync
for each row execute function private.impedir_mutacion_inmutable();
create trigger conflicto_candidatos_inmutables
before update or delete on public.conflicto_candidatos
for each row execute function private.impedir_mutacion_inmutable();
create trigger operaciones_sync_finales_inmutables
before update or delete on public.operaciones_sync
for each row execute function private.proteger_operacion_final();
create trigger facturas_emitidas_inmutables
before update or delete on public.facturas
for each row execute function private.proteger_factura();
create trigger factura_lineas_emitidas_inmutables
before update or delete on public.factura_lineas
for each row execute function private.proteger_linea_factura();
create trigger producto_componentes_validar_kit
before insert or update on public.producto_componentes_kit
for each row execute function private.validar_componente_catalogo();
create trigger piezas_validar_kit_padre
before insert or update of kit_padre_id on public.piezas
for each row execute function private.validar_kit_padre_pieza();

revoke all on function private.purga_demo_en_curso() from public;
revoke all on function private.impedir_mutacion_inmutable() from public;
revoke all on function private.proteger_operacion_final() from public;
revoke all on function private.proteger_factura() from public;
revoke all on function private.proteger_linea_factura() from public;
revoke all on function private.validar_componente_catalogo() from public;
revoke all on function private.validar_kit_padre_pieza() from public;

comment on index public.maleta_items_pieza_activa_uidx is
  'Garantía física: una pieza solo puede pertenecer activamente a una maleta.';
comment on index public.ciclos_reproceso_abierto_uidx is
  'Una pieza reutilizable no puede tener dos ciclos de reproceso abiertos.';
