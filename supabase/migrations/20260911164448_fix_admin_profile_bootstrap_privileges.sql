-- La administración central valida auth.users sin exponer permisos directos
-- sobre el esquema auth al rol de ejecución de la RPC.
create or replace function public.provisionar_usuario_por_admin(
  p_actor_id uuid,
  p_usuario_id uuid,
  p_nombre text,
  p_rol public.rol_aplicacion
)
returns public.perfiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles%rowtype;
  v_commit bigint;
begin
  perform private.exigir_rol_actor(p_actor_id, array['ADMINISTRADOR']::public.rol_aplicacion[]);
  if not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception using errcode = 'P0002', message = 'USUARIO_AUTH_NO_EXISTE';
  end if;
  if p_rol = 'SISTEMA' or nullif(btrim(p_nombre), '') is null then
    raise exception using errcode = '22023', message = 'PERFIL_INVALIDO';
  end if;
  insert into public.perfiles (id, nombre, rol, activo)
  values (p_usuario_id, btrim(p_nombre), p_rol, true)
  returning * into v_perfil;
  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'PERFIL', v_perfil.id, 0, false, to_jsonb(v_perfil)
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'PROVISIONAR_USUARIO', 'PERFIL', p_usuario_id, 'OK',
    jsonb_build_object('rol', p_rol, 'commit', v_commit)
  );
  return v_perfil;
end;
$$;

revoke all on function public.provisionar_usuario_por_admin(
  uuid, uuid, text, public.rol_aplicacion
) from public, anon, authenticated;
grant execute on function public.provisionar_usuario_por_admin(
  uuid, uuid, text, public.rol_aplicacion
) to service_role;
