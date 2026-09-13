import { fallo, ok, usuarioId as crearUsuarioId, type Resultado, type Rol } from '@crearcos/core';
import { CLAVE_SESION, type BaseLocal } from '../db.js';
import {
  VIGENCIA_SESION_MS,
  idDispositivo,
  type ErrorAuth,
  type OpcionesAuth,
  type SesionActiva,
} from '../autenticacion.js';
import type { ClienteSupabase } from './cliente.js';
import type { Database } from './database.types.js';

type PerfilFila = Pick<
  Database['public']['Tables']['perfiles']['Row'],
  'id' | 'nombre' | 'rol' | 'activo'
>;

const ROLES: readonly Rol[] = [
  'SISTEMA',
  'ADMINISTRADOR',
  'AUXILIAR',
  'COORDINADORA',
  'CONTABLE',
  'SUPERVISOR',
  'FREELANCE',
];

function esRol(valor: string): valor is Rol {
  return ROLES.includes(valor as Rol);
}

export interface PerfilCentralValidado {
  readonly usuarioId: string;
  readonly nombre: string;
  readonly rol: Exclude<Rol, 'SISTEMA'>;
}

export interface DesafioMfaCentral {
  readonly factorId: string;
  readonly modo: 'INSCRIBIR' | 'VERIFICAR';
  readonly qr: string | null;
  readonly secreto: string | null;
}

export type RevalidacionSesionCentral =
  | { readonly estado: 'VALIDA'; readonly perfil: PerfilCentralValidado }
  | {
      readonly estado: 'INVALIDA';
      readonly codigo: 'SESION_AUSENTE' | 'IDENTIDAD_NO_COINCIDE' | 'PERFIL_INACTIVO';
      readonly motivo: string;
    }
  | { readonly estado: 'NO_DISPONIBLE'; readonly motivo: string };

/**
 * Inicia el flujo autocontenido de recuperación. La respuesta de la interfaz
 * debe ser genérica para no confirmar si el correo existe.
 */
export async function solicitarRecuperacionCentral(
  cliente: ClienteSupabase,
  correo: string,
  redirectTo: string,
): Promise<void> {
  const destino = new URL(redirectTo);
  if (
    destino.origin !== globalThis.location.origin ||
    destino.pathname !== '/actualizar-contrasena' ||
    destino.search !== '' ||
    destino.hash !== ''
  ) {
    throw new Error('REDIRECCION_RECUPERACION_INVALIDA');
  }
  const { error } = await cliente.auth.resetPasswordForEmail(correo.trim().toLowerCase(), {
    redirectTo: destino.toString(),
  });
  if (error) throw error;
}

export async function actualizarContrasenaCentral(
  cliente: ClienteSupabase,
  contrasena: string,
): Promise<void> {
  if (
    contrasena.length < 12 ||
    !/[a-z]/.test(contrasena) ||
    !/[A-Z]/.test(contrasena) ||
    !/[0-9]/.test(contrasena) ||
    !/[^A-Za-z0-9]/.test(contrasena)
  ) {
    throw new Error(
      'La contraseña debe tener al menos 12 caracteres, mayúscula, minúscula, número y símbolo.',
    );
  }
  const { error: identidadError } = await cliente.auth.getUser();
  if (identidadError) throw new Error('ENLACE_RECUPERACION_INVALIDO_O_VENCIDO');
  const { error } = await cliente.auth.updateUser({ password: contrasena });
  if (error) throw error;
  await cliente.auth.signOut({ scope: 'global' });
}

/** Supabase Auth es la autoridad; IndexedDB solo conserva el perfil habilitado. */
export async function iniciarSesionCentral(
  db: BaseLocal,
  cliente: ClienteSupabase,
  correo: string,
  contrasena: string,
  opciones: OpcionesAuth,
): Promise<Resultado<SesionActiva, ErrorAuth>> {
  let respuestaAuth: Awaited<ReturnType<ClienteSupabase['auth']['signInWithPassword']>>;
  try {
    respuestaAuth = await cliente.auth.signInWithPassword({
      email: correo,
      password: contrasena,
    });
  } catch (causa) {
    return fallo(errorNoDisponible(causa));
  }
  const { data: auth, error: errorAuth } = respuestaAuth;
  if (errorAuth) {
    if (esFalloDeRed(errorAuth)) return fallo(errorNoDisponible(errorAuth));
    return fallo({
      codigo: 'CREDENCIALES_INVALIDAS',
      mensaje: 'Correo o contrasena incorrectos',
      esperaMs: null,
    });
  }

  return establecerSesionCentral(db, cliente, auth.user.id, correo, opciones);
}

