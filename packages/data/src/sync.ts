import {
  aplicarEvento,
  codigoPieza as crearCodigoPieza,
  conflictoId as crearConflictoId,
  eventoId as crearEventoId,
  esquemaLoteSync,
  serializar,
  usuarioId as crearUsuarioId,
  type DispositivoId,
  type Evento,
  type LoteSync,
  type Pieza,
} from '@crearcos/core';
import type { BaseLocal, FilaOutbox } from './db.js';
import { CLAVE_CURSOR } from './db.js';
import { avanzarReloj } from './reloj.js';
import { AZAR_CRIPTOGRAFICO, uuidV7, type FuenteAzar } from './identificadores.js';

export interface EventoRechazado {
  readonly eventoId: string;
  readonly motivo: string;
}

export interface ConflictoReportado {
  readonly eventoId: string;
  readonly codigo: string;
  readonly conflictoId: string;
  readonly detalle: unknown;
}

export interface RespuestaSync {
  readonly aceptados: readonly string[];
  readonly rechazados: readonly EventoRechazado[];
  readonly conflictos: readonly ConflictoReportado[];
  /** Estado autoritativo de las piezas que cambiaron desde el cursor anterior. */
  readonly piezas: readonly Pieza[];
  readonly cursorServidor: string | null;
}

export interface Transporte {
  enviar: (lote: LoteSync) => Promise<RespuestaSync>;
}

export type EstadoSync = 'COMPLETADO' | 'SIN_CONEXION' | 'YA_EN_CURSO' | 'LOTE_INVALIDO';

export interface ResumenSync {
  readonly estado: EstadoSync;
  readonly enviados: number;
  readonly aceptados: number;
  readonly rechazados: number;
  readonly conflictos: number;
  readonly piezasActualizadas: number;
  readonly piezasOmitidas: number;
  readonly mensaje: string | null;
}

export interface OpcionesSync {
  readonly dispositivoId: DispositivoId;
  readonly ahora: () => number;
  readonly tamanoLote?: number;
  readonly azar?: FuenteAzar;
}

const TAMANO_LOTE = 200;
const RETRASO_BASE_MS = 2_000;
const RETRASO_MAXIMO_MS = 5 * 60 * 1000;

/** Bases que ya tienen una sincronizacion corriendo. Evita lotes solapados. */
const enCurso = new Set<BaseLocal>();

/**
 * Retraso exponencial con dispersion.
 *
 * Sin la dispersion, veinte dispositivos que perdieron la red en el mismo
 * apagon vuelven a golpear el servidor exactamente en el mismo instante.
 */
export function retrasoReintento(intentos: number, azar: FuenteAzar): number {
  const exponencial = Math.min(RETRASO_BASE_MS * 2 ** Math.max(0, intentos - 1), RETRASO_MAXIMO_MS);
  const dispersion = azar.enteroAleatorio(Math.floor(exponencial / 2) + 1);
  return exponencial + dispersion;
}

const vacio = (estado: EstadoSync, mensaje: string | null): ResumenSync => ({
  estado,
  enviados: 0,
  aceptados: 0,
  rechazados: 0,
  conflictos: 0,
  piezasActualizadas: 0,
  piezasOmitidas: 0,
  mensaje,
});

/**
 * Envia lo pendiente y aplica lo que devuelve el servidor.
 *
 * Garantias:
 *  - La cola solo se vacia con confirmacion explicita del servidor. Un fallo de
 *    red reprograma el reintento y no pierde nada.
 *  - Nada se descarta en silencio: lo rechazado de forma definitiva va a la
 *    tabla de fallidos para que alguien lo revise.
 *  - Los cambios que bajan del servidor no pisan una pieza que todavia tiene
 *    eventos locales sin enviar. Esa pieza se reconcilia en la siguiente vuelta.
 */
