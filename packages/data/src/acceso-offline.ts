import { fallo, ok, usuarioId as crearUsuarioId, type Resultado, type Rol } from '@crearcos/core';
import {
  VIGENCIA_SESION_MS,
  type ErrorAuth,
  type OpcionesAuth,
  type SesionActiva,
} from './autenticacion.js';
import type {
  AccionAuditoriaAcceso,
  BaseLocal,
  FilaAuditoriaAcceso,
  FilaCredencialOffline,
  FilaPerfilCentral,
} from './db.js';
import { CLAVE_SESION } from './db.js';
import { derivadosIguales, derivarSecreto, generarSal } from './criptografia.js';

export const ITERACIONES_PIN_OFFLINE = 310_000;
export const INTENTOS_PIN_MAXIMOS = 5;
export const BLOQUEO_PIN_MS = 15 * 60 * 1000;
export const VIGENCIA_ACCESO_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000;
const INTERVALO_AUDITORIA_REVALIDACION_MS = 24 * 60 * 60 * 1000;
const PIN_VALIDO = /^\d{8}$/;

export type EstadoAccesoOffline = 'DISPONIBLE' | 'BLOQUEADO' | 'EXPIRADO' | 'REVOCADO';

export interface ResumenAccesoOffline {
  readonly usuarioId: string;
  readonly identificador: string;
  readonly nombre: string;
  readonly rol: Rol;
  readonly validaHasta: number;
  readonly bloqueadoHasta: number | null;
  readonly estado: EstadoAccesoOffline;
}

export interface OpcionesAccesoOffline extends OpcionesAuth {
  readonly iteraciones?: number;
}

