create index auditoria_administrativa_actor_idx
  on private.auditoria_administrativa (actor_usuario_id)
  where actor_usuario_id is not null;
create index desafios_handoff_actor_idx
  on private.desafios_handoff (actor_usuario_id)
  where actor_usuario_id is not null;
create index handoff_auth_pendientes_desafio_idx
  on private.handoff_auth_pendientes (desafio_id);
create index configuracion_lote_demo_idx
  on public.configuracion_sistema (lote_demo_activo_id)
  where lote_demo_activo_id is not null;

-- Políticas explícitas documentan que estas tablas no tienen acceso de
-- navegador. service_role conserva BYPASSRLS y permisos server-side.
create policy auditoria_solo_service_role
on private.auditoria_administrativa for all to service_role
using (true) with check (true);
create policy cabeza_sync_solo_service_role
on private.cabeza_sync for all to service_role
using (true) with check (true);
create policy desafios_handoff_solo_service_role
on private.desafios_handoff for all to service_role
using (true) with check (true);
create policy handoff_auth_solo_service_role
on private.handoff_auth_pendientes for all to service_role
using (true) with check (true);
create policy commits_sync_solo_service_role
on public.commits_sync for all to service_role
using (true) with check (true);
create policy cambios_sync_solo_service_role
on public.cambios_sync for all to service_role
using (true) with check (true);
