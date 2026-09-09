import { describe, expect, it } from 'vitest';
import { aplicarPorcentaje, centavos, formatearUSD, sumar } from './dinero.js';

describe('dinero en centavos enteros', () => {
  it('no acumula error de punto flotante al sumar', () => {
    const total = sumar(centavos(10), centavos(20), centavos(30));
    expect(total).toBe(60);
  });

  it('redondea mitad hacia arriba', () => {
    expect(aplicarPorcentaje(centavos(5), 110)).toBe(6); // 5.5 -> 6
    expect(aplicarPorcentaje(centavos(1_233), 110)).toBe(1_356); // 1356.3 -> 1356
    expect(aplicarPorcentaje(centavos(1_235), 110)).toBe(1_359); // 1358.5 -> 1359
  });

  it('rechaza decimales para que nadie guarde 12.34 como si fueran centavos', () => {
    expect(() => centavos(12.34)).toThrow(/entero/i);
    expect(() => centavos(-1)).toThrow(/negativo/i);
  });

  it('formatea siempre con dos decimales', () => {
    expect(formatearUSD(centavos(5))).toBe('$0.05');
    expect(formatearUSD(centavos(100))).toBe('$1.00');
    expect(formatearUSD(centavos(123_456))).toBe('$1234.56');
  });
});