export async function sincronizar(
  db: BaseLocal,
  transporte: Transporte,
  opciones: OpcionesSync,
): Promise<ResumenSync> {
  if (enCurso.has(db)) return vacio('YA_EN_CURSO', 'Ya hay una sincronizacion en curso');
  enCurso.add(db);

  try {
    const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
    const ahora = opciones.ahora();
    const limite = opciones.tamanoLote ?? TAMANO_LOTE;

    const pendientes = (await db.outbox.orderBy('seq').toArray())
      .filter((fila) => fila.proximoIntento <= ahora)
      .slice(0, limite);

    const eventos: Evento[] = [];
    for (const fila of pendientes) {
      const guardado = await db.eventos.get(fila.eventoId);
      if (guardado === undefined) {
        // La cola apunta a un evento que no existe. Se limpia en vez de
        // reintentar para siempre contra un id fantasma.
        await db.outbox.where('eventoId').equals(fila.eventoId).delete();
        continue;
      }
      eventos.push(guardado.evento);
    }

    const cursorGuardado = await db.meta.get(CLAVE_CURSOR);
    const cursor = typeof cursorGuardado?.valor === 'string' ? cursorGuardado.valor : null;

    const lote: LoteSync = {
      dispositivoId: opciones.dispositivoId,
      cursorServidor: cursor,
      eventos,
    };

    // Se valida el payload propio antes de salir a la red. Si una version vieja
    // de la app dejo un evento con forma invalida, es mejor detectarlo aqui que
    // recibir un 400 opaco del servidor.
    const validado = esquemaLoteSync.safeParse(lote);
    if (!validado.success) {
      return vacio('LOTE_INVALIDO', validado.error.issues[0]?.message ?? 'Lote invalido');
    }

    let respuesta: RespuestaSync;
    try {
      respuesta = await transporte.enviar(lote);
    } catch (causa) {
      const mensaje = causa instanceof Error ? causa.message : 'Fallo de red';
      await reprogramar(db, pendientes, opciones.ahora(), mensaje, azar);
      return {
        ...vacio('SIN_CONEXION', mensaje),
        enviados: eventos.length,
      };
    }

    const aceptados = await confirmarAceptados(db, respuesta.aceptados);
    const rechazados = await archivarRechazados(db, respuesta.rechazados, opciones.ahora());
    const conflictos = await marcarConflictos(db, respuesta.conflictos, opciones, azar);
    const { actualizadas, omitidas } = await aplicarDeltas(db, respuesta.piezas);

    if (respuesta.cursorServidor !== null) {
      await db.meta.put({ clave: CLAVE_CURSOR, valor: respuesta.cursorServidor });
    }

    return {
      estado: 'COMPLETADO',
      enviados: eventos.length,
      aceptados,
      rechazados,
      conflictos,
      piezasActualizadas: actualizadas,
      piezasOmitidas: omitidas,
      mensaje: null,
    };
  } finally {
    enCurso.delete(db);
  }
}

async function reprogramar(
  db: BaseLocal,
  pendientes: readonly FilaOutbox[],
  ahora: number,
  mensaje: string,
  azar: FuenteAzar,
): Promise<void> {
  await db.transaction('rw', db.outbox, async () => {
    for (const fila of pendientes) {
      if (fila.seq === undefined) continue;
      const intentos = fila.intentos + 1;
      await db.outbox.update(fila.seq, {
        intentos,
        proximoIntento: ahora + retrasoReintento(intentos, azar),
        ultimoError: mensaje,
      });
    }
  });
}

async function confirmarAceptados(db: BaseLocal, aceptados: readonly string[]): Promise<number> {
  if (aceptados.length === 0) return 0;
  await db.transaction('rw', [db.eventos, db.outbox], async () => {
    for (const id of aceptados) {
      await db.eventos.update(id, { enviado: 1 });
      await db.outbox.where('eventoId').equals(id).delete();
    }
  });
  return aceptados.length;
}

/**
 * Un rechazo del servidor es definitivo, no se reintenta. El evento sale de la
 * cola y queda en cuarentena con su motivo, porque un dato perdido en silencio
 * es peor que un dato que alguien tiene que revisar.
 */
