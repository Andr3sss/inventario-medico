import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { centavos, codigoPieza, hospitalId, sku } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import { confirmarSalidaMaleta, crearMaleta, escanearArmado, escanearUso } from './maletas.js';
import { cerrarMaleta, definirCiudadBase, emitirFactura } from './facturacion.js';
import { AZAR_FIJO, SESION, baseDePrueba, piezaDe, relojFalso } from './pruebas/entorno.js';

const CONTABLE = { ...SESION, rol: 'CONTABLE' } as const;
const HOSPITAL = hospitalId('HOSP-1');
const CODIGO_2 = codigoPieza('INS-9002');

let db: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;

beforeEach(async () => {
  db = await baseDePrueba();
  reloj = relojFalso();
  await db.piezas.put(piezaDe());
  await db.piezas.put(piezaDe({ codigo: CODIGO_2 }));
  await db.catalogo.put({
    sku: 'TIJERA-MAYO-14',
    nombre: 'Tijera Mayo recta 14 cm',
    tipo: 'INSTRUMENTAL',
    costoBase: 4_200,
  });
  await db.hospitales.put({
    id: HOSPITAL,
    nombre: 'Hospital San Juan',
    ciudad: 'Guayaquil',
    nivelPorDefecto: 'HABITUAL',
  });
  await definirCiudadBase(db, 'Guayaquil');
});

afterEach(() => {
  db.close();
});

const opciones = () => ({ ahora: reloj.ahora, azar: AZAR_FIJO });

async function maletaEnCirugiaConUnaPiezaUsada() {
  const maleta = await crearMaleta(
    db,
    { responsableId: 'u-aux-1', procedimiento: null },
    SESION,
    opciones(),
  );
  if (!maleta.ok) throw new Error('setup');
  await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
  reloj.avanzar(200);
  await escanearArmado(db, 'INS-9002', maleta.valor.id, SESION, opciones());
  reloj.avanzar(200);
  await confirmarSalidaMaleta(db, maleta.valor.id, SESION, opciones());
  reloj.avanzar(200);
  await escanearUso(db, 'INS-4471', maleta.valor.id, SESION, opciones());
  reloj.avanzar(200);
  return maleta.valor;
}

describe('cerrarMaleta', () => {
  it('genera un borrador con el precio habitual y reprocesa lo no usado', async () => {
    const maleta = await maletaEnCirugiaConUnaPiezaUsada();
    const r = await cerrarMaleta(db, maleta.id, HOSPITAL, SESION, opciones());
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.valor.maleta.estado).toBe('CERRADA');
    expect(r.valor.maleta.hospitalId).toBe(HOSPITAL);
    expect(r.valor.piezasReprocesadas).toBe(1);
    expect(r.valor.factura).not.toBeNull();
    expect(r.valor.factura?.total).toBe(4_620); // 4200 + 10%
    expect(r.valor.factura?.lineas).toHaveLength(1);
    expect(r.valor.factura?.estado).toBe('BORRADOR');

    const noUsada = await db.piezas.get(CODIGO_2);
    expect(noUsada?.estado).toBe('EN_REPROCESAMIENTO');
    const usada = await db.piezas.get(codigoPieza('INS-4471'));
    expect(usada?.estado).toBe('USADA_PENDIENTE_VALORACION');
  });

  it('cierra sin factura cuando no se uso nada', async () => {
    const maleta = await crearMaleta(
      db,
      { responsableId: 'u-aux-1', procedimiento: null },
      SESION,
      opciones(),
    );
    if (!maleta.ok) throw new Error('setup');
    await escanearArmado(db, 'INS-4471', maleta.valor.id, SESION, opciones());
    reloj.avanzar(200);
    await confirmarSalidaMaleta(db, maleta.valor.id, SESION, opciones());
    reloj.avanzar(200);

    const r = await cerrarMaleta(db, maleta.valor.id, HOSPITAL, SESION, opciones());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.factura).toBeNull();
      expect(r.valor.piezasReprocesadas).toBe(1);
    }
  });

  it('rechaza cerrar contra un hospital que no existe', async () => {
    const maleta = await maletaEnCirugiaConUnaPiezaUsada();
    const r = await cerrarMaleta(db, maleta.id, 'HOSP-FANTASMA', SESION, opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('HOSPITAL_NO_ENCONTRADO');
  });

  it('es idempotente frente al estado: cerrar dos veces la segunda vez falla con ESTADO_INVALIDO', async () => {
    const maleta = await maletaEnCirugiaConUnaPiezaUsada();
    await cerrarMaleta(db, maleta.id, HOSPITAL, SESION, opciones());
    reloj.avanzar(200);
    const segunda = await cerrarMaleta(db, maleta.id, HOSPITAL, SESION, opciones());
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.error.codigo).toBe('ESTADO_INVALIDO');
  });
});

