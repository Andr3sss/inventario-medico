import type { CodigoPieza, MaletaId, Sku, UsuarioId } from '../comun/marcas.js';

/** Estado unico de una pieza fisica en todo el sistema. */
export type EstadoPieza =
  | 'EN_BODEGA_CENTRAL'
  | 'EN_BODEGA_INSTRUMENTISTA'
  | 'ASIGNADA_A_MALETA'
  | 'EN_MALETA_ACTIVA'
  | 'USADA_PENDIENTE_VALORACION'
  | 'FACTURADA'
  | 'CONSUMIDA'
  | 'EN_REPROCESAMIENTO'
  | 'EN_CONFLICTO'
  | 'EXTRAVIADA';

/** Estados de los que ya no se sale. Un evento sobre ellos es un error de flujo. */
export const ESTADOS_TERMINALES = [
  'CONSUMIDA',
  'EXTRAVIADA',
] as const satisfies readonly EstadoPieza[];

export type EstadoTerminal = (typeof ESTADOS_TERMINALES)[number];

export function esTerminal(estado: EstadoPieza): estado is EstadoTerminal {
  return (ESTADOS_TERMINALES as readonly EstadoPieza[]).includes(estado);
}

/**
 * INSTRUMENTAL: activo fijo, se reprocesa indefinidamente.
 * INSUMO: consumible, sale del inventario al facturarse.
 * KIT: caja padre que agrupa piezas hijas con codigo propio.
 */
export type TipoPieza = 'INSTRUMENTAL' | 'INSUMO' | 'KIT';

export type Ubicacion =
  | { readonly clase: 'BODEGA_CENTRAL' }
  | { readonly clase: 'BODEGA_INSTRUMENTISTA'; readonly usuarioId: UsuarioId };

export const BODEGA_CENTRAL: Ubicacion = { clase: 'BODEGA_CENTRAL' };

export function bodegaDe(usuario: UsuarioId): Ubicacion {
  return { clase: 'BODEGA_INSTRUMENTISTA', usuarioId: usuario };
}

export function mismaUbicacion(a: Ubicacion, b: Ubicacion): boolean {
  if (a.clase !== b.clase) return false;
  if (a.clase === 'BODEGA_INSTRUMENTISTA' && b.clase === 'BODEGA_INSTRUMENTISTA') {
    return a.usuarioId === b.usuarioId;
  }
  return true;
}

/** Estado en reposo que corresponde a una ubicacion. */
export function estadoEnReposo(ubicacion: Ubicacion): EstadoPieza {
  return ubicacion.clase === 'BODEGA_CENTRAL' ? 'EN_BODEGA_CENTRAL' : 'EN_BODEGA_INSTRUMENTISTA';
}

export interface Pieza {
  readonly codigo: CodigoPieza;
  readonly sku: Sku;
  readonly tipo: TipoPieza;
  readonly estado: EstadoPieza;
  /** Bodega a la que la pieza debe volver cuando queda en reposo. */
  readonly ubicacion: Ubicacion;
  readonly maletaId: MaletaId | null;
  /** Codigo de la caja padre si esta pieza es un componente de un kit. */
  readonly parentCodigo: CodigoPieza | null;
  /** Se incrementa en cada evento aplicado. Base del compare-and-swap al sincronizar. */
  readonly version: number;
  /** HLC serializado del ultimo evento aplicado. */
  readonly hlc: string;
}

/**
 * SISTEMA no es una persona. Es el actor de los eventos que nacen del motor de
 * sincronizacion, como marcar una pieza en conflicto. Separarlo evita
 * atribuirle a un auxiliar una accion que nunca ejecuto.
 */
export type Rol =
  | 'SISTEMA'
  | 'ADMINISTRADOR'
  | 'AUXILIAR'
  | 'COORDINADORA'
  | 'CONTABLE'
  | 'SUPERVISOR'
  | 'FREELANCE';
