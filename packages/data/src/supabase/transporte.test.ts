import { describe, expect, it, vi } from 'vitest';
import type { ClienteSupabase } from './cliente.js';
import { crearTransporteSupabase } from './transporte.js';

describe('Transporte Supabase', () => {
  it('notifica un 401 para que la aplicación cierre una sesión obsoleta', async () => {
    const alInvalidarSesion = vi.fn();
    const cliente = {
      functions: {
        invoke: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: {
              message: 'Edge Function returned a non-2xx status code',
              context: new Response(null, { status: 401 }),
            },
          }),
        ),
      },
    } as unknown as ClienteSupabase;
    const transporte = crearTransporteSupabase(cliente, alInvalidarSesion);

    await expect(
      transporte.enviar({
        dispositivoId: '01994a64-8780-7000-8000-000000000001',
        operaciones: [],
        eventos: [],
        cursorServidor: null,
      }),
    ).rejects.toThrow('SYNC_CENTRAL');
    expect(alInvalidarSesion).toHaveBeenCalledOnce();
  });
});
