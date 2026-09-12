import { describe, expect, it } from 'vitest';
import { configuracionSupabaseValida } from './cliente.js';

function jwtDeRol(rol: string): string {
  const payload = globalThis
    .btoa(JSON.stringify({ role: rol }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `cabecera.${payload}.firma`;
}

describe('configuracionSupabaseValida', () => {
  const url = 'https://proyecto.supabase.co';

  it('acepta claves publishable y claves anon heredadas', () => {
    expect(configuracionSupabaseValida({ url, clavePublicable: 'sb_publishable_prueba' })).toBe(
      true,
    );
    expect(configuracionSupabaseValida({ url, clavePublicable: jwtDeRol('anon') })).toBe(true);
  });

  it('rechaza secretos y JWT service_role aunque tengan forma válida', () => {
    expect(configuracionSupabaseValida({ url, clavePublicable: 'sb_secret_no_debe_entrar' })).toBe(
      false,
    );
    expect(configuracionSupabaseValida({ url, clavePublicable: jwtDeRol('service_role') })).toBe(
      false,
    );
  });

  it('rechaza URL insegura y claves malformadas', () => {
    expect(
      configuracionSupabaseValida({
        url: 'http://proyecto.supabase.co',
        clavePublicable: 'sb_publishable_x',
      }),
    ).toBe(false);
    expect(configuracionSupabaseValida({ url, clavePublicable: 'texto-plano' })).toBe(false);
  });
});
