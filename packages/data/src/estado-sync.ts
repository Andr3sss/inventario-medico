import type { BaseLocal, FilaFallido, FilaInboxSync } from './db.js';
import {
  CLAVE_CURSOR,
  CLAVE_ULTIMA_DESCARGA_EXITOSA,
  CLAVE_ULTIMO_ENVIO_EXITOSO,
  CLAVE_ULTIMO_ERROR_SYNC,
  CLAVE_ULTIMO_INTENTO_SYNC,
} from './db.js';

export const UMBRAL_COLA_ESTANCADA_MS = 15 * 60 * 1000;
export const UMBRAL_DESCARGA_ATRASADA_MS = 5 * 60 * 1000;

export interface ErrorSyncPersistido {
  readonly mensaje: string;
  readonly ocurridoEn: number;
}

export interface DiagnosticoSincronizacion {
  readonly pendientes: number;
  readonly fallidasTotal: number;
  readonly fallidas: readonly FilaFallido[];
  readonly entradasNoAplicadas: number;
  readonly erroresProyeccion: number;
  readonly entradasConError: readonly FilaInboxSync[];
  readonly cursor: string | null;
  readonly ultimoIntentoEn: number | null;
  readonly ultimoEnvioExitosoEn: number | null;
  readonly ultimaDescargaExitosaEn: number | null;
  readonly ultimoError: ErrorSyncPersistido | null;
  readonly colaEstancada: boolean;
  readonly descargaAtrasada: boolean;
}

export type SaludSincronizacion =
  | 'SIN_SERVIDOR'
  | 'COMPROBANDO'
  | 'SIN_CONEXION'
  | 'CON_INCIDENCIAS'
  | 'ATRASADA'
  | 'PENDIENTE'
  | 'SIN_VERIFICAR'
  | 'SALUDABLE';

/**
 * Fotografia operativa del dispositivo. No infiere salud a partir de una sola
 * cola: combina PUSH, cuarentena, proyeccion del PULL y marcas durables de exito.
 */
export async function diagnosticarSincronizacion(
  db: BaseLocal,
  ahora: number,
): Promise<DiagnosticoSincronizacion> {
  const [
    pendientes,
    operacionesAntiguas,
    operacionesConReintentos,
    fallidasTotal,
    fallidas,
    entradasNoAplicadas,
    erroresProyeccion,
    entradasConError,
    metas,
  ] = await Promise.all([
    db.operacionesSync.count(),
    db.operacionesSync
      .where('creadoEn')
      .belowOrEqual(ahora - UMBRAL_COLA_ESTANCADA_MS)
      .count(),
    db.operacionesSync
      .filter((fila) => fila.intentos >= 3)
      .limit(1)
      .count(),
    db.fallidos.count(),
    db.fallidos.orderBy('registradoEn').reverse().limit(100).toArray(),
    db.inboxSync.where('aplicado').equals(0).count(),
    db.inboxSync
      .where('aplicado')
      .equals(0)
      .filter((fila) => fila.error !== null)
      .count(),
    db.inboxSync
      .where('aplicado')
      .equals(0)
      .filter((fila) => fila.error !== null)
      .limit(100)
      .toArray(),
    db.meta.bulkGet([
      CLAVE_CURSOR,
      CLAVE_ULTIMO_INTENTO_SYNC,
      CLAVE_ULTIMO_ENVIO_EXITOSO,
      CLAVE_ULTIMA_DESCARGA_EXITOSA,
      CLAVE_ULTIMO_ERROR_SYNC,
    ]),
  ]);

  const cursor = valorTexto(metas[0]?.valor);
  const ultimoIntentoEn = valorNumero(metas[1]?.valor);
  const ultimoEnvioExitosoEn = valorNumero(metas[2]?.valor);
  const ultimaDescargaExitosaEn = valorNumero(metas[3]?.valor);
  const ultimoError = valorError(metas[4]?.valor);
  const colaEstancada = operacionesAntiguas > 0 || operacionesConReintentos > 0;

  return {
    pendientes,
    fallidasTotal,
    fallidas,
    entradasNoAplicadas,
    erroresProyeccion,
    entradasConError,
    cursor,
    ultimoIntentoEn,
    ultimoEnvioExitosoEn,
    ultimaDescargaExitosaEn,
    ultimoError,
    colaEstancada,
    descargaAtrasada:
      ultimaDescargaExitosaEn !== null &&
      ahora - ultimaDescargaExitosaEn >= UMBRAL_DESCARGA_ATRASADA_MS,
  };
}

/** La unica puerta para mostrar "Todo sincronizado". */
export function clasificarSaludSincronizacion(
  diagnostico: DiagnosticoSincronizacion | null,
  contexto: { readonly centralConfigurado: boolean; readonly enLinea: boolean },
): SaludSincronizacion {
  if (!contexto.centralConfigurado) return 'SIN_SERVIDOR';
  if (diagnostico === null) return 'COMPROBANDO';
  if (
    diagnostico.fallidasTotal > 0 ||
    diagnostico.erroresProyeccion > 0 ||
    diagnostico.ultimoError !== null
  ) {
    return 'CON_INCIDENCIAS';
  }
  if (!contexto.enLinea) return 'SIN_CONEXION';
  if (diagnostico.colaEstancada || diagnostico.descargaAtrasada) return 'ATRASADA';
  if (diagnostico.pendientes > 0 || diagnostico.entradasNoAplicadas > 0) return 'PENDIENTE';
  if (diagnostico.ultimaDescargaExitosaEn === null) return 'SIN_VERIFICAR';
  return 'SALUDABLE';
}

function valorTexto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
}

function valorNumero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

function valorError(valor: unknown): ErrorSyncPersistido | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const posible = valor as { mensaje?: unknown; ocurridoEn?: unknown };
  return typeof posible.mensaje === 'string' && typeof posible.ocurridoEn === 'number'
    ? { mensaje: posible.mensaje, ocurridoEn: posible.ocurridoEn }
    : null;
}
