import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { maletaId, type LoteSync } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import { registrarEvento } from './escaneo.js';
import { retrasoReintento, sincronizar, type RespuestaSync, type Transporte } from './sync.js';
import { AZAR_FIJO, CODIGO, SESION, baseDePrueba, piezaDe, relojFalso } from './pruebas/entorno.js';

const MALETA = maletaId('MAL-882');

let db: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;

const respuestaVacia: RespuestaSync = {
  aceptados: [],
  rechazados: [],
  conflictos: [],
  piezas: [],
  cursorServidor: null,
};

const transporteQue = (
  responder: (lote: LoteSync) => Promise<RespuestaSync>,
): Transporte & { lotes: LoteSync[] } => {
  const lotes: LoteSync[] = [];
  return {
    lotes,
    enviar: async (lote) => {
      lotes.push(lote);
      return responder(lote);
    },
  };
};

const opcionesSync = () => ({
  dispositivoId: SESION.dispositivoId,
  ahora: reloj.ahora,
  azar: AZAR_FIJO,
});

async function escanearArmado(): Promise<string> {
  const r = await registrarEvento(
    db,
    { tipo: 'ESCANEO_ARMADO', codigo: CODIGO, maletaId: MALETA },
    SESION,
    { ahora: reloj.ahora, azar: AZAR_FIJO },
  );
  if (!r.ok) throw new Error('El escaneo de preparacion fallo');
  return r.valor.evento.sobre.eventoId;
}

beforeEach(async () => {
  db = await baseDePrueba();
  reloj = relojFalso();
  await db.piezas.put(piezaDe());
});

afterEach(() => {
  db.close();
});

describe('envio de pendientes', () => {
  it('vacia la cola solo con confirmacion del servidor', async () => {
    const id = await escanearArmado();
    const transporte = transporteQue(async (lote) =>
      Promise.resolve({
        ...respuestaVacia,
        aceptados: lote.eventos.map((e) => e.sobre.eventoId),
        cursorServidor: 'cur-1',
      }),
    );

    const resumen = await sincronizar(db, transporte, opcionesSync());

    expect(resumen.estado).toBe('COMPLETADO');
    expect(resumen.aceptados).toBe(1);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.eventos.get(id))?.enviado).toBe(1);
    expect((await db.meta.get('cursor-servidor'))?.valor).toBe('cur-1');
  });

  it('conserva la cola intacta cuando no hay red', async () => {
    await escanearArmado();
    const transporte = transporteQue(() => Promise.reject(new Error('Sin conexion')));

    const resumen = await sincronizar(db, transporte, opcionesSync());

    expect(resumen.estado).toBe('SIN_CONEXION');
    const cola = await db.outbox.toArray();
    expect(cola).toHaveLength(1);
    expect(cola[0]?.intentos).toBe(1);
    expect(cola[0]?.proximoIntento).toBeGreaterThan(reloj.ahora());
    expect(cola[0]?.ultimoError).toBe('Sin conexion');
  });

  it('no reenvia un evento cuyo reintento aun no vence', async () => {
    await escanearArmado();
    const caido = transporteQue(() => Promise.reject(new Error('Sin conexion')));
    await sincronizar(db, caido, opcionesSync());

    const segundo = transporteQue(async () => Promise.resolve(respuestaVacia));
    await sincronizar(db, segundo, opcionesSync());

    expect(segundo.lotes[0]?.eventos).toHaveLength(0);
  });

  it('el retraso crece y nunca es exacto entre dispositivos', () => {
    const sinDispersion = { enteroAleatorio: () => 0 };
    expect(retrasoReintento(1, sinDispersion)).toBe(2_000);
    expect(retrasoReintento(3, sinDispersion)).toBe(8_000);
    expect(retrasoReintento(20, sinDispersion)).toBe(300_000);
    expect(retrasoReintento(2, AZAR_FIJO)).toBeGreaterThan(4_000);
  });
});

describe('rechazos definitivos', () => {
  it('pone el evento en cuarentena en vez de descartarlo', async () => {
    const id = await escanearArmado();
    const transporte = transporteQue(async () =>
      Promise.resolve({
        ...respuestaVacia,
        rechazados: [{ eventoId: id, motivo: 'Version de esquema no soportada' }],
      }),
    );

    const resumen = await sincronizar(db, transporte, opcionesSync());

    expect(resumen.rechazados).toBe(1);
    expect(await db.outbox.count()).toBe(0);
    const fallido = await db.fallidos.get(id);
    expect(fallido?.motivo).toBe('Version de esquema no soportada');
    expect(fallido?.evento).toBeDefined();
  });
});

