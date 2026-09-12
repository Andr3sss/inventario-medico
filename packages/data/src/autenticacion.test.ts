import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BaseLocal } from './db.js';
import {
  BLOQUEO_MS,
  INTENTOS_MAXIMOS,
  cerrarSesion,
  idDispositivo,
  iniciarSesion,
  registrarUsuario,
  sesionActual,
} from './autenticacion.js';
import { baseDePrueba, relojFalso } from './pruebas/entorno.js';

let db: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;

// Iteraciones bajas a proposito: la prueba mide la logica alrededor del hash,
// no la fuerza del derivado.
const opciones = () => ({ ahora: reloj.ahora, iteraciones: 1_000 });

beforeEach(async () => {
  db = await baseDePrueba();
  reloj = relojFalso();
  await registrarUsuario(
    db,
    { usuarioId: 'u-aux-1', nombre: 'Marcia Loor', rol: 'AUXILIAR', contrasena: 'clave-buena' },
    opciones(),
  );
});

afterEach(() => {
  db.close();
});

describe('alta de usuarios', () => {
  it('nunca guarda la contrasena en claro', async () => {
    const fila = await db.usuarios.get('u-aux-1');
    expect(fila).toBeDefined();
    expect(JSON.stringify(fila)).not.toContain('clave-buena');
    expect(fila?.sal).toHaveLength(32);
  });

  it('dos usuarios con la misma clave tienen hashes distintos', async () => {
    await registrarUsuario(
      db,
      { usuarioId: 'u-aux-2', nombre: 'Diego Salas', rol: 'AUXILIAR', contrasena: 'clave-buena' },
      opciones(),
    );
    const uno = await db.usuarios.get('u-aux-1');
    const dos = await db.usuarios.get('u-aux-2');
    expect(uno?.hash).not.toBe(dos?.hash);
  });

  it('no permite crear credenciales para el rol SISTEMA', async () => {
    const r = await registrarUsuario(
      db,
      { usuarioId: 'u-sistema', nombre: 'Sistema', rol: 'SISTEMA', contrasena: 'x' },
      opciones(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('ROL_NO_INICIA_SESION');
  });
});

describe('inicio de sesion', () => {
  it('entra con la clave correcta y deja la sesion abierta', async () => {
    const r = await iniciarSesion(db, 'u-aux-1', 'clave-buena', opciones());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.rol).toBe('AUXILIAR');

    const actual = await sesionActual(db, opciones());
    expect(actual.ok).toBe(true);
  });

  it('da el mismo mensaje si el usuario no existe o la clave esta mal', async () => {
    const inexistente = await iniciarSesion(db, 'u-fantasma', 'lo-que-sea', opciones());
    const claveMala = await iniciarSesion(db, 'u-aux-1', 'clave-mala', opciones());

    expect(inexistente.ok || claveMala.ok).toBe(false);
    if (!inexistente.ok && !claveMala.ok) {
      expect(inexistente.error.codigo).toBe(claveMala.error.codigo);
      expect(inexistente.error.mensaje).toBe(claveMala.error.mensaje);
    }
  });

  it('bloquea la cuenta tras varios intentos fallidos', async () => {
    for (let i = 0; i < INTENTOS_MAXIMOS; i += 1) {
      await iniciarSesion(db, 'u-aux-1', 'clave-mala', opciones());
    }

    const bloqueado = await iniciarSesion(db, 'u-aux-1', 'clave-buena', opciones());
    expect(bloqueado.ok).toBe(false);
    if (!bloqueado.ok) {
      expect(bloqueado.error.codigo).toBe('USUARIO_BLOQUEADO');
      expect(bloqueado.error.esperaMs).toBeGreaterThan(0);
    }
  });

  it('libera el bloqueo cuando pasa el tiempo', async () => {
    for (let i = 0; i < INTENTOS_MAXIMOS; i += 1) {
      await iniciarSesion(db, 'u-aux-1', 'clave-mala', opciones());
    }
    reloj.avanzar(BLOQUEO_MS + 1_000);

    const r = await iniciarSesion(db, 'u-aux-1', 'clave-buena', opciones());
    expect(r.ok).toBe(true);
  });

  it('el contador se reinicia despues de un ingreso correcto', async () => {
    await iniciarSesion(db, 'u-aux-1', 'clave-mala', opciones());
    await iniciarSesion(db, 'u-aux-1', 'clave-buena', opciones());
    expect((await db.usuarios.get('u-aux-1'))?.intentosFallidos).toBe(0);
  });

  it('no deja entrar a una cuenta desactivada', async () => {
    await db.usuarios.update('u-aux-1', { activo: false });
    const r = await iniciarSesion(db, 'u-aux-1', 'clave-buena', opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('USUARIO_INACTIVO');
  });
});

describe('vigencia de la sesion', () => {
  it('caduca sola y se limpia del dispositivo', async () => {
    await iniciarSesion(db, 'u-aux-1', 'clave-buena', opciones());
    reloj.avanzar(13 * 60 * 60 * 1000);

    const r = await sesionActual(db, opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('SESION_EXPIRADA');
    expect(await db.meta.get('sesion-activa')).toBeUndefined();
  });

  it('la del freelance dura menos que la del personal de planta', async () => {
    await registrarUsuario(
      db,
      { usuarioId: 'u-free', nombre: 'Rodrigo Lema', rol: 'FREELANCE', contrasena: 'clave-free' },
      opciones(),
    );
    const planta = await iniciarSesion(db, 'u-aux-1', 'clave-buena', opciones());
    const free = await iniciarSesion(db, 'u-free', 'clave-free', opciones());

    expect(planta.ok && free.ok).toBe(true);
    if (planta.ok && free.ok) expect(free.valor.expiraEn).toBeLessThan(planta.valor.expiraEn);
  });

  it('cerrar sesion borra el rastro', async () => {
    await iniciarSesion(db, 'u-aux-1', 'clave-buena', opciones());
    await cerrarSesion(db);
    const r = await sesionActual(db, opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('SIN_SESION');
  });
});

describe('identidad central del dispositivo', () => {
  it('genera un UUID crudo estable, compatible con PostgreSQL', async () => {
    const primero = await idDispositivo(db);
    const segundo = await idDispositivo(db);
    expect(primero).toBe(segundo);
    expect(primero).toMatch(/^[0-9a-f-]{36}$/i);
    expect(primero).not.toMatch(/^disp-/);
  });

  it('migra el prefijo legado sin cambiar el UUID', async () => {
    const uuid = '018bcfe5-6800-7000-8000-000000000001';
    await db.meta.put({ clave: 'dispositivo-id', valor: `disp-${uuid}` });
    expect(await idDispositivo(db)).toBe(uuid);
    expect((await db.meta.get('dispositivo-id'))?.valor).toBe(uuid);
  });
});
