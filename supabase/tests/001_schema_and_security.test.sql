begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select plan(42);

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
select has_function('public', 'crear_producto_central', array['uuid', 'uuid', 'text', 'text', 'tipo_producto', 'bigint']);
select has_function('public', 'registrar_pieza_central', array['uuid', 'uuid', 'uuid', 'text', 'text', 'text']);
select has_function('public', 'validar_acceso_freelance', array['text']);
select has_function('public', 'obtener_cambios_freelance', array['uuid', 'uuid', 'bigint', 'integer']);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.guardar_hospital_central(uuid,uuid,text,text,text,nivel_precio,bigint)',
    'execute'
  ),
  'el navegador no ejecuta comandos maestros privilegiados directamente'
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

select * from finish();
rollback;
