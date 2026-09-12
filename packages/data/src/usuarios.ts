import { fallo, ok, type Resultado, type Rol } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import { registrarUsuario, type DatosUsuarioNuevo, type OpcionesAuth } from './autenticacion.js';
import type { Sesion } from './escaneo.js';

/**
 * Alta/baja/reseteo de usuarios, autoservicio del Administrador (punto 10 del
 * brief: "sin intervencion de un programador"). Envuelve las primitivas de
 * `autenticacion.ts` -que no conocen el concepto de sesion- y agrega la
 * unica regla de autorizacion que le falta: solo ADMINISTRADOR puede llamarlas.
 *
 * Vigente solo mientras no exista el servidor: hoy cada dispositivo tiene su
 * propia lista de usuarios (ver decisiones.md, "Pendiente de decidir"). Un
 * usuario creado en un celular no aparece todavia en otro hasta que exista
 * sincronizacion de usuarios contra el servidor.
 */
export type CodigoErrorUsuarios = 'NO_AUTORIZADO' | 'USUARIO_NO_ENCONTRADO' | 'USUARIO_YA_EXISTE';

export interface ErrorUsuarios {
  readonly codigo: CodigoErrorUsuarios;
  readonly mensaje: string;
}

/** Nunca incluye hash, sal ni iteraciones: eso no debe salir de `autenticacion.ts`. */
export interface UsuarioResumen {
  readonly usuarioId: string;
  readonly nombre: string;
  readonly rol: Rol;
  readonly activo: boolean;
  readonly bloqueadoHasta: number | null;
}

const aResumen = (fila: {
  usuarioId: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  bloqueadoHasta: number | null;
}): UsuarioResumen => ({
  usuarioId: fila.usuarioId,
  nombre: fila.nombre,
  rol: fila.rol,
  activo: fila.activo,
  bloqueadoHasta: fila.bloqueadoHasta,
});

function exigirAdministrador(sesion: Sesion): Resultado<true, ErrorUsuarios> {
  if (sesion.rol !== 'ADMINISTRADOR') {
    return fallo({ codigo: 'NO_AUTORIZADO', mensaje: 'Solo el Administrador gestiona usuarios' });
  }
  return ok(true);
}

export async function listarUsuarios(
  db: BaseLocal,
  sesion: Sesion,
): Promise<Resultado<readonly UsuarioResumen[], ErrorUsuarios>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;
  const filas = await db.usuarios.toArray();
  return ok(filas.map(aResumen));
}

export async function crearUsuario(
  db: BaseLocal,
  datos: DatosUsuarioNuevo,
  sesion: Sesion,
  opciones: OpcionesAuth,
): Promise<Resultado<UsuarioResumen, ErrorUsuarios>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;

  const existente = await db.usuarios.get(datos.usuarioId);
  if (existente !== undefined) {
    return fallo({
      codigo: 'USUARIO_YA_EXISTE',
      mensaje: `Ya existe un usuario con id ${datos.usuarioId}`,
    });
  }

  const resultado = await registrarUsuario(db, datos, opciones);
  if (!resultado.ok) {
    return fallo({ codigo: 'NO_AUTORIZADO', mensaje: resultado.error.mensaje });
  }
  return ok(aResumen(resultado.valor));
}

export async function cambiarEstadoUsuario(
  db: BaseLocal,
  usuarioIdTexto: string,
  activo: boolean,
  sesion: Sesion,
): Promise<Resultado<UsuarioResumen, ErrorUsuarios>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;

  const fila = await db.usuarios.get(usuarioIdTexto);
  if (fila === undefined) {
    return fallo({
      codigo: 'USUARIO_NO_ENCONTRADO',
      mensaje: `El usuario ${usuarioIdTexto} no existe`,
    });
  }
  await db.usuarios.update(usuarioIdTexto, { activo });
  return ok(aResumen({ ...fila, activo }));
}

/** Vuelve a derivar el hash con una contrasena nueva y limpia el bloqueo por intentos fallidos. */
export async function resetearContrasena(
  db: BaseLocal,
  usuarioIdTexto: string,
  nuevaContrasena: string,
  sesion: Sesion,
  opciones: OpcionesAuth,
): Promise<Resultado<UsuarioResumen, ErrorUsuarios>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;

  const fila = await db.usuarios.get(usuarioIdTexto);
  if (fila === undefined) {
    return fallo({
      codigo: 'USUARIO_NO_ENCONTRADO',
      mensaje: `El usuario ${usuarioIdTexto} no existe`,
    });
  }

  const resultado = await registrarUsuario(
    db,
    { usuarioId: fila.usuarioId, nombre: fila.nombre, rol: fila.rol, contrasena: nuevaContrasena },
    opciones,
  );
  if (!resultado.ok) return fallo({ codigo: 'NO_AUTORIZADO', mensaje: resultado.error.mensaje });
  if (!fila.activo) await db.usuarios.update(usuarioIdTexto, { activo: false });
  return ok(aResumen({ ...resultado.valor, activo: fila.activo }));
}

/** Version minima de un usuario, para resolver nombres o elegir un destino, sin exponer nada de `autenticacion.ts`. */
export interface UsuarioBasico {
  readonly usuarioId: string;
  readonly nombre: string;
  readonly rol: Rol;
}

export interface FiltroUsuariosBasico {
  readonly rol?: Rol;
  /** Por defecto solo activos: no tiene sentido ofrecer una cuenta desactivada como destino de una pieza. */
  readonly incluirInactivos?: boolean;
}

/**
 * Lectura abierta, a diferencia de todo lo demas en este modulo.
 *
 * `listarUsuarios` es solo para Administrador porque expone el estado de
 * bloqueo/actividad de la cuenta, que es informacion administrativa. Esto es
 * distinto: solo id, nombre y rol -lo minimo para que la Coordinadora elija
 * un instrumentista al mandar una pieza a su bodega, o para que cualquier
 * pantalla resuelva un `usuarioId` a un nombre legible en vez de mostrar el
 * id crudo-. No hay nada aqui que un dispositivo con estos datos ya sembrados
 * localmente no pueda leer igual abriendo la base con las herramientas del
 * navegador; el gating de `listarUsuarios` protege la accion administrativa,
 * no el dato en si.
 */
export async function listarUsuariosBasico(
  db: BaseLocal,
  filtro: FiltroUsuariosBasico = {},
): Promise<readonly UsuarioBasico[]> {
  const ahora = globalThis.performance.timeOrigin + globalThis.performance.now();
  const perfilesCentrales = await db.perfilesCentrales
    .filter((fila) => fila.validoHasta > ahora)
    .toArray();
  if (perfilesCentrales.length > 0) {
    return perfilesCentrales
      .filter((fila) => {
        if (filtro.rol !== undefined && fila.rol !== filtro.rol) return false;
        if (filtro.incluirInactivos !== true && !fila.activo) return false;
        return true;
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map((fila) => ({ usuarioId: fila.usuarioId, nombre: fila.nombre, rol: fila.rol }));
  }
  const todos = await db.usuarios.toArray();
  const filtrados = todos.filter((fila) => {
    if (filtro.rol !== undefined && fila.rol !== filtro.rol) return false;
    if (filtro.incluirInactivos !== true && !fila.activo) return false;
    return true;
  });
  return [...filtrados]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((fila) => ({ usuarioId: fila.usuarioId, nombre: fila.nombre, rol: fila.rol }));
}
