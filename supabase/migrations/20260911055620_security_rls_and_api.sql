-- La autorización se deriva exclusivamente de perfiles, nunca de
-- raw_user_meta_data/raw_app_meta_data enviados por el cliente.
create or replace function private.usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo
  );
$$;

create or replace function private.tiene_rol(p_roles public.rol_aplicacion[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo
      and p.rol = any (p_roles)
  );
$$;

create or replace function private.sistema_disponible()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.configuracion_sistema c
    where c.singleton = true
      and c.ciclo_vida in ('DEMO', 'PRODUCCION')
  );
$$;

revoke all on function private.usuario_activo() from public;
revoke all on function private.tiene_rol(public.rol_aplicacion[]) from public;
revoke all on function private.sistema_disponible() from public;
grant usage on schema private to authenticated, service_role;
grant execute on function private.usuario_activo() to authenticated, service_role;
grant execute on function private.tiene_rol(public.rol_aplicacion[]) to authenticated, service_role;
grant execute on function private.sistema_disponible() to authenticated, service_role;

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'lotes_semilla', 'configuracion_sistema', 'perfiles', 'dispositivos',
    'dispositivo_usuarios', 'bodegas', 'hospitales', 'productos',
    'producto_componentes_kit', 'piezas', 'membresias_kit_pieza',
    'maletas', 'maleta_participantes', 'maleta_items',
    'ciclos_reprocesamiento', 'excepciones_precio', 'facturas',
    'factura_lineas', 'accesos_freelance', 'sesiones_freelance',
    'operaciones_sync', 'eventos_dominio', 'conflictos',
    'conflicto_candidatos', 'commits_sync', 'cambios_sync', 'rechazos_sync'
  ] loop
    execute format('alter table public.%I enable row level security', v_tabla);
    execute format('alter table public.%I force row level security', v_tabla);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_tabla);
  end loop;
end;
$$;

alter table private.auditoria_administrativa enable row level security;
alter table private.auditoria_administrativa force row level security;
alter table private.cabeza_sync enable row level security;
alter table private.cabeza_sync force row level security;

-- El service role solo se utiliza en Edge Functions y scripts de operación.
-- Nunca se publica en el navegador.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Configuración y procedencia.
grant select on public.configuracion_sistema to authenticated;
create policy configuracion_lectura_autenticada
on public.configuracion_sistema for select to authenticated
using ((select private.usuario_activo()));

grant select on public.lotes_semilla to authenticated;
create policy lotes_semilla_lectura_administrativa
on public.lotes_semilla for select to authenticated
using ((select private.tiene_rol(array['ADMINISTRADOR', 'SUPERVISOR']::public.rol_aplicacion[])));

-- Identidad: todos los usuarios activos pueden resolver nombres/roles, pero
-- los cambios de perfiles y dispositivos pasan por operaciones privilegiadas.
grant select on public.perfiles to authenticated;
create policy perfiles_lectura_autenticada
on public.perfiles for select to authenticated
using ((select private.usuario_activo()) and (select private.sistema_disponible()));

grant select on public.dispositivos to authenticated;
create policy dispositivos_lectura_propietario_o_gestion
on public.dispositivos for select to authenticated
using (
  (select private.sistema_disponible())
  and (
    exists (
      select 1 from public.dispositivo_usuarios du
      where du.dispositivo_id = dispositivos.id
        and du.usuario_id = (select auth.uid())
    )
    or (select private.tiene_rol(array['ADMINISTRADOR', 'COORDINADORA', 'SUPERVISOR']::public.rol_aplicacion[]))
  )
);

grant select on public.dispositivo_usuarios to authenticated;
create policy dispositivo_usuarios_lectura_propietario_o_gestion
on public.dispositivo_usuarios for select to authenticated
using (
  (select private.sistema_disponible())
  and (
    usuario_id = (select auth.uid())
    or (select private.tiene_rol(array['ADMINISTRADOR', 'COORDINADORA', 'SUPERVISOR']::public.rol_aplicacion[]))
  )
);

-- Datos maestros compartidos por la réplica local.
grant select on public.bodegas, public.hospitales, public.productos,
  public.producto_componentes_kit to authenticated;
create policy bodegas_lectura_operativa on public.bodegas
for select to authenticated using ((select private.usuario_activo()) and (select private.sistema_disponible()));
create policy hospitales_lectura_operativa on public.hospitales
for select to authenticated using ((select private.usuario_activo()) and (select private.sistema_disponible()));
create policy productos_lectura_operativa on public.productos
for select to authenticated using ((select private.usuario_activo()) and (select private.sistema_disponible()));
create policy producto_componentes_lectura_operativa on public.producto_componentes_kit
for select to authenticated using ((select private.usuario_activo()) and (select private.sistema_disponible()));

-- Inventario, operaciones y trazabilidad física.
grant select on public.piezas, public.membresias_kit_pieza, public.maletas,
  public.maleta_participantes, public.maleta_items,
  public.ciclos_reprocesamiento, public.eventos_dominio to authenticated;
