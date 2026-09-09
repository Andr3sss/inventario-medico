import { describe, expect, it } from 'vitest';
import { nivelAplicable, resolverPrecio } from './motor.js';
import type { ExcepcionPrecio, Hospital } from './tipos.js';
import { centavos, formatearUSD } from '../comun/dinero.js';
import { hospitalId, sku } from '../comun/marcas.js';

const CIUDAD_BASE = 'Quito';
const SKU = sku('TIJERA-MAYO-14');
const AHORA = new Date('2026-09-07T10:00:00.000Z');

const hospital = (parcial: Partial<Hospital> = {}): Hospital => ({
  id: hospitalId('HOSP-METRO'),
  nombre: 'Hospital Metropolitano',
  ciudad: 'Quito',
  nivelPorDefecto: 'HABITUAL',
  ...parcial,
});

const exigirOk = <T>(r: { ok: true; valor: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`Se esperaba ok: ${JSON.stringify(r.error)}`);
  return r.valor;
};

describe('matriz de precios', () => {
  it('aplica habitual, provincia y nota de credito sobre el costo', () => {
    const costo = centavos(10_000);
    const casos = [
      { nivel: 'HABITUAL' as const, ciudad: 'Quito', esperado: 11_000 },
      { nivel: 'PROVINCIA' as const, ciudad: 'Ambato', esperado: 12_000 },
      { nivel: 'NOTA_CREDITO' as const, ciudad: 'Quito', esperado: 13_000 },
    ];

    for (const caso of casos) {
      const r = exigirOk(
        resolverPrecio({
          sku: SKU,
          costoBase: costo,
          hospital: hospital({ nivelPorDefecto: caso.nivel, ciudad: caso.ciudad }),
          ciudadBase: CIUDAD_BASE,
          excepcion: null,
          ahora: AHORA,
        }),
      );
      expect(r.valor).toBe(caso.esperado);
      expect(r.tipo).toBe(caso.nivel);
    }
  });

  it('provincia es un piso, no un reemplazo del nivel configurado', () => {
    expect(
      nivelAplicable(hospital({ nivelPorDefecto: 'HABITUAL', ciudad: 'Ambato' }), CIUDAD_BASE),
    ).toBe('PROVINCIA');
    expect(
      nivelAplicable(hospital({ nivelPorDefecto: 'NOTA_CREDITO', ciudad: 'Ambato' }), CIUDAD_BASE),
    ).toBe('NOTA_CREDITO');
  });

  it('ignora tildes y mayusculas al comparar la ciudad', () => {
    expect(nivelAplicable(hospital({ ciudad: 'QUITO' }), 'quito')).toBe('HABITUAL');
    expect(nivelAplicable(hospital({ ciudad: 'Quito' }), 'Quíto')).toBe('HABITUAL');
  });

  it('redondea a centavo entero sin arrastrar decimales', () => {
    const r = exigirOk(
      resolverPrecio({
        sku: SKU,
        costoBase: centavos(1_233),
        hospital: hospital(),
        ciudadBase: CIUDAD_BASE,
        excepcion: null,
        ahora: AHORA,
      }),
    );
    expect(r.valor).toBe(1_356);
    expect(Number.isInteger(r.valor)).toBe(true);
    expect(formatearUSD(r.valor)).toBe('$13.56');
  });

  it('rechaza un SKU sin costo cargado en vez de facturar cero', () => {
    const r = resolverPrecio({
      sku: SKU,
      costoBase: centavos(0),
      hospital: hospital(),
      ciudadBase: CIUDAD_BASE,
      excepcion: null,
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('COSTO_NO_DEFINIDO');
  });
});

describe('precio aleatorio', () => {
  const excepcion = (parcial: Partial<ExcepcionPrecio> = {}): ExcepcionPrecio => ({
    sku: SKU,
    hospitalId: hospitalId('HOSP-METRO'),
    valor: centavos(9_500),
    estado: 'PENDIENTE',
    vigenteDesde: '2026-09-01T00:00:00.000Z',
    vigenteHasta: null,
    ...parcial,
  });

  it('marca la linea como bloqueante mientras gerencia no aprueba', () => {
    const r = exigirOk(
      resolverPrecio({
        sku: SKU,
        costoBase: centavos(10_000),
        hospital: hospital(),
        ciudadBase: CIUDAD_BASE,
        excepcion: excepcion(),
        ahora: AHORA,
      }),
    );
    expect(r.tipo).toBe('ALEATORIO');
    expect(r.valor).toBe(9_500);
    expect(r.requiereAprobacion).toBe(true);
  });

  it('libera la linea cuando la excepcion esta aprobada', () => {
    const r = exigirOk(
      resolverPrecio({
        sku: SKU,
        costoBase: centavos(10_000),
        hospital: hospital(),
        ciudadBase: CIUDAD_BASE,
        excepcion: excepcion({ estado: 'APROBADO' }),
        ahora: AHORA,
      }),
    );
    expect(r.requiereAprobacion).toBe(false);
  });

  it('cae a la matriz normal si la excepcion fue rechazada o ya vencio', () => {
    const rechazada = exigirOk(
      resolverPrecio({
        sku: SKU,
        costoBase: centavos(10_000),
        hospital: hospital(),
        ciudadBase: CIUDAD_BASE,
        excepcion: excepcion({ estado: 'RECHAZADO' }),
        ahora: AHORA,
      }),
    );
    expect(rechazada.tipo).toBe('HABITUAL');

    const vencida = exigirOk(
      resolverPrecio({
        sku: SKU,
        costoBase: centavos(10_000),
        hospital: hospital(),
        ciudadBase: CIUDAD_BASE,
        excepcion: excepcion({ estado: 'APROBADO', vigenteHasta: '2026-09-05T00:00:00.000Z' }),
        ahora: AHORA,
      }),
    );
    expect(vencida.tipo).toBe('HABITUAL');
  });

  it('no acepta una excepcion negociada para otro hospital', () => {
    const r = resolverPrecio({
      sku: SKU,
      costoBase: centavos(10_000),
      hospital: hospital(),
      ciudadBase: CIUDAD_BASE,
      excepcion: excepcion({ hospitalId: hospitalId('HOSP-OTRO') }),
      ahora: AHORA,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('EXCEPCION_DE_OTRO_HOSPITAL');
  });
});
