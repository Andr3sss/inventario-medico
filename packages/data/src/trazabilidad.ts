import Dexie from 'dexie';
import { codigoPieza as crearCodigoPieza, type Evento } from '@crearcos/core';
import type { BaseLocal } from './db.js';

/**
 * Historial completo de una pieza, mas antiguo primero: la base de la
 * trazabilidad que pide el brief (punto "Objetivo principal" del encargo) y de
 * cualquier timeline que construya Codex.
 *
 * Se ordena por el indice compuesto [codigo+hlc], la unica fuente de orden
 * entre dispositivos (decision 3): nunca por `sobre.registradoEn`, que es solo
 * el reloj de pared local y puede estar mal.
 */
export async function historialDePieza(db: BaseLocal, codigo: string): Promise<readonly Evento[]> {
  const codigoPieza = crearCodigoPieza(codigo);
  const filas = await db.eventos
    .where('[codigo+hlc]')
    .between([codigoPieza, Dexie.minKey], [codigoPieza, Dexie.maxKey])
    .toArray();
  return filas.map((fila) => fila.evento);
}