async function archivarRechazados(
  db: BaseLocal,
  rechazados: readonly EventoRechazado[],
  ahora: number,
): Promise<number> {
  if (rechazados.length === 0) return 0;
  await db.transaction('rw', [db.eventos, db.outbox, db.fallidos], async () => {
    for (const rechazo of rechazados) {
      const guardado = await db.eventos.get(rechazo.eventoId);
      if (guardado !== undefined) {
        await db.fallidos.put({
          eventoId: rechazo.eventoId,
          codigo: guardado.codigo,
          motivo: rechazo.motivo,
          evento: guardado.evento,
          registradoEn: ahora,
        });
      }
      await db.outbox.where('eventoId').equals(rechazo.eventoId).delete();
    }
  });
  return rechazados.length;
}

/**
 * Congela localmente la pieza reclamada por dos maletas y abre el registro que
 * la Coordinadora vera en su bandeja.
 */
async function marcarConflictos(
  db: BaseLocal,
  conflictos: readonly ConflictoReportado[],
  opciones: OpcionesSync,
  azar: FuenteAzar,
): Promise<number> {
  if (conflictos.length === 0) return 0;
  let aplicados = 0;

  for (const conflicto of conflictos) {
    const relojPared = opciones.ahora();
    await db.transaction(
      'rw',
      [db.piezas, db.eventos, db.outbox, db.conflictos, db.meta],
      async () => {
        const pieza = await db.piezas.get(crearCodigoPieza(conflicto.codigo));
        if (pieza === undefined) return;

        const hlc = await avanzarReloj(db, opciones.dispositivoId, relojPared);
        const evento: Evento = {
          sobre: {
            eventoId: crearEventoId(uuidV7(relojPared, azar)),
            hlc: serializar(hlc),
            dispositivoId: opciones.dispositivoId,
            usuarioId: crearUsuarioId('sistema'),
            rol: 'SISTEMA',
            registradoEn: new Date(relojPared).toISOString(),
          },
          cuerpo: {
            tipo: 'CONFLICTO_SYNC',
            codigo: pieza.codigo,
            conflictoId: crearConflictoId(conflicto.conflictoId),
          },
        };

        const transicion = aplicarEvento(pieza, evento);
        if (!transicion.ok) return;

        await db.eventos.add({
          eventoId: evento.sobre.eventoId,
          codigo: pieza.codigo,
          tipo: evento.cuerpo.tipo,
          hlc: evento.sobre.hlc,
          evento,
          // El servidor ya sabe del conflicto, este evento no vuelve a subir.
          enviado: 1,
        });
        await db.piezas.put(transicion.valor);
        await db.conflictos.put({
          conflictoId: conflicto.conflictoId,
          codigo: pieza.codigo,
          detectadoEn: relojPared,
          detalle: conflicto.detalle,
          estado: 'ABIERTO',
        });
        await db.outbox.where('eventoId').equals(conflicto.eventoId).delete();
        aplicados += 1;
      },
    );
  }

  return aplicados;
}

/**
 * Aplica el estado autoritativo del servidor.
 *
 * Se omite toda pieza con eventos locales sin enviar: pisarla borraria escaneos
 * que el servidor todavia no ha visto. Esa pieza se reconcilia en la vuelta
 * siguiente, cuando su cola ya este vacia.
 */
async function aplicarDeltas(
  db: BaseLocal,
  piezas: readonly Pieza[],
): Promise<{ actualizadas: number; omitidas: number }> {
  let actualizadas = 0;
  let omitidas = 0;
  if (piezas.length === 0) return { actualizadas, omitidas };

  await db.transaction('rw', [db.piezas, db.outbox], async () => {
    for (const remota of piezas) {
      const pendiente = await db.outbox.where('codigo').equals(remota.codigo).count();
      if (pendiente > 0) {
        omitidas += 1;
        continue;
      }
      const local = await db.piezas.get(remota.codigo);
      if (local !== undefined && local.version >= remota.version) {
        omitidas += 1;
        continue;
      }
      await db.piezas.put(remota);
      actualizadas += 1;
    }
  });

  return { actualizadas, omitidas };
}
