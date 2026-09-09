import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { maletaId } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import { registrarEvento } from './escaneo.js';
import { milisDe } from './reloj.js';
import { AZAR_FIJO, CODIGO, SESION, baseDePrueba, piezaDe, relojFalso } from './pruebas/entorno.js';

const MALETA = maletaId('MAL-882');

let db: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;

beforeEach(async () => {
  db = await baseDePrueba();
  reloj = relojFalso();
  await db.piezas.put(piezaDe());
});

afterEach(() => {
  db.close();
});

const opciones = () => ({ ahora: reloj.ahora, azar: AZAR_FIJO });

describe('registro atomico del escaneo', () => {
  it('escribe evento, pieza y cola de salida en una sola operacion', async () => {
    const r = await registrarEvento(
      db,
      { tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA },
      SESION,
      opciones(),
    );

    expect(r.ok).toBe(true);
    expect(await db.eventos.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);

    const pieza = await db.piezas.get(CODIGO);
    expect(pieza?.estado).toBe('ASIGNADA_A_MALETA');
    expect(pieza?.maletaId).toBe(MALETA);
    expect(pieza?.version).toBe(2);
  });

  it('una transicion ilegal no deja ningun rastro', async () => {
    const r = await registrarEvento(
      db,
      { tipo: 'ESCANEO_USO', codigo: CODIGO, maletaId: MALETA },
      SESION,
      opciones(),
    );

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('TRANSICION_RECHAZADA');

    expect(await db.eventos.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    const pieza = await db.piezas.get(CODIGO);
    expect(pieza?.estado).toBe('EN_BODEGA_CENTRAL');
    expect(pieza?.version).toBe(1);
  });

  it('ignora el segundo disparo del lector sobre el mismo codigo', async () => {
    const cuerpo = { tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA } as const;

    await registrarEvento(db, cuerpo, SESION, opciones());
    reloj.avanzar(50);
    const rebote = await registrarEvento(db, cuerpo, SESION, opciones());

    expect(rebote.ok).toBe(false);
    if (!rebote.ok) expect(rebote.error.codigo).toBe('REBOTE_DE_LECTOR');
    expect(await db.eventos.count()).toBe(1);
  });

  it('acepta el mismo escaneo una vez pasada la ventana de rebote', async () => {
    await registrarEvento(
      db,
      { tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA },
      SESION,
      opciones(),
    );
    reloj.avanzar(1_000);
    const segundo = await registrarEvento(
      db,
      { tipo: 'ESCANEO_ARMADO_REVERSO', codigo: CODIGO },
      SESION,
      opciones(),
    );

    expect(segundo.ok).toBe(true);
    expect(await db.eventos.count()).toBe(2);
  });

  it('rechaza un codigo que no existe en el inventario del dispositivo', async () => {
    const r = await registrarEvento(
      db,
      { tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA },
      SESION,
      opciones(),
    );
    expect(r.ok).toBe(true);

    await db.piezas.clear();
    const segundo = await registrarEvento(
      db,
      { tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA },
      SESION,
      opciones(),
    );
    expect(segundo.ok).toBe(false);
    if (!segundo.ok) expect(segundo.error.codigo).toBe('PIEZA_DESCONOCIDA');
  });
});

describe('reloj logico persistido', () => {
  it('avanza aunque el reloj del dispositivo retroceda', async () => {
    const primero = await registrarEvento(
      db,
      { tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA },
      SESION,
      opciones(),
    );
    reloj.retroceder(10_000); // alguien corrigio la hora del celular
    const segundo = await registrarEvento(
      db,
      { tipo: 'CONFIRMAR_SALIDA', codigo: CODIGO, maletaId: MALETA },
      SESION,
      opciones(),
    );

    expect(primero.ok && segundo.ok).toBe(true);
    if (!primero.ok || !segundo.ok) return;

    const hlcPrimero = primero.valor.evento.sobre.hlc;
    const hlcSegundo = segundo.valor.evento.sobre.hlc;
    expect(hlcSegundo > hlcPrimero).toBe(true);
    expect(milisDe(hlcSegundo)).toBe(milisDe(hlcPrimero));
  });

  it('sobrevive al cierre y reapertura de la base', async () => {
    await registrarEvento(
      db,
      { tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA },
      SESION,
      opciones(),
    );
    const guardado = await db.meta.get('reloj-hlc');
    expect(guardado).toBeDefined();
  });
});
