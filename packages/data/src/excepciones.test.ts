import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BaseLocal } from './db.js';
import {
  aprobarExcepcionPrecio,
  listarExcepcionesPrecio,
  obtenerExcepcionPrecio,
  proponerExcepcionPrecio,
  rechazarExcepcionPrecio,
} from './excepciones.js';
import { baseDePrueba, relojFalso, SESION } from './pruebas/entorno.js';

const ADMIN = { ...SESION, rol: 'ADMINISTRADOR' } as const;
const CONTABLE = { ...SESION, rol: 'CONTABLE' } as const;

let db: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;

beforeEach(async () => {
  db = await baseDePrueba();
  reloj = relojFalso();
});

afterEach(() => {
  db.close();
});

const DATOS = {
  sku: 'TIJERA-MAYO-14',
  hospitalId: 'HOSP-1',
  valor: 5_500,
  vigenteDesde: '2026-01-01T00:00:00.000Z',
};

describe('proponerExcepcionPrecio', () => {
  it('Contable registra una negociacion, siempre PENDIENTE', async () => {
    const r = await proponerExcepcionPrecio(db, DATOS, CONTABLE, { ahora: reloj.ahora });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.estado).toBe('PENDIENTE');
      expect(r.valor.id).toMatch(/^EXC-/);
    }
  });

  it('rechaza a un rol que no negocia precios', async () => {
    const r = await proponerExcepcionPrecio(db, DATOS, SESION, { ahora: reloj.ahora }); // AUXILIAR
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('NO_AUTORIZADO');
  });

  it('rechaza un valor no entero o negativo', async () => {
    const decimal = await proponerExcepcionPrecio(db, { ...DATOS, valor: 10.5 }, ADMIN, { ahora: reloj.ahora });
    expect(decimal.ok).toBe(false);
    if (!decimal.ok) expect(decimal.error.codigo).toBe('VALOR_INVALIDO');
  });

  it('el propio Administrador puede proponer, pero nace PENDIENTE igual', async () => {
    const r = await proponerExcepcionPrecio(db, DATOS, ADMIN, { ahora: reloj.ahora });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.estado).toBe('PENDIENTE');
  });
});

describe('aprobarExcepcionPrecio / rechazarExcepcionPrecio', () => {
  it('el Administrador aprueba una pendiente', async () => {
    const creada = await proponerExcepcionPrecio(db, DATOS, CONTABLE, { ahora: reloj.ahora });
    if (!creada.ok) throw new Error('fixture invalido');

    const r = await aprobarExcepcionPrecio(db, creada.valor.id, ADMIN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.estado).toBe('APROBADO');
    expect((await obtenerExcepcionPrecio(db, creada.valor.id))?.estado).toBe('APROBADO');
  });

  it('el Administrador rechaza una pendiente con motivo', async () => {
    const creada = await proponerExcepcionPrecio(db, DATOS, CONTABLE, { ahora: reloj.ahora });
    if (!creada.ok) throw new Error('fixture invalido');

    const r = await rechazarExcepcionPrecio(db, creada.valor.id, 'Fuera de politica comercial', ADMIN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.estado).toBe('RECHAZADO');
      expect(r.valor.motivoRechazo).toBe('Fuera de politica comercial');
    }
  });

  it('rechaza a quien no es Administrador', async () => {
    const creada = await proponerExcepcionPrecio(db, DATOS, CONTABLE, { ahora: reloj.ahora });
    if (!creada.ok) throw new Error('fixture invalido');

    const r = await aprobarExcepcionPrecio(db, creada.valor.id, CONTABLE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('NO_AUTORIZADO');
  });

  it('no permite decidir dos veces la misma excepcion', async () => {
    const creada = await proponerExcepcionPrecio(db, DATOS, CONTABLE, { ahora: reloj.ahora });
    if (!creada.ok) throw new Error('fixture invalido');

    await aprobarExcepcionPrecio(db, creada.valor.id, ADMIN);
    const segunda = await rechazarExcepcionPrecio(db, creada.valor.id, 'tarde', ADMIN);
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.codigo).toBe('ESTADO_INVALIDO');
  });

  it('devuelve EXCEPCION_NO_ENCONTRADA si el id no existe', async () => {
    const r = await aprobarExcepcionPrecio(db, 'EXC-00000000', ADMIN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('EXCEPCION_NO_ENCONTRADA');
  });
});

describe('listarExcepcionesPrecio', () => {
  it('filtra por estado', async () => {
    const a = await proponerExcepcionPrecio(db, DATOS, CONTABLE, { ahora: reloj.ahora });
    reloj.avanzar(1_000);
    const b = await proponerExcepcionPrecio(
      db,
      { ...DATOS, sku: 'PINZA-KELLY-14' },
      CONTABLE,
      { ahora: reloj.ahora },
    );
    if (!a.ok || !b.ok) throw new Error('fixture invalido');
    await aprobarExcepcionPrecio(db, a.valor.id, ADMIN);

    const pendientes = await listarExcepcionesPrecio(db, { estado: 'PENDIENTE' });
    expect(pendientes.map((e) => e.id)).toEqual([b.valor.id]);
  });
});
