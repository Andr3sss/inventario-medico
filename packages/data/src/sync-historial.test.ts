import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  codigoPieza,
  dispositivoId,
  maletaId,
  type Evento,
  type EventoMaleta,
} from '@crearcos/core';
import type { BaseLocal, FilaEvento, FilaEventoMaleta } from './db.js';
import { registrarEvento } from './escaneo.js';
import { confirmarSalidaMaleta, crearMaleta, escanearArmado } from './maletas.js';
import { sincronizar, type CambioSync, type RespuestaSync, type Transporte } from './sync.js';
import { historialDeMaleta, historialDePieza } from './trazabilidad.js';
import { AZAR_FIJO, CODIGO, SESION, baseDePrueba, piezaDe, relojFalso } from './pruebas/entorno.js';

let origen: BaseLocal;
let destino: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;

beforeEach(async () => {
  origen = await baseDePrueba();
  destino = await baseDePrueba();
  reloj = relojFalso();
  await origen.piezas.put(piezaDe());
  await destino.piezas.put(piezaDe());
});

afterEach(() => {
  origen.close();
  destino.close();
});

const opcionesLocales = () => ({ ahora: reloj.ahora, azar: AZAR_FIJO });
const opcionesDestino = () => ({
  dispositivoId: dispositivoId('PC-BODEGA-02'),
  ahora: reloj.ahora,
  azar: AZAR_FIJO,
});

function cambioDePieza(fila: FilaEvento, ordinal: number): CambioSync {
  return cambioEvento(fila.evento, fila.operacionId, 'PIEZA', ordinal);
}

function cambioDeMaleta(fila: FilaEventoMaleta, ordinal: number): CambioSync {
  return cambioEvento(fila.evento, fila.operacionId, 'MALETA', ordinal);
}

function cambioEvento(
  evento: Evento | EventoMaleta,
  operacionId: string,
  tipoAgregado: 'PIEZA' | 'MALETA',
  ordinal: number,
): CambioSync {
  return {
    ordinal,
    entidadTipo: 'EVENTO_DOMINIO',
    entidadId: evento.sobre.eventoId,
    version: ordinal + 1,
    eliminado: false,
    payload: {
      id: evento.sobre.eventoId,
      operacion_id: operacionId,
      tipo_agregado: tipoAgregado,
      payload: evento,
      resultado: 'ACEPTADO',
      recibido_en_servidor: new Date(reloj.ahora()).toISOString(),
    },
  };
}

function respuestaCon(cambios: readonly CambioSync[], secuencia = '1'): RespuestaSync {
  return {
    aceptados: [],
    rechazados: [],
    conflictos: [],
    piezas: [],
    cursorServidor: secuencia,
    hayMas: false,
    commits: [
      {
        secuenciaServidor: secuencia,
        commitId: `00000000-0000-4000-8000-${secuencia.padStart(12, '0')}`,
        creadoEn: new Date(reloj.ahora()).toISOString(),
        cambios,
      },
    ],
  };
}

function transporteDe(respuesta: RespuestaSync): Transporte {
  return { enviar: () => Promise.resolve(respuesta) };
}

