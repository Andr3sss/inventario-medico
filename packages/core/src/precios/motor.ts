import { aplicarPorcentaje, type Centavos } from '../comun/dinero.js';
import { fallo, ok, type Resultado } from '../comun/resultado.js';
import type { Sku } from '../comun/marcas.js';
import {
  PORCENTAJE_NIVEL,
  type ExcepcionPrecio,
  type Hospital,
  type NivelFacturable,
  type PrecioResuelto,
} from './tipos.js';

export type CodigoErrorPrecio =
  'COSTO_NO_DEFINIDO' | 'EXCEPCION_DE_OTRO_HOSPITAL' | 'EXCEPCION_DE_OTRO_SKU';

export interface ErrorPrecio {
  readonly codigo: CodigoErrorPrecio;
  readonly mensaje: string;
}

export interface EntradaPrecio {
  readonly sku: Sku;
  readonly costoBase: Centavos;
  readonly hospital: Hospital;
  /** Ciudad sede de la empresa. Fuera de ella aplica piso de provincia. */
  readonly ciudadBase: string;
  readonly excepcion: ExcepcionPrecio | null;
  /** El tiempo se inyecta siempre. Nunca se lee el reloj dentro del dominio. */
  readonly ahora: Date;
}

const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

function excepcionVigente(excepcion: ExcepcionPrecio, ahora: Date): boolean {
  const desde = Date.parse(excepcion.vigenteDesde);
  if (Number.isNaN(desde) || ahora.getTime() < desde) return false;
  if (excepcion.vigenteHasta === null) return true;
  const hasta = Date.parse(excepcion.vigenteHasta);
  return !Number.isNaN(hasta) && ahora.getTime() <= hasta;
}

/**
 * Resuelve el precio de una linea contra la matriz del brief.
 *
 * Reglas que no son obvias y estan aqui a proposito:
 *  - Provincia es un piso, no un reemplazo. Un hospital de provincia que ademas
 *    factura con nota de credito paga el mayor de los dos, nunca el menor.
 *  - Una excepcion pendiente devuelve su valor pero marcada como bloqueante, no
 *    cae al precio habitual. Si cayera, el Contable podria facturar sin notar
 *    que gerencia jamas aprobo nada.
 *  - Una excepcion rechazada o vencida se ignora y se sigue con la matriz.
 */
export function resolverPrecio(entrada: EntradaPrecio): Resultado<PrecioResuelto, ErrorPrecio> {
  const { sku, costoBase, hospital, ciudadBase, excepcion, ahora } = entrada;

  if (costoBase <= 0) {
    return fallo({
      codigo: 'COSTO_NO_DEFINIDO',
      mensaje: `El SKU ${sku} no tiene costo base cargado`,
    });
  }

  if (excepcion !== null) {
    if (excepcion.sku !== sku) {
      return fallo({
        codigo: 'EXCEPCION_DE_OTRO_SKU',
        mensaje: `La excepcion es del SKU ${excepcion.sku} y la linea es ${sku}`,
      });
    }
    if (excepcion.hospitalId !== hospital.id) {
      return fallo({
        codigo: 'EXCEPCION_DE_OTRO_HOSPITAL',
        mensaje: `La excepcion pertenece al hospital ${excepcion.hospitalId}`,
      });
    }

    if (excepcion.estado !== 'RECHAZADO' && excepcionVigente(excepcion, ahora)) {
      const pendiente = excepcion.estado === 'PENDIENTE';
      return ok({
        valor: excepcion.valor,
        tipo: 'ALEATORIO',
        requiereAprobacion: pendiente,
        explicacion: pendiente
          ? 'Precio aleatorio pendiente de aprobacion de gerencia'
          : 'Precio aleatorio aprobado por gerencia',
      });
    }
  }

  const nivel = nivelAplicable(hospital, ciudadBase);
  const porcentaje = PORCENTAJE_NIVEL[nivel];
  return ok({
    valor: aplicarPorcentaje(costoBase, porcentaje),
    tipo: nivel,
    requiereAprobacion: false,
    explicacion: `Nivel ${nivel} (costo + ${(porcentaje - 100).toString()}%)`,
  });
}

/** Toma el nivel configurado del hospital y le aplica el piso de provincia. */
export function nivelAplicable(hospital: Hospital, ciudadBase: string): NivelFacturable {
  const fueraDeCiudad = normalizar(hospital.ciudad) !== normalizar(ciudadBase);
  if (!fueraDeCiudad) return hospital.nivelPorDefecto;
  return PORCENTAJE_NIVEL[hospital.nivelPorDefecto] >= PORCENTAJE_NIVEL.PROVINCIA
    ? hospital.nivelPorDefecto
    : 'PROVINCIA';
}
