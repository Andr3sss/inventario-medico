/**
 * Tipos marcados (branded types).
 *
 * Un `string` puede pasarse a cualquier parametro `string`. En este dominio hay
 * seis identificadores distintos que son todos texto, y confundir un codigo de
 * pieza con un id de maleta produce corrupcion de inventario silenciosa.
 * Marcarlos hace que el compilador rechace la confusion.
 */
declare const marca: unique symbol;

export type Marcado<T, M extends string> = T & { readonly [marca]: M };

export type Sku = Marcado<string, 'Sku'>;
export type CodigoPieza = Marcado<string, 'CodigoPieza'>;
export type MaletaId = Marcado<string, 'MaletaId'>;
export type HospitalId = Marcado<string, 'HospitalId'>;
export type UsuarioId = Marcado<string, 'UsuarioId'>;
export type EventoId = Marcado<string, 'EventoId'>;
export type DispositivoId = Marcado<string, 'DispositivoId'>;
export type ConflictoId = Marcado<string, 'ConflictoId'>;
export type FacturaId = Marcado<string, 'FacturaId'>;

const noVacio = (valor: string, nombre: string): string => {
  const limpio = valor.trim();
  if (limpio.length === 0) {
    throw new Error(`${nombre} no puede estar vacio`);
  }
  return limpio;
};

export const sku = (v: string): Sku => noVacio(v, 'Sku') as Sku;
export const codigoPieza = (v: string): CodigoPieza => noVacio(v, 'CodigoPieza') as CodigoPieza;
export const maletaId = (v: string): MaletaId => noVacio(v, 'MaletaId') as MaletaId;
export const hospitalId = (v: string): HospitalId => noVacio(v, 'HospitalId') as HospitalId;
export const usuarioId = (v: string): UsuarioId => noVacio(v, 'UsuarioId') as UsuarioId;
export const eventoId = (v: string): EventoId => noVacio(v, 'EventoId') as EventoId;
export const dispositivoId = (v: string): DispositivoId =>
  noVacio(v, 'DispositivoId') as DispositivoId;
export const conflictoId = (v: string): ConflictoId => noVacio(v, 'ConflictoId') as ConflictoId;
export const facturaId = (v: string): FacturaId => noVacio(v, 'FacturaId') as FacturaId;
