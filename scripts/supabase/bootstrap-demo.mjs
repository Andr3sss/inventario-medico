import { createClient } from '@supabase/supabase-js';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
};

const url = required('SUPABASE_URL');
const serviceRole = required('SUPABASE_SERVICE_ROLE_KEY');
const email = required('DEMO_ADMIN_EMAIL');
const name = required('DEMO_ADMIN_NAME');
const password = required('DEMO_ADMIN_PASSWORD');
const client = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: created, error: createError } = await client.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createError || !created.user) throw createError ?? new Error('Auth no devolvio usuario');

try {
  const { error: profileError } = await client.rpc('provisionar_perfil', {
    p_usuario_id: created.user.id,
    p_nombre: name,
    p_rol: 'ADMINISTRADOR',
  });
  if (profileError) throw profileError;
  const { data: seed, error: seedError } = await client.rpc('cargar_datos_demo', {
    p_actor_id: created.user.id,
  });
  if (seedError) throw seedError;
  process.stdout.write(`${JSON.stringify({ adminId: created.user.id, seed }, null, 2)}\n`);
} catch (error) {
  await client.auth.admin.deleteUser(created.user.id);
  throw error;
}
