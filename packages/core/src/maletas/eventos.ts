import type { FacturaId, HospitalId, MaletaId } from '../comun/marcas.js';
import type { Rol } from '../estados/tipos.js';
import type { Sobre } from '../eventos/tipos.js';

/**
 * Eventos que mueven a la maleta como entidad, separados de los eventos de
 * Pieza. MALETA_ABIERTA no pasa por `aplicarEventoMaleta`: es el punto de
 * partida, igual que una Pieza sembrada nace en EN_BODEGA_CENTRAL sin pasar
 * por la maquina de estados.
 */
export type CuerpoEventoMaleta =
  | {
      readonly tipo: 'MALETA_ABIERTA';
      readonly maletaId: MaletaId;
      readonly procedimiento: string | null;
    }
  | { readonly tipo: 'MALETA_SALIO'; readonly maletaId: MaletaId }
  | {
      readonly tipo: 'MALETA_CERRADA';
      readonly maletaId: MaletaId;
      readonly hospitalId: HospitalId;
      /** UUID del borrador para que servidor y replica conserven la misma identidad. */
      readonly facturaId?: FacturaId;
    }
  | { readonly tipo: 'MALETA_CANCELADA'; readonly maletaId: MaletaId; readonly motivo: string };

export type TipoEventoMaleta = CuerpoEventoMaleta['tipo'];

export interface EventoMaleta {
  readonly sobre: Sobre;
  readonly cuerpo: CuerpoEventoMaleta;
}

/**
 * Duplicada a proposito del lado del dispositivo, igual que ROLES_PERMITIDOS
 * de Pieza: el dispositivo esta offline y tiene que poder rechazar la
 * operacion en el momento.
 */
export const ROLES_PERMITIDOS_MALETA: Readonly<Record<TipoEventoMaleta, readonly Rol[]>> = {
  MALETA_ABIERTA: ['AUXILIAR', 'COORDINADORA', 'ADMINISTRADOR'],
  MALETA_SALIO: ['AUXILIAR', 'COORDINADORA'],
  MALETA_CERRADA: ['AUXILIAR', 'COORDINADORA'],
  MALETA_CANCELADA: ['AUXILIAR', 'COORDINADORA'],
};
