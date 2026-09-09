import type { DispositivoId } from '../comun/marcas.js';

/**
 * Reloj logico hibrido (Hybrid Logical Clock).
 *
 * Los celulares de los instrumentistas van a tener la hora mal, y un dispositivo
 * puede estar horas sin sincronizar. Ordenar eventos por `Date.now()` produce
 * historias imposibles (una pieza usada antes de salir de bodega). El HLC
 * combina el reloj de pared con un contador logico: nunca retrocede, aunque el
 * reloj del sistema si lo haga.
 *
 * Formato serializado, ordenable como texto:
 *   <milis 15 digitos>:<contador 5 digitos>:<dispositivo>
 */
export interface Hlc {
  readonly milis: number;
  readonly contador: number;
  readonly dispositivo: DispositivoId;
}

/** Tolerancia maxima frente a un reloj remoto adelantado, en milisegundos. */
export const DERIVA_MAXIMA_MS = 60 * 60 * 1000;

export function hlcInicial(dispositivo: DispositivoId): Hlc {
  return { milis: 0, contador: 0, dispositivo };
}

/** Avanza el reloj local al emitir un evento propio. */
export function marcar(actual: Hlc, relojPared: number): Hlc {
  if (relojPared > actual.milis) {
    return { milis: relojPared, contador: 0, dispositivo: actual.dispositivo };
  }
  return {
    milis: actual.milis,
    contador: actual.contador + 1,
    dispositivo: actual.dispositivo,
  };
}

/** Fusiona el reloj local con el de un evento recibido de otro dispositivo. */
export function recibir(local: Hlc, remoto: Hlc, relojPared: number): Hlc {
  const milis = Math.max(local.milis, remoto.milis, relojPared);

  if (remoto.milis - relojPared > DERIVA_MAXIMA_MS) {
    throw new Error(
      `Reloj remoto adelantado ${(remoto.milis - relojPared).toString()} ms, supera la deriva permitida`,
    );
  }

  if (milis === local.milis && milis === remoto.milis) {
    return {
      milis,
      contador: Math.max(local.contador, remoto.contador) + 1,
      dispositivo: local.dispositivo,
    };
  }
  if (milis === local.milis) {
    return { milis, contador: local.contador + 1, dispositivo: local.dispositivo };
  }
  if (milis === remoto.milis) {
    return { milis, contador: remoto.contador + 1, dispositivo: local.dispositivo };
  }
  return { milis, contador: 0, dispositivo: local.dispositivo };
}

/** Orden total. Negativo si a va antes que b. */
export function comparar(a: Hlc, b: Hlc): number {
  if (a.milis !== b.milis) return a.milis - b.milis;
  if (a.contador !== b.contador) return a.contador - b.contador;
  return a.dispositivo < b.dispositivo ? -1 : a.dispositivo > b.dispositivo ? 1 : 0;
}

export function serializar(h: Hlc): string {
  return `${h.milis.toString().padStart(15, '0')}:${h.contador.toString().padStart(5, '0')}:${h.dispositivo}`;
}
