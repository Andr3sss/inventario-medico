import { fallo, ok, usuarioId as crearUsuarioId, type Resultado, type Rol } from '@crearcos/core';
import { CLAVE_SESION, type BaseLocal, type FilaUsuario } from './db.js';
import type { Sesion } from './escaneo.js';
import { derivadosIguales, derivarSecreto, generarSal } from './criptografia.js';
import { validarSesionOfflineGuardada } from './acceso-offline.js';
import { VIGENCIA_FREELANCE_MS, VIGENCIA_SESION_MS } from './configuracion-auth.js';

export { VIGENCIA_FREELANCE_MS, VIGENCIA_SESION_MS } from './configuracion-auth.js';

/**
 * Iteraciones de PBKDF2 para produccion. Las pruebas bajan este numero porque
 * no estan midiendo la fuerza del derivado sino la logica alrededor.
 */
export const ITERACIONES = 210_000;

/** Intentos antes de bloquear, y cuanto dura el bloqueo. */
export const INTENTOS_MAXIMOS = 5;
export const BLOQUEO_MS = 5 * 60 * 1000;

export type CodigoErrorAuth =
  | 'CREDENCIALES_INVALIDAS'
  | 'USUARIO_INACTIVO'
  | 'USUARIO_BLOQUEADO'
  | 'ROL_NO_INICIA_SESION'
  | 'PERFIL_NO_DISPONIBLE'
  | 'SERVIDOR_NO_CONFIGURADO'
  | 'SERVICIO_NO_DISPONIBLE'
  | 'ACCESO_OFFLINE_NO_CONFIGURADO'
  | 'PIN_INVALIDO'
  | 'PIN_DEBIL'
  | 'CREDENCIAL_OFFLINE_EXPIRADA'
  | 'CREDENCIAL_OFFLINE_REVOCADA'
  | 'SESION_EXPIRADA'
  | 'SIN_SESION';

export interface ErrorAuth {
  readonly codigo: CodigoErrorAuth;
  readonly mensaje: string;
  /** Milisegundos restantes de bloqueo, cuando aplica. */
  readonly esperaMs: number | null;
}

export interface SesionActiva extends Sesion {
  readonly nombre: string;
  readonly expiraEn: number;
  readonly origen?: 'LOCAL' | 'CENTRAL' | 'OFFLINE' | 'FREELANCE_LOCAL' | 'FREELANCE_CENTRAL';
  /** Correo central normalizado. Solo se conserva para identificar el acceso offline. */
  readonly identificador?: string;
  /** Credencial opaca de una sesión freelance central; nunca es un token de Auth. */
  readonly sesionFreelanceId?: string;
}

export interface OpcionesAuth {
  readonly ahora: () => number;
  readonly iteraciones?: number;
}

export interface DatosUsuarioNuevo {
  readonly usuarioId: string;
  readonly nombre: string;
  readonly rol: Rol;
  readonly contrasena: string;
}

/**
 * Alta de usuario hecha por el Administrador, sin pasar por un programador.
 * Es uno de los requisitos explicitos del brief.
 */
export async function registrarUsuario(
  db: BaseLocal,
  datos: DatosUsuarioNuevo,
  opciones: OpcionesAuth,
): Promise<Resultado<FilaUsuario, ErrorAuth>> {
  if (datos.rol === 'SISTEMA') {
    return fallo({
      codigo: 'ROL_NO_INICIA_SESION',
      mensaje: 'SISTEMA no es una persona y no puede tener credenciales',
      esperaMs: null,
    });
  }

  const iteraciones = opciones.iteraciones ?? ITERACIONES;
  const sal = generarSal();
  const fila: FilaUsuario = {
    usuarioId: datos.usuarioId,
    nombre: datos.nombre,
    rol: datos.rol,
    activo: true,
    hash: await derivarSecreto(datos.contrasena, sal, iteraciones),
    sal,
    iteraciones,
    intentosFallidos: 0,
    bloqueadoHasta: null,
  };
  await db.usuarios.put(fila);
  return ok(fila);
}

/**
 * Inicio de sesion contra la credencial local.
 *
 * Se verifica siempre el hash aunque el usuario este inactivo o bloqueado, para
 * que el tiempo de respuesta no revele cual de las tres cosas fallo.
 */
