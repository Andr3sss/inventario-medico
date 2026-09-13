-- Fase 7: MFA en la frontera REST, revocacion de permisos offline y retiro de
-- dispositivos. Supabase Auth sigue siendo la autoridad de credenciales.

create or replace function private.mfa_suficiente()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    or exists (
      select 1
      from public.perfiles p
      where p.id = (select auth.uid())
        and p.activo
        and p.rol <> 'ADMINISTRADOR'
        and not exists (
          select 1
          from auth.mfa_factors f
          where f.user_id = p.id
            and f.status = 'verified'
        )
    );
$$;

revoke all on function private.mfa_suficiente() from public, anon, authenticated;
grant execute on function private.mfa_suficiente() to authenticated, service_role;

create or replace function private.usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.mfa_suficiente()) and exists (
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
  select (select private.mfa_suficiente()) and exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo
      and p.rol = any (p_roles)
  );
$$;

create or replace function private.revocar_permisos_usuario_inactivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.activo and not new.activo then
    update public.dispositivo_usuarios
    set habilitado = false
    where usuario_id = new.id
      and habilitado;
  end if;
  return new;
end;
$$;

revoke all on function private.revocar_permisos_usuario_inactivo() from public, anon, authenticated;

create trigger perfiles_revocar_permisos_al_desactivar
after update of activo on public.perfiles
for each row
when (old.activo is distinct from new.activo)
execute function private.revocar_permisos_usuario_inactivo();

create or replace function public.revocar_dispositivo(
  p_actor_id uuid,
  p_dispositivo_id uuid,
  p_motivo text
)
returns public.dispositivos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_dispositivo public.dispositivos%rowtype;
  v_es_propietario boolean;
  v_es_gestor boolean;
begin
  if p_actor_id is distinct from (select auth.uid()) then
    -- Las Edge Functions usan service_role, pero el actor siempre se valida
    -- contra un perfil activo y no contra datos arbitrarios del navegador.
    perform private.exigir_rol_actor(
      p_actor_id,
      array['ADMINISTRADOR', 'COORDINADORA', 'SUPERVISOR']::public.rol_aplicacion[]
    );
    v_es_gestor := true;
  else
    select exists (
      select 1 from public.perfiles p
      where p.id = p_actor_id and p.activo
        and p.rol in ('ADMINISTRADOR', 'COORDINADORA', 'SUPERVISOR')
    ) into v_es_gestor;
  end if;

  select exists (
    select 1 from public.dispositivo_usuarios du
    where du.dispositivo_id = p_dispositivo_id
      and du.usuario_id = p_actor_id
      and du.habilitado
  ) into v_es_propietario;

  if not coalesce(v_es_propietario, false) and not coalesce(v_es_gestor, false) then
    raise exception using errcode = '42501', message = 'DISPOSITIVO_NO_AUTORIZADO';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception using errcode = '22023', message = 'MOTIVO_REVOCACION_REQUERIDO';
  end if;

  update public.dispositivos
  set activo = false,
      retirado_en = coalesce(retirado_en, statement_timestamp()),
      metadata = metadata || jsonb_build_object(
        'revocadoPor', p_actor_id,
        'motivoRevocacion', left(btrim(p_motivo), 500)
      )
  where id = p_dispositivo_id
  returning * into v_dispositivo;
  if v_dispositivo.id is null then
    raise exception using errcode = 'P0002', message = 'DISPOSITIVO_NO_ENCONTRADO';
  end if;

  update public.dispositivo_usuarios
  set habilitado = false
  where dispositivo_id = p_dispositivo_id
    and habilitado;

  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'REVOCAR_DISPOSITIVO', 'DISPOSITIVO', p_dispositivo_id, 'OK',
    jsonb_build_object('motivo', left(btrim(p_motivo), 500))
  );
  return v_dispositivo;
end;
$$;

revoke all on function public.revocar_dispositivo(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.revocar_dispositivo(uuid, uuid, text) to service_role;

comment on function private.mfa_suficiente() is
  'Exige AAL2 a Administradores y a cualquier identidad con un factor MFA verificado.';
comment on function public.revocar_dispositivo(uuid, uuid, text) is
  'Retira un dispositivo perdido y deshabilita todas sus concesiones de usuario de forma atomica.';
