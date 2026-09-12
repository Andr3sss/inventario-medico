import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codigoPieza, sku } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import {
  componentesDeKit,
  contarPiezasPorEstado,
  crearProducto,
  listarPiezas,
  obtenerPieza,
  registrarPieza,
} from './inventario.js';
import { baseDePrueba, piezaDe, SESION } from './pruebas/entorno.js';

const ADMIN = { ...SESION, rol: 'ADMINISTRADOR' } as const;

let db: BaseLocal;

beforeEach(async () => {
  db = await baseDePrueba();
  await db.catalogo.put({ sku: 'TIJERA-MAYO-14', nombre: 'Tijera Mayo recta 14 cm', tipo: 'INSTRUMENTAL', costoBase: 4_200 });
  await db.catalogo.put({ sku: 'KIT-BASICO-CX', nombre: 'Kit basico de cirugia', tipo: 'KIT', costoBase: 15_000 });
  await db.piezas.put(piezaDe()); // INS-4471, sku TIJERA-MAYO-14
  await db.piezas.put(
    piezaDe({ codigo: codigoPieza('INS-9002'), sku: sku('PINZA-KELLY-14'), estado: 'EN_REPROCESAMIENTO' }),
  );
  await db.piezas.put(
    piezaDe({ codigo: codigoPieza('KIT-000104'), sku: sku('KIT-BASICO-CX'), tipo: 'KIT', parentCodigo: null }),
  );
  await db.piezas.put(
    piezaDe({ codigo: codigoPieza('INS-9003'), sku: sku('PINZA-KELLY-14'), parentCodigo: codigoPieza('KIT-000104') }),
  );
});

afterEach(() => {
  db.close();
});

describe('listarPiezas', () => {
  it('filtra por estado y pagina', async () => {
    const pagina = await listarPiezas(db, { estado: 'EN_REPROCESAMIENTO' });
    expect(pagina.total).toBe(1);
    expect(pagina.items[0]?.pieza.codigo).toBe('INS-9002');
  });

  it('busca por texto en el codigo o en el nombre del producto', async () => {
    const porCodigo = await listarPiezas(db, { texto: '4471' });
    expect(porCodigo.items.map((i) => i.pieza.codigo)).toEqual(['INS-4471']);

    const porNombre = await listarPiezas(db, { texto: 'mayo' });
    expect(porNombre.items.map((i) => i.pieza.codigo)).toEqual(['INS-4471']);
  });

  it('trae el producto del catalogo junto a cada pieza', async () => {
    const pagina = await listarPiezas(db, { sku: 'TIJERA-MAYO-14' });
    expect(pagina.items[0]?.producto?.nombre).toBe('Tijera Mayo recta 14 cm');
  });
});

describe('obtenerPieza', () => {
  it('devuelve undefined si el codigo no existe', async () => {
    expect(await obtenerPieza(db, 'INS-0000')).toBeUndefined();
  });
});

describe('componentesDeKit', () => {
  it('lista los hijos de una caja (punto 5.3 del brief)', async () => {
    const hijos = await componentesDeKit(db, 'KIT-000104');
    expect(hijos.map((h) => h.pieza.codigo)).toEqual(['INS-9003']);
  });
});

