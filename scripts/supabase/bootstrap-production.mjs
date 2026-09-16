import { createClient } from '@supabase/supabase-js';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
};

const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = required('PRODUCTION_ADMIN_EMAIL');
const name = required('PRODUCTION_ADMIN_NAME');
const password = required('PRODUCTION_ADMIN_PASSWORD');
if (
  password.length < 12 ||
  password.length > 72 ||
  !/[a-z]/.test(password) ||
  !/[A-Z]/.test(password) ||
  !/[0-9]/.test(password) ||
  !/[^A-Za-z0-9]/.test(password)
) {
  throw new Error('PRODUCTION_ADMIN_PASSWORD no cumple la política fuerte');
}

const { data: created, error: createError } = await client.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { nombre: name },
});
if (createError || !created.user) throw createError ?? new Error('Auth no devolvio usuario');

try {
  const { error: profileError } = await client.rpc('provisionar_perfil', {
    p_usuario_id: created.user.id,
    p_nombre: name,
    p_rol: 'ADMINISTRADOR',
  });
  if (profileError) throw profileError;
  const { data: activation, error: activationError } = await client.rpc('activar_produccion', {
    p_primer_admin_id: created.user.id,
  });
  if (activationError) throw activationError;
  process.stdout.write(
    `${JSON.stringify({ adminId: created.user.id, email, activation }, null, 2)}\n`,
  );
} catch (error) {
  await client.auth.admin.deleteUser(created.user.id);
  throw error;
}
