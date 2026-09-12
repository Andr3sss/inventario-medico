import type { HospitalId, MaletaId, UsuarioId } from '../comun/marcas.js';

/**
 * Estado de la maleta como entidad propia, independiente del estado de cada
 * pieza que contiene.
 *
 * EN_ARMADO      El auxiliar esta escaneando piezas hacia la maleta. Todavia
 *                no salio de bodega.
 * EN_CIRUGIA     Confirmo la salida: sus piezas pasaron a EN_MALETA_ACTIVA.
 *                Punto 8.1 del brief: "sin precio ni institucion asignados".
 * CERRADA        Regreso de cirugia, se le asigno el hospital y lo no usado
 *                ya se mando a reprocesamiento. A partir de aqui existe la
 *                Factura en borrador.
 * CANCELADA      Se armo por error y se descarto antes de salir de bodega.
 */
export type EstadoMaleta = 'EN_ARMADO' | 'EN_CIRUGIA' | 'CERRADA' | 'CANCELADA';

export const ESTADOS_TERMINALES_MALETA = ['CERRADA', 'CANCELADA'] as const satisfies readonly EstadoMaleta[];

export interface Maleta {
  readonly id: MaletaId;
  /** Auxiliar o Coordinadora que arma y responde por la maleta. */
  readonly responsableId: UsuarioId;
  /** Texto libre informativo (ej. "Osteosintesis de radio"). No es una entidad Cirugia todavia. */
  readonly procedimiento: string | null;
  /**
   * Nulo mientras la maleta esta en armado o en cirugia. El brief es explicito:
   * el hospital se conoce recien al cierre, nunca antes.
   */
  readonly hospitalId: HospitalId | null;
  readonly estado: EstadoMaleta;
  readonly creadaEn: string;
  readonly salioEn: string | null;
  readonly cerradaEn: string | null;
  readonly canceladaEn: string | null;
  /** Se incrementa en cada transicion. Compare-and-swap al sincronizar, igual que Pieza.version. */
  readonly version: number;
}
