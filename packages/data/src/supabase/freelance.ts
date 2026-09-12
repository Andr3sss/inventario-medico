import { fallo, ok, usuarioId as crearUsuarioId, type Resultado } from '@crearcos/core';
import { idDispositivo, type SesionActiva } from '../autenticacion.js';
import { CLAVE_SESION, type BaseLocal } from '../db.js';
import type { ErrorFreelance } from '../freelance.js';
import type { RespuestaSync, SolicitudSync, Transporte } from '../sync.js';
import type { ClienteSupabase } from './cliente.js';

function registro(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function cadena(valor: unknown): string | null {
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
}

async function mensajeFuncion(error: unknown): Promise<string> {
  const envelope = registro(error);
  const context = envelope?.context;
  if (context instanceof Response) {
    try {
      const body = registro(await context.clone().json());
      return cadena(body?.detalle) ?? cadena(body?.error) ?? 'El enlace no es válido';
    } catch {
      // Se conserva el mensaje genérico para no filtrar detalles del token.
    }
  }
  return cadena(envelope?.message) ?? 'El enlace no es válido';
}

async function invocar(
  cliente: ClienteSupabase,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const respuestaFuncion = await cliente.functions.invoke<unknown>('freelance-access', { body });
  const data: unknown = respuestaFuncion.data;
  const error: unknown = respuestaFuncion.error;
  if (error) throw new Error(await mensajeFuncion(error));
  const resultado = registro(data);
  if (resultado === null) throw new Error('RESPUESTA_FREELANCE_INVALIDA');
  return resultado;
}

function errorToken(mensaje: string): ErrorFreelance {
  return { codigo: 'TOKEN_INVALIDO', mensaje };
}

export async function validarTokenFreelanceCentral(
  cliente: ClienteSupabase,
  token: string,
): Promise<Resultado<{ readonly maletaId: string }, ErrorFreelance>> {
  try {
    const respuesta = await invocar(cliente, { accion: 'VALIDAR', token });
    const maletaId = cadena(respuesta.maletaId);
    return maletaId === null ? fallo(errorToken('El enlace no es válido')) : ok({ maletaId });
  } catch (error) {
    return fallo(errorToken(error instanceof Error ? error.message : 'El enlace no es válido'));
  }
}

export async function entrarConTokenCentral(
  db: BaseLocal,
  cliente: ClienteSupabase,
  token: string,
  nombre: string,
): Promise<Resultado<SesionActiva, ErrorFreelance>> {
  const nombreLimpio = nombre.trim();
  if (nombreLimpio === '') {
    return fallo({ codigo: 'NOMBRE_REQUERIDO', mensaje: 'Escribe tu nombre para continuar' });
  }
  try {
    const dispositivoId = await idDispositivo(db);
    const respuesta = await invocar(cliente, {
      accion: 'REDIMIR',
      token,
      dispositivoId,
      nombreDispositivo: globalThis.navigator.userAgent.slice(0, 120),
      plataforma: 'web',
      nombre: nombreLimpio,
    });
    const sesionId = cadena(respuesta.sesionId);
    const expiraEn = Date.parse(cadena(respuesta.expiraEn) ?? '');
    if (sesionId === null || !Number.isFinite(expiraEn)) {
      return fallo(errorToken('El servidor no pudo abrir una sesión válida'));
    }
    const sesion: SesionActiva = {
      usuarioId: crearUsuarioId(sesionId),
      nombre: cadena(respuesta.nombre) ?? nombreLimpio,
      rol: 'FREELANCE',
      dispositivoId,
      expiraEn,
      sesionFreelanceId: sesionId,
    };
    await db.meta.put({ clave: CLAVE_SESION, valor: sesion });
    return ok(sesion);
  } catch (error) {
    return fallo(errorToken(error instanceof Error ? error.message : 'El enlace no es válido'));
  }
}

export function crearTransporteFreelance(cliente: ClienteSupabase, sesionId: string): Transporte {
  return {
    enviar: async (lote: SolicitudSync): Promise<RespuestaSync> => {
      const respuesta = await invocar(cliente, {
        ...lote,
        accion: 'SINCRONIZAR',
        sesionId,
      });
      if (
        !Array.isArray(respuesta.aceptados) ||
        !Array.isArray(respuesta.rechazados) ||
        !Array.isArray(respuesta.conflictos) ||
        !Array.isArray(respuesta.piezas) ||
        (typeof respuesta.cursorServidor !== 'string' && respuesta.cursorServidor !== null)
      ) {
        throw new Error('RESPUESTA_SYNC_FREELANCE_INVALIDA');
      }
      return respuesta as unknown as RespuestaSync;
    },
  };
}
