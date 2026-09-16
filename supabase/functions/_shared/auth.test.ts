import { describe, expect, it, vi } from 'vitest';
import { validarPerfilActivoServidor } from './auth.js';

function cliente(activo: boolean, error: unknown = null) {
  const maybeSingle = vi.fn(() => Promise.resolve({ data: { activo }, error }));
  return {
    servicio: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
      })),
    },
    maybeSingle,
  };
}

describe('perfil activo en la frontera privilegiada', () => {
  it('permite una identidad cuyo perfil continúa activo', async () => {
    const { servicio } = cliente(true);
    await expect(validarPerfilActivoServidor(servicio, 'u-1')).resolves.toBeNull();
  });

  it('rechaza una identidad cuyo perfil está inactivo', async () => {
    const { servicio } = cliente(false);
    await expect(validarPerfilActivoServidor(servicio, 'u-2')).resolves.toBe('PERFIL_INACTIVO');
  });

  it('falla cerrado si el perfil no puede validarse', async () => {
    const { servicio } = cliente(true, { message: 'database unavailable' });
    await expect(validarPerfilActivoServidor(servicio, 'u-3')).resolves.toBe('PERFIL_INACTIVO');
  });
});
