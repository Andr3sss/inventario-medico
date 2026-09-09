import {
  BODEGA_CENTRAL,
  codigoPieza,
  dispositivoId,
  sku,
  usuarioId,
  type EstadoPieza,
  type Pieza,
} from '@crearcos/core';
import { BaseLocal } from '../db.js';
import type { Sesion } from '../escaneo.js';
import type { FuenteAzar } from '../identificadores.js';

let contador = 0;

/** Base limpia por prueba. Nombre unico para que no compartan estado. */
export async function baseDePrueba(): Promise<BaseLocal> {
  contador += 1;
  const db = new BaseLocal(`prueba-${contador.toString()}`);
  await db.open();
  return db;
}

/**
 * Azar determinista pero variable. Con un valor constante, dos identificadores
 * generados en el mismo milisegundo saldrian iguales y chocarian, que es
 * exactamente lo que este contador evita.
 */
let paso = 0;
export const AZAR_FIJO: FuenteAzar = {
  enteroAleatorio: (maximo: number): number => {
    paso = (paso * 1103515245 + 12345) >>> 0;
    return paso % maximo;
  },
};

export const SESION: Sesion = {
  usuarioId: usuarioId('u-aux-1'),
  rol: 'AUXILIAR',
  dispositivoId: dispositivoId('PC-BODEGA-01'),
};

export const CODIGO = codigoPieza('INS-4471');

export function piezaDe(parcial: Partial<Pieza> = {}): Pieza {
  return {
    codigo: CODIGO,
    sku: sku('TIJERA-MAYO-14'),
    tipo: 'INSTRUMENTAL',
    estado: 'EN_BODEGA_CENTRAL' satisfies EstadoPieza,
    ubicacion: BODEGA_CENTRAL,
    maletaId: null,
    parentCodigo: null,
    version: 1,
    hlc: '000000000000000:00000:SEMILLA',
    ...parcial,
  };
}

/** Reloj controlado: avanza solo cuando la prueba lo dice. */
export function relojFalso(inicio = 1_700_000_000_000): {
  ahora: () => number;
  avanzar: (ms: number) => void;
  retroceder: (ms: number) => void;
} {
  let actual = inicio;
  return {
    ahora: () => actual,
    avanzar: (ms: number) => {
      actual += ms;
    },
    retroceder: (ms: number) => {
      actual -= ms;
    },
  };
}
