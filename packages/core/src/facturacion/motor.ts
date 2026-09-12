import { sumar, type Centavos } from '../comun/dinero.js';
import { fallo, ok, type Resultado } from '../comun/resultado.js';
import type { FacturaId, HospitalId, MaletaId } from '../comun/marcas.js';
import type { Factura, LineaFactura } from './tipos.js';

export type CodigoErrorFactura =
  | 'SIN_LINEAS'
  | 'FACTURA_NO_ES_BORRADOR'
  | 'LINEA_BLOQUEADA_POR_APROBACION';

export interface ErrorFactura {
  readonly codigo: CodigoErrorFactura;
  readonly mensaje: string;
  /** Codigos de pieza bloqueados, solo cuando el codigo es LINEA_BLOQUEADA_POR_APROBACION. */
  readonly codigosBloqueados: readonly string[];
}

/** Arma el borrador. Pura: no decide que piezas entran, eso lo hace el llamador. */
export function armarBorrador(
  id: FacturaId,
  maletaId: MaletaId,
  hospitalId: HospitalId,
  lineas: readonly LineaFactura[],
  creadaEn: string,
): Resultado<Factura, ErrorFactura> {
  if (lineas.length === 0) {
    return fallo({ codigo: 'SIN_LINEAS', mensaje: 'No hay piezas usadas para facturar', codigosBloqueados: [] });
  }
  const total: Centavos = sumar(...lineas.map((l) => l.precio.valor));
  return ok({ id, maletaId, hospitalId, estado: 'BORRADOR', lineas, total, creadaEn, emitidaEn: null });
}

/**
 * Emite la factura. Bloquea si alguna linea trae un precio aleatorio
 * pendiente de aprobacion de gerencia: dejarla pasar equivaldria a que el
 * Contable facture sin que nadie haya aprobado el valor negociado (decision 12).
 */
export function emitirFactura(factura: Factura, emitidaEn: string): Resultado<Factura, ErrorFactura> {
  if (factura.estado !== 'BORRADOR') {
    return fallo({
      codigo: 'FACTURA_NO_ES_BORRADOR',
      mensaje: `La factura esta ${factura.estado}, no se puede volver a emitir`,
      codigosBloqueados: [],
    });
  }

  const bloqueadas = factura.lineas.filter((l) => l.precio.requiereAprobacion);
  if (bloqueadas.length > 0) {
    return fallo({
      codigo: 'LINEA_BLOQUEADA_POR_APROBACION',
      mensaje: 'Hay lineas con precio aleatorio pendiente de aprobacion de gerencia',
      codigosBloqueados: bloqueadas.map((l) => l.codigoPieza),
    });
  }

  return ok({ ...factura, estado: 'EMITIDA', emitidaEn });
}
