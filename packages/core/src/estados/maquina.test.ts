import { describe, expect, it } from 'vitest';
import { aplicarEvento, reproducir } from './maquina.js';
import { BODEGA_CENTRAL, bodegaDe, type EstadoPieza } from './tipos.js';
import { CODIGO, MALETA_A, MALETA_B, eventoDe, piezaDe } from '../pruebas/fabricas.js';
import { codigoPieza, conflictoId, usuarioId } from '../comun/marcas.js';

const exigirOk = <T>(r: { ok: true; valor: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`Se esperaba ok: ${JSON.stringify(r.error)}`);
  return r.valor;
};

describe('camino feliz completo', () => {
  it('recorre bodega, maleta, cirugia, factura y reproceso', () => {
    const inicial = piezaDe();
    const historia = [
      eventoDe({ tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA_A }, 'AUXILIAR'),
      eventoDe({ tipo: 'CONFIRMAR_SALIDA', codigo: CODIGO, maletaId: MALETA_A }, 'AUXILIAR'),
      eventoDe({ tipo: 'ESCANEO_USO', codigo: CODIGO, maletaId: MALETA_A }, 'FREELANCE'),
      eventoDe({ tipo: 'CONFIRMAR_FACTURA', codigo: CODIGO }, 'CONTABLE'),
      eventoDe({ tipo: 'INGRESO_REPROCESO', codigo: CODIGO }, 'COORDINADORA'),
      eventoDe(
        { tipo: 'FIN_REPROCESO', codigo: CODIGO, destino: bodegaDe(usuarioId('u-inst-1')) },
        'COORDINADORA',
      ),
    ];

    const final = exigirOk(reproducir(inicial, historia));

    expect(final.estado).toBe<EstadoPieza>('EN_BODEGA_INSTRUMENTISTA');
    expect(final.ubicacion).toEqual(bodegaDe(usuarioId('u-inst-1')));
    expect(final.maletaId).toBeNull();
    expect(final.version).toBe(inicial.version + historia.length);
  });

  it('una pieza puede salir, no usarse y volver a salir en la misma semana', () => {
    const primeraSalida = exigirOk(
      reproducir(piezaDe(), [
        eventoDe({ tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA_A }, 'AUXILIAR'),
        eventoDe({ tipo: 'CONFIRMAR_SALIDA', codigo: CODIGO, maletaId: MALETA_A }, 'AUXILIAR'),
        eventoDe({ tipo: 'CIERRE_MALETA_SIN_USO', codigo: CODIGO, maletaId: MALETA_A }, 'AUXILIAR'),
        eventoDe(
          { tipo: 'FIN_REPROCESO', codigo: CODIGO, destino: BODEGA_CENTRAL },
          'COORDINADORA',
        ),
      ]),
    );
    expect(primeraSalida.estado).toBe<EstadoPieza>('EN_BODEGA_CENTRAL');

    const segundaSalida = exigirOk(
      aplicarEvento(
        primeraSalida,
        eventoDe({ tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA_B }, 'AUXILIAR'),
      ),
    );
    expect(segundaSalida.maletaId).toBe(MALETA_B);
  });

  it('el insumo se consume al facturarse y el instrumental no', () => {
    const base = piezaDe({ estado: 'USADA_PENDIENTE_VALORACION', maletaId: MALETA_A });
    const evento = eventoDe({ tipo: 'CONFIRMAR_FACTURA', codigo: CODIGO }, 'CONTABLE');

    expect(exigirOk(aplicarEvento({ ...base, tipo: 'INSUMO' }, evento)).estado).toBe('CONSUMIDA');
    expect(exigirOk(aplicarEvento({ ...base, tipo: 'INSTRUMENTAL' }, evento)).estado).toBe(
      'FACTURADA',
    );
  });
});

