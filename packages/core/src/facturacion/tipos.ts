import type { Centavos } from '../comun/dinero.js';
import type { CodigoPieza, FacturaId, HospitalId, MaletaId, Sku } from '../comun/marcas.js';
import type { PrecioResuelto } from '../precios/tipos.js';

/**
 * BORRADOR: se genero al cerrar la maleta, con el precio ya resuelto por linea.
 * El Contable la revisa antes de emitirla; nada de esto pasa por el frontend.
 * EMITIDA: terminal. A partir de aqui cada pieza de instrumental ya recibio su
 * evento CONFIRMAR_FACTURA y quedo en FACTURADA o CONSUMIDA.
 */
export type EstadoFactura = 'BORRADOR' | 'EMITIDA';

export interface LineaFactura {
  readonly codigoPieza: CodigoPieza;
  readonly sku: Sku;
  readonly nombre: string;
  readonly precio: PrecioResuelto;
}

export interface Factura {
  readonly id: FacturaId;
  readonly maletaId: MaletaId;
  readonly hospitalId: HospitalId;
  readonly estado: EstadoFactura;
  readonly lineas: readonly LineaFactura[];
  readonly total: Centavos;
  readonly creadaEn: string;
  readonly emitidaEn: string | null;
}
