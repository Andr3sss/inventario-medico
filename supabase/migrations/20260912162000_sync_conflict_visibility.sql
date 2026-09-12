-- Una réplica auxiliar que no originó el conflicto necesita recibir su estado
-- para congelar la misma pieza. Quien lo originó también necesita recibir la
-- resolución posterior. Los candidatos conservan su alcance restringido.
create or replace function private.puede_recibir_entidad(
  p_rol public.rol_aplicacion,
  p_entidad_tipo text
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when p_entidad_tipo in ('FACTURA', 'FACTURA_LINEA', 'EXCEPCION_PRECIO')
      then p_rol in ('ADMINISTRADOR', 'CONTABLE', 'SUPERVISOR')
    when p_entidad_tipo = 'CONFLICTO'
      then p_rol in ('ADMINISTRADOR', 'AUXILIAR', 'COORDINADORA', 'SUPERVISOR')
    when p_entidad_tipo = 'CONFLICTO_CANDIDATO'
      then p_rol in ('ADMINISTRADOR', 'COORDINADORA', 'SUPERVISOR')
    when p_entidad_tipo = 'CICLO_REPROCESAMIENTO'
      then p_rol in ('ADMINISTRADOR', 'AUXILIAR', 'COORDINADORA', 'SUPERVISOR')
    else p_rol <> 'FREELANCE'
  end;
$$;

revoke all on function private.puede_recibir_entidad(public.rol_aplicacion, text)
  from public, anon, authenticated;
grant execute on function private.puede_recibir_entidad(public.rol_aplicacion, text)
  to service_role;

comment on function private.puede_recibir_entidad(public.rol_aplicacion, text) is
  'Filtra el PULL por rol. Auxiliar recibe estado/resolución de conflictos, nunca sus candidatos.';
