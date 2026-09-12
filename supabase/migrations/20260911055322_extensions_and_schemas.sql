-- Extensiones y espacios de nombres mínimos. No se fijan versiones: Supabase
-- administra las versiones disponibles de extensiones en la plataforma.
create schema if not exists private;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

revoke all on schema private from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- Un objeto nuevo no queda accesible por accidente. Cada GRANT se declara en
-- la migración de seguridad después de habilitar RLS.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

comment on schema private is
  'Objetos internos no expuestos por PostgREST: auditoría, helpers y coordinación transaccional.';
