import { fallo, ok, usuarioId as crearUsuarioId, type Resultado, type Rol } from '@crearcos/core';
import { CLAVE_SESION, type BaseLocal, type FilaUsuario } from './db.js';
import type { Sesion } from './escaneo.js';

/**
 * Iteraciones de PBKDF2 para produccion. Las pruebas bajan este numero porque
 * no estan midiendo la fuerza del derivado sino la logica alrededor.
 */
export const ITERACIONES = 210_000;

/** Intentos antes de bloquear, y cuanto dura el bloqueo. */
export const INTENTOS_MAXIMOS = 5;
export const BLOQUEO_MS = 5 * 60 * 1000;

/** Duracion de la sesion. El freelance dura lo que dura su cirugia, no mas. */
export const VIGENCIA_SESION_MS = 12 * 60 * 60 * 1000;
export const VIGENCIA_FREELANCE_MS = 6 * 60 * 60 * 1000;

export type CodigoErrorAuth =
  | 'CREDENCIALES_INVALIDAS'
  | 'USUARIO_INACTIVO'
  | 'USUARIO_BLOQUEADO'
  | 'ROL_NO_INICIA_SESION'
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
}

export interface OpcionesAuth {
  readonly ahora: () => number;
  readonly iteraciones?: number;
}

/**
 * Copia el texto a un ArrayBuffer propio. WebCrypto acepta BufferSource y el
 * tipo que devuelve TextEncoder puede estar respaldado por memoria compartida,
 * que no sirve aqui.
 */
function textoAOctetos(texto: string): ArrayBuffer {
  const datos = new TextEncoder().encode(texto);
  const destino = new ArrayBuffer(datos.byteLength);
  new Uint8Array(destino).set(datos);
  return destino;
}

const aHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function derivar(contrasena: string, sal: string, iteraciones: number): Promise<string> {
  const clave = await globalThis.crypto.subtle.importKey(
    'raw',
    textoAOctetos(contrasena),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: textoAOctetos(sal), iterations: iteraciones },
    clave,
    256,
  );
  return aHex(bits);
}

/**
 * Comparacion de tiempo constante.
 *
 * Comparar con === sale antes en el primer caracter distinto, y esa diferencia
 * de microsegundos es medible. Aqui siempre se recorren los dos hashes enteros.
 */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i += 1) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

function salAleatoria(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
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
  const sal = salAleatoria();
  const fila: FilaUsuario = {
    usuarioId: datos.usuarioId,
    nombre: datos.nombre,
    rol: datos.rol,
    activo: true,
    hash: await derivar(datos.contrasena, sal, iteraciones),
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
    await derivar(contrasena, 'inexistente', opciones.iteraciones ?? ITERACIONES);
    return fallo({
      codigo: 'CREDENCIALES_INVALIDAS',
      mensaje: 'Usuario o contrasena incorrectos',
      esperaMs: null,
    });
  }

  const derivado = await derivar(contrasena, fila.sal, fila.iteraciones);
  const coincide = iguales(derivado, fila.hash);

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
  if (sesion.expiraEn <= opciones.ahora()) {
    await db.meta.delete(CLAVE_SESION);
    return fallo({
      codigo: 'SESION_EXPIRADA',
      mensaje: 'La sesion caduco, vuelve a entrar',
      esperaMs: null,
    });
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
    return guardado.valor as Sesion['dispositivoId'];
  }
  const nuevo = `disp-${globalThis.crypto.randomUUID()}`;
  await db.meta.put({ clave: CLAVE_DISPOSITIVO, valor: nuevo });
  return nuevo as Sesion['dispositivoId'];
}
