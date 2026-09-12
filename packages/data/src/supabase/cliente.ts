import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

export interface ConfiguracionSupabase {
  readonly url: string;
  /** Clave publishable (o anon heredada). Nunca service_role. */
  readonly clavePublicable: string;
}

export type ClienteSupabase = SupabaseClient<Database>;

export function configuracionSupabaseValida(
  configuracion: Partial<ConfiguracionSupabase> | null,
): configuracion is ConfiguracionSupabase {
  if (!configuracion?.url?.startsWith('https://') || !configuracion.clavePublicable) return false;
  const clave = configuracion.clavePublicable;
  if (clave.startsWith('sb_publishable_')) return true;
  if (clave.startsWith('sb_secret_')) return false;
  try {
    const payload = clave.split('.')[1];
    if (payload === undefined) return false;
    const normalizado = payload.replace(/-/g, '+').replace(/_/g, '/');
    const relleno = normalizado.padEnd(Math.ceil(normalizado.length / 4) * 4, '=');
    const json: unknown = JSON.parse(globalThis.atob(relleno));
    return (
      typeof json === 'object' &&
      json !== null &&
      (json as { readonly role?: unknown }).role === 'anon'
    );
  } catch {
    return false;
  }
}

/** Unico punto que construye el cliente central usado por la capa de datos. */
export function crearClienteSupabase(configuracion: ConfiguracionSupabase): ClienteSupabase {
  if (!configuracionSupabaseValida(configuracion)) {
    throw new Error('CONFIGURACION_SUPABASE_INVALIDA');
  }
  return createClient<Database>(configuracion.url, configuracion.clavePublicable, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'crearcos-auth',
    },
  });
}
