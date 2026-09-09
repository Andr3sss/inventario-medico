import type { Marcado } from './marcas.js';

/**
 * Dinero en centavos enteros, nunca en decimales flotantes.
 *
 * 0.1 + 0.2 no es 0.3 en punto flotante. Con cuatro niveles de precio y
 * facturas que se emiten desde el celular, un centavo de deriva por linea se
 * vuelve una diferencia contable que nadie puede explicar tres meses despues.
 * Moneda de trabajo: USD (Ecuador).
 */
export type Centavos = Marcado<number, 'Centavos'>;

export function centavos(valor: number): Centavos {
  if (!Number.isInteger(valor)) {
    throw new Error(`Centavos debe ser entero, se recibio ${String(valor)}`);
  }
  if (valor < 0) {
    throw new Error(`Centavos no puede ser negativo, se recibio ${String(valor)}`);
  }
  if (!Number.isSafeInteger(valor)) {
    throw new Error(`Centavos fuera del rango seguro: ${String(valor)}`);
  }
  return valor as Centavos;
}

export const CERO = 0 as Centavos;

/**
 * Aplica un factor expresado en porcentaje entero (110 = costo + 10%).
 * Redondeo mitad hacia arriba con aritmetica entera, sin division flotante.
 */
export function aplicarPorcentaje(base: Centavos, porcentaje: number): Centavos {
  if (!Number.isInteger(porcentaje) || porcentaje <= 0) {
    throw new Error(`Porcentaje invalido: ${String(porcentaje)}`);
  }
  const total = base * porcentaje;
  const entero = Math.floor(total / 100);
  const residuo = total % 100;
  return centavos(residuo >= 50 ? entero + 1 : entero);
}

export function sumar(...valores: readonly Centavos[]): Centavos {
  return centavos(valores.reduce<number>((acumulado, v) => acumulado + v, 0));
}

export function formatearUSD(valor: Centavos): string {
  const entero = Math.floor(valor / 100);
  const decimal = (valor % 100).toString().padStart(2, '0');
  return `$${entero.toString()}.${decimal}`;
}
