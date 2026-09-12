import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { maletaId, type LoteSync } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import {
  clasificarSaludSincronizacion,
  diagnosticarSincronizacion,
  UMBRAL_COLA_ESTANCADA_MS,
} from './estado-sync.js';
import { registrarEvento } from './escaneo.js';
import { sincronizar, type RespuestaSync, type Transporte } from './sync.js';
import { AZAR_FIJO, CODIGO, SESION, baseDePrueba, piezaDe, relojFalso } from './pruebas/entorno.js';

const MALETA = maletaId('MAL-DIAGNOSTICO');
const RESPUESTA_VACIA: RespuestaSync = {
  aceptados: [],
  rechazados: [],
  conflictos: [],
  piezas: [],
  cursorServidor: null,
};

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

function transporte(responder: (lote: LoteSync) => Promise<RespuestaSync>): Transporte {
  return { enviar: responder };
}

const opciones = () => ({
  dispositivoId: SESION.dispositivoId,
  ahora: reloj.ahora,
  azar: AZAR_FIJO,
});

async function prepararPendiente(): Promise<string> {
  const resultado = await registrarEvento(
    db,
    { tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA },
    SESION,
    { ahora: reloj.ahora, azar: AZAR_FIJO },
  );
  if (!resultado.ok) throw new Error('No se pudo preparar el evento');
  return resultado.valor.evento.sobre.eventoId;
}

describe('diagnostico durable de sincronizacion', () => {
  it('no declara salud antes de completar la primera descarga', async () => {
    const diagnostico = await diagnosticarSincronizacion(db, reloj.ahora());

    expect(diagnostico.ultimaDescargaExitosaEn).toBeNull();
    expect(diagnostico.cursor).toBeNull();
    expect(diagnostico.pendientes).toBe(0);
    expect(
      clasificarSaludSincronizacion(diagnostico, {
        centralConfigurado: true,
        enLinea: true,
      }),
    ).toBe('SIN_VERIFICAR');
  });

  it('detecta una operacion que permanece demasiado tiempo en cola', async () => {
    await prepararPendiente();
    const reciente = await diagnosticarSincronizacion(db, reloj.ahora());
    expect(
      clasificarSaludSincronizacion(reciente, {
        centralConfigurado: true,
        enLinea: true,
      }),
    ).toBe('PENDIENTE');
    reloj.avanzar(UMBRAL_COLA_ESTANCADA_MS);

    const diagnostico = await diagnosticarSincronizacion(db, reloj.ahora());

    expect(diagnostico.pendientes).toBe(1);
    expect(diagnostico.colaEstancada).toBe(true);
    expect(
      clasificarSaludSincronizacion(diagnostico, {
        centralConfigurado: true,
        enLinea: true,
      }),
    ).toBe('ATRASADA');
  });

  it('persiste el fallo de red y lo limpia tras una descarga posterior', async () => {
    await prepararPendiente();
    await sincronizar(
      db,
      transporte(() => Promise.reject(new Error('RED_NO_DISPONIBLE'))),
      opciones(),
    );
    const fallido = await diagnosticarSincronizacion(db, reloj.ahora());
    expect(fallido.ultimoError?.mensaje).toBe('RED_NO_DISPONIBLE');
    expect(fallido.ultimaDescargaExitosaEn).toBeNull();

    reloj.avanzar(5_000);
    await sincronizar(
      db,
      transporte((lote) =>
        Promise.resolve({
          ...RESPUESTA_VACIA,
          aceptados: lote.eventos.map((evento) => evento.sobre.eventoId),
          cursorServidor: '17',
        }),
      ),
      opciones(),
    );
    const recuperado = await diagnosticarSincronizacion(db, reloj.ahora());
    expect(recuperado.ultimoError).toBeNull();
    expect(recuperado.ultimaDescargaExitosaEn).toBe(reloj.ahora());
    expect(recuperado.ultimoEnvioExitosoEn).toBe(reloj.ahora());
    expect(recuperado.cursor).toBe('17');
    expect(
      clasificarSaludSincronizacion(recuperado, {
        centralConfigurado: true,
        enLinea: true,
      }),
    ).toBe('SALUDABLE');
  });

  it('expone juntos la cuarentena y los errores pendientes del inbox', async () => {
    const eventoId = await prepararPendiente();
    await sincronizar(
      db,
      transporte(() =>
        Promise.resolve({
          ...RESPUESTA_VACIA,
          rechazados: [
            {
              eventoId,
              codigo: '23514',
              motivo: 'TRANSICION_CENTRAL_INVALIDA',
            },
          ],
          cursorServidor: '18',
          commits: [
            {
              secuenciaServidor: '18',
              commitId: '00000000-0000-4000-8000-000000000018',
              creadoEn: new Date(reloj.ahora()).toISOString(),
              cambios: [
                {
                  ordinal: 0,
                  entidadTipo: 'PIEZA',
                  entidadId: CODIGO,
                  version: 9,
                  eliminado: false,
                  payload: { dato: 'invalido' },
                },
              ],
            },
          ],
        }),
      ),
      opciones(),
    );

    const diagnostico = await diagnosticarSincronizacion(db, reloj.ahora());
    expect(diagnostico.fallidasTotal).toBe(1);
    expect(diagnostico.fallidas).toHaveLength(1);
    expect(diagnostico.fallidas[0]).toMatchObject({
      codigo: CODIGO,
      codigoError: '23514',
      motivo: 'TRANSICION_CENTRAL_INVALIDA',
    });
    expect(diagnostico.entradasNoAplicadas).toBe(1);
    expect(diagnostico.erroresProyeccion).toBe(1);
    expect(diagnostico.entradasConError[0]?.error).toBe('SNAPSHOT_PIEZA_INVALIDO');
    expect(diagnostico.ultimoError?.mensaje).toBe('SNAPSHOT_PIEZA_INVALIDO');
    expect(
      clasificarSaludSincronizacion(diagnostico, {
        centralConfigurado: true,
        enLinea: true,
      }),
    ).toBe('CON_INCIDENCIAS');
  });
});
