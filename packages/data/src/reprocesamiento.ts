import {
  codigoPieza as crearCodigoPieza,
  normalizarPagina,
  type Pagina,
  type Pieza,
  type Resultado,
  type Ubicacion,
} from '@crearcos/core';
import type { BaseLocal } from './db.js';
import { registrarEvento, type ErrorRegistro, type OpcionesRegistro, type RegistroAplicado, type Sesion } from './escaneo.js';

/** Piezas esperando su ciclo de reesterilizacion. Sin paginacion no habria techo a la lista. */
export async function listarEnReprocesamiento(
  db: BaseLocal,
  opciones: { readonly pagina?: number; readonly porPagina?: number } = {},
): Promise<Pagina<Pieza>> {
  const todas = await db.piezas.where('estado').equals('EN_REPROCESAMIENTO').toArray();
  const ordenadas = [...todas].sort((a, b) => a.hlc.localeCompare(b.hlc));
  const { pagina, porPagina } = normalizarPagina(opciones);
  const inicio = (pagina - 1) * porPagina;
  return { items: ordenadas.slice(inicio, inicio + porPagina), total: ordenadas.length, pagina, porPagina };
}

/**
 * Cierra el ciclo: la pieza reesterilizada vuelve a bodega central o a la
 * bodega del instrumentista, sin limite de veces (punto 6 del brief).
 */
export async function finReproceso(
  db: BaseLocal,
  codigo: string,
  destino: Ubicacion,
  sesion: Sesion,
  opciones: OpcionesRegistro,
): Promise<Resultado<RegistroAplicado, ErrorRegistro>> {
  return registrarEvento(db, { tipo: 'FIN_REPROCESO', codigo: crearCodigoPieza(codigo), destino }, sesion, opciones);
}

/**
 * Envia manualmente una pieza a reprocesamiento fuera del cierre de maleta,
 * por ejemplo un instrumento que la Coordinadora recupera suelto.
 */
export async function ingresoReproceso(
  db: BaseLocal,
  codigo: string,
  sesion: Sesion,
  opciones: OpcionesRegistro,
): Promise<Resultado<RegistroAplicado, ErrorRegistro>> {
  return registrarEvento(db, { tipo: 'INGRESO_REPROCESO', codigo: crearCodigoPieza(codigo) }, sesion, opciones);
}