async function establecerSesionCentral(
  db: BaseLocal,
  cliente: ClienteSupabase,
  authUserId: string,
  identificador: string,
  opciones: OpcionesAuth,
): Promise<Resultado<SesionActiva, ErrorAuth>> {
  let perfiles: PerfilFila[] | null;
  let errorPerfil: unknown;
  try {
    const respuestaPerfiles = await cliente
      .from('perfiles')
      .select('id,nombre,rol,activo')
      .order('nombre');
    perfiles = respuestaPerfiles.data;
    errorPerfil = respuestaPerfiles.error;
  } catch (causa) {
    return fallo(errorNoDisponible(causa));
  }
  if (errorPerfil && esFalloDeRed(errorPerfil)) return fallo(errorNoDisponible(errorPerfil));
  const perfil = perfiles?.find((fila) => fila.id === authUserId) ?? null;
  if (errorPerfil || perfil === null || !esRol(perfil.rol)) {
    await cliente.auth.signOut({ scope: 'local' });
    return fallo({
      codigo: 'PERFIL_NO_DISPONIBLE',
      mensaje: 'La cuenta no tiene un perfil de negocio habilitado',
      esperaMs: null,
    });
  }
  const perfilesValidos = perfiles ?? [];
  if (!perfil.activo) {
    await cliente.auth.signOut({ scope: 'local' });
    return fallo({
      codigo: 'USUARIO_INACTIVO',
      mensaje: 'La cuenta esta desactivada, habla con el Administrador',
      esperaMs: null,
    });
  }
  if (perfil.rol === 'SISTEMA') {
    await cliente.auth.signOut({ scope: 'local' });
    return fallo({
      codigo: 'ROL_NO_INICIA_SESION',
      mensaje: 'SISTEMA no es una cuenta interactiva',
      esperaMs: null,
    });
  }

  try {
    const { data: aal, error: aalError } = await cliente.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) return fallo(errorNoDisponible(aalError));
    if (aal.currentLevel !== 'aal2' && aal.nextLevel === 'aal2') {
      return fallo({
        codigo: 'MFA_REQUERIDA',
        mensaje: 'Ingresa el código de tu aplicación autenticadora',
        esperaMs: null,
      });
    }
    if (perfil.rol === 'ADMINISTRADOR' && aal.currentLevel !== 'aal2') {
      return fallo({
        codigo: 'MFA_INSCRIPCION_REQUERIDA',
        mensaje: 'Los administradores deben configurar autenticación de dos factores',
        esperaMs: null,
      });
    }
  } catch (causa) {
    return fallo(errorNoDisponible(causa));
  }

  const ahora = opciones.ahora();
  const sesion: SesionActiva = {
    usuarioId: crearUsuarioId(perfil.id),
    nombre: perfil.nombre,
    rol: perfil.rol,
    dispositivoId: await idDispositivo(db),
    expiraEn: ahora + VIGENCIA_SESION_MS,
    origen: 'CENTRAL',
    identificador: identificador.trim().toLocaleLowerCase('en-US'),
  };
  await db.transaction('rw', [db.perfilesCentrales, db.meta], async () => {
    const centrales = perfilesValidos.flatMap((fila) =>
      esRol(fila.rol)
        ? [
            {
              usuarioId: fila.id,
              nombre: fila.nombre,
              rol: fila.rol,
              activo: fila.activo,
              validoHasta: sesion.expiraEn,
            },
          ]
        : [],
    );
    await db.perfilesCentrales.bulkPut(centrales);
    await db.meta.put({ clave: CLAVE_SESION, valor: sesion });
  });
  return ok(sesion);
}

