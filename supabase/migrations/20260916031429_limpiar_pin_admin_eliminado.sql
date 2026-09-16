-- El perfil historico se conserva anonimizado, pero su verificador de PIN deja
-- de tener utilidad y debe eliminarse junto con el acceso de Auth.

create or replace function private.eliminar_pin_administrador_borrado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.eliminado_en is null and new.eliminado_en is not null then
    delete from private.pines_administrador
    where usuario_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.eliminar_pin_administrador_borrado()
from public, anon, authenticated;

create trigger perfiles_eliminar_pin_al_anonimizar
after update of eliminado_en on public.perfiles
for each row
when (old.eliminado_en is distinct from new.eliminado_en)
execute function private.eliminar_pin_administrador_borrado();

delete from private.pines_administrador pa
using public.perfiles p
where p.id = pa.usuario_id
  and p.eliminado_en is not null;
