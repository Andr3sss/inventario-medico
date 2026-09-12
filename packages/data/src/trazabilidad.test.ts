import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { maletaId } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import { registrarEvento } from './escaneo.js';
import { historialDePieza } from './trazabilidad.js';
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

describe('historialDePieza', () => {
  it('devuelve los eventos en el orden en que ocurrieron, mas antiguo primero', async () => {
    await registrarEvento(db, { tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA }, SESION, opciones());
    reloj.avanzar(200);
    await registrarEvento(db, { tipo: 'CONFIRMAR_SALIDA', codigo: CODIGO, maletaId: MALETA }, SESION, opciones());
    reloj.avanzar(200);
    await registrarEvento(db, { tipo: 'ESCANEO_USO', codigo: CODIGO, maletaId: MALETA }, SESION, opciones());

    const historial = await historialDePieza(db, 'INS-4471');
    expect(historial.map((e) => e.cuerpo.tipo)).toEqual(['ESCANEO_ARMADO', 'CONFIRMAR_SALIDA', 'ESCANEO_USO']);
  });

  it('devuelve vacio para una pieza sin eventos', async () => {
    expect(await historialDePieza(db, 'INS-9999')).toEqual([]);
  });
});