export async function listarAccesosOffline(
  db: BaseLocal,
  ahora: number,
): Promise<readonly ResumenAccesoOffline[]> {
  const dispositivo = await idDispositivoGuardado(db);
  if (dispositivo === null) return [];
  const filas = await db.credencialesOffline.where('dispositivoId').equals(dispositivo).toArray();
  return filas
    .map((fila) => ({
      usuarioId: fila.usuarioId,
      identificador: fila.identificador,
      nombre: fila.nombre,
      rol: fila.rol,
      validaHasta: fila.validaHasta,
      bloqueadoHasta: fila.bloqueadoHasta,
      estado: estadoDe(fila, ahora),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/**
 * Enrola un PIN distinto de la contraseña central. Solo una sesión que acaba de
 * validarse contra Supabase puede crear o reemplazar esta credencial.
 */
export async function configurarAccesoOffline(
  db: BaseLocal,
  sesion: SesionActiva,
  pin: string,
  opciones: OpcionesAccesoOffline,
): Promise<Resultado<ResumenAccesoOffline, ErrorAuth>> {
  if (sesion.origen !== 'CENTRAL' || sesion.identificador === undefined) {
    return fallo(error('ACCESO_OFFLINE_NO_CONFIGURADO', 'Se requiere una sesión central reciente'));
  }
  if (!PIN_VALIDO.test(pin)) {
    return fallo(error('PIN_DEBIL', 'El PIN offline debe contener exactamente 8 dígitos'));
  }
  const perfil = await db.perfilesCentrales.get(sesion.usuarioId);
  if (!perfilValido(perfil, sesion)) {
    return fallo(error('USUARIO_INACTIVO', 'El perfil central no está habilitado'));
  }
  const ahora = opciones.ahora();
  const sal = generarSal();
  const iteraciones = opciones.iteraciones ?? ITERACIONES_PIN_OFFLINE;
  const fila: FilaCredencialOffline = {
    usuarioId: sesion.usuarioId,
    identificador: normalizarIdentificador(sesion.identificador),
    nombre: perfil.nombre,
    rol: perfil.rol,
    dispositivoId: sesion.dispositivoId,
    hash: await derivarSecreto(pin, sal, iteraciones),
    sal,
    iteraciones,
    creadaEn: ahora,
    verificadaEn: ahora,
    validaHasta: ahora + VIGENCIA_ACCESO_OFFLINE_MS,
    intentosFallidos: 0,
    bloqueadoHasta: null,
    revocadaEn: null,
    motivoRevocacion: null,
  };
  await db.transaction('rw', [db.credencialesOffline, db.auditoriaAcceso], async () => {
    await db.credencialesOffline.put(fila);
    await auditar(db, {
      usuarioId: fila.usuarioId,
      dispositivoId: fila.dispositivoId,
      accion: 'ENROLAMIENTO_OFFLINE',
      resultado: 'OK',
      ocurridoEn: ahora,
      detalle: `VIGENTE_HASTA:${fila.validaHasta.toString()}`,
    });
  });
  return ok(aResumen(fila, ahora));
}

export async function iniciarSesionOffline(
  db: BaseLocal,
  identificador: string,
  pin: string,
  opciones: OpcionesAccesoOffline,
): Promise<Resultado<SesionActiva, ErrorAuth>> {
  const ahora = opciones.ahora();
  const normalizado = normalizarIdentificador(identificador);
  const fila = await db.credencialesOffline.where('identificador').equals(normalizado).first();
  const dispositivo = await idDispositivoGuardado(db);

  if (fila === undefined) {
    await derivarSecreto(
      pin,
      'acceso-offline-inexistente',
      opciones.iteraciones ?? ITERACIONES_PIN_OFFLINE,
    );
    if (dispositivo !== null) {
      await auditar(db, {
        usuarioId: null,
        dispositivoId: dispositivo,
        accion: 'DESBLOQUEO_OFFLINE',
        resultado: 'RECHAZADO',
        ocurridoEn: ahora,
        detalle: 'CREDENCIAL_NO_ENCONTRADA',
      });
    }
    return fallo(error('PIN_INVALIDO', 'Usuario o PIN offline incorrectos'));
  }

  const derivado = await derivarSecreto(pin, fila.sal, fila.iteraciones);
  const coincide = derivadosIguales(derivado, fila.hash);
  if (fila.bloqueadoHasta !== null && fila.bloqueadoHasta > ahora) {
    await registrarRechazo(db, fila, ahora, 'BLOQUEO_VIGENTE');
    return fallo({
      codigo: 'USUARIO_BLOQUEADO',
      mensaje: 'Demasiados intentos fallidos de PIN',
      esperaMs: fila.bloqueadoHasta - ahora,
    });
  }
  if (!coincide) {
    const intentos = fila.intentosFallidos + 1;
    await db.transaction('rw', [db.credencialesOffline, db.auditoriaAcceso], async () => {
      await db.credencialesOffline.update(fila.usuarioId, {
        intentosFallidos: intentos,
        bloqueadoHasta: intentos >= INTENTOS_PIN_MAXIMOS ? ahora + BLOQUEO_PIN_MS : null,
      });
      await auditar(db, {
        usuarioId: fila.usuarioId,
        dispositivoId: fila.dispositivoId,
        accion: 'DESBLOQUEO_OFFLINE',
        resultado: 'RECHAZADO',
        ocurridoEn: ahora,
        detalle: 'PIN_INVALIDO',
      });
    });
    return fallo(error('PIN_INVALIDO', 'Usuario o PIN offline incorrectos'));
  }
  if (fila.revocadaEn !== null) {
    await registrarRechazo(db, fila, ahora, 'CREDENCIAL_REVOCADA');
    return fallo(error('CREDENCIAL_OFFLINE_REVOCADA', 'El acceso offline fue revocado'));
  }
  if (fila.validaHasta <= ahora) {
    await registrarExpiracion(db, fila, ahora);
    return fallo(
      error(
        'CREDENCIAL_OFFLINE_EXPIRADA',
        'El acceso offline venció; conecta el dispositivo e ingresa con tu contraseña',
      ),
    );
  }
  if (dispositivo === null || fila.dispositivoId !== dispositivo) {
    await registrarRechazo(db, fila, ahora, 'DISPOSITIVO_NO_COINCIDE');
    return fallo(
      error('ACCESO_OFFLINE_NO_CONFIGURADO', 'El PIN no está habilitado para este dispositivo'),
    );
  }
  const perfil = await db.perfilesCentrales.get(fila.usuarioId);
  if (perfil === undefined || !perfil.activo || perfil.rol !== fila.rol) {
    await revocarAccesoOffline(db, fila.usuarioId, ahora, 'PERFIL_CENTRAL_NO_AUTORIZADO');
    return fallo(error('CREDENCIAL_OFFLINE_REVOCADA', 'El perfil local ya no está autorizado'));
  }

  const sesion: SesionActiva = {
    usuarioId: crearUsuarioId(fila.usuarioId),
    nombre: fila.nombre,
    rol: fila.rol,
    dispositivoId: fila.dispositivoId as SesionActiva['dispositivoId'],
    expiraEn: Math.min(ahora + VIGENCIA_SESION_MS, fila.validaHasta),
    origen: 'OFFLINE',
    identificador: fila.identificador,
  };
  await db.transaction('rw', [db.credencialesOffline, db.auditoriaAcceso, db.meta], async () => {
    await db.credencialesOffline.update(fila.usuarioId, {
      intentosFallidos: 0,
      bloqueadoHasta: null,
    });
    await db.meta.put({ clave: CLAVE_SESION, valor: sesion });
    await auditar(db, {
      usuarioId: fila.usuarioId,
      dispositivoId: fila.dispositivoId,
      accion: 'DESBLOQUEO_OFFLINE',
      resultado: 'OK',
      ocurridoEn: ahora,
      detalle: null,
    });
  });
  return ok(sesion);
}

/** Renueva la ventana local únicamente después de una validación central real. */
export async function renovarAccesoOffline(
  db: BaseLocal,
  sesion: SesionActiva,
  ahora: number,
  forzarAuditoria = false,
): Promise<boolean> {
  const fila = await db.credencialesOffline.get(sesion.usuarioId);
  const perfil = await db.perfilesCentrales.get(sesion.usuarioId);
  if (
    fila === undefined ||
    fila.revocadaEn !== null ||
    fila.dispositivoId !== sesion.dispositivoId ||
    !perfilValido(perfil, sesion)
  ) {
    return false;
  }
  const auditable =
    forzarAuditoria || ahora - fila.verificadaEn >= INTERVALO_AUDITORIA_REVALIDACION_MS;
  await db.transaction('rw', [db.credencialesOffline, db.auditoriaAcceso], async () => {
    await db.credencialesOffline.update(fila.usuarioId, {
      nombre: perfil.nombre,
      rol: perfil.rol,
      verificadaEn: ahora,
      validaHasta: ahora + VIGENCIA_ACCESO_OFFLINE_MS,
      intentosFallidos: 0,
      bloqueadoHasta: null,
    });
    if (auditable) {
      await auditar(db, {
        usuarioId: fila.usuarioId,
        dispositivoId: fila.dispositivoId,
        accion: 'REVALIDACION_CENTRAL',
        resultado: 'OK',
        ocurridoEn: ahora,
        detalle: `VIGENTE_HASTA:${(ahora + VIGENCIA_ACCESO_OFFLINE_MS).toString()}`,
      });
    }
  });
  return true;
}

export async function revocarAccesoOffline(
  db: BaseLocal,
  usuarioId: string,
  ahora: number,
  motivo: string,
): Promise<void> {
  const fila = await db.credencialesOffline.get(usuarioId);
  if (fila === undefined || fila.revocadaEn !== null) return;
  await db.transaction('rw', [db.credencialesOffline, db.auditoriaAcceso], async () => {
    await db.credencialesOffline.update(usuarioId, {
      revocadaEn: ahora,
      motivoRevocacion: motivo,
      bloqueadoHasta: null,
    });
    await auditar(db, {
      usuarioId,
      dispositivoId: fila.dispositivoId,
      accion: 'REVOCACION_OFFLINE',
      resultado: 'OK',
      ocurridoEn: ahora,
      detalle: motivo,
    });
  });
}

export async function hayAccesoOfflineVigente(
  db: BaseLocal,
  sesion: SesionActiva,
  ahora: number,
): Promise<boolean> {
  const fila = await db.credencialesOffline.get(sesion.usuarioId);
  return (
    fila !== undefined &&
    fila.dispositivoId === sesion.dispositivoId &&
    fila.revocadaEn === null &&
    fila.validaHasta > ahora
  );
}

export async function listarAuditoriaAcceso(
  db: BaseLocal,
  usuarioId?: string,
): Promise<readonly FilaAuditoriaAcceso[]> {
  return usuarioId === undefined
    ? db.auditoriaAcceso.orderBy('ocurridoEn').reverse().toArray()
    : db.auditoriaAcceso
        .where('[usuarioId+ocurridoEn]')
        .between([usuarioId, DexieMin], [usuarioId, DexieMax])
        .reverse()
        .toArray();
}

const DexieMin = Number.MIN_SAFE_INTEGER;
const DexieMax = Number.MAX_SAFE_INTEGER;

function perfilValido(
  perfil: FilaPerfilCentral | undefined,
  sesion: SesionActiva,
): perfil is FilaPerfilCentral {
  return perfil !== undefined && perfil.activo && perfil.rol === sesion.rol;
}

function estadoDe(fila: FilaCredencialOffline, ahora: number): EstadoAccesoOffline {
  if (fila.revocadaEn !== null) return 'REVOCADO';
  if (fila.validaHasta <= ahora) return 'EXPIRADO';
  if (fila.bloqueadoHasta !== null && fila.bloqueadoHasta > ahora) return 'BLOQUEADO';
  return 'DISPONIBLE';
}

function aResumen(fila: FilaCredencialOffline, ahora: number): ResumenAccesoOffline {
  return {
    usuarioId: fila.usuarioId,
    identificador: fila.identificador,
    nombre: fila.nombre,
    rol: fila.rol,
    validaHasta: fila.validaHasta,
    bloqueadoHasta: fila.bloqueadoHasta,
    estado: estadoDe(fila, ahora),
  };
}

function normalizarIdentificador(valor: string): string {
  return valor.trim().toLocaleLowerCase('en-US');
}

function error(codigo: ErrorAuth['codigo'], mensaje: string): ErrorAuth {
  return { codigo, mensaje, esperaMs: null };
}

async function idDispositivoGuardado(db: BaseLocal): Promise<string | null> {
  const fila = await db.meta.get('dispositivo-id');
  return typeof fila?.valor === 'string' ? fila.valor.replace(/^disp-/, '') : null;
}

async function registrarRechazo(
  db: BaseLocal,
  fila: FilaCredencialOffline,
  ahora: number,
  detalle: string,
): Promise<void> {
  await auditar(db, {
    usuarioId: fila.usuarioId,
    dispositivoId: fila.dispositivoId,
    accion: 'DESBLOQUEO_OFFLINE',
    resultado: 'RECHAZADO',
    ocurridoEn: ahora,
    detalle,
  });
}

async function registrarExpiracion(
  db: BaseLocal,
  fila: FilaCredencialOffline,
  ahora: number,
): Promise<void> {
  await auditar(db, {
    usuarioId: fila.usuarioId,
    dispositivoId: fila.dispositivoId,
    accion: 'EXPIRACION_OFFLINE',
    resultado: 'RECHAZADO',
    ocurridoEn: ahora,
    detalle: `VENCIO_EN:${fila.validaHasta.toString()}`,
  });
}

async function auditar(
  db: BaseLocal,
  entrada: Omit<FilaAuditoriaAcceso, 'id'> & { readonly accion: AccionAuditoriaAcceso },
): Promise<void> {
  await db.auditoriaAcceso.add({
    id: globalThis.crypto.randomUUID(),
    ...entrada,
  });
}
