import {
  codigoPieza,
  dispositivoId,
  eventoId,
  maletaId,
  sku,
  usuarioId,
  type CodigoPieza,
} from '../comun/marcas.js';
import { BODEGA_CENTRAL, type Pieza, type Rol } from '../estados/tipos.js';
import type { CuerpoEvento, Evento } from '../eventos/tipos.js';
import type { CuerpoEventoMaleta, EventoMaleta } from '../maletas/eventos.js';
import type { Maleta } from '../maletas/tipos.js';

/** Constructores para pruebas. Fuera de pruebas no se usan. */
export function piezaDe(parcial: Partial<Pieza> = {}): Pieza {
  return {
    codigo: codigoPieza('INS-4471'),
    sku: sku('TIJERA-MAYO-14'),
    tipo: 'INSTRUMENTAL',
    estado: 'EN_BODEGA_CENTRAL',
    ubicacion: BODEGA_CENTRAL,
    maletaId: null,
    parentCodigo: null,
    version: 1,
    hlc: '000000000000000:00000:PC-BODEGA-01',
    ...parcial,
  };
}

let secuencia = 0;

export function eventoDe(cuerpo: CuerpoEvento, rol: Rol, milis = 1_700_000_000_000): Evento {
  secuencia += 1;
  return {
    sobre: {
      eventoId: eventoId(`ev-${secuencia.toString().padStart(4, '0')}`),
      hlc: `${milis.toString().padStart(15, '0')}:${secuencia.toString().padStart(5, '0')}:PC-BODEGA-01`,
      dispositivoId: dispositivoId('PC-BODEGA-01'),
      usuarioId: usuarioId('u-auxiliar'),
      rol,
      registradoEn: new Date(milis).toISOString(),
    },
    cuerpo,
  };
}

export const MALETA_A = maletaId('MAL-882');
export const MALETA_B = maletaId('MAL-885');
export const CODIGO: CodigoPieza = codigoPieza('INS-4471');

export function maletaDe(parcial: Partial<Maleta> = {}): Maleta {
  return {
    id: MALETA_A,
    responsableId: usuarioId('u-aux-1'),
    procedimiento: 'Trauma menor',
    hospitalId: null,
    estado: 'EN_ARMADO',
    creadaEn: '2026-01-05T08:00:00.000Z',
    salioEn: null,
    cerradaEn: null,
    canceladaEn: null,
    version: 1,
    ...parcial,
  };
}

let secuenciaMaleta = 0;

export function eventoMaletaDe(
  cuerpo: CuerpoEventoMaleta,
  rol: Rol,
  milis = 1_700_000_000_000,
): EventoMaleta {
  secuenciaMaleta += 1;
  return {
    sobre: {
      eventoId: eventoId(`ev-mal-${secuenciaMaleta.toString().padStart(4, '0')}`),
      hlc: `${milis.toString().padStart(15, '0')}:${secuenciaMaleta.toString().padStart(5, '0')}:PC-BODEGA-01`,
      dispositivoId: dispositivoId('PC-BODEGA-01'),
      usuarioId: usuarioId('u-auxiliar'),
      rol,
      registradoEn: new Date(milis).toISOString(),
    },
    cuerpo,
  };
}