create policy piezas_lectura_operativa on public.piezas
for select to authenticated using ((select private.usuario_activo()) and (select private.sistema_disponible()));
create policy membresias_kit_lectura_operativa on public.membresias_kit_pieza
for select to authenticated using ((select private.usuario_activo()) and (select private.sistema_disponible()));
create policy maletas_lectura_operativa on public.maletas
for select to authenticated using ((select private.usuario_activo()) and (select private.sistema_disponible()));
create policy maleta_participantes_lectura_operativa on public.maleta_participantes
for select to authenticated using ((select private.usuario_activo()) and (select private.sistema_disponible()));
create policy maleta_items_lectura_operativa on public.maleta_items
for select to authenticated using ((select private.usuario_activo()) and (select private.sistema_disponible()));
create policy ciclos_reproceso_lectura_operativa on public.ciclos_reprocesamiento
for select to authenticated using (
  (select private.sistema_disponible())
  and (select private.tiene_rol(array['ADMINISTRADOR', 'AUXILIAR', 'COORDINADORA', 'SUPERVISOR']::public.rol_aplicacion[]))
);
create policy eventos_lectura_operativa on public.eventos_dominio
for select to authenticated using (
  (select private.sistema_disponible())
  and (select private.tiene_rol(array['ADMINISTRADOR', 'AUXILIAR', 'COORDINADORA', 'CONTABLE', 'SUPERVISOR']::public.rol_aplicacion[]))
);

-- Precios y facturación: lectura limitada a Contable, Administrador y
-- Supervisor. Ninguno recibe DML directo; las mutaciones son RPC atómicas.
grant select on public.excepciones_precio, public.facturas, public.factura_lineas to authenticated;
create policy excepciones_precio_lectura_contable on public.excepciones_precio
for select to authenticated using (
  (select private.sistema_disponible())
  and (select private.tiene_rol(array['ADMINISTRADOR', 'CONTABLE', 'SUPERVISOR']::public.rol_aplicacion[]))
);
create policy facturas_lectura_contable on public.facturas
for select to authenticated using (
  (select private.sistema_disponible())
  and (select private.tiene_rol(array['ADMINISTRADOR', 'CONTABLE', 'SUPERVISOR']::public.rol_aplicacion[]))
);
create policy factura_lineas_lectura_contable on public.factura_lineas
for select to authenticated using (
  (select private.sistema_disponible())
  and (select private.tiene_rol(array['ADMINISTRADOR', 'CONTABLE', 'SUPERVISOR']::public.rol_aplicacion[]))
);

-- Nunca se concede SELECT sobre token_hash.
grant select (
  id, maleta_id, token_prefijo, creado_por, creado_en, expira_en,
  revocado_por, revocado_en, motivo_revocacion, ultimo_uso_en
) on public.accesos_freelance to authenticated;
create policy accesos_freelance_lectura_contable on public.accesos_freelance
for select to authenticated using (
  (select private.sistema_disponible())
  and (select private.tiene_rol(array['ADMINISTRADOR', 'CONTABLE']::public.rol_aplicacion[]))
);

grant select on public.sesiones_freelance to authenticated;
create policy sesiones_freelance_lectura_contable on public.sesiones_freelance
for select to authenticated using (
  (select private.sistema_disponible())
  and (select private.tiene_rol(array['ADMINISTRADOR', 'CONTABLE']::public.rol_aplicacion[]))
);

-- Conflictos: solo Coordinadora los gestiona; Supervisor mantiene lectura.
grant select on public.conflictos, public.conflicto_candidatos to authenticated;
create policy conflictos_lectura_coordinacion on public.conflictos
for select to authenticated using (
  (select private.sistema_disponible())
  and (select private.tiene_rol(array['ADMINISTRADOR', 'COORDINADORA', 'SUPERVISOR']::public.rol_aplicacion[]))
);
create policy conflicto_candidatos_lectura_coordinacion on public.conflicto_candidatos
for select to authenticated using (
  (select private.sistema_disponible())
  and (select private.tiene_rol(array['ADMINISTRADOR', 'COORDINADORA', 'SUPERVISOR']::public.rol_aplicacion[]))
);

-- Diagnóstico de los PUSH propios. Commits/cambios se sirven por el endpoint
-- de sync, que aplica filtrado y paginación por commit completo.
grant select on public.operaciones_sync, public.rechazos_sync to authenticated;
create policy operaciones_sync_lectura_propia on public.operaciones_sync
for select to authenticated using (
  (select private.sistema_disponible())
  and (
    actor_usuario_id = (select auth.uid())
    or (select private.tiene_rol(array['ADMINISTRADOR', 'COORDINADORA', 'SUPERVISOR']::public.rol_aplicacion[]))
  )
);
create policy rechazos_sync_lectura_propia on public.rechazos_sync
for select to authenticated using (
  exists (
    select 1
    from public.operaciones_sync o
    where o.id = rechazos_sync.operacion_id
      and (
        o.actor_usuario_id = (select auth.uid())
        or (select private.tiene_rol(array['ADMINISTRADOR', 'COORDINADORA', 'SUPERVISOR']::public.rol_aplicacion[]))
      )
  )
);

comment on function private.tiene_rol(public.rol_aplicacion[]) is
  'Comprueba rol y activación contra perfiles; nunca confía en metadata editable del JWT.';
