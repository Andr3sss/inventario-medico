import type { Factura, Maleta } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import { listarConflictos, type ConflictoConPieza } from './conflictos.js';

/**
 * Notificaciones del Supervisor (brief §11.5, punto que estaba abierto). El
 * rol "Pantalla de solo notificacion / lectura general" (brief §4) no escribe
 * nada: esto es una vista agregada de datos que ya existen, sin tabla propia.
 *
 * Decision tomada con el usuario, las tres senales que le importan:
 *  - Conflictos abiertos (ya existia `listarConflictos`).
 *  - Maletas que llevan demasiado tiempo fuera de bodega.
 *  - Facturas en borrador bloqueadas por una aprobacion de precio pendiente.
 */
export interface OpcionesNotificaciones {
  readonly ahora: () => number;
  /**
   * Umbral para considerar una maleta demorada. Sin numero en el brief, se
   * documenta el default en vez de asumirlo en silencio (decisiones.md): una
   * jornada quirurgica tipica no debería superar las 8 horas fuera de bodega.
   */
  readonly umbralMaletaDemoradaMs?: number;
}

export const UMBRAL_MALETA_DEMORADA_MS_DEFECTO = 8 * 60 * 60 * 1000;

export interface Notificaciones {
  readonly conflictosAbiertos: readonly ConflictoConPieza[];
  readonly maletasDemoradas: readonly Maleta[];
  readonly facturasBloqueadas: readonly Factura[];
  readonly total: number;
}

function facturaBloqueada(factura: Factura): boolean {
  return factura.estado === 'BORRADOR' && factura.lineas.some((linea) => linea.precio.requiereAprobacion);
}

/**
 * Compone las tres senales en una sola llamada porque el Supervisor no tiene
 * (ni necesita) mas de una pantalla: es una lectura, no un flujo con pasos.
 */
export async function obtenerNotificaciones(
  db: BaseLocal,
  opciones: OpcionesNotificaciones,
): Promise<Notificaciones> {
  const umbral = opciones.umbralMaletaDemoradaMs ?? UMBRAL_MALETA_DEMORADA_MS_DEFECTO;
  const ahora = opciones.ahora();

  const [conflictosAbiertos, maletasEnCirugia, facturas] = await Promise.all([
    listarConflictos(db, { estado: 'ABIERTO' }),
    db.maletas.where('estado').equals('EN_CIRUGIA').toArray(),
    db.facturas.toArray(),
  ]);

  const maletasDemoradas = maletasEnCirugia.filter((maleta) => {
    if (maleta.salioEn === null) return false;
    const salida = Date.parse(maleta.salioEn);
    return !Number.isNaN(salida) && ahora - salida > umbral;
  });

  const facturasBloqueadas = facturas.filter(facturaBloqueada);

  return {
    conflictosAbiertos,
    maletasDemoradas,
    facturasBloqueadas,
    total: conflictosAbiertos.length + maletasDemoradas.length + facturasBloqueadas.length,
  };
}
