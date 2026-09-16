import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseLocal } from '../db.js';
import { baseDePrueba } from '../pruebas/entorno.js';
import type { UsuarioResumen } from '../usuarios.js';
import { crearAdministracionCentral } from './administracion.js';
import type { ClienteSupabase } from './cliente.js';

const ID = '01994a64-8780-7000-8000-000000000001';

let db: BaseLocal;

beforeEach(async () => {
  db = await baseDePrueba();
});

afterEach(() => {
  db.close();
});

function clienteConRespuesta(
  resolver: (cuerpo: Record<string, unknown>) => Record<string, unknown>,
): { cliente: ClienteSupabase; invocar: ReturnType<typeof vi.fn> } {
  const invocar = vi.fn((_nombre: string, opciones: { readonly body: Record<string, unknown> }) =>
    Promise.resolve({ data: resolver(opciones.body), error: null }),
  );
  return {
    cliente: { functions: { invoke: invocar } } as unknown as ClienteSupabase,
    invocar,
  };
}

const usuario: UsuarioResumen = {
  usuarioId: ID,
  correo: 'ana@crearcos.test',
  nombre: 'Ana Inicial',
  rol: 'AUXILIAR',
  activo: true,
  bloqueadoHasta: null,
};

describe('AdministracionCentral usuarios', () => {
  it('lista y conserva el correo central sin exponer credenciales', async () => {
    const { cliente } = clienteConRespuesta(() => ({
      usuarios: [
        {
          id: ID,
          correo: 'ANA@CREARCOS.TEST',
          nombre: 'Ana Inicial',
          rol: 'AUXILIAR',
          activo: true,
        },
      ],
    }));
    const administracion = crearAdministracionCentral(db, cliente, () => 1_000);

    await expect(administracion.listarUsuarios()).resolves.toEqual([usuario]);
    await expect(db.perfilesCentrales.get(ID)).resolves.toMatchObject({
      usuarioId: ID,
      nombre: 'Ana Inicial',
    });
  });

  it('envia correo, nombre y rol al editar una cuenta', async () => {
    const { cliente, invocar } = clienteConRespuesta(() => ({
      usuario: {
        id: ID,
        correo: 'ana.nueva@crearcos.test',
        nombre: 'Ana Nueva',
        rol: 'SUPERVISOR',
        activo: true,
      },
    }));
    const administracion = crearAdministracionCentral(db, cliente, () => 1_000);

    const resultado = await administracion.editarUsuario(usuario, {
      correo: 'Ana.Nueva@Crearcos.Test',
      nombre: 'Ana Nueva',
      rol: 'SUPERVISOR',
    });

    expect(resultado).toMatchObject({
      correo: 'ana.nueva@crearcos.test',
      nombre: 'Ana Nueva',
      rol: 'SUPERVISOR',
    });
    expect(invocar).toHaveBeenCalledWith('administration', {
      body: {
        accion: 'EDITAR_USUARIO',
        usuarioId: ID,
        correo: 'Ana.Nueva@Crearcos.Test',
        nombre: 'Ana Nueva',
        rol: 'SUPERVISOR',
      },
    });
  });

  it('cambia la contraseña enviando el PIN administrativo solo a la función protegida', async () => {
    const { cliente, invocar } = clienteConRespuesta(() => ({
      usuario: {
        id: ID,
        correo: usuario.correo,
        nombre: usuario.nombre,
        rol: usuario.rol,
        activo: usuario.activo,
      },
    }));
    const administracion = crearAdministracionCentral(db, cliente, () => 1_000);

    await expect(
      administracion.cambiarContrasena(usuario, 'Nueva-Clave-2026!', '48273916'),
    ).resolves.toMatchObject(usuario);
    expect(invocar).toHaveBeenCalledWith('administration', {
      body: {
        accion: 'CAMBIAR_CONTRASENA_USUARIO',
        usuarioId: ID,
        contrasena: 'Nueva-Clave-2026!',
        pinAdministrador: '48273916',
      },
    });
  });

  it('registra el PIN administrativo mediante la frontera central', async () => {
    const { cliente, invocar } = clienteConRespuesta(() => ({ configurado: true }));
    const administracion = crearAdministracionCentral(db, cliente, () => 1_000);

    await administracion.configurarPinAdministrador('48273916');
    expect(invocar).toHaveBeenCalledWith('administration', {
      body: { accion: 'CONFIGURAR_PIN_ADMIN', pinAdministrador: '48273916' },
    });
  });

  it('confirma la baja definitiva y limpia el perfil local', async () => {
    await db.perfilesCentrales.put({
      usuarioId: ID,
      nombre: usuario.nombre,
      rol: usuario.rol,
      activo: true,
      validoHasta: 10_000,
    });
    const { cliente, invocar } = clienteConRespuesta(() => ({ eliminado: true }));
    const administracion = crearAdministracionCentral(db, cliente, () => 1_000);

    await administracion.eliminarUsuario(usuario);

    expect(invocar).toHaveBeenCalledWith('administration', {
      body: { accion: 'ELIMINAR_USUARIO', usuarioId: ID, confirmacion: 'ELIMINAR' },
    });
    await expect(db.perfilesCentrales.get(ID)).resolves.toBeUndefined();
  });

  it('notifica un 401 para cerrar la sesión visual obsoleta', async () => {
    const alInvalidarSesion = vi.fn();
    const cliente = {
      functions: {
        invoke: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: {
              message: 'Edge Function returned a non-2xx status code',
              context: new Response(JSON.stringify({ error: 'SESION_INVALIDA' }), {
                status: 401,
                headers: { 'content-type': 'application/json' },
              }),
            },
          }),
        ),
      },
    } as unknown as ClienteSupabase;
    const administracion = crearAdministracionCentral(db, cliente, () => 1_000, alInvalidarSesion);

    await expect(administracion.listarUsuarios()).rejects.toThrow(
      'Tu sesión central terminó. Inicia sesión nuevamente.',
    );
    expect(alInvalidarSesion).toHaveBeenCalledOnce();
  });
});