describe('crearProducto', () => {
  it('rechaza a quien no es Administrador', async () => {
    const r = await crearProducto(
      db,
      { sku: 'SEPARADOR-FARABEUF', nombre: 'Separador Farabeuf', tipo: 'INSTRUMENTAL', costoBase: 3_000 },
      SESION,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('NO_AUTORIZADO');
  });

  it('da de alta un producto nuevo', async () => {
    const r = await crearProducto(
      db,
      { sku: 'SEPARADOR-FARABEUF', nombre: 'Separador Farabeuf', tipo: 'INSTRUMENTAL', costoBase: 3_000 },
      ADMIN,
    );
    expect(r.ok).toBe(true);
    expect(await db.catalogo.get('SEPARADOR-FARABEUF')).toMatchObject({ nombre: 'Separador Farabeuf' });
  });

  it('rechaza un sku que ya existe', async () => {
    const r = await crearProducto(
      db,
      { sku: 'TIJERA-MAYO-14', nombre: 'Duplicada', tipo: 'INSTRUMENTAL', costoBase: 1_000 },
      ADMIN,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('PRODUCTO_YA_EXISTE');
  });

  it('rechaza un costo base no entero o negativo', async () => {
    const decimal = await crearProducto(
      db,
      { sku: 'NUEVO-SKU-1', nombre: 'Nuevo', tipo: 'INSUMO', costoBase: 10.5 },
      ADMIN,
    );
    expect(decimal.ok).toBe(false);
    if (!decimal.ok) expect(decimal.error.codigo).toBe('COSTO_INVALIDO');

    const negativo = await crearProducto(
      db,
      { sku: 'NUEVO-SKU-2', nombre: 'Nuevo', tipo: 'INSUMO', costoBase: -100 },
      ADMIN,
    );
    expect(negativo.ok).toBe(false);
    if (!negativo.ok) expect(negativo.error.codigo).toBe('COSTO_INVALIDO');
  });
});

describe('contarPiezasPorEstado', () => {
  it('cuenta las piezas sembradas en una sola pasada, con todos los estados presentes', async () => {
    const conteo = await contarPiezasPorEstado(db);
    // INS-4471, KIT-000104 e INS-9003 quedan en bodega central; INS-9002 en reprocesamiento.
    expect(conteo.EN_BODEGA_CENTRAL).toBe(3);
    expect(conteo.EN_REPROCESAMIENTO).toBe(1);
    expect(conteo.EN_CONFLICTO).toBe(0);
    expect(Object.keys(conteo)).toHaveLength(10);
  });

  it('no se ve afectado por ningun filtro: siempre es el total global del dispositivo', async () => {
    const conteo = await contarPiezasPorEstado(db);
    const suma = Object.values(conteo).reduce((a, b) => a + b, 0);
    expect(suma).toBe(await db.piezas.count());
  });
});

describe('registrarPieza', () => {
  it('rechaza a quien no es Administrador', async () => {
    const r = await registrarPieza(db, { codigo: 'INS-5000', sku: 'TIJERA-MAYO-14' }, SESION);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('NO_AUTORIZADO');
  });

  it('da de alta una pieza en bodega central, tomando tipo del catalogo', async () => {
    const r = await registrarPieza(db, { codigo: 'INS-5000', sku: 'TIJERA-MAYO-14' }, ADMIN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.estado).toBe('EN_BODEGA_CENTRAL');
      expect(r.valor.tipo).toBe('INSTRUMENTAL');
    }
  });

  it('rechaza un sku que no existe en el catalogo', async () => {
    const r = await registrarPieza(db, { codigo: 'INS-5000', sku: 'SKU-INEXISTENTE' }, ADMIN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('PRODUCTO_NO_ENCONTRADO');
  });

  it('rechaza un codigo que ya existe', async () => {
    const r = await registrarPieza(db, { codigo: 'INS-4471', sku: 'TIJERA-MAYO-14' }, ADMIN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('PIEZA_YA_EXISTE');
  });

  it('asocia la pieza a un kit padre existente', async () => {
    const r = await registrarPieza(
      db,
      { codigo: 'INS-5001', sku: 'TIJERA-MAYO-14', parentCodigo: 'KIT-000104' },
      ADMIN,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.parentCodigo).toBe('KIT-000104');
  });

  it('rechaza un kit padre que no existe', async () => {
    const r = await registrarPieza(
      db,
      { codigo: 'INS-5001', sku: 'TIJERA-MAYO-14', parentCodigo: 'KIT-NO-EXISTE' },
      ADMIN,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('PADRE_NO_ENCONTRADO');
  });
});