describe('conflictos', () => {
  it('congela la pieza y abre el registro para la Coordinadora', async () => {
    const id = await escanearArmado();
    const transporte = transporteQue(async () =>
      Promise.resolve({
        ...respuestaVacia,
        conflictos: [
          {
            eventoId: id,
            codigo: CODIGO,
            conflictoId: 'cf-1',
            detalle: { reclamaciones: ['MAL-882', 'MAL-885'] },
          },
        ],
      }),
    );

    const resumen = await sincronizar(db, transporte, opcionesSync());

    expect(resumen.conflictos).toBe(1);
    expect((await db.piezas.get(CODIGO))?.estado).toBe('EN_CONFLICTO');
    expect((await db.conflictos.get('cf-1'))?.estado).toBe('ABIERTO');
    expect(await db.outbox.count()).toBe(0);
  });

  it('bloquea cualquier escaneo posterior sobre la pieza congelada', async () => {
    const id = await escanearArmado();
    await sincronizar(
      db,
      transporteQue(async () =>
        Promise.resolve({
          ...respuestaVacia,
          conflictos: [{ eventoId: id, codigo: CODIGO, conflictoId: 'cf-2', detalle: null }],
        }),
      ),
      opcionesSync(),
    );

    reloj.avanzar(5_000);
    const intento = await registrarEvento(
      db,
      { tipo: 'CONFIRMAR_SALIDA', codigo: CODIGO, maletaId: MALETA },
      SESION,
      { ahora: reloj.ahora, azar: AZAR_FIJO },
    );

    expect(intento.ok).toBe(false);
    if (!intento.ok) expect(intento.error.detalle?.codigo).toBe('PIEZA_CONGELADA');
  });
});

describe('cambios que bajan del servidor', () => {
  it('aplica la version mas nueva del servidor', async () => {
    const remota = piezaDe({ estado: 'EN_REPROCESAMIENTO', version: 9 });
    const resumen = await sincronizar(
      db,
      transporteQue(async () => Promise.resolve({ ...respuestaVacia, piezas: [remota] })),
      opcionesSync(),
    );

    expect(resumen.piezasActualizadas).toBe(1);
    expect((await db.piezas.get(CODIGO))?.estado).toBe('EN_REPROCESAMIENTO');
  });

  it('no pisa una pieza que todavia tiene escaneos sin enviar', async () => {
    await escanearArmado();
    const remota = piezaDe({ estado: 'EN_REPROCESAMIENTO', version: 99 });

    const resumen = await sincronizar(
      db,
      transporteQue(async () => Promise.resolve({ ...respuestaVacia, piezas: [remota] })),
      opcionesSync(),
    );

    expect(resumen.piezasOmitidas).toBe(1);
    expect((await db.piezas.get(CODIGO))?.estado).toBe('ASIGNADA_A_MALETA');
  });

  it('conserva el cambio omitido en inbox y lo aplica despues del ACK', async () => {
    const eventoId = await escanearArmado();
    const remota = piezaDe({ estado: 'EN_REPROCESAMIENTO', version: 99 });

    await sincronizar(
      db,
      transporteQue(async () =>
        Promise.resolve({ ...respuestaVacia, piezas: [remota], cursorServidor: 'cur-99' }),
      ),
      opcionesSync(),
    );

    const retenida = await db.inboxSync.toArray();
    expect(retenida).toHaveLength(1);
    expect(retenida[0]?.aplicado).toBe(0);
    expect((await db.meta.get('cursor-servidor'))?.valor).toBe('cur-99');

    await sincronizar(
      db,
      transporteQue(async () =>
        Promise.resolve({ ...respuestaVacia, aceptados: [eventoId], cursorServidor: 'cur-99' }),
      ),
      opcionesSync(),
    );

    expect((await db.inboxSync.toArray())[0]?.aplicado).toBe(1);
    expect((await db.piezas.get(CODIGO))?.estado).toBe('EN_REPROCESAMIENTO');
  });

  it('persiste agregados no nativos en la replica generica', async () => {
    const respuesta: RespuestaSync = {
      ...respuestaVacia,
      cursorServidor: '42',
      commits: [
        {
          secuenciaServidor: '42',
          commitId: '00000000-0000-4000-8000-000000000042',
          creadoEn: new Date(reloj.ahora()).toISOString(),
          cambios: [
            {
              ordinal: 0,
              entidadTipo: 'MALETA_ITEM',
              entidadId: '00000000-0000-4000-8000-000000000043',
              version: 3,
              eliminado: false,
              payload: { resultado: 'UTILIZADA' },
            },
          ],
        },
      ],
    };
    await sincronizar(
      db,
      transporteQue(async () => Promise.resolve(respuesta)),
      opcionesSync(),
    );

    const copia = await db.replicaCentral.get('MALETA_ITEM:00000000-0000-4000-8000-000000000043');
    expect(copia?.version).toBe(3);
    expect((await db.inboxSync.toArray())[0]?.aplicado).toBe(1);
  });

  it('ignora una version mas vieja que la local', async () => {
    const remota = piezaDe({ estado: 'EN_REPROCESAMIENTO', version: 1 });
    const resumen = await sincronizar(
      db,
      transporteQue(async () => Promise.resolve({ ...respuestaVacia, piezas: [remota] })),
      opcionesSync(),
    );

    expect(resumen.piezasActualizadas).toBe(0);
    expect((await db.piezas.get(CODIGO))?.estado).toBe('EN_BODEGA_CENTRAL');
  });
});

describe('concurrencia', () => {
  it('no permite dos sincronizaciones solapadas sobre la misma base', async () => {
    await escanearArmado();
    let liberar: () => void = () => undefined;
    const espera = new Promise<void>((resolver) => {
      liberar = resolver;
    });

    const transporte = transporteQue(async () => {
      await espera;
      return respuestaVacia;
    });

    const primera = sincronizar(db, transporte, opcionesSync());
    const segunda = await sincronizar(db, transporte, opcionesSync());

    expect(segunda.estado).toBe('YA_EN_CURSO');
    liberar();
    expect((await primera).estado).toBe('COMPLETADO');
    expect(transporte.lotes).toHaveLength(1);
  });
});
