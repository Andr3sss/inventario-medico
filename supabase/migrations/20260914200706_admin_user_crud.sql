-- Permite retirar la identidad de Auth sin destruir las referencias historicas
-- del dominio. El perfil queda como una lapida anonimizada e inactiva.
alter table public.perfiles
  drop constraint perfiles_id_fkey;

alter table public.perfiles
  add column eliminado_en timestamptz;

alter table public.perfiles
  add constraint perfiles_eliminacion_coherente
  check (eliminado_en is null or not activo) not valid;

alter table public.perfiles
  validate constraint perfiles_eliminacion_coherente;

create or replace function public.actualizar_perfil(
  p_actor_id uuid,
  p_usuario_id uuid,
  p_nombre text,
  p_rol public.rol_aplicacion,
  p_activo boolean
)
returns public.perfiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_anterior public.perfiles%rowtype;
  v_nuevo public.perfiles%rowtype;
  v_commit bigint;
begin
  perform private.exigir_rol_actor(p_actor_id, array['ADMINISTRADOR']::public.rol_aplicacion[]);
  if p_rol = 'SISTEMA'
     or nullif(btrim(p_nombre), '') is null
     or char_length(btrim(p_nombre)) > 160 then
    raise exception using errcode = '22023', message = 'PERFIL_INVALIDO';
  end if;

  select p.* into v_anterior
  from public.perfiles p
  where p.id = p_usuario_id
  for update;

  if v_anterior.id is null then
    raise exception using errcode = 'P0002', message = 'PERFIL_NO_ENCONTRADO';
  end if;
  if v_anterior.eliminado_en is not null then
    raise exception using errcode = '55000', message = 'USUARIO_ELIMINADO';
  end if;
  if p_actor_id = p_usuario_id
     and (p_rol <> v_anterior.rol or not p_activo) then
    raise exception using errcode = '55000', message = 'NO_SE_PUEDE_MODIFICAR_PROPIO_ACCESO';
  end if;
  if v_anterior.rol = 'ADMINISTRADOR'
     and v_anterior.activo
     and (p_rol <> 'ADMINISTRADOR' or not p_activo)
     and not exists (
       select 1
       from public.perfiles p
       where p.rol = 'ADMINISTRADOR'
         and p.activo
         and p.eliminado_en is null
         and p.id <> p_usuario_id
     ) then
    raise exception using errcode = '55000', message = 'NO_SE_PUEDE_DESACTIVAR_ULTIMO_ADMIN';
  end if;

  update public.perfiles
  set nombre = btrim(p_nombre),
      rol = p_rol,
      activo = p_activo,
      actualizado_en = statement_timestamp()
  where id = p_usuario_id
  returning * into v_nuevo;

  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'PERFIL', v_nuevo.id, 0, false, to_jsonb(v_nuevo)
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'ACTUALIZAR_PERFIL', 'PERFIL', p_usuario_id, 'OK',
    jsonb_build_object(
      'rolAnterior', v_anterior.rol,
      'rolNuevo', v_nuevo.rol,
      'activoAnterior', v_anterior.activo,
      'activoNuevo', v_nuevo.activo,
      'commit', v_commit
    )
  );
  return v_nuevo;
end;
$$;

create or replace function public.eliminar_perfil_por_admin(
  p_actor_id uuid,
  p_usuario_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_anterior public.perfiles%rowtype;
  v_eliminado_en timestamptz;
  v_commit bigint;
begin
  perform private.exigir_rol_actor(p_actor_id, array['ADMINISTRADOR']::public.rol_aplicacion[]);
  if p_actor_id = p_usuario_id then
    raise exception using errcode = '55000', message = 'NO_SE_PUEDE_ELIMINAR_PROPIA_CUENTA';
  end if;

  select p.* into v_anterior
  from public.perfiles p
  where p.id = p_usuario_id
  for update;

  if v_anterior.id is null then
    raise exception using errcode = 'P0002', message = 'PERFIL_NO_ENCONTRADO';
  end if;
  if v_anterior.eliminado_en is not null then
    return jsonb_build_object(
      'usuarioId', v_anterior.id,
      'eliminadoEn', v_anterior.eliminado_en,
      'yaEliminado', true
    );
  end if;
  if v_anterior.rol = 'ADMINISTRADOR'
     and v_anterior.activo
     and not exists (
       select 1
       from public.perfiles p
       where p.rol = 'ADMINISTRADOR'
         and p.activo
         and p.eliminado_en is null
         and p.id <> p_usuario_id
     ) then
    raise exception using errcode = '55000', message = 'NO_SE_PUEDE_ELIMINAR_ULTIMO_ADMIN';
  end if;

  v_eliminado_en := statement_timestamp();
  update public.perfiles
  set nombre = 'Usuario eliminado',
      activo = false,
      eliminado_en = v_eliminado_en,
      actualizado_en = v_eliminado_en
  where id = p_usuario_id;

  update public.dispositivo_usuarios
  set habilitado = false
  where usuario_id = p_usuario_id
    and habilitado;

  v_commit := private.reservar_commit(null);
  perform private.registrar_cambio(
    v_commit, 0, 'PERFIL', p_usuario_id, 0, true, '{}'::jsonb
  );
  insert into private.auditoria_administrativa (
    actor_usuario_id, accion, objetivo_tipo, objetivo_id, resultado, detalle
  ) values (
    p_actor_id, 'ELIMINAR_USUARIO', 'PERFIL', p_usuario_id, 'OK',
    jsonb_build_object('rolAnterior', v_anterior.rol, 'commit', v_commit)
  );

  return jsonb_build_object(
    'usuarioId', p_usuario_id,
    'eliminadoEn', v_eliminado_en,
    'yaEliminado', false
  );
end;
$$;

revoke all on function public.eliminar_perfil_por_admin(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.eliminar_perfil_por_admin(uuid, uuid)
to service_role;

comment on column public.perfiles.eliminado_en is
  'Marca la baja definitiva de acceso; la fila anonimizada se conserva para integridad historica.';
comment on function public.eliminar_perfil_por_admin(uuid, uuid) is
  'Anonimiza el perfil, revoca dispositivos y publica su eliminacion; Auth se elimina desde la Edge Function.';
