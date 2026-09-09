import Dexie from 'dexie';
import {
  aplicarEvento,
  eventoId as crearEventoId,
  fallo,
  ok,
  serializar,
  type CuerpoEvento,
  type DispositivoId,
  type ErrorTransicion,
  type Evento,
  type Pieza,
  type Resultado,
  type Rol,
  type UsuarioId,
} from '@crearcos/core';
import type { BaseLocal } from './db.js';
import { avanzarReloj, milisDe } from './reloj.js';
import { AZAR_CRIPTOGRAFICO, uuidV7, type FuenteAzar } from './identificadores.js';

export interface Sesion {
  readonly usuarioId: UsuarioId;
  readonly rol: Rol;
  readonly dispositivoId: DispositivoId;
}

export interface OpcionesRegistro {
  /** El reloj se inyecta para que las pruebas sean deterministas. */
  readonly ahora: () => number;
  readonly azar?: FuenteAzar;
  /** Ventana en la que un segundo disparo del lector se considera rebote. */
  readonly ventanaReboteMs?: number;
}

export type CodigoErrorRegistro = 'PIEZA_DESCONOCIDA' | 'REBOTE_DE_LECTOR' | 'TRANSICION_RECHAZADA';

export interface ErrorRegistro {
  readonly codigo: CodigoErrorRegistro;
  readonly mensaje: string;
  readonly detalle: ErrorTransicion | null;
}

export interface RegistroAplicado {
  readonly pieza: Pieza;
  readonly evento: Evento;
}

const VENTANA_REBOTE_MS = 400;

/**
 * Unica via para registrar un escaneo en el dispositivo.
 *
 * Las cuatro escrituras (reloj, evento, pieza, cola de salida) ocurren dentro de
 * una sola transaccion de IndexedDB. O quedan las cuatro o no queda ninguna: si
 * se corta la luz a mitad del escaneo, el auxiliar ve que no paso nada y vuelve
 * a escanear, en vez de tener una pieza movida sin evento que lo explique.
 *
 * Cuidado al modificar: dentro de la transaccion solo se pueden esperar promesas
 * de Dexie. Un `await fetch(...)` o un `await` a cualquier promesa ajena hace que
 * Dexie cierre la transaccion antes de tiempo y las escrituras se pierden.
 */
export async function registrarEvento(
  db: BaseLocal,
  cuerpo: CuerpoEvento,
  sesion: Sesion,
  opciones: OpcionesRegistro,
): Promise<Resultado<RegistroAplicado, ErrorRegistro>> {
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const ventana = opciones.ventanaReboteMs ?? VENTANA_REBOTE_MS;
  const relojPared = opciones.ahora();

  return db.transaction('rw', [db.piezas, db.eventos, db.outbox, db.meta], async () => {
    const pieza = await db.piezas.get(cuerpo.codigo);
    if (pieza === undefined) {
      return fallo({
        codigo: 'PIEZA_DESCONOCIDA',
        mensaje: `El codigo ${cuerpo.codigo} no existe en el inventario de este dispositivo`,
        detalle: null,
      });
    }

    // Los lectores HID a veces emiten dos veces la misma lectura. Sin esta
    // guarda, el segundo disparo genera un evento valido pero falso.
    const ultimo = await db.eventos
      .where('[codigo+hlc]')
      .between([cuerpo.codigo, Dexie.minKey], [cuerpo.codigo, Dexie.maxKey])
      .last();

    if (
      ultimo !== undefined &&
      ultimo.tipo === cuerpo.tipo &&
      relojPared - milisDe(ultimo.hlc) < ventana
    ) {
      return fallo({
        codigo: 'REBOTE_DE_LECTOR',
        mensaje: 'Lectura repetida del mismo codigo, se ignora',
        detalle: null,
      });
    }

    const hlc = await avanzarReloj(db, sesion.dispositivoId, relojPared);
    const evento: Evento = {
      sobre: {
        eventoId: crearEventoId(uuidV7(relojPared, azar)),
        hlc: serializar(hlc),
        dispositivoId: sesion.dispositivoId,
        usuarioId: sesion.usuarioId,
        rol: sesion.rol,
        registradoEn: new Date(relojPared).toISOString(),
      },
      cuerpo,
    };

    const transicion = aplicarEvento(pieza, evento);
    if (!transicion.ok) {
      // No se escribe nada. La transaccion se cierra sin efectos.
      return fallo({
        codigo: 'TRANSICION_RECHAZADA',
        mensaje: transicion.error.mensaje,
        detalle: transicion.error,
      });
    }

    await db.eventos.add({
      eventoId: evento.sobre.eventoId,
      codigo: cuerpo.codigo,
      tipo: cuerpo.tipo,
      hlc: evento.sobre.hlc,
      evento,
      enviado: 0,
    });
    await db.piezas.put(transicion.valor);
    await db.outbox.add({
      eventoId: evento.sobre.eventoId,
      codigo: cuerpo.codigo,
      intentos: 0,
      proximoIntento: relojPared,
      ultimoError: null,
    });

    return ok({ pieza: transicion.valor, evento });
  });
}