export async function prepararMfaCentral(
  cliente: ClienteSupabase,
  inscribir: boolean,
): Promise<DesafioMfaCentral> {
  const { data: factores, error: factoresError } = await cliente.auth.mfa.listFactors();
  if (factoresError) throw factoresError;
  const verificado = factores.totp[0];
  if (verificado !== undefined) {
    return { factorId: verificado.id, modo: 'VERIFICAR', qr: null, secreto: null };
  }
  if (!inscribir) throw new Error('FACTOR_MFA_NO_DISPONIBLE');
  for (const factor of factores.all.filter(
    (item) => item.factor_type === 'totp' && item.status === 'unverified',
  )) {
    await cliente.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await cliente.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Crearcos',
  });
  if (error) throw error;
  return {
    factorId: data.id,
    modo: 'INSCRIBIR',
    qr: data.totp.qr_code.startsWith('data:')
      ? data.totp.qr_code
      : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`,
    secreto: data.totp.secret,
  };
}

export async function completarMfaCentral(
  db: BaseLocal,
  cliente: ClienteSupabase,
  desafio: DesafioMfaCentral,
  codigo: string,
  identificador: string,
  opciones: OpcionesAuth,
): Promise<Resultado<SesionActiva, ErrorAuth>> {
  const limpio = codigo.replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpio)) {
    return fallo({
      codigo: 'MFA_REQUERIDA',
      mensaje: 'El código debe tener seis dígitos',
      esperaMs: null,
    });
  }
  try {
    const { error } = await cliente.auth.mfa.challengeAndVerify({
      factorId: desafio.factorId,
      code: limpio,
    });
    if (error) {
      return fallo({
        codigo: 'MFA_REQUERIDA',
        mensaje: 'Código de autenticación inválido',
        esperaMs: null,
      });
    }
    const { data: auth, error: authError } = await cliente.auth.getUser();
    if (authError) return fallo(errorNoDisponible(authError));
    return await establecerSesionCentral(db, cliente, auth.user.id, identificador, opciones);
  } catch (causa) {
    return fallo(errorNoDisponible(causa));
  }
}

/**
 * Confirma por red que la sesión Auth sigue perteneciendo al mismo usuario y
 * que su perfil de negocio continúa activo. Un error de transporte nunca se
 * interpreta como revocación.
 */
export async function revalidarSesionCentral(
  cliente: ClienteSupabase,
  sesion: SesionActiva,
): Promise<RevalidacionSesionCentral> {
  try {
    const { data: auth, error: errorAuth } = await cliente.auth.getUser();
    if (errorAuth) {
      return esFalloDeRed(errorAuth)
        ? { estado: 'NO_DISPONIBLE', motivo: mensaje(errorAuth) }
        : {
            estado: 'INVALIDA',
            codigo: 'SESION_AUSENTE',
            motivo: 'La sesión central ya no es válida',
          };
    }
    if (auth.user.id !== sesion.usuarioId) {
      return {
        estado: 'INVALIDA',
        codigo: 'IDENTIDAD_NO_COINCIDE',
        motivo: 'La identidad central no coincide con la sesión local',
      };
    }
    const { data: perfil, error: errorPerfil } = await cliente
      .from('perfiles')
      .select('id,nombre,rol,activo')
      .eq('id', auth.user.id)
      .maybeSingle();
    if (errorPerfil) {
      return esFalloDeRed(errorPerfil)
        ? { estado: 'NO_DISPONIBLE', motivo: mensaje(errorPerfil) }
        : {
            estado: 'INVALIDA',
            codigo: 'PERFIL_INACTIVO',
            motivo: 'El perfil central no pudo validarse',
          };
    }
    if (perfil === null || !perfil.activo || !esRol(perfil.rol) || perfil.rol === 'SISTEMA') {
      return {
        estado: 'INVALIDA',
        codigo: 'PERFIL_INACTIVO',
        motivo: 'El perfil central está inactivo o fue retirado',
      };
    }
    return {
      estado: 'VALIDA',
      perfil: { usuarioId: perfil.id, nombre: perfil.nombre, rol: perfil.rol },
    };
  } catch (causa) {
    return { estado: 'NO_DISPONIBLE', motivo: mensaje(causa) };
  }
}

export async function cerrarSesionCentral(db: BaseLocal, cliente: ClienteSupabase): Promise<void> {
  // scope local invalida la copia del navegador sin cerrar otros dispositivos.
  try {
    await cliente.auth.signOut({ scope: 'local' });
  } finally {
    await db.meta.delete(CLAVE_SESION);
  }
}

function esFalloDeRed(causa: unknown): boolean {
  if (typeof causa !== 'object' || causa === null) return true;
  const posible = causa as {
    readonly status?: unknown;
    readonly name?: unknown;
    readonly message?: unknown;
  };
  if (posible.status === 0 || (typeof posible.status === 'number' && posible.status >= 500))
    return true;
  const nombre = typeof posible.name === 'string' ? posible.name : '';
  const detalle = typeof posible.message === 'string' ? posible.message : '';
  const texto = `${nombre} ${detalle}`;
  return /fetch|network|timeout|conexi[oó]n|retryable/i.test(texto);
}

function errorNoDisponible(causa: unknown): ErrorAuth {
  return {
    codigo: 'SERVICIO_NO_DISPONIBLE',
    mensaje: `No se pudo contactar a Supabase. ${mensaje(causa)}`,
    esperaMs: null,
  };
}

function mensaje(causa: unknown): string {
  return causa instanceof Error
    ? causa.message
    : typeof causa === 'object' &&
        causa !== null &&
        typeof (causa as { message?: unknown }).message === 'string'
      ? (causa as { message: string }).message
      : 'Servicio central no disponible';
}
