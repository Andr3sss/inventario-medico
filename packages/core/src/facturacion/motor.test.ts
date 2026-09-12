import { describe, expect, it } from 'vitest';
import { armarBorrador, emitirFactura } from './motor.js';
import { centavos } from '../comun/dinero.js';
import { codigoPieza, facturaId, hospitalId, maletaId, sku } from '../comun/marcas.js';
import type { LineaFactura } from './tipos.js';

const lineaDe = (parcial: Partial<LineaFactura> = {}): LineaFactura => ({
  codigoPieza: codigoPieza('INS-0001'),
  sku: sku('TIJERA-MAYO-14'),
  nombre: 'Tijera Mayo recta 14 cm',
  precio: { valor: centavos(4_620), tipo: 'HABITUAL', requiereAprobacion: false, explicacion: 'x' },
  ...parcial,
});

describe('armarBorrador', () => {
  it('suma el total de las lineas', () => {
    const r = armarBorrador(
      facturaId('FAC-1'),
      maletaId('MAL-1'),
      hospitalId('HOSP-1'),
      [lineaDe(), lineaDe({ codigoPieza: codigoPieza('INS-0002'), precio: { valor: centavos(1_000), tipo: 'HABITUAL', requiereAprobacion: false, explicacion: 'x' } })],
      '2026-01-05T10:00:00.000Z',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.total).toBe(5_620);
  });

  it('rechaza un borrador sin lineas', () => {
    const r = armarBorrador(facturaId('FAC-1'), maletaId('MAL-1'), hospitalId('HOSP-1'), [], '2026-01-05T10:00:00.000Z');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('SIN_LINEAS');
  });
});

describe('emitirFactura', () => {
  it('emite un borrador sin lineas bloqueadas', () => {
    const borrador = armarBorrador(
      facturaId('FAC-1'),
      maletaId('MAL-1'),
      hospitalId('HOSP-1'),
      [lineaDe()],
      '2026-01-05T10:00:00.000Z',
    );
    if (!borrador.ok) throw new Error('setup');
    const r = emitirFactura(borrador.valor, '2026-01-05T11:00:00.000Z');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.estado).toBe('EMITIDA');
      expect(r.valor.emitidaEn).toBe('2026-01-05T11:00:00.000Z');
    }
  });

  it('bloquea la emision si una linea tiene precio aleatorio pendiente', () => {
    const bloqueada = lineaDe({
      codigoPieza: codigoPieza('INS-0009'),
      precio: { valor: centavos(9_999), tipo: 'ALEATORIO', requiereAprobacion: true, explicacion: 'pendiente' },
    });
    const borrador = armarBorrador(
      facturaId('FAC-1'),
      maletaId('MAL-1'),
      hospitalId('HOSP-1'),
      [lineaDe(), bloqueada],
      '2026-01-05T10:00:00.000Z',
    );
    if (!borrador.ok) throw new Error('setup');
    const r = emitirFactura(borrador.valor, '2026-01-05T11:00:00.000Z');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.codigo).toBe('LINEA_BLOQUEADA_POR_APROBACION');
      expect(r.error.codigosBloqueados).toEqual(['INS-0009']);
    }
  });

  it('no permite emitir dos veces la misma factura', () => {
    const borrador = armarBorrador(
      facturaId('FAC-1'),
      maletaId('MAL-1'),
      hospitalId('HOSP-1'),
      [lineaDe()],
      '2026-01-05T10:00:00.000Z',
    );
    if (!borrador.ok) throw new Error('setup');
    const emitida = emitirFactura(borrador.valor, '2026-01-05T11:00:00.000Z');
    if (!emitida.ok) throw new Error('setup');
    const segundo = emitirFactura(emitida.valor, '2026-01-05T12:00:00.000Z');
    expect(segundo.ok).toBe(false);
    if (!segundo.ok) expect(segundo.error.codigo).toBe('FACTURA_NO_ES_BORRADOR');
  });
});