export async function iniciarSesion(
  db: BaseLocal,
  usuario: string,
  contrasena: string,
  opciones: OpcionesAuth,
): Promise<Resultado<SesionActiva, ErrorAuth>> {
  const ahora = opciones.ahora();
  const fila = await db.usuarios.get(usuario);

  if (fila === undefined) {
    // Se deriva igual con parametros de descarte para no delatar por tiempo que
    // el usuario no existe.
    await derivarSecreto(contrasena, 'inexistente', opciones.iteraciones ?? ITERACIONES);
    return fallo({
      codigo: 'CREDENCIALES_INVALIDAS',
      mensaje: 'Usuario o contrasena incorrectos',
      esperaMs: null,
    });
  }

  const derivado = await derivarSecreto(contrasena, fila.sal, fila.iteraciones);
  const coincide = derivadosIguales(derivado, fila.hash);

  if (fila.bloqueadoHasta !== null && fila.bloqueadoHasta > ahora) {
    return fallo({
      codigo: 'USUARIO_BLOQUEADO',
      mensaje: 'Demasiados intentos fallidos, espera unos minutos',
      esperaMs: fila.bloqueadoHasta - ahora,
    });
  }

  if (!coincide) {
    const intentos = fila.intentosFallidos + 1;
    await db.usuarios.update(fila.usuarioId, {
      intentosFallidos: intentos,
      bloqueadoHasta: intentos >= INTENTOS_MAXIMOS ? ahora + BLOQUEO_MS : null,
    });
    return fallo({
      codigo: 'CREDENCIALES_INVALIDAS',
      mensaje: 'Usuario o contrasena incorrectos',
      esperaMs: null,
    });
  }

  if (!fila.activo) {
    return fallo({
      codigo: 'USUARIO_INACTIVO',
      mensaje: 'La cuenta esta desactivada, habla con el Administrador',
      esperaMs: null,
    });
  }

  const vigencia = fila.rol === 'FREELANCE' ? VIGENCIA_FREELANCE_MS : VIGENCIA_SESION_MS;
  const sesion: SesionActiva = {
    usuarioId: crearUsuarioId(fila.usuarioId),
    nombre: fila.nombre,
    rol: fila.rol,
    dispositivoId: await idDispositivo(db),
    expiraEn: ahora + vigencia,
    origen: 'LOCAL',
  };

  await db.transaction('rw', [db.usuarios, db.meta], async () => {
    await db.usuarios.update(fila.usuarioId, { intentosFallidos: 0, bloqueadoHasta: null });
    await db.meta.put({ clave: CLAVE_SESION, valor: sesion });
  });

  return ok(sesion);
}

export async function sesionActual(
  db: BaseLocal,
  opciones: OpcionesAuth,
): Promise<Resultado<SesionActiva, ErrorAuth>> {
  const guardada = await db.meta.get(CLAVE_SESION);
  const sesion = guardada?.valor as SesionActiva | undefined;
  if (sesion === undefined) {
    return fallo({ codigo: 'SIN_SESION', mensaje: 'No hay sesion abierta', esperaMs: null });
  }
  const ahora = opciones.ahora();
  if (sesion.expiraEn <= ahora) {
    await db.meta.delete(CLAVE_SESION);
    return fallo({
      codigo: 'SESION_EXPIRADA',
      mensaje: 'La sesion caduco, vuelve a entrar',
      esperaMs: null,
    });
  }
  const errorOffline = await validarSesionOfflineGuardada(db, sesion, ahora);
  if (errorOffline !== null) {
    await db.meta.delete(CLAVE_SESION);
    return fallo(errorOffline);
  }
  return ok(sesion);
}

export async function cerrarSesion(db: BaseLocal): Promise<void> {
  await db.meta.delete(CLAVE_SESION);
}

const CLAVE_DISPOSITIVO = 'dispositivo-id';

/** Identidad estable del equipo. Se genera una vez y acompana a todos los eventos. */
export async function idDispositivo(db: BaseLocal): Promise<Sesion['dispositivoId']> {
  const guardado = await db.meta.get(CLAVE_DISPOSITIVO);
  if (typeof guardado?.valor === 'string') {
    const normalizado = guardado.valor.startsWith('disp-')
      ? guardado.valor.slice('disp-'.length)
      : guardado.valor;
    if (normalizado !== guardado.valor) {
      await db.meta.put({ clave: CLAVE_DISPOSITIVO, valor: normalizado });
    }
    return normalizado as Sesion['dispositivoId'];
  }
  const nuevo = globalThis.crypto.randomUUID();
  await db.meta.put({ clave: CLAVE_DISPOSITIVO, valor: nuevo });
  return nuevo as Sesion['dispositivoId'];
}
