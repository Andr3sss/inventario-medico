import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BODEGA_CENTRAL, bodegaDe, codigoPieza, usuarioId } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import { finReproceso, ingresoReproceso, listarEnReprocesamiento } from './reprocesamiento.js';
import { AZAR_FIJO, SESION, baseDePrueba, piezaDe, relojFalso } from './pruebas/entorno.js';

const COORDINADORA = { ...SESION, rol: 'COORDINADORA' } as const;

let db: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;

beforeEach(async () => {
  db = await baseDePrueba();
  reloj = relojFalso();
});

afterEach(() => {
  db.close();
});

const opciones = () => ({ ahora: reloj.ahora, azar: AZAR_FIJO });

describe('reprocesamiento', () => {
  it('lista solo las piezas EN_REPROCESAMIENTO, paginado', async () => {
    await db.piezas.put(piezaDe({ estado: 'EN_REPROCESAMIENTO' }));
    await db.piezas.put(piezaDe({ codigo: codigoPieza('INS-9002'), estado: 'EN_BODEGA_CENTRAL' }));

    const pagina = await listarEnReprocesamiento(db);
    expect(pagina.total).toBe(1);
    expect(pagina.items[0]?.codigo).toBe('INS-4471');
  });

  it('finReproceso devuelve la pieza a bodega central o a la del instrumentista', async () => {
    await db.piezas.put(piezaDe({ estado: 'EN_REPROCESAMIENTO' }));

    const r = await finReproceso(db, 'INS-4471', bodegaDe(usuarioId('u-inst-1')), COORDINADORA, opciones());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.pieza.estado).toBe('EN_BODEGA_INSTRUMENTISTA');
      expect(r.valor.pieza.ubicacion).toEqual(bodegaDe(usuarioId('u-inst-1')));
    }
  });

  it('rechaza finReproceso sobre una pieza que no esta en reprocesamiento', async () => {
    await db.piezas.put(piezaDe({ estado: 'EN_BODEGA_CENTRAL' }));
    const r = await finReproceso(db, 'INS-4471', BODEGA_CENTRAL, COORDINADORA, opciones());
    expect(r.ok).toBe(false);
  });

  it('ingresoReproceso mueve una pieza FACTURADA a reprocesamiento', async () => {
    await db.piezas.put(piezaDe({ estado: 'FACTURADA' }));
    const r = await ingresoReproceso(db, 'INS-4471', COORDINADORA, opciones());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.pieza.estado).toBe('EN_REPROCESAMIENTO');
  });
});
