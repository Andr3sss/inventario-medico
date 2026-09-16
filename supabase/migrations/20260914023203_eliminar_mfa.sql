-- El acceso central usa correo/contrasena. La autorizacion conserva perfil
-- activo, roles, RLS y revocacion de dispositivos, sin depender del nivel AAL.

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

revoke all on function private.usuario_activo() from public, anon;
revoke all on function private.tiene_rol(public.rol_aplicacion[]) from public, anon;
grant execute on function private.usuario_activo() to authenticated, service_role;
grant execute on function private.tiene_rol(public.rol_aplicacion[]) to authenticated, service_role;

drop function private.mfa_suficiente();

comment on function private.usuario_activo() is
  'Comprueba que la identidad autenticada conserva un perfil de negocio activo.';
comment on function private.tiene_rol(public.rol_aplicacion[]) is
  'Comprueba perfil activo y rol autorizado sin requerir un segundo factor.';
