-- Registra los cambios manuales de contraseña hechos por un Administrador y
-- revoca las concesiones offline del usuario afectado. La contraseña nunca
-- entra a PostgreSQL: Supabase Auth la procesa desde la Edge Function.

create table private.pines_administrador (
  usuario_id uuid primary key references public.perfiles(id) on delete cascade,
  pin_hash text not null,
  intentos_fallidos smallint not null default 0,
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz not null default statement_timestamp(),
  constraint pines_administrador_intentos_validos
    check (intentos_fallidos between 0 and 5)
);

alter table private.pines_administrador enable row level security;
alter table private.pines_administrador force row level security;

revoke all on private.pines_administrador from public, anon, authenticated;
grant select, insert, update on private.pines_administrador to service_role;

create policy pines_administrador_solo_servicio
on private.pines_administrador
for all
to service_role
using (true)
with check (true);

create or replace function public.configurar_pin_administrador(
  p_actor_id uuid,
  p_pin text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_digitos_distintos integer;
begin
  perform private.exigir_rol_actor(
    p_actor_id,
    array['ADMINISTRADOR']::public.rol_aplicacion[]
  );

  select count(distinct digito)
  into v_digitos_distintos
  from regexp_split_to_table(coalesce(p_pin, ''), '') as digito;

  if p_pin !~ '^[0-9]{8}$'
     or v_digitos_distintos < 4
     or position(p_pin in '012345678901234567') > 0
     or position(p_pin in '987654321098765432') > 0 then
    raise exception using errcode = '22023', message = 'PIN_ADMIN_DEBIL';
  end if;

  insert into private.pines_administrador (
    usuario_id,
    pin_hash,
    intentos_fallidos,
    bloqueado_hasta,
    actualizado_en
  ) values (
    p_actor_id,
    extensions.crypt(p_pin, extensions.gen_salt('bf', 12)),
    0,
    null,
    statement_timestamp()
  )
  on conflict (usuario_id) do update
  set pin_hash = excluded.pin_hash,
      intentos_fallidos = 0,
      bloqueado_hasta = null,
      actualizado_en = excluded.actualizado_en;

  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'CONFIGURAR_PIN_ADMIN', 'PERFIL', p_actor_id, 'OK', '{}'::jsonb
  );
  return true;
end;
$$;

create or replace function public.verificar_pin_administrador(
  p_actor_id uuid,
  p_pin text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pin private.pines_administrador%rowtype;
  v_intentos smallint;
  v_bloqueado_hasta timestamptz;
begin
  perform private.exigir_rol_actor(
    p_actor_id,
    array['ADMINISTRADOR']::public.rol_aplicacion[]
  );

  select *
  into v_pin
  from private.pines_administrador p
  where p.usuario_id = p_actor_id
  for update;

  if v_pin.usuario_id is null then
    return jsonb_build_object('ok', false, 'codigo', 'PIN_ADMIN_NO_CONFIGURADO');
  end if;
  if v_pin.bloqueado_hasta is not null and v_pin.bloqueado_hasta > clock_timestamp() then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'PIN_ADMIN_BLOQUEADO',
      'esperaSegundos', greatest(1, ceil(extract(epoch from (v_pin.bloqueado_hasta - clock_timestamp()))))
    );
  end if;

  if extensions.crypt(coalesce(p_pin, ''), v_pin.pin_hash) <> v_pin.pin_hash then
    v_intentos := least(5, (v_pin.intentos_fallidos + 1)::integer)::smallint;
    v_bloqueado_hasta := case
      when v_intentos >= 5 then clock_timestamp() + interval '15 minutes'
      else null
    end;
    update private.pines_administrador
    set intentos_fallidos = v_intentos,
        bloqueado_hasta = v_bloqueado_hasta
    where usuario_id = p_actor_id;
    insert into private.auditoria_administrativa (
      actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
    ) values (
      p_actor_id, 'VERIFICAR_PIN_ADMIN', 'PERFIL', p_actor_id, 'RECHAZADO',
      jsonb_build_object('codigo', 'PIN_ADMIN_INVALIDO', 'intentos', v_intentos)
    );
    return jsonb_build_object(
      'ok', false,
      'codigo', case when v_intentos >= 5 then 'PIN_ADMIN_BLOQUEADO' else 'PIN_ADMIN_INVALIDO' end,
      'esperaSegundos', case when v_intentos >= 5 then 900 else null end
    );
  end if;

  update private.pines_administrador
  set intentos_fallidos = 0,
      bloqueado_hasta = null
  where usuario_id = p_actor_id;
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'VERIFICAR_PIN_ADMIN', 'PERFIL', p_actor_id, 'OK', '{}'::jsonb
  );
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.configurar_pin_administrador(uuid, text)
from public, anon, authenticated;
revoke all on function public.verificar_pin_administrador(uuid, text)
from public, anon, authenticated;
grant execute on function public.configurar_pin_administrador(uuid, text) to service_role;
grant execute on function public.verificar_pin_administrador(uuid, text) to service_role;

create or replace function public.registrar_cambio_contrasena_admin(
  p_actor_id uuid,
  p_usuario_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rol public.rol_aplicacion;
begin
  perform private.exigir_rol_actor(
    p_actor_id,
    array['ADMINISTRADOR']::public.rol_aplicacion[]
  );

  select p.rol
  into v_rol
  from public.perfiles p
  where p.id = p_usuario_id
    and p.eliminado_en is null;

  if v_rol is null or v_rol in ('SISTEMA', 'FREELANCE') then
    raise exception using
      errcode = '22023',
      message = 'USUARIO_NO_ADMITE_CONTRASENA';
  end if;

  update public.dispositivo_usuarios
  set habilitado = false
  where usuario_id = p_usuario_id
    and habilitado;

  insert into private.auditoria_administrativa (
    actor_usuario_id,
    accion,
    objetivo_tipo,
    objetivo_id,
    resultado,
    detalle
  ) values (
    p_actor_id,
    'CAMBIAR_CONTRASENA_USUARIO',
    'PERFIL',
    p_usuario_id,
    'OK',
    jsonb_build_object('concesionesOfflineRevocadas', true)
  );

  return true;
end;
$$;

revoke all on function public.registrar_cambio_contrasena_admin(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.registrar_cambio_contrasena_admin(uuid, uuid)
to service_role;

comment on function public.registrar_cambio_contrasena_admin(uuid, uuid) is
  'Audita un cambio manual de contraseña por Administrador y revoca las concesiones offline; solo service_role puede ejecutarla.';
