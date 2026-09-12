import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import {
  codigoPieza,
  conflictoId,
  dispositivoId,
  eventoId,
  maletaId,
  usuarioId,
  type Evento,
  type EventoMaleta,
} from '@crearcos/core';
import { BaseLocal, type FilaEvento, type FilaEventoMaleta, type FilaInboxSync } from './db.js';

let secuenciaBase = 0;
type FilaEventoMaletaV5 = Omit<FilaEventoMaleta, 'hlc'>;

class BaseVersion5 extends Dexie {
  constructor(nombre: string) {
    super(nombre);
    this.version(5).stores({
      eventos: 'eventoId, operacionId, codigo, hlc, enviado, [codigo+hlc]',
      eventosMaleta: 'eventoId, operacionId, maletaId, enviado',
      inboxSync: 'id, aplicado, entidadTipo, [secuenciaServidor+ordinal]',
      meta: 'clave',
    });
  }
}

describe('migracion local v6', () => {
  it('reabre el historial previo y reinicia una sola vez el PULL completo', async () => {
    secuenciaBase += 1;
    const nombre = `migracion-v6-${secuenciaBase.toString()}`;
    const idMaleta = maletaId('00000000-0000-4000-8000-000000000101');
    const idEventoMaleta = eventoId('00000000-0000-4000-8000-000000000102');
    const idEventoSintetico = eventoId('00000000-0000-4000-8000-000000000103');
    const sobreBase = {
      hlc: '1700000000000:00000:PC-BODEGA-01',
      dispositivoId: dispositivoId('PC-BODEGA-01'),
      usuarioId: usuarioId('u-aux-1'),
      registradoEn: '2023-11-14T22:13:20.000Z',
    };
    const eventoMaleta: EventoMaleta = {
      sobre: { ...sobreBase, eventoId: idEventoMaleta, rol: 'AUXILIAR' },
      cuerpo: { tipo: 'MALETA_ABIERTA', maletaId: idMaleta, procedimiento: null },
    };
    const eventoSintetico: Evento = {
      sobre: { ...sobreBase, eventoId: idEventoSintetico, rol: 'SISTEMA' },
      cuerpo: {
        tipo: 'CONFLICTO_SYNC',
        codigo: codigoPieza('INS-4471'),
        conflictoId: conflictoId('00000000-0000-4000-8000-000000000104'),
      },
    };
    const inbox: FilaInboxSync = {
      id: '9:000001',
      secuenciaServidor: '9',
      ordinal: 1,
      entidadTipo: 'EVENTO_DOMINIO',
      entidadId: idEventoMaleta,
      version: 1,
      eliminado: false,
      payload: {},
      aplicado: 1,
      error: 'ERROR_ANTERIOR',
    };

    const antigua = new BaseVersion5(nombre);
    await antigua.open();
    await antigua.table<FilaEventoMaletaV5, string>('eventosMaleta').put({
      eventoId: idEventoMaleta,
      operacionId: idEventoMaleta,
      maletaId: idMaleta,
      tipo: 'MALETA_ABIERTA',
      evento: eventoMaleta,
      enviado: 1,
    });
    await antigua.table<FilaEvento, string>('eventos').put({
      eventoId: idEventoSintetico,
      operacionId: idEventoSintetico,
      codigo: eventoSintetico.cuerpo.codigo,
      tipo: 'CONFLICTO_SYNC',
      hlc: eventoSintetico.sobre.hlc,
      evento: eventoSintetico,
      enviado: 1,
    });
    await antigua.table<FilaInboxSync, string>('inboxSync').put(inbox);
    await antigua.table('meta').put({ clave: 'cursor-servidor', valor: '9' });
    antigua.close();

    const actual = new BaseLocal(nombre);
    try {
      await actual.open();
      expect((await actual.eventosMaleta.get(idEventoMaleta))?.hlc).toBe(eventoMaleta.sobre.hlc);
      expect(await actual.eventos.get(idEventoSintetico)).toBeUndefined();
      expect(await actual.inboxSync.get(inbox.id)).toMatchObject({ aplicado: 0, error: null });
      expect(await actual.meta.get('cursor-servidor')).toBeUndefined();
    } finally {
      await actual.delete();
    }
  });
});
