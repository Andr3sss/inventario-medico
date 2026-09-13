import { describe, expect, it, vi } from 'vitest';
import { validarMfaServidor } from './auth.js';

function clientes(
  rol: string,
  activo: boolean,
  currentLevel: string | null,
  nextLevel: string | null,
) {
  const getAuthenticatorAssuranceLevel = vi.fn(() =>
    Promise.resolve({ data: { currentLevel, nextLevel }, error: null }),
  );
  const maybeSingle = vi.fn(() => Promise.resolve({ data: { rol, activo }, error: null }));
  return {
    usuario: { auth: { mfa: { getAuthenticatorAssuranceLevel } } },
    servicio: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
      })),
    },
    getAuthenticatorAssuranceLevel,
  };
}

describe('MFA en la frontera privilegiada', () => {
  it('exige AAL2 a un Administrador', async () => {
    const { usuario, servicio } = clientes('ADMINISTRADOR', true, 'aal1', 'aal1');
    await expect(validarMfaServidor(usuario, servicio, 'u-1', 'jwt-aal1')).resolves.toBe(
      'MFA_REQUERIDA',
    );
  });

  it('permite a un rol operativo sin factor inscrito', async () => {
    const { usuario, servicio } = clientes('AUXILIAR', true, 'aal1', 'aal1');
    await expect(validarMfaServidor(usuario, servicio, 'u-2', 'jwt-aal1')).resolves.toBeNull();
  });

  it('exige el factor ya verificado a cualquier rol', async () => {
    const { usuario, servicio, getAuthenticatorAssuranceLevel } = clientes(
      'AUXILIAR',
      true,
      'aal1',
      'aal2',
    );
    await expect(validarMfaServidor(usuario, servicio, 'u-2', 'token-exacto')).resolves.toBe(
      'MFA_REQUERIDA',
    );
    expect(getAuthenticatorAssuranceLevel).toHaveBeenCalledWith('token-exacto');
  });

  it('rechaza un perfil inactivo incluso con AAL2', async () => {
    const { usuario, servicio } = clientes('ADMINISTRADOR', false, 'aal2', 'aal2');
    await expect(validarMfaServidor(usuario, servicio, 'u-3', 'jwt-aal2')).resolves.toBe(
      'PERFIL_INACTIVO',
    );
  });
});
