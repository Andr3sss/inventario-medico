import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codigoPieza, sku } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import {
  actualizarPieza,
  actualizarPiezaOffline,
  actualizarProducto,
  crearProductoOffline,
  componentesDeKit,
  contarPiezasPorEstado,
  crearProducto,
  eliminarPieza,
  eliminarProducto,
  eliminarProductoOffline,
  listarPiezas,
  obtenerPieza,
  registrarPieza,
} from './inventario.js';
import { AZAR_FIJO, baseDePrueba, piezaDe, relojFalso, SESION } from './pruebas/entorno.js';

const ADMIN = { ...SESION, rol: 'ADMINISTRADOR' } as const;

let db: BaseLocal;

function existente<T>(valor: T | undefined): T {
  expect(valor).toBeDefined();
  if (valor === undefined) throw new Error('FILA_DE_PRUEBA_NO_ENCONTRADA');
  return valor;
}

beforeEach(async () => {
  db = await baseDePrueba();
  await db.catalogo.put({
    sku: 'TIJERA-MAYO-14',
    nombre: 'Tijera Mayo recta 14 cm',
    tipo: 'INSTRUMENTAL',
    costoBase: 4_200,
  });
  await db.catalogo.put({
    sku: 'KIT-BASICO-CX',
    nombre: 'Kit basico de cirugia',
    tipo: 'KIT',
    costoBase: 15_000,
  });
  await db.piezas.put(piezaDe()); // INS-4471, sku TIJERA-MAYO-14
  await db.piezas.put(
    piezaDe({
      codigo: codigoPieza('INS-9002'),
      sku: sku('PINZA-KELLY-14'),
      estado: 'EN_REPROCESAMIENTO',
    }),
  );
  await db.piezas.put(
    piezaDe({
      codigo: codigoPieza('KIT-000104'),
      sku: sku('KIT-BASICO-CX'),
      tipo: 'KIT',
      parentCodigo: null,
    }),
  );
  await db.piezas.put(
    piezaDe({
      codigo: codigoPieza('INS-9003'),
      sku: sku('PINZA-KELLY-14'),
      parentCodigo: codigoPieza('KIT-000104'),
    }),
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
      {
        sku: 'SEPARADOR-FARABEUF',
        nombre: 'Separador Farabeuf',
        tipo: 'INSTRUMENTAL',
        costoBase: 3_000,
      },
      SESION,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('NO_AUTORIZADO');
  });

  it('da de alta un producto nuevo', async () => {
    const r = await crearProducto(
      db,
      {
        sku: 'SEPARADOR-FARABEUF',
        nombre: 'Separador Farabeuf',
        tipo: 'INSTRUMENTAL',
        costoBase: 3_000,
      },
      ADMIN,
    );
    expect(r.ok).toBe(true);
    expect(await db.catalogo.get('SEPARADOR-FARABEUF')).toMatchObject({
      nombre: 'Separador Farabeuf',
    });
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

describe('CRUD administrativo de productos', () => {
  it('edita nombre y costo conservando el SKU inmutable', async () => {
    const producto = existente(await db.catalogo.get('TIJERA-MAYO-14'));
    const resultado = await actualizarProducto(
      db,
      producto,
      {
        sku: 'SKU-IGNORADO',
        nombre: 'Tijera Mayo premium',
        tipo: 'INSTRUMENTAL',
        costoBase: 5_500,
      },
      ADMIN,
    );

    expect(resultado).toMatchObject({
      ok: true,
      valor: { sku: 'TIJERA-MAYO-14', costoBase: 5_500 },
    });
  });

  it('impide borrar un producto con piezas y permite borrar uno sin dependencias', async () => {
    const ocupado = existente(await db.catalogo.get('TIJERA-MAYO-14'));
    const rechazado = await eliminarProducto(db, ocupado, ADMIN);
    expect(rechazado).toMatchObject({ ok: false, error: { codigo: 'PRODUCTO_TIENE_PIEZAS' } });

    const libre = {
      sku: 'GASA-ESTERIL',
      nombre: 'Gasa esteril',
      tipo: 'INSUMO' as const,
      costoBase: 150,
    };
    await db.catalogo.put(libre);
    await expect(eliminarProducto(db, libre, ADMIN)).resolves.toMatchObject({ ok: true });
    await expect(db.catalogo.get(libre.sku)).resolves.toBeUndefined();
  });

  it('encola altas y bajas offline como comandos maestros durables', async () => {
    const reloj = relojFalso();
    const creado = await crearProductoOffline(
      db,
      { sku: 'GASA-OFFLINE', nombre: 'Gasa offline', tipo: 'INSUMO', costoBase: 175 },
      ADMIN,
      { ahora: reloj.ahora, azar: AZAR_FIJO },
    );
    expect(creado.ok).toBe(true);
    if (!creado.ok) return;

    const borrado = await eliminarProductoOffline(db, creado.valor, ADMIN, {
      ahora: reloj.ahora,
      azar: AZAR_FIJO,
    });
    expect(borrado.ok).toBe(true);
    expect(
      (await db.operacionesSync.toArray()).map((operacion) => operacion.maestro?.tipo),
    ).toEqual(['CREAR_PRODUCTO', 'ELIMINAR_PRODUCTO']);
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

describe('CRUD administrativo de piezas', () => {
  it('edita una pieza disponible y conserva su codigo inmutable', async () => {
    const pieza = existente(await db.piezas.get(codigoPieza('INS-4471')));
    const resultado = await actualizarPieza(
      db,
      pieza,
      { codigo: 'OTRO-CODIGO', sku: 'TIJERA-MAYO-14', parentCodigo: 'KIT-000104' },
      ADMIN,
    );
    expect(resultado).toMatchObject({
      ok: true,
      valor: { codigo: 'INS-4471', parentCodigo: 'KIT-000104', version: pieza.version + 1 },
    });
  });

  it('impide editar o borrar una pieza fuera de bodega central', async () => {
    const pieza = existente(await db.piezas.get(codigoPieza('INS-9002')));
    await expect(
      actualizarPieza(db, pieza, { codigo: pieza.codigo, sku: pieza.sku }, ADMIN),
    ).resolves.toMatchObject({ ok: false, error: { codigo: 'PIEZA_NO_EDITABLE' } });
    await expect(eliminarPieza(db, pieza, ADMIN)).resolves.toMatchObject({
      ok: false,
      error: { codigo: 'PIEZA_NO_EDITABLE' },
    });
  });

  it('encola la edicion offline con version esperada', async () => {
    const reloj = relojFalso();
    const pieza = existente(await db.piezas.get(codigoPieza('INS-4471')));
    await db.replicaCentral.put({
      clave: 'PIEZA:01994a64-8780-7000-8000-000000000099',
      entidadTipo: 'PIEZA',
      entidadId: '01994a64-8780-7000-8000-000000000099',
      version: 7,
      eliminado: false,
      payload: { codigo: pieza.codigo },
    });

    const resultado = await actualizarPiezaOffline(
      db,
      pieza,
      { codigo: pieza.codigo, sku: pieza.sku, parentCodigo: 'KIT-000104' },
      ADMIN,
      { ahora: reloj.ahora, azar: AZAR_FIJO },
    );
    expect(resultado.ok).toBe(true);
    expect((await db.operacionesSync.toArray())[0]?.maestro).toMatchObject({
      tipo: 'ACTUALIZAR_PIEZA',
      entidadId: 'INS-4471',
      payload: { versionEsperada: 7 },
    });
  });
});
