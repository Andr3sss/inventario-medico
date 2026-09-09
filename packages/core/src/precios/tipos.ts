import type { Centavos } from '../comun/dinero.js';
import type { HospitalId, Sku } from '../comun/marcas.js';

/** Los cuatro niveles del brief, expresados como porcentaje entero sobre el costo. */
export type NivelPrecio = 'BASE' | 'HABITUAL' | 'PROVINCIA' | 'NOTA_CREDITO';

export const PORCENTAJE_NIVEL: Readonly<Record<NivelPrecio, number>> = {
  BASE: 100,
  HABITUAL: 110,
  PROVINCIA: 120,
  NOTA_CREDITO: 130,
};

/** Nivel que se puede configurar por hospital. BASE es costo interno, no se factura. */
export type NivelFacturable = Exclude<NivelPrecio, 'BASE'>;

export interface Hospital {
  readonly id: HospitalId;
  readonly nombre: string;
  readonly ciudad: string;
  readonly nivelPorDefecto: NivelFacturable;
}

export type EstadoAprobacion = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

/** Precio negociado puntualmente. Requiere aprobacion de gerencia antes de facturar. */
export interface ExcepcionPrecio {
  readonly sku: Sku;
  readonly hospitalId: HospitalId;
  readonly valor: Centavos;
  readonly estado: EstadoAprobacion;
  readonly vigenteDesde: string;
  readonly vigenteHasta: string | null;
}

export type TipoPrecioAplicado = NivelFacturable | 'ALEATORIO';

export interface PrecioResuelto {
  readonly valor: Centavos;
  readonly tipo: TipoPrecioAplicado;
  /** Si es true, la linea queda bloqueada y el Contable no puede emitir. */
  readonly requiereAprobacion: boolean;
  /** Traza legible para auditoria. */
  readonly explicacion: string;
}
