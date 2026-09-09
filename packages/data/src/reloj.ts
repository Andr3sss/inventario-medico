import { hlcInicial, marcar, serializar, type DispositivoId, type Hlc } from '@crearcos/core';
import { CLAVE_RELOJ, type BaseLocal } from './db.js';

/**
 * Reloj logico persistido.
 *
 * Se guarda en la misma transaccion que el evento. Si el dispositivo se apaga
 * entre marcar el reloj y escribir el escaneo, no queda un hueco en la
 * secuencia ni un contador adelantado sin evento que lo respalde.
 */
export async function leerReloj(db: BaseLocal, dispositivo: DispositivoId): Promise<Hlc> {
  const fila = await db.meta.get(CLAVE_RELOJ);
  if (fila === undefined) return hlcInicial(dispositivo);
  const valor = fila.valor as Partial<Hlc> | undefined;
  if (
    valor === undefined ||
    typeof valor.milis !== 'number' ||
    typeof valor.contador !== 'number'
  ) {
    return hlcInicial(dispositivo);
  }
  return { milis: valor.milis, contador: valor.contador, dispositivo };
}

export async function avanzarReloj(
  db: BaseLocal,
  dispositivo: DispositivoId,
  relojPared: number,
): Promise<Hlc> {
  const actual = await leerReloj(db, dispositivo);
  const siguiente = marcar(actual, relojPared);
  await db.meta.put({ clave: CLAVE_RELOJ, valor: siguiente });
  return siguiente;
}

/** Extrae los milisegundos de un HLC serializado. */
export function milisDe(hlcSerializado: string): number {
  const parte = hlcSerializado.split(':')[0];
  const valor = parte === undefined ? Number.NaN : Number.parseInt(parte, 10);
  return Number.isNaN(valor) ? 0 : valor;
}

export { serializar as serializarHlc };