describe('transiciones ilegales', () => {
  it('no permite registrar uso de una pieza que sigue en bodega', () => {
    const r = aplicarEvento(
      piezaDe(),
      eventoDe({ tipo: 'ESCANEO_USO', codigo: CODIGO, maletaId: MALETA_A }, 'AUXILIAR'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('TRANSICION_ILEGAL');
  });

  it('no permite usar una pieza en una maleta distinta a la que salio', () => {
    const enMaleta = piezaDe({ estado: 'EN_MALETA_ACTIVA', maletaId: MALETA_A });
    const r = aplicarEvento(
      enMaleta,
      eventoDe({ tipo: 'ESCANEO_USO', codigo: CODIGO, maletaId: MALETA_B }, 'AUXILIAR'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('MALETA_NO_COINCIDE');
  });

  it('rechaza un evento dirigido a otra pieza', () => {
    const r = aplicarEvento(
      piezaDe(),
      eventoDe(
        { tipo: 'ESCANEO_ARMADO', codigo: codigoPieza('OTRA-999'), maletaId: MALETA_A },
        'AUXILIAR',
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('CODIGO_NO_COINCIDE');
  });

  it('no deja facturar a quien no es contable', () => {
    const r = aplicarEvento(
      piezaDe({ estado: 'USADA_PENDIENTE_VALORACION' }),
      eventoDe({ tipo: 'CONFIRMAR_FACTURA', codigo: CODIGO }, 'AUXILIAR'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('ROL_NO_AUTORIZADO');
  });

  it('no admite eventos sobre una pieza ya consumida', () => {
    const r = aplicarEvento(
      piezaDe({ estado: 'CONSUMIDA', tipo: 'INSUMO' }),
      eventoDe({ tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA_A }, 'AUXILIAR'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('PIEZA_EN_ESTADO_TERMINAL');
  });
});

describe('congelamiento por conflicto', () => {
  const enConflicto = () =>
    exigirOk(
      aplicarEvento(
        piezaDe({ estado: 'EN_MALETA_ACTIVA', maletaId: MALETA_A }),
        eventoDe(
          { tipo: 'CONFLICTO_SYNC', codigo: CODIGO, conflictoId: conflictoId('cf-1') },
          'SISTEMA',
        ),
      ),
    );

  it('bloquea cualquier escaneo mientras el conflicto no se resuelve', () => {
    const r = aplicarEvento(
      enConflicto(),
      eventoDe({ tipo: 'ESCANEO_USO', codigo: CODIGO, maletaId: MALETA_A }, 'FREELANCE'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('PIEZA_CONGELADA');
  });

  it('la coordinadora adjudica la pieza y la libera', () => {
    const resuelta = exigirOk(
      aplicarEvento(
        enConflicto(),
        eventoDe(
          {
            tipo: 'RESOLUCION_MANUAL',
            codigo: CODIGO,
            estadoAdjudicado: 'EN_MALETA_ACTIVA',
            ubicacion: BODEGA_CENTRAL,
            maletaId: MALETA_B,
            motivo: 'Etiqueta duplicada, se adjudica a la maleta 885',
          },
          'COORDINADORA',
        ),
      ),
    );
    expect(resuelta.estado).toBe<EstadoPieza>('EN_MALETA_ACTIVA');
    expect(resuelta.maletaId).toBe(MALETA_B);
  });

  it('no permite adjudicar un estado que no es de reposo valido', () => {
    const r = aplicarEvento(
      enConflicto(),
      eventoDe(
        {
          tipo: 'RESOLUCION_MANUAL',
          codigo: CODIGO,
          estadoAdjudicado: 'FACTURADA',
          ubicacion: BODEGA_CENTRAL,
          maletaId: null,
          motivo: 'intento invalido',
        },
        'COORDINADORA',
      ),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('ESTADO_ADJUDICADO_INVALIDO');
  });
});

describe('inmutabilidad', () => {
  it('no muta la pieza recibida', () => {
    const original = piezaDe();
    const copia = { ...original };
    aplicarEvento(
      original,
      eventoDe({ tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA_A }, 'AUXILIAR'),
    );
    expect(original).toEqual(copia);
  });
});