describe('proyeccion del historial central', () => {
  it('proyecta cursores bigint en orden numerico al cruzar de 9 a 10', async () => {
    const productoId = '00000000-0000-4000-8000-000000000001';
    const cambioProducto = (secuencia: string, nombre: string): CambioSync => ({
      ordinal: 0,
      entidadTipo: 'PRODUCTO',
      entidadId: productoId,
      version: Number(secuencia),
      eliminado: false,
      payload: {
        id: productoId,
        sku: 'ORDEN-CURSOR',
        nombre,
        tipo: 'INSTRUMENTAL',
        costo_base_centavos: 100,
      },
    });
    const respuesta: RespuestaSync = {
      aceptados: [],
      rechazados: [],
      conflictos: [],
      piezas: [],
      cursorServidor: '10',
      commits: [
        {
          secuenciaServidor: '10',
          commitId: '00000000-0000-4000-8000-000000000010',
          creadoEn: new Date(reloj.ahora()).toISOString(),
          cambios: [cambioProducto('10', 'Version nueva')],
        },
        {
          secuenciaServidor: '9',
          commitId: '00000000-0000-4000-8000-000000000009',
          creadoEn: new Date(reloj.ahora()).toISOString(),
          cambios: [cambioProducto('9', 'Version anterior')],
        },
      ],
    };

    await sincronizar(destino, transporteDe(respuesta), opcionesDestino());

    expect((await destino.catalogo.get('ORDEN-CURSOR'))?.nombre).toBe('Version nueva');
    expect((await destino.replicaCentral.get(`PRODUCTO:${productoId}`))?.version).toBe(10);
  });

  it('proyecta una excepción con el campo PostgreSQL precio_centavos', async () => {
    const productoId = '00000000-0000-4000-8000-000000000201';
    const excepcionId = '00000000-0000-4000-8000-000000000202';
    const hospitalId = '00000000-0000-4000-8000-000000000203';
    await destino.replicaCentral.put({
      clave: `PRODUCTO:${productoId}`,
      entidadTipo: 'PRODUCTO',
      entidadId: productoId,
      version: 1,
      eliminado: false,
      payload: { id: productoId, sku: 'PINZA-TEST' },
    });
    const cambio: CambioSync = {
      ordinal: 0,
      entidadTipo: 'EXCEPCION_PRECIO',
      entidadId: excepcionId,
      version: 1,
      eliminado: false,
      payload: {
        id: excepcionId,
        estado: 'APROBADO',
        hospital_id: hospitalId,
        producto_id: productoId,
        precio_centavos: 1500,
        vigente_desde: '2026-09-13T00:00:00+00:00',
        vigente_hasta: '2026-12-31T00:00:00+00:00',
      },
    };

    const resumen = await sincronizar(
      destino,
      transporteDe(respuestaCon([cambio], '37')),
      opcionesDestino(),
    );

    expect(resumen.erroresProyeccion).toBe(0);
    expect(await destino.excepcionesPrecio.get(excepcionId)).toMatchObject({
      sku: 'PINZA-TEST',
      hospitalId,
      valor: 1500,
      estado: 'APROBADO',
    });
    expect((await destino.inboxSync.get('37:000000'))?.aplicado).toBe(1);
  });

  it('resuelve el codigo de un conflicto central desde el snapshot de la pieza', async () => {
    const piezaId = '00000000-0000-4000-8000-000000000101';
    const idConflicto = '00000000-0000-4000-8000-000000000102';
    await destino.replicaCentral.put({
      clave: `PIEZA:${piezaId}`,
      entidadTipo: 'PIEZA',
      entidadId: piezaId,
      version: 2,
      eliminado: false,
      payload: { codigo: CODIGO },
    });
    const cambio: CambioSync = {
      ordinal: 0,
      entidadTipo: 'CONFLICTO',
      entidadId: idConflicto,
      version: 0,
      eliminado: false,
      payload: {
        id: idConflicto,
        pieza_id: piezaId,
        estado: 'ABIERTO',
        detectado_en: new Date(reloj.ahora()).toISOString(),
      },
    };

    const resultado = await sincronizar(
      destino,
      transporteDe(respuestaCon([cambio])),
      opcionesDestino(),
    );

    expect(resultado.erroresProyeccion).toBe(0);
    expect(await destino.conflictos.get(idConflicto)).toMatchObject({
      conflictoId: idConflicto,
      codigo: CODIGO,
      estado: 'ABIERTO',
    });
  });

  it('converge el historial de una pieza y no duplica un replay', async () => {
    const registrado = await registrarEvento(
      origen,
      { tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: maletaId('MAL-882') },
      SESION,
      opcionesLocales(),
    );
    if (!registrado.ok) throw new Error('No se pudo preparar el evento');
    const fila = await origen.eventos.get(registrado.valor.evento.sobre.eventoId);
    if (fila === undefined) throw new Error('Evento local ausente');
    const respuesta = respuestaCon([cambioDePieza(fila, 0)]);

    await sincronizar(destino, transporteDe(respuesta), opcionesDestino());
    await sincronizar(destino, transporteDe(respuesta), opcionesDestino());

    expect(await historialDePieza(destino, CODIGO)).toEqual(await historialDePieza(origen, CODIGO));
    expect(await destino.eventos.count()).toBe(1);
    expect((await destino.eventos.get(fila.eventoId))?.resultadoCentral).toBe('ACEPTADO');
  });

  it('converge el historial de maleta aunque los cambios lleguen en orden inverso', async () => {
    const creada = await crearMaleta(
      origen,
      { responsableId: SESION.usuarioId, procedimiento: 'Trauma menor' },
      SESION,
      opcionesLocales(),
    );
    if (!creada.ok) throw new Error('No se pudo crear la maleta');
    await escanearArmado(origen, CODIGO, creada.valor.id, SESION, opcionesLocales());
    reloj.avanzar(1_000);
    const salida = await confirmarSalidaMaleta(origen, creada.valor.id, SESION, opcionesLocales());
    if (!salida.ok) throw new Error('No se pudo confirmar la salida');
    const filas = await origen.eventosMaleta.toArray();
    const cambios = filas
      .slice()
      .reverse()
      .map((fila, indice) => cambioDeMaleta(fila, indice));

    await sincronizar(destino, transporteDe(respuestaCon(cambios)), opcionesDestino());

    expect(await historialDeMaleta(destino, creada.valor.id)).toEqual(
      await historialDeMaleta(origen, creada.valor.id),
    );
    expect(
      (await historialDeMaleta(destino, creada.valor.id)).map((evento) => evento.cuerpo.tipo),
    ).toEqual(['MALETA_ABIERTA', 'MALETA_SALIO']);
  });

  it('retiene en inbox un UUID remoto que intenta cambiar un evento inmutable', async () => {
    const registrado = await registrarEvento(
      origen,
      { tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: maletaId('MAL-882') },
      SESION,
      opcionesLocales(),
    );
    if (!registrado.ok) throw new Error('No se pudo preparar el evento');
    const fila = await origen.eventos.get(registrado.valor.evento.sobre.eventoId);
    if (fila === undefined) throw new Error('Evento local ausente');
    await sincronizar(
      destino,
      transporteDe(respuestaCon([cambioDePieza(fila, 0)])),
      opcionesDestino(),
    );

    const alterado: FilaEvento = {
      ...fila,
      evento: {
        ...fila.evento,
        cuerpo: { ...fila.evento.cuerpo, codigo: codigoPieza('INS-ALTERADA') },
      },
    };
    await sincronizar(
      destino,
      transporteDe(respuestaCon([cambioDePieza(alterado, 0)], '2')),
      opcionesDestino(),
    );

    expect((await destino.inboxSync.get('2:000000'))?.error).toBe('EVENTO_PIEZA_REMOTO_DIVERGENTE');
    expect((await destino.eventos.get(fila.eventoId))?.evento).toEqual(fila.evento);
  });
});
