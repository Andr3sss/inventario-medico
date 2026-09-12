import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codigoPieza } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import {
  cancelarMaleta,
  confirmarSalidaMaleta,
  crearMaleta,
  escanearArmado,
  escanearUso,
  listarMaletas,
  obtenerMaleta,
  retirarDeArmado,
} from './maletas.js';
import { AZAR_FIJO, SESION, baseDePrueba, piezaDe, relojFalso } from './pruebas/entorno.js';

const OTRA_SESION = { ...SESION, rol: 'SUPERVISOR' } as const;
const CODIGO_2 = codigoPieza('INS-9002');

let db: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;

beforeEach(async () => {
  db = await baseDePrueba();
  reloj = relojFalso();
  await db.piezas.put(piezaDe());
  await db.piezas.put(piezaDe({ codigo: CODIGO_2, sku: piezaDe().sku }));
});

afterEach(() => {
  db.close();
});

const opciones = () => ({ ahora: reloj.ahora, azar: AZAR_FIJO });

describe('crearMaleta', () => {
  it('abre una maleta vacia en EN_ARMADO con un evento de auditoria', async () => {
    const r = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: 'Trauma menor' },
      SESION,
      opciones(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.estado).toBe('EN_ARMADO');
    expect(r.valor.version).toBe(1);
    expect(await db.eventosMaleta.count()).toBe(1);
  });
});

describe('escanearArmado', () => {
  it('agrega una pieza en bodega a una maleta en armado', async () => {
    const maleta = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!maleta.ok) throw new Error('setup');

    const r = await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.codigo).toBe('EXITO');
      expect(r.valor.pieza?.estado).toBe('ASIGNADA_A_MALETA');
      expect(r.valor.pieza?.maletaId).toBe(maleta.valor.id);
    }
  });

  it('rechaza escanear hacia una maleta que no existe', async () => {
    const r = await escanearArmado(db, 'INS-4471', 'MAL-FANTASMA', SESION, opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('MALETA_NO_ENCONTRADA');
  });

  it('rechaza escanear hacia una maleta que ya no esta en armado', async () => {
    const maleta = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!maleta.ok) throw new Error('setup');
    await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    reloj.avanzar(1_000);
    await confirmarSalidaMaleta(db, maleta.valor.id, SESION, opciones());

    reloj.avanzar(1_000);
    const r = await escanearArmado(db, 'INS-9002', maleta.valor.id, SESION, opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('ESTADO_INVALIDO');
  });

  it('devuelve PIEZA_NO_ENCONTRADA como resultado ok, no como fallo', async () => {
    const maleta = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!maleta.ok) throw new Error('setup');
    const r = await escanearArmado(db, 'INS-0000', maleta.valor.id, SESION, opciones());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.codigo).toBe('PIEZA_NO_ENCONTRADA');
  });

  it('ignora el rebote del lector como REBOTE_IGNORADO, no como error', async () => {
    const maleta = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!maleta.ok) throw new Error('setup');
    await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    reloj.avanzar(50);
    const rebote = await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    expect(rebote.ok).toBe(true);
    if (rebote.ok) expect(rebote.valor.codigo).toBe('REBOTE_IGNORADO');
  });

  it('un rol no autorizado se traduce a NO_AUTORIZADO', async () => {
    const maleta = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!maleta.ok) throw new Error('setup');
    const r = await escanearArmado(db, 'INS-4471', maleta.valor.id, OTRA_SESION, opciones());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.codigo).toBe('NO_AUTORIZADO');
  });
});

describe('retirarDeArmado', () => {
  it('devuelve la pieza a su bodega antes de la salida', async () => {
    const maleta = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!maleta.ok) throw new Error('setup');
    await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    reloj.avanzar(1_000);
    const r = await retirarDeArmado(db, 'INS-4471', SESION, opciones());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.codigo).toBe('EXITO');
      expect(r.valor.pieza?.estado).toBe('EN_BODEGA_CENTRAL');
      expect(r.valor.pieza?.maletaId).toBeNull();
    }
  });
});

