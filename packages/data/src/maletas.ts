import {
  aplicarEventoMaleta,
  codigoPieza as crearCodigoPieza,
  eventoId as crearEventoId,
  maletaId as crearMaletaId,
  fallo,
  ok,
  serializar,
  type CuerpoEventoMaleta,
  type Maleta,
  type Pieza,
  type Resultado,
} from '@crearcos/core';
import type { BaseLocal, EventoSincronizable } from './db.js';
import { escribirEventoPieza, type Sesion } from './escaneo.js';
import { avanzarReloj } from './reloj.js';
import { AZAR_CRIPTOGRAFICO, uuidV7, type FuenteAzar } from './identificadores.js';
import { encolarOperacion } from './operaciones.js';

export interface OpcionesMaleta {
  readonly ahora: () => number;
  readonly azar?: FuenteAzar;
}

/**
 * Un solo codigo de error para todo el modulo de maletas, a proposito: quien
 * consume esto (hoy la app, manana Codex) programa contra una forma unica en
 * vez de una por operacion. `detalle` trae el error de origen cuando viene de
 * la maquina de estados de la pieza o del motor de precios, para depuracion,
 * pero el campo que se debe usar para decidir que mostrar es `codigo`.
 */
export type CodigoErrorMaleta =
  | 'MALETA_NO_ENCONTRADA'
  | 'ESTADO_INVALIDO'
  | 'MALETA_VACIA'
  | 'PIEZA_DESCONOCIDA'
  | 'REBOTE_DE_LECTOR'
  | 'TRANSICION_RECHAZADA'
  | 'ROL_NO_AUTORIZADO'
  | 'PRECIO_NO_RESUELTO';

export interface ErrorMaleta {
  readonly codigo: CodigoErrorMaleta;
  readonly mensaje: string;
  readonly detalle?: unknown;
}

const errorMaleta = (
  codigo: CodigoErrorMaleta,
  mensaje: string,
  detalle?: unknown,
): ErrorMaleta => ({
  codigo,
  mensaje,
  detalle,
});

