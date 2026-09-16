begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;
select plan(13);

select ok(
  to_regprocedure('private.mfa_suficiente()') is null,
  'no existe una funcion de autorizacion para MFA'
);
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
    'and p.activo'
    in pg_get_functiondef('private.usuario_activo()'::regprocedure)
  ) > 0
  and position(
    'mfa'
    in lower(pg_get_functiondef('private.usuario_activo()'::regprocedure))
  ) = 0,
  'el acceso general depende del perfil activo y no de MFA'
);

select ok(
  position(
    'p.rol = any (p_roles)'
    in pg_get_functiondef('private.tiene_rol(public.rol_aplicacion[])'::regprocedure)
  ) > 0
  and position(
    'mfa'
    in lower(pg_get_functiondef('private.tiene_rol(public.rol_aplicacion[])'::regprocedure))
  ) = 0,
  'la autorizacion conserva roles sin depender de MFA'
);

select ok(
  position(
    'set habilitado = false'
    in pg_get_functiondef('public.revocar_dispositivo(uuid,uuid,text)'::regprocedure)
  ) > 0,
  'retirar un dispositivo invalida todas sus concesiones'
);

select ok(
  position(
    'p_actor_id = p_usuario_id'
    in pg_get_functiondef('public.eliminar_perfil_por_admin(uuid,uuid)'::regprocedure)
  ) > 0
  and position(
    'NO_SE_PUEDE_ELIMINAR_ULTIMO_ADMIN'
    in pg_get_functiondef('public.eliminar_perfil_por_admin(uuid,uuid)'::regprocedure)
  ) > 0,
  'la baja definitiva protege la cuenta propia y el ultimo Administrador'
);

select ok(
  position(
    'nombre = ''Usuario eliminado'''
    in pg_get_functiondef('public.eliminar_perfil_por_admin(uuid,uuid)'::regprocedure)
  ) > 0
  and position(
    '''PERFIL'', p_usuario_id, 0, true'
    in pg_get_functiondef('public.eliminar_perfil_por_admin(uuid,uuid)'::regprocedure)
  ) > 0,
  'la baja anonimiza el perfil y publica una eliminacion para las replicas'
);

select ok(
  position(
    'intentos_fallidos'
    in pg_get_functiondef('public.verificar_pin_administrador(uuid,text)'::regprocedure)
  ) > 0
  and position(
    '15 minutes'
    in pg_get_functiondef('public.verificar_pin_administrador(uuid,text)'::regprocedure)
  ) > 0,
  'el PIN administrativo limita intentos y aplica un bloqueo temporal'
);

select ok(
  position(
    'set habilitado = false'
    in pg_get_functiondef('public.registrar_cambio_contrasena_admin(uuid,uuid)'::regprocedure)
  ) > 0
  and position(
    'CAMBIAR_CONTRASENA_USUARIO'
    in pg_get_functiondef('public.registrar_cambio_contrasena_admin(uuid,uuid)'::regprocedure)
  ) > 0,
  'el cambio de contraseña revoca concesiones offline y queda auditado'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.perfiles'::regclass
      and tgname = 'perfiles_eliminar_pin_al_anonimizar'
      and not tgisinternal
  ),
  'anonimizar una cuenta elimina también su verificador de PIN administrativo'
);

select * from finish();
rollback;