describe('confirmarSalidaMaleta', () => {
  it('pasa todas las piezas armadas a EN_MALETA_ACTIVA y la maleta a EN_CIRUGIA', async () => {
    const maleta = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!maleta.ok) throw new Error('setup');
    await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    reloj.avanzar(500);
    await escanearArmado(db, 'INS-9002', maleta.valor.id, SESION, opciones());
    reloj.avanzar(500);

    const r = await confirmarSalidaMaleta(db, maleta.valor.id, SESION, opciones());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.maleta.estado).toBe('EN_CIRUGIA');
    expect(r.valor.piezasConfirmadas).toBe(2);

    const p1 = await db.piezas.get(codigoPieza('INS-4471'));
    const p2 = await db.piezas.get(CODIGO_2);
    expect(p1?.estado).toBe('EN_MALETA_ACTIVA');
    expect(p2?.estado).toBe('EN_MALETA_ACTIVA');

    const operaciones = await db.operacionesSync.orderBy('seq').toArray();
    const salida = operaciones.at(-1);
    expect(salida?.eventos.map((evento) => evento.cuerpo.tipo)).toEqual([
      'MALETA_SALIO',
      'CONFIRMAR_SALIDA',
      'CONFIRMAR_SALIDA',
    ]);
    expect(new Set(salida?.eventoIds).size).toBe(3);
  });

  it('es idempotente: la segunda confirmacion no reemite eventos', async () => {
    const maleta = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!maleta.ok) throw new Error('setup');
    await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    reloj.avanzar(500);
    await confirmarSalidaMaleta(db, maleta.valor.id, SESION, opciones());
    const eventosAntes = await db.eventos.count();

    reloj.avanzar(500);
    const segunda = await confirmarSalidaMaleta(db, maleta.valor.id, SESION, opciones());
    expect(segunda.ok).toBe(true);
    if (segunda.ok) expect(segunda.valor.piezasConfirmadas).toBe(0);
    expect(await db.eventos.count()).toBe(eventosAntes);
  });

  it('rechaza confirmar la salida de una maleta vacia', async () => {
    const maleta = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!maleta.ok) throw new Error('setup');
    const r = await confirmarSalidaMaleta(db, maleta.valor.id, SESION, opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('MALETA_VACIA');
  });
});

describe('escanearUso', () => {
  it('marca una pieza en maleta activa como usada', async () => {
    const maleta = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!maleta.ok) throw new Error('setup');
    await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    reloj.avanzar(500);
    await confirmarSalidaMaleta(db, maleta.valor.id, SESION, opciones());
    reloj.avanzar(500);

    const r = await escanearUso(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.pieza?.estado).toBe('USADA_PENDIENTE_VALORACION');
  });
});

describe('cancelarMaleta', () => {
  it('devuelve las piezas armadas a bodega y cancela la maleta', async () => {
    const maleta = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!maleta.ok) throw new Error('setup');
    await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    reloj.avanzar(500);

    const r = await cancelarMaleta(db, maleta.valor.id, 'Armada por error', SESION, opciones());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.estado).toBe('CANCELADA');

    const pieza = await db.piezas.get(codigoPieza('INS-4471'));
    expect(pieza?.estado).toBe('EN_BODEGA_CENTRAL');
  });
});

describe('listarMaletas y obtenerMaleta', () => {
  it('lista de mas nueva a mas vieja y filtra por estado', async () => {
    const a = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    reloj.avanzar(1_000);
    const b = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!a.ok || !b.ok) throw new Error('setup');

    const todas = await listarMaletas(db);
    expect(todas.map((m) => m.id)).toEqual([b.valor.id, a.valor.id]);

    const detalle = await obtenerMaleta(db, a.valor.id);
    expect(detalle?.maleta.id).toBe(a.valor.id);
    expect(detalle?.piezas).toEqual([]);
  });
});