async function construirEventoMaleta(
  db: BaseLocal,
  cuerpo: CuerpoEventoMaleta,
  sesion: Sesion,
  relojPared: number,
  azar: FuenteAzar,
) {
  const hlc = await avanzarReloj(db, sesion.dispositivoId, relojPared);
  return {
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
}

export interface DatosMaletaNueva {
  readonly responsableId: string;
  readonly procedimiento: string | null;
}

/**
 * Abre una maleta nueva, vacia, en EN_ARMADO. El id se genera en el
 * dispositivo (decision 2: nunca autoincremento de servidor) a partir de un
 * UUIDv7, asi que dos auxiliares sin internet pueden crear maletas al mismo
 * tiempo sin chocar.
 */
export async function crearMaleta(
  db: BaseLocal,
  datos: DatosMaletaNueva,
  sesion: Sesion,
  opciones: OpcionesMaleta,
): Promise<Resultado<Maleta, ErrorMaleta>> {
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const relojPared = opciones.ahora();
  const id = crearMaletaId(uuidV7(relojPared, azar));
  const creadaEn = new Date(relojPared).toISOString();

  return db.transaction(
    'rw',
    [db.maletas, db.eventosMaleta, db.operacionesSync, db.meta],
    async () => {
      const maleta: Maleta = {
        id,
        responsableId: sesion.usuarioId,
        procedimiento: datos.procedimiento,
        hospitalId: null,
        estado: 'EN_ARMADO',
        creadaEn,
        salioEn: null,
        cerradaEn: null,
        canceladaEn: null,
        version: 1,
      };
      const evento = await construirEventoMaleta(
        db,
        { tipo: 'MALETA_ABIERTA', maletaId: id, procedimiento: datos.procedimiento },
        sesion,
        relojPared,
        azar,
      );
      await db.maletas.add(maleta);
      await db.eventosMaleta.add({
        eventoId: evento.sobre.eventoId,
        operacionId: evento.sobre.eventoId,
        maletaId: id,
        tipo: 'MALETA_ABIERTA',
        hlc: evento.sobre.hlc,
        evento,
        enviado: 0,
      });
      await encolarOperacion(db, evento.sobre.eventoId, [evento], relojPared);
      return ok(maleta);
    },
  );
}

/** Espejo local de RespuestaEscaneo (ver escaneo.ts), para las piezas de una maleta. */
export type CodigoResultadoEscaneo =
  'EXITO' | 'REBOTE_IGNORADO' | 'PIEZA_NO_ENCONTRADA' | 'ESTADO_INVALIDO' | 'NO_AUTORIZADO';

export interface RespuestaEscaneo {
  readonly codigo: CodigoResultadoEscaneo;
  readonly mensaje: string;
  readonly pieza: Pieza | null;
}

/**
 * Escanea una pieza hacia la maleta (armado). Valida que la maleta exista y
 * siga EN_ARMADO antes de delegar en la maquina de estados de la pieza: el
 * estado de la pieza por si solo no sabe si su maleta ya salio o se cerro.
 */
export async function escanearArmado(
  db: BaseLocal,
  codigo: string,
  maletaIdTexto: string,
  sesion: Sesion,
  opciones: OpcionesMaleta,
): Promise<Resultado<RespuestaEscaneo, ErrorMaleta>> {
  const relojPared = opciones.ahora();
  const idMaleta = crearMaletaId(maletaIdTexto);

  return db.transaction(
    'rw',
    [db.maletas, db.piezas, db.eventos, db.outbox, db.operacionesSync, db.meta],
    async () => {
      const maleta = await db.maletas.get(idMaleta);
      if (maleta === undefined) {
        return fallo(
          errorMaleta(
            'MALETA_NO_ENCONTRADA',
            `La maleta ${maletaIdTexto} no existe en este dispositivo`,
          ),
        );
      }
      if (maleta.estado !== 'EN_ARMADO') {
        return fallo(
          errorMaleta('ESTADO_INVALIDO', `La maleta esta ${maleta.estado}, no admite mas armado`),
        );
      }

      const pieza = await db.piezas.get(crearCodigoPieza(codigo));
      if (pieza === undefined) {
        return ok<RespuestaEscaneo>({
          codigo: 'PIEZA_NO_ENCONTRADA',
          mensaje: `El codigo ${codigo} no existe`,
          pieza: null,
        });
      }

      const r = await escribirEventoPieza(
        db,
        pieza,
        { tipo: 'ESCANEO_ARMADO', codigo: pieza.codigo, maletaId: idMaleta },
        sesion,
        relojPared,
        opciones,
      );
      if (!r.ok) {
        if (r.error.codigo === 'REBOTE_DE_LECTOR') {
          return ok<RespuestaEscaneo>({
            codigo: 'REBOTE_IGNORADO',
            mensaje: r.error.mensaje,
            pieza,
          });
        }
        const noAutorizado = r.error.detalle?.codigo === 'ROL_NO_AUTORIZADO';
        return ok<RespuestaEscaneo>({
          codigo: noAutorizado ? 'NO_AUTORIZADO' : 'ESTADO_INVALIDO',
          mensaje: r.error.mensaje,
          pieza,
        });
      }
      return ok<RespuestaEscaneo>({
        codigo: 'EXITO',
        mensaje: 'Pieza agregada a la maleta',
        pieza: r.valor.pieza,
      });
    },
  );
}

/** Retira una pieza de una maleta que todavia esta en armado (arrepentimiento antes de salir). */
export async function retirarDeArmado(
  db: BaseLocal,
  codigo: string,
  sesion: Sesion,
  opciones: OpcionesMaleta,
): Promise<Resultado<RespuestaEscaneo, ErrorMaleta>> {
  const relojPared = opciones.ahora();
  return db.transaction(
    'rw',
    [db.piezas, db.eventos, db.outbox, db.operacionesSync, db.meta],
    async () => {
      const pieza = await db.piezas.get(crearCodigoPieza(codigo));
      if (pieza === undefined) {
        return ok<RespuestaEscaneo>({
          codigo: 'PIEZA_NO_ENCONTRADA',
          mensaje: `El codigo ${codigo} no existe`,
          pieza: null,
        });
      }
      const r = await escribirEventoPieza(
        db,
        pieza,
        { tipo: 'ESCANEO_ARMADO_REVERSO', codigo: pieza.codigo },
        sesion,
        relojPared,
        opciones,
      );
      if (!r.ok) {
        return ok<RespuestaEscaneo>({
          codigo: r.error.codigo === 'REBOTE_DE_LECTOR' ? 'REBOTE_IGNORADO' : 'ESTADO_INVALIDO',
          mensaje: r.error.mensaje,
          pieza,
        });
      }
      return ok<RespuestaEscaneo>({
        codigo: 'EXITO',
        mensaje: 'Pieza retirada de la maleta',
        pieza: r.valor.pieza,
      });
    },
  );
}

/** Escanea una pieza como efectivamente usada durante la cirugia. */
export async function escanearUso(
  db: BaseLocal,
  codigo: string,
  maletaIdTexto: string,
  sesion: Sesion,
  opciones: OpcionesMaleta,
): Promise<Resultado<RespuestaEscaneo, ErrorMaleta>> {
  const relojPared = opciones.ahora();
  const idMaleta = crearMaletaId(maletaIdTexto);
  return db.transaction(
    'rw',
    [db.piezas, db.eventos, db.outbox, db.operacionesSync, db.meta],
    async () => {
      const pieza = await db.piezas.get(crearCodigoPieza(codigo));
      if (pieza === undefined) {
        return ok<RespuestaEscaneo>({
          codigo: 'PIEZA_NO_ENCONTRADA',
          mensaje: `El codigo ${codigo} no existe`,
          pieza: null,
        });
      }
      const r = await escribirEventoPieza(
        db,
        pieza,
        { tipo: 'ESCANEO_USO', codigo: pieza.codigo, maletaId: idMaleta },
        sesion,
        relojPared,
        opciones,
      );
      if (!r.ok) {
        if (r.error.codigo === 'REBOTE_DE_LECTOR') {
          return ok<RespuestaEscaneo>({
            codigo: 'REBOTE_IGNORADO',
            mensaje: r.error.mensaje,
            pieza,
          });
        }
        const noAutorizado = r.error.detalle?.codigo === 'ROL_NO_AUTORIZADO';
        return ok<RespuestaEscaneo>({
          codigo: noAutorizado ? 'NO_AUTORIZADO' : 'ESTADO_INVALIDO',
          mensaje: r.error.mensaje,
          pieza,
        });
      }
      return ok<RespuestaEscaneo>({
        codigo: 'EXITO',
        mensaje: 'Uso registrado',
        pieza: r.valor.pieza,
      });
    },
  );
}

export interface ResumenConfirmarSalida {
  readonly maleta: Maleta;
  readonly piezasConfirmadas: number;
}

/**
 * Confirma que la maleta sale de bodega: todas sus piezas ASIGNADA_A_MALETA
 * pasan a EN_MALETA_ACTIVA, y la maleta misma pasa a EN_CIRUGIA. Todo en una
 * sola transaccion (decision 14, extendida a la maleta).
 *
 * Idempotente: si la maleta ya esta EN_CIRUGIA, devuelve su estado actual sin
 * volver a emitir eventos, para que un reintento de red o un doble tap del
 * boton no dupliquen la salida.
 */
export async function confirmarSalidaMaleta(
  db: BaseLocal,
  maletaIdTexto: string,
  sesion: Sesion,
  opciones: OpcionesMaleta,
): Promise<Resultado<ResumenConfirmarSalida, ErrorMaleta>> {
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const relojPared = opciones.ahora();
  const idMaleta = crearMaletaId(maletaIdTexto);
  const operacionId = uuidV7(relojPared, azar);

  return db.transaction(
    'rw',
    [db.maletas, db.eventosMaleta, db.piezas, db.eventos, db.outbox, db.operacionesSync, db.meta],
    async () => {
      const maleta = await db.maletas.get(idMaleta);
      if (maleta === undefined) {
        return fallo(errorMaleta('MALETA_NO_ENCONTRADA', `La maleta ${maletaIdTexto} no existe`));
      }
      if (maleta.estado === 'EN_CIRUGIA') {
        return ok<ResumenConfirmarSalida>({ maleta, piezasConfirmadas: 0 });
      }
      if (maleta.estado !== 'EN_ARMADO') {
        return fallo(
          errorMaleta(
            'ESTADO_INVALIDO',
            `La maleta esta ${maleta.estado}, no se puede confirmar salida`,
          ),
        );
      }

      const asignadas = await db.piezas
        .where('maletaId')
        .equals(idMaleta)
        .and((p) => p.estado === 'ASIGNADA_A_MALETA')
        .toArray();

      if (asignadas.length === 0) {
        return fallo(errorMaleta('MALETA_VACIA', 'La maleta no tiene piezas armadas todavia'));
      }

      const eventosPieza: EventoSincronizable[] = [];
      for (const pieza of asignadas) {
        const r = await escribirEventoPieza(
          db,
          pieza,
          { tipo: 'CONFIRMAR_SALIDA', codigo: pieza.codigo, maletaId: idMaleta },
          sesion,
          relojPared,
          { ...opciones, operacionId, encolarOperacion: false },
        );
        if (!r.ok) {
          return fallo(errorMaleta('TRANSICION_RECHAZADA', r.error.mensaje, r.error.detalle));
        }
        eventosPieza.push(r.valor.evento);
      }

      const evento = await construirEventoMaleta(
        db,
        { tipo: 'MALETA_SALIO', maletaId: idMaleta },
        sesion,
        relojPared,
        azar,
      );
      const transicion = aplicarEventoMaleta(maleta, evento);
      if (!transicion.ok) {
        return fallo(
          errorMaleta('TRANSICION_RECHAZADA', transicion.error.mensaje, transicion.error),
        );
      }
      await db.eventosMaleta.add({
        eventoId: evento.sobre.eventoId,
        operacionId,
        maletaId: idMaleta,
        tipo: 'MALETA_SALIO',
        hlc: evento.sobre.hlc,
        evento,
        enviado: 0,
      });
      await db.maletas.put(transicion.valor);
      // En el servidor la maleta debe pasar primero a EN_CIRUGIA; despues sus
      // piezas pueden confirmar salida. Todo queda en el mismo commit.
      await encolarOperacion(db, operacionId, [evento, ...eventosPieza], relojPared);

      return ok<ResumenConfirmarSalida>({
        maleta: transicion.valor,
        piezasConfirmadas: asignadas.length,
      });
    },
  );
}

/** Cancela una maleta que todavia no salio de bodega (se armo por error). */
export async function cancelarMaleta(
  db: BaseLocal,
  maletaIdTexto: string,
  motivo: string,
  sesion: Sesion,
  opciones: OpcionesMaleta,
): Promise<Resultado<Maleta, ErrorMaleta>> {
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const relojPared = opciones.ahora();
  const idMaleta = crearMaletaId(maletaIdTexto);
  const operacionId = uuidV7(relojPared, azar);

  return db.transaction(
    'rw',
    [db.maletas, db.eventosMaleta, db.piezas, db.eventos, db.outbox, db.operacionesSync, db.meta],
    async () => {
      const maleta = await db.maletas.get(idMaleta);
      if (maleta === undefined) {
        return fallo(errorMaleta('MALETA_NO_ENCONTRADA', `La maleta ${maletaIdTexto} no existe`));
      }

      // Cualquier pieza ya armada vuelve a su bodega antes de cancelar, para no
      // dejarla apuntando a una maleta que dejo de existir en la practica.
      const asignadas = await db.piezas.where('maletaId').equals(idMaleta).toArray();
      const eventosPieza: EventoSincronizable[] = [];
      for (const pieza of asignadas) {
        if (pieza.estado !== 'ASIGNADA_A_MALETA') continue;
        const r = await escribirEventoPieza(
          db,
          pieza,
          { tipo: 'ESCANEO_ARMADO_REVERSO', codigo: pieza.codigo },
          sesion,
          relojPared,
          { ...opciones, operacionId, encolarOperacion: false },
        );
        if (!r.ok)
          return fallo(errorMaleta('TRANSICION_RECHAZADA', r.error.mensaje, r.error.detalle));
        eventosPieza.push(r.valor.evento);
      }

      const evento = await construirEventoMaleta(
        db,
        { tipo: 'MALETA_CANCELADA', maletaId: idMaleta, motivo },
        sesion,
        relojPared,
        azar,
      );
      const transicion = aplicarEventoMaleta(maleta, evento);
      if (!transicion.ok)
        return fallo(errorMaleta('ESTADO_INVALIDO', transicion.error.mensaje, transicion.error));

      await db.eventosMaleta.add({
        eventoId: evento.sobre.eventoId,
        operacionId,
        maletaId: idMaleta,
        tipo: 'MALETA_CANCELADA',
        hlc: evento.sobre.hlc,
        evento,
        enviado: 0,
      });
      await db.maletas.put(transicion.valor);
      await encolarOperacion(db, operacionId, [...eventosPieza, evento], relojPared);
      return ok(transicion.valor);
    },
  );
}

export interface DetalleMaleta {
  readonly maleta: Maleta;
  readonly piezas: readonly Pieza[];
}

export async function obtenerMaleta(
  db: BaseLocal,
  maletaIdTexto: string,
): Promise<DetalleMaleta | undefined> {
  const idMaleta = crearMaletaId(maletaIdTexto);
  const maleta = await db.maletas.get(idMaleta);
  if (maleta === undefined) return undefined;
  const piezas = await db.piezas.where('maletaId').equals(idMaleta).toArray();
  return { maleta, piezas };
}

export interface FiltroMaletas {
  readonly estado?: Maleta['estado'];
  readonly responsableId?: string;
}

/** Lista simple, mas nueva primero. El volumen esperado por dispositivo es bajo (decenas, no miles). */
export async function listarMaletas(
  db: BaseLocal,
  filtro: FiltroMaletas = {},
): Promise<readonly Maleta[]> {
  const coleccion =
    filtro.estado === undefined
      ? db.maletas.toCollection()
      : db.maletas.where('estado').equals(filtro.estado);
  const todas = await coleccion.toArray();
  const filtradas =
    filtro.responsableId === undefined
      ? todas
      : todas.filter((m) => m.responsableId === filtro.responsableId);
  return [...filtradas].sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
}
