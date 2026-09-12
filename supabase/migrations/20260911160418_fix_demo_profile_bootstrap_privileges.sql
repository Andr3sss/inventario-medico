-- El bootstrap de demo valida auth.users desde una función invocada por
-- service_role; no se concede SELECT general sobre el esquema auth.
create or replace function public.provisionar_perfil(
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
  v_ciclo public.ciclo_vida_sistema;
  v_perfil public.perfiles%rowtype;
begin
  perform private.exigir_service_role();
  if not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception using errcode = 'P0002', message = 'USUARIO_AUTH_NO_EXISTE';
  end if;
  if p_rol = 'SISTEMA' or nullif(btrim(p_nombre), '') is null then
    raise exception using errcode = '22023', message = 'PERFIL_INVALIDO';
  end if;

  select ciclo_vida into v_ciclo from public.configuracion_sistema where singleton for update;
  if v_ciclo = 'DEMO' then
    null;
  elsif v_ciclo = 'LISTO_BOOTSTRAP' then
    if p_rol <> 'ADMINISTRADOR'
       or exists (select 1 from public.perfiles where origen = 'PRODUCCION') then
      raise exception using errcode = '42501', message = 'SOLO_PRIMER_ADMINISTRADOR';
    end if;
  else
    raise exception using errcode = '55000', message = 'PROVISION_NO_PERMITIDO_EN_ESTE_CICLO';
  end if;

  insert into public.perfiles (id, nombre, rol, activo)
  values (p_usuario_id, btrim(p_nombre), p_rol, true)
  returning * into v_perfil;

  insert into private.auditoria_administrativa (
    actor_usuario_id, actor_identificador, accion, objetivo_tipo,
    objetivo_id, resultado, detalle
  ) values (
    p_usuario_id, 'self-bootstrap', 'PROVISIONAR_PERFIL', 'PERFIL',
    p_usuario_id, 'OK', jsonb_build_object('rol', p_rol, 'ciclo', v_ciclo)
  );
  return v_perfil;
end;
$$;

revoke all on function public.provisionar_perfil(uuid, text, public.rol_aplicacion)
  from public, anon, authenticated;
grant execute on function public.provisionar_perfil(uuid, text, public.rol_aplicacion)
  to service_role;
