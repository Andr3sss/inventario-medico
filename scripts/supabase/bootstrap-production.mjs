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
const redirectTo = required('PRODUCTION_REDIRECT_URL');

const { data: invited, error: inviteError } = await client.auth.admin.inviteUserByEmail(email, {
  redirectTo,
});
if (inviteError || !invited.user) throw inviteError ?? new Error('Auth no devolvio usuario');

try {
  const { error: profileError } = await client.rpc('provisionar_perfil', {
    p_usuario_id: invited.user.id,
    p_nombre: name,
    p_rol: 'ADMINISTRADOR',
  });
  if (profileError) throw profileError;
  const { data: activation, error: activationError } = await client.rpc('activar_produccion', {
    p_primer_admin_id: invited.user.id,
  });
  if (activationError) throw activationError;
  process.stdout.write(
    `${JSON.stringify({ adminId: invited.user.id, email, activation }, null, 2)}\n`,
  );
} catch (error) {
  await client.auth.admin.deleteUser(invited.user.id);
  throw error;
}
