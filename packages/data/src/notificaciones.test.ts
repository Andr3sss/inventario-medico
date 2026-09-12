import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { centavos, codigoPieza, hospitalId, sku } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import { confirmarSalidaMaleta, crearMaleta, escanearArmado, escanearUso } from './maletas.js';
import { cerrarMaleta, definirCiudadBase } from './facturacion.js';
import { obtenerNotificaciones, UMBRAL_MALETA_DEMORADA_MS_DEFECTO } from './notificaciones.js';
import { AZAR_FIJO, SESION, baseDePrueba, piezaDe, relojFalso } from './pruebas/entorno.js';

const HOSPITAL = hospitalId('HOSP-1');

let db: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;

beforeEach(async () => {
  db = await baseDePrueba();
  reloj = relojFalso();
  await db.piezas.put(piezaDe());
  await db.catalogo.put({ sku: 'TIJERA-MAYO-14', nombre: 'Tijera Mayo recta 14 cm', tipo: 'INSTRUMENTAL', costoBase: 4_200 });
  await db.hospitales.put({ id: HOSPITAL, nombre: 'Hospital San Juan', ciudad: 'Guayaquil', nivelPorDefecto: 'HABITUAL' });
  await definirCiudadBase(db, 'Guayaquil');
});

afterEach(() => {
  db.close();
});

const opciones = () => ({ ahora: reloj.ahora, azar: AZAR_FIJO });

describe('obtenerNotificaciones', () => {
  it('sin nada pendiente, devuelve las tres listas vacias', async () => {
    const n = await obtenerNotificaciones(db, { ahora: reloj.ahora });
    expect(n.total).toBe(0);
    expect(n.conflictosAbiertos).toHaveLength(0);
    expect(n.maletasDemoradas).toHaveLength(0);
    expect(n.facturasBloqueadas).toHaveLength(0);
  });

  it('incluye un conflicto abierto pero no uno ya resuelto', async () => {
    await db.conflictos.put({ conflictoId: 'c-1', codigo: 'INS-4471', detectadoEn: reloj.ahora(), detalle: null, estado: 'ABIERTO' });
    await db.conflictos.put({ conflictoId: 'c-2', codigo: 'INS-9002', detectadoEn: reloj.ahora(), detalle: null, estado: 'RESUELTO' });

    const n = await obtenerNotificaciones(db, { ahora: reloj.ahora });
    expect(n.conflictosAbiertos.map((c) => c.conflicto.conflictoId)).toEqual(['c-1']);
    expect(n.total).toBe(1);
  });

  it('marca una maleta EN_CIRUGIA como demorada solo despues del umbral', async () => {
    const maleta = await crearMaleta(db, { responsableId: 'u-aux-1', procedimiento: null }, SESION, opciones());
    if (!maleta.ok) throw new Error('setup');
    await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    await confirmarSalidaMaleta(db, maleta.valor.id, SESION, opciones());

    const antes = await obtenerNotificaciones(db, { ahora: reloj.ahora });
    expect(antes.maletasDemoradas).toHaveLength(0);

    reloj.avanzar(UMBRAL_MALETA_DEMORADA_MS_DEFECTO + 1_000);
    const despues = await obtenerNotificaciones(db, { ahora: reloj.ahora });
    expect(despues.maletasDemoradas.map((m) => m.id)).toEqual([maleta.valor.id]);
    expect(despues.total).toBe(1);
  });

  it('respeta un umbral personalizado', async () => {
    const maleta = await crearMaleta(db, { responsableId: 'u-aux-1', procedimiento: null }, SESION, opciones());
    if (!maleta.ok) throw new Error('setup');
    await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    await confirmarSalidaMaleta(db, maleta.valor.id, SESION, opciones());
    reloj.avanzar(60_000);

    const n = await obtenerNotificaciones(db, { ahora: reloj.ahora, umbralMaletaDemoradaMs: 1_000 });
    expect(n.maletasDemoradas.map((m) => m.id)).toEqual([maleta.valor.id]);
  });

  it('incluye una factura en borrador con una linea bloqueada por aprobacion', async () => {
    await db.excepcionesPrecio.put({
      id: 'exc-1',
      sku: sku('TIJERA-MAYO-14'),
      hospitalId: HOSPITAL,
      valor: centavos(9_999),
      estado: 'PENDIENTE',
      vigenteDesde: '2020-01-01T00:00:00.000Z',
      vigenteHasta: null,
      motivoRechazo: null,
    });
    const maleta = await crearMaleta(db, { responsableId: 'u-aux-1', procedimiento: null }, SESION, opciones());
    if (!maleta.ok) throw new Error('setup');
    await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    await confirmarSalidaMaleta(db, maleta.valor.id, SESION, opciones());
    await escanearUso(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    const cierre = await cerrarMaleta(db, maleta.valor.id, HOSPITAL, SESION, opciones());
    if (!cierre.ok || cierre.valor.factura === null) throw new Error('setup');

    const n = await obtenerNotificaciones(db, { ahora: reloj.ahora });
    expect(n.facturasBloqueadas.map((f) => f.id)).toEqual([cierre.valor.factura.id]);
  });

  it('no cuenta una pieza extraviada como conflicto ni bloquea nada por si sola', async () => {
    await db.piezas.put(piezaDe({ codigo: codigoPieza('INS-9999'), estado: 'EXTRAVIADA' }));
    const n = await obtenerNotificaciones(db, { ahora: reloj.ahora });
    expect(n.total).toBe(0);
  });
});
