begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select plan(66);

select has_table('public', nombre, format('existe public.%s', nombre))
from unnest(array[
  'productos', 'piezas', 'membresias_kit_pieza', 'maletas', 'maleta_items',
  'ciclos_reprocesamiento', 'excepciones_precio', 'facturas', 'factura_lineas',
  'eventos_dominio', 'conflictos', 'conflicto_candidatos', 'dispositivos', 'cambios_sync'
]) as nombre;

select ok(c.relrowsecurity and c.relforcerowsecurity, format('RLS forzado en public.%s', c.relname))
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = any(array[
    'productos', 'piezas', 'membresias_kit_pieza', 'maletas', 'maleta_items',
    'ciclos_reprocesamiento', 'excepciones_precio', 'facturas', 'factura_lineas',
    'eventos_dominio', 'conflictos', 'conflicto_candidatos', 'dispositivos', 'cambios_sync'
  ])
order by c.relname;

select has_function('public', 'procesar_lote_sync', array['uuid', 'uuid', 'jsonb']);
select has_function('public', 'obtener_cambios_sync', array['uuid', 'uuid', 'bigint', 'integer']);
select has_function('public', 'emitir_factura_central', array['uuid', 'uuid', 'uuid', 'bigint', 'uuid', 'text', 'jsonb']);
select has_function('public', 'cargar_datos_demo', array['uuid']);
select has_function('public', 'purgar_datos_demo', array['uuid', 'uuid', 'text', 'text', 'text', 'boolean']);
select has_function('public', 'activar_produccion', array['uuid']);
select has_function('public', 'guardar_hospital_central', array['uuid', 'uuid', 'text', 'text', 'text', 'nivel_precio', 'bigint']);
select has_function('public', 'guardar_hospital_offline', array['uuid', 'uuid', 'uuid', 'bigint', 'uuid', 'text', 'text', 'text', 'nivel_precio', 'bigint']);
select has_function('public', 'crear_producto_central', array['uuid', 'uuid', 'text', 'text', 'tipo_producto', 'bigint']);
select has_function('public', 'registrar_pieza_central', array['uuid', 'uuid', 'uuid', 'text', 'text', 'text']);
select has_function('public', 'eliminar_hospital_central', array['uuid', 'uuid', 'bigint']);
select has_function('public', 'actualizar_producto_central', array['uuid', 'text', 'text', 'tipo_producto', 'bigint', 'bigint']);
select has_function('public', 'eliminar_producto_central', array['uuid', 'text', 'bigint']);
select has_function('public', 'actualizar_pieza_central', array['uuid', 'uuid', 'text', 'text', 'text', 'bigint']);
select has_function('public', 'eliminar_pieza_central', array['uuid', 'uuid', 'text', 'bigint']);
select has_function('public', 'aplicar_comando_maestro_offline', array['uuid', 'uuid', 'uuid', 'bigint', 'text', 'jsonb']);
select has_function('public', 'validar_acceso_freelance', array['text']);
select has_function('public', 'obtener_cambios_freelance', array['uuid', 'uuid', 'bigint', 'integer']);
select has_column(
  'public',
  'perfiles',
  'eliminado_en',
  'perfiles conserva la marca de eliminacion historica'
);
select has_function('public', 'eliminar_perfil_por_admin', array['uuid', 'uuid']);
select has_table(
  'private',
  'pines_administrador',
  'existe private.pines_administrador'
);
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_class c
   where c.oid = 'private.pines_administrador'::regclass),
  'RLS esta habilitado y forzado en los hashes de PIN administrativo'
);
select has_function('public', 'configurar_pin_administrador', array['uuid', 'text']);
select has_function('public', 'verificar_pin_administrador', array['uuid', 'text']);
select has_function('public', 'registrar_cambio_contrasena_admin', array['uuid', 'uuid']);
select ok(
  not has_function_privilege('authenticated', 'public.configurar_pin_administrador(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.verificar_pin_administrador(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.registrar_cambio_contrasena_admin(uuid,uuid)', 'execute'),
  'el navegador no accede directamente a las operaciones de PIN y contraseña'
);
select ok(
  has_function_privilege('service_role', 'public.configurar_pin_administrador(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.verificar_pin_administrador(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.registrar_cambio_contrasena_admin(uuid,uuid)', 'execute'),
  'solo la Edge Function ejecuta las operaciones centrales de PIN y contraseña'
);

select ok(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.perfiles'::regclass
      and confrelid = 'auth.users'::regclass
      and contype = 'f'
  ),
  'el perfil historico no impide eliminar la identidad de Auth'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.eliminar_perfil_por_admin(uuid,uuid)',
    'execute'
  ),
  'el navegador no puede anonimizar perfiles directamente'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.eliminar_perfil_por_admin(uuid,uuid)',
    'execute'
  ),
  'solo la Edge Function puede anonimizar el perfil antes de eliminar Auth'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.guardar_hospital_central(uuid,uuid,text,text,text,nivel_precio,bigint)',
    'execute'
  ),
  'el navegador no ejecuta comandos maestros privilegiados directamente'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.guardar_hospital_offline(uuid,uuid,uuid,bigint,uuid,text,text,text,nivel_precio,bigint)',
    'execute'
  ),
  'el comando offline solo se ejecuta desde la Edge Function autenticada'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.aplicar_comando_maestro_offline(uuid,uuid,uuid,bigint,text,jsonb)',
    'execute'
  ),
  'el navegador no ejecuta comandos CRUD offline directamente'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.aplicar_comando_maestro_offline(uuid,uuid,uuid,bigint,text,jsonb)',
    'execute'
  ),
  'la Edge Function puede aplicar comandos CRUD offline'
);

select ok(
  not has_table_privilege('anon', 'public.piezas', 'select'),
  'anon no puede leer inventario'
);

select ok(
  position(
    'ed.maleta_id = v_maleta_id'
    in pg_get_functiondef(
      'public.obtener_cambios_freelance(uuid,uuid,bigint,integer)'::regprocedure
    )
  ) > 0,
  'el pull freelance incluye solo eventos de dominio de su maleta'
);

select ok(
  private.puede_recibir_entidad('AUXILIAR', 'CONFLICTO'),
  'Auxiliar recibe el estado y la resolución de conflictos para converger'
);

select ok(
  not private.puede_recibir_entidad('AUXILIAR', 'CONFLICTO_CANDIDATO'),
  'Auxiliar no recibe la evidencia reservada de candidatos'
);

select * from finish();
rollback;