describe('emitirFactura', () => {
  it('confirma la factura y factura cada pieza de instrumental usada', async () => {
    const maleta = await maletaEnCirugiaConUnaPiezaUsada();
    const cierre = await cerrarMaleta(db, maleta.id, HOSPITAL, SESION, opciones());
    if (!cierre.ok || cierre.valor.factura === null) throw new Error('setup');
    reloj.avanzar(200);

    const r = await emitirFactura(db, cierre.valor.factura.id, CONTABLE, opciones());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.estado).toBe('EMITIDA');

    const pieza = await db.piezas.get(codigoPieza('INS-4471'));
    expect(pieza?.estado).toBe('FACTURADA'); // instrumental: se factura y vuelve a reprocesamiento despues, no desaparece
  });

  it('es idempotente: emitir dos veces la misma factura no vuelve a tocar las piezas', async () => {
    const maleta = await maletaEnCirugiaConUnaPiezaUsada();
    const cierre = await cerrarMaleta(db, maleta.id, HOSPITAL, SESION, opciones());
    if (!cierre.ok || cierre.valor.factura === null) throw new Error('setup');
    reloj.avanzar(200);
    await emitirFactura(db, cierre.valor.factura.id, CONTABLE, opciones());
    const eventosAntes = await db.eventos.count();

    reloj.avanzar(200);
    const segunda = await emitirFactura(db, cierre.valor.factura.id, CONTABLE, opciones());
    expect(segunda.ok).toBe(true);
    expect(await db.eventos.count()).toBe(eventosAntes);
  });

  it('bloquea la emision si hay una excepcion de precio pendiente de aprobacion', async () => {
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
    const maleta = await maletaEnCirugiaConUnaPiezaUsada();
    const cierre = await cerrarMaleta(db, maleta.id, HOSPITAL, SESION, opciones());
    if (!cierre.ok || cierre.valor.factura === null) throw new Error('setup');
    expect(cierre.valor.factura.lineas[0]?.precio.requiereAprobacion).toBe(true);

    reloj.avanzar(200);
    const r = await emitirFactura(db, cierre.valor.factura.id, CONTABLE, opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('LINEA_BLOQUEADA_POR_APROBACION');

    const pieza = await db.piezas.get(codigoPieza('INS-4471'));
    expect(pieza?.estado).toBe('USADA_PENDIENTE_VALORACION'); // no se toco ninguna pieza
  });

  it('usa una aprobada vigente aunque exista un rechazo historico mas reciente', async () => {
    await db.excepcionesPrecio.bulkPut([
      {
        id: 'exc-aprobada',
        sku: sku('TIJERA-MAYO-14'),
        hospitalId: HOSPITAL,
        valor: centavos(8_500),
        estado: 'APROBADO',
        vigenteDesde: '2020-01-01T00:00:00.000Z',
        vigenteHasta: null,
        motivoRechazo: null,
      },
      {
        id: 'exc-rechazada',
        sku: sku('TIJERA-MAYO-14'),
        hospitalId: HOSPITAL,
        valor: centavos(9_900),
        estado: 'RECHAZADO',
        vigenteDesde: '2021-01-01T00:00:00.000Z',
        vigenteHasta: null,
        motivoRechazo: 'No autorizada',
      },
    ]);
    const maleta = await maletaEnCirugiaConUnaPiezaUsada();
    const cierre = await cerrarMaleta(db, maleta.id, HOSPITAL, SESION, opciones());
    expect(cierre.ok).toBe(true);
    if (cierre.ok) expect(cierre.valor.factura?.total).toBe(8_500);
  });

  it('no emite parcialmente si falta una pieza del snapshot', async () => {
    const maleta = await maletaEnCirugiaConUnaPiezaUsada();
    const cierre = await cerrarMaleta(db, maleta.id, HOSPITAL, SESION, opciones());
    if (!cierre.ok || cierre.valor.factura === null) throw new Error('setup');
    await db.piezas.delete(codigoPieza('INS-4471'));

    const respuesta = await emitirFactura(db, cierre.valor.factura.id, CONTABLE, opciones());
    expect(respuesta.ok).toBe(false);
    expect((await db.facturas.get(cierre.valor.factura.id))?.estado).toBe('BORRADOR');
  });
});
