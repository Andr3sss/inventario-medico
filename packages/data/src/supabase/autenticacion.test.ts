import { dispositivoId, usuarioId } from '@crearcos/core';
import { describe, expect, it, vi } from 'vitest';
import type { SesionActiva } from '../autenticacion.js';
import type { BaseLocal } from '../db.js';
import {
  iniciarSesionCentral,
  revalidarSesionCentral,
} from './autenticacion.js';
import type { ClienteSupabase } from './cliente.js';

const sesion: SesionActiva = {
  usuarioId: usuarioId('u-central-1'),
  nombre: 'Marcia Loor',
  rol: 'AUXILIAR',
  dispositivoId: dispositivoId('018bcfe5-6800-7000-8000-000000000001'),
  expiraEn: 1_800_000_000_000,
  origen: 'OFFLINE',
  identificador: 'auxiliar@crearcos.test',
};

interface RespuestaFalsa {
  readonly authId?: string;
  readonly errorAuth?: unknown;
  readonly perfil?: { id: string; nombre: string; rol: string; activo: boolean } | null;
  readonly errorPerfil?: unknown;
  readonly lanzar?: Error;
}

function clienteFalso(respuesta: RespuestaFalsa): ClienteSupabase {
  const maybeSingle = vi.fn(() => {
    if (respuesta.lanzar !== undefined) throw respuesta.lanzar;
    return Promise.resolve({
      data: respuesta.perfil ?? null,
      error: respuesta.errorPerfil ?? null,
    });
  });
  return {
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: { id: respuesta.authId ?? sesion.usuarioId } },
          error: respuesta.errorAuth ?? null,
        }),
      ),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
  } as unknown as ClienteSupabase;
}

describe('revalidacion de una sesion central', () => {
  it('acepta solo la misma identidad con un perfil activo', async () => {
    const resultado = await revalidarSesionCentral(
      clienteFalso({
        perfil: {
          id: sesion.usuarioId,
          nombre: 'Marcia Actualizada',
          rol: 'AUXILIAR',
          activo: true,
        },
      }),
      sesion,
    );

    expect(resultado).toEqual({
      estado: 'VALIDA',
      perfil: {
        usuarioId: sesion.usuarioId,
        nombre: 'Marcia Actualizada',
        rol: 'AUXILIAR',
      },
    });
  });

  it('rechaza una sesion Auth perteneciente a otra identidad', async () => {
    const resultado = await revalidarSesionCentral(clienteFalso({ authId: 'u-central-2' }), sesion);

    expect(resultado).toMatchObject({ estado: 'INVALIDA', codigo: 'IDENTIDAD_NO_COINCIDE' });
  });

  it('distingue una sesion Auth vencida de una caida de red', async () => {
    const vencida = await revalidarSesionCentral(
      clienteFalso({ errorAuth: { status: 401, message: 'Invalid JWT' } }),
      sesion,
    );
    const sinRed = await revalidarSesionCentral(
      clienteFalso({ errorAuth: { status: 0, message: 'Failed to fetch' } }),
      sesion,
    );

    expect(vencida).toMatchObject({ estado: 'INVALIDA', codigo: 'SESION_AUSENTE' });
    expect(sinRed).toMatchObject({ estado: 'NO_DISPONIBLE' });
  });

  it.each([
    { perfil: null },
    {
      perfil: { id: sesion.usuarioId, nombre: 'Marcia Loor', rol: 'AUXILIAR', activo: false },
    },
    {
      perfil: { id: sesion.usuarioId, nombre: 'Sistema', rol: 'SISTEMA', activo: true },
    },
  ])('rechaza perfiles ausentes, inactivos o no interactivos', async (caso) => {
    const resultado = await revalidarSesionCentral(clienteFalso(caso), sesion);
    expect(resultado).toMatchObject({ estado: 'INVALIDA', codigo: 'PERFIL_INACTIVO' });
  });

  it('distingue un fallo transitorio de red de una revocacion', async () => {
    const resultado = await revalidarSesionCentral(
      clienteFalso({
        perfil: null,
        errorPerfil: { status: 503, message: 'Servicio temporalmente no disponible' },
      }),
      sesion,
    );

    expect(resultado).toMatchObject({ estado: 'NO_DISPONIBLE' });
  });

  it('trata una excepcion de transporte como indisponibilidad', async () => {
    const resultado = await revalidarSesionCentral(
      clienteFalso({ lanzar: new TypeError('Failed to fetch') }),
      sesion,
    );

    expect(resultado).toMatchObject({ estado: 'NO_DISPONIBLE' });
  });
});

describe('endurecimiento de credenciales centrales', () => {
  it('permite a un Administrador entrar únicamente con correo y contraseña', async () => {
    const put = vi.fn(() => Promise.resolve());
    const bulkPut = vi.fn(() => Promise.resolve());
    const db = {
      meta: { get: vi.fn(() => Promise.resolve(undefined)), put },
      perfilesCentrales: { bulkPut },
      transaction: vi.fn((_modo: string, _tablas: unknown[], operacion: () => Promise<void>) =>
        operacion(),
      ),
    } as unknown as BaseLocal;
    const signInWithPassword = vi.fn(() =>
      Promise.resolve({ data: { user: { id: 'admin-1' } }, error: null }),
    );
    const cliente = {
      auth: {
        signInWithPassword,
        signOut: vi.fn(),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({
              data: [
                { id: 'admin-1', nombre: 'Administradora UAT', rol: 'ADMINISTRADOR', activo: true },
              ],
              error: null,
            }),
          ),
        })),
      })),
    } as unknown as ClienteSupabase;

    const resultado = await iniciarSesionCentral(
      db,
      cliente,
      'admin@crearcos.test',
      'Clave-Segura-2026!',
      { ahora: () => 1_700_000_000_000 },
    );

    expect(resultado).toMatchObject({
      ok: true,
      valor: { usuarioId: 'admin-1', rol: 'ADMINISTRADOR', origen: 'CENTRAL' },
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'admin@crearcos.test',
      password: 'Clave-Segura-2026!',
    });
  });

});
