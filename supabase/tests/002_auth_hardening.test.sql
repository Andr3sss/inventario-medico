begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select plan(8);

select has_function('private', 'mfa_suficiente', array[]::text[]);
select has_function('public', 'revocar_dispositivo', array['uuid', 'uuid', 'text']);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.revocar_dispositivo(uuid,uuid,text)',
    'execute'
  ),
  'el navegador no puede invocar directamente la revocacion privilegiada'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.revocar_dispositivo(uuid,uuid,text)',
    'execute'
  ),
  'la Edge Function puede ejecutar la revocacion de dispositivo'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.perfiles'::regclass
      and tgname = 'perfiles_revocar_permisos_al_desactivar'
      and not tgisinternal
  ),
  'desactivar un perfil dispara la revocacion de permisos offline'
);

select ok(
  position(
    'auth.mfa_factors'
    in pg_get_functiondef('private.mfa_suficiente()'::regprocedure)
  ) > 0,
  'MFA se deriva de factores verificados de Auth y no de metadata editable'
);

select ok(
  position(
    $$auth.jwt() ->> 'aal'$$
    in pg_get_functiondef('private.mfa_suficiente()'::regprocedure)
  ) > 0,
  'la autorizacion comprueba el nivel AAL del JWT'
);

select ok(
  position(
    'set habilitado = false'
    in pg_get_functiondef('public.revocar_dispositivo(uuid,uuid,text)'::regprocedure)
  ) > 0,
  'retirar un dispositivo invalida todas sus concesiones'
);

select * from finish();
rollback;
