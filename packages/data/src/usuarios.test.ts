import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BaseLocal } from './db.js';
import { iniciarSesion } from './autenticacion.js';
import {
  cambiarEstadoUsuario,
  crearUsuario,
  listarUsuarios,
  listarUsuariosBasico,
  resetearContrasena,
} from './usuarios.js';
import { SESION, baseDePrueba, relojFalso } from './pruebas/entorno.js';

const ADMIN = { ...SESION, rol: 'ADMINISTRADOR' } as const;

let db: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;

beforeEach(async () => {
  db = await baseDePrueba();
  reloj = relojFalso();
});

afterEach(() => {
  db.close();
});

const opciones = () => ({ ahora: reloj.ahora, iteraciones: 100 });

describe('crearUsuario', () => {
  it('el Administrador da de alta un usuario sin pasar por autenticacion.ts directamente', async () => {
    const r = await crearUsuario(
      db,
      {
        usuarioId: 'u-nuevo',
        nombre: 'Persona Nueva',
        rol: 'AUXILIAR',
        contrasena: 'clave-segura',
      },
      ADMIN,
      opciones(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.usuarioId).toBe('u-nuevo');
      expect('hash' in r.valor).toBe(false); // nunca se filtra el hash
    }

    const entrada = await iniciarSesion(db, 'u-nuevo', 'clave-segura', opciones());
    expect(entrada.ok).toBe(true);
  });

  it('un rol distinto de Administrador no puede crear usuarios', async () => {
    const r = await crearUsuario(
      db,
      { usuarioId: 'u-nuevo', nombre: 'x', rol: 'AUXILIAR', contrasena: 'clave-segura' },
      SESION, // AUXILIAR
      opciones(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('NO_AUTORIZADO');
  });

  it('rechaza crear un usuario con un id que ya existe', async () => {
    await crearUsuario(
      db,
      { usuarioId: 'u-1', nombre: 'x', rol: 'AUXILIAR', contrasena: 'clave-segura' },
      ADMIN,
      opciones(),
    );
    const r = await crearUsuario(
      db,
      { usuarioId: 'u-1', nombre: 'y', rol: 'AUXILIAR', contrasena: 'otra-clave' },
      ADMIN,
      opciones(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('USUARIO_YA_EXISTE');
  });
});

describe('cambiarEstadoUsuario', () => {
  it('desactiva un usuario y le impide entrar', async () => {
    await crearUsuario(
      db,
      { usuarioId: 'u-1', nombre: 'x', rol: 'AUXILIAR', contrasena: 'clave-segura' },
      ADMIN,
      opciones(),
    );
    const r = await cambiarEstadoUsuario(db, 'u-1', false, ADMIN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.activo).toBe(false);

    const entrada = await iniciarSesion(db, 'u-1', 'clave-segura', opciones());
    expect(entrada.ok).toBe(false);
    if (!entrada.ok) expect(entrada.error.codigo).toBe('USUARIO_INACTIVO');
  });
});

describe('resetearContrasena', () => {
  it('la contrasena vieja deja de servir y la nueva funciona', async () => {
    await crearUsuario(
      db,
      { usuarioId: 'u-1', nombre: 'x', rol: 'AUXILIAR', contrasena: 'clave-vieja' },
      ADMIN,
      opciones(),
    );
    await resetearContrasena(db, 'u-1', 'clave-nueva', ADMIN, opciones());

    const vieja = await iniciarSesion(db, 'u-1', 'clave-vieja', opciones());
    expect(vieja.ok).toBe(false);
    const nueva = await iniciarSesion(db, 'u-1', 'clave-nueva', opciones());
    expect(nueva.ok).toBe(true);
  });
});

describe('listarUsuarios', () => {
  it('nunca incluye hash ni sal', async () => {
    await crearUsuario(
      db,
      { usuarioId: 'u-1', nombre: 'x', rol: 'AUXILIAR', contrasena: 'clave-segura' },
      ADMIN,
      opciones(),
    );
    const r = await listarUsuarios(db, ADMIN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor).toHaveLength(1);
      expect(Object.keys(r.valor[0] ?? {})).toEqual([
        'usuarioId',
        'correo',
        'nombre',
        'rol',
        'activo',
        'bloqueadoHasta',
      ]);
    }
  });
});

describe('listarUsuariosBasico', () => {
  it('es una lectura abierta, sin sesion ni permiso', async () => {
    await crearUsuario(
      db,
      { usuarioId: 'u-1', nombre: 'Beto', rol: 'AUXILIAR', contrasena: 'clave-segura' },
      ADMIN,
      opciones(),
    );
    const r = await listarUsuariosBasico(db);
    expect(r).toEqual([{ usuarioId: 'u-1', nombre: 'Beto', rol: 'AUXILIAR' }]);
  });

  it('excluye inactivos por defecto', async () => {
    await crearUsuario(
      db,
      { usuarioId: 'u-1', nombre: 'Beto', rol: 'AUXILIAR', contrasena: 'x' },
      ADMIN,
      opciones(),
    );
    await cambiarEstadoUsuario(db, 'u-1', false, ADMIN);
    expect(await listarUsuariosBasico(db)).toHaveLength(0);
    expect(await listarUsuariosBasico(db, { incluirInactivos: true })).toHaveLength(1);
  });

  it('filtra por rol', async () => {
    await crearUsuario(
      db,
      { usuarioId: 'u-1', nombre: 'Ana', rol: 'AUXILIAR', contrasena: 'x' },
      ADMIN,
      opciones(),
    );
    await crearUsuario(
      db,
      { usuarioId: 'u-2', nombre: 'Beto', rol: 'COORDINADORA', contrasena: 'x' },
      ADMIN,
      opciones(),
    );
    const r = await listarUsuariosBasico(db, { rol: 'COORDINADORA' });
    expect(r.map((u) => u.usuarioId)).toEqual(['u-2']);
  });

  it('nunca incluye hash, sal ni estado de bloqueo', async () => {
    await crearUsuario(
      db,
      { usuarioId: 'u-1', nombre: 'Ana', rol: 'AUXILIAR', contrasena: 'x' },
      ADMIN,
      opciones(),
    );
    const r = await listarUsuariosBasico(db);
    expect(Object.keys(r[0] ?? {})).toEqual(['usuarioId', 'nombre', 'rol']);
  });
});
