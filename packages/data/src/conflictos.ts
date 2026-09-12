import {
  codigoPieza as crearCodigoPieza,
  fallo,
  ok,
  type CodigoPieza,
  type EstadoPieza,
  type MaletaId,
  type Pieza,
  type Resultado,
  type Ubicacion,
} from '@crearcos/core';
import type { BaseLocal, FilaConflicto } from './db.js';
import { escribirEventoPieza, type Sesion } from './escaneo.js';
import type { FuenteAzar } from './identificadores.js';

export interface OpcionesConflicto {
  readonly ahora: () => number;
  readonly azar?: FuenteAzar;
}

export type CodigoErrorConflicto =
  | 'CONFLICTO_NO_ENCONTRADO'
  | 'CONFLICTO_YA_RESUELTO'
  | 'PIEZA_NO_ENCONTRADA'
  | 'TRANSICION_RECHAZADA';

export interface ErrorConflicto {
  readonly codigo: CodigoErrorConflicto;
  readonly mensaje: string;
}

export interface ConflictoConPieza {
  readonly conflicto: FilaConflicto;
  readonly pieza: Pieza | undefined;
}

export async function listarConflictos(
  db: BaseLocal,
  filtro: { readonly estado?: FilaConflicto['estado'] } = {},
): Promise<readonly ConflictoConPieza[]> {
  const conflictos =
    filtro.estado === undefined
      ? await db.conflictos.toArray()
      : await db.conflictos.where('estado').equals(filtro.estado).toArray();
  const conPieza = await Promise.all(
    conflictos.map(async (conflicto) => ({
      conflicto,
      pieza: await db.piezas.get(crearCodigoPieza(conflicto.codigo)),
    })),
  );
  return conPieza.sort((a, b) => b.conflicto.detectadoEn - a.conflicto.detectadoEn);
}

export async function obtenerConflicto(
  db: BaseLocal,
  conflictoIdTexto: string,
): Promise<ConflictoConPieza | undefined> {
  const conflicto = await db.conflictos.get(conflictoIdTexto);
  if (conflicto === undefined) return undefined;
  return { conflicto, pieza: await db.piezas.get(crearCodigoPieza(conflicto.codigo)) };
}

export interface DatosResolucionConflicto {
  readonly estadoAdjudicado: EstadoPieza;
  readonly ubicacion: Ubicacion;
  readonly maletaId: MaletaId | null;
  /** Texto libre. Codex puede ofrecer motivos predefinidos, incluyendo "etiqueta fisica duplicada" (decision 9). */
  readonly motivo: string;
}

/**
 * Resolucion manual de un conflicto. Solo la Coordinadora (ya lo exige la
 * maquina de estados de Pieza). Marca el conflicto RESUELTO en la misma
 * transaccion que libera la pieza.
 */
export async function resolverConflicto(
  db: BaseLocal,
  conflictoIdTexto: string,
  datos: DatosResolucionConflicto,
  sesion: Sesion,
  opciones: OpcionesConflicto,
): Promise<Resultado<Pieza, ErrorConflicto>> {
  const relojPared = opciones.ahora();

  return db.transaction(
    'rw',
    [db.conflictos, db.piezas, db.eventos, db.outbox, db.operacionesSync, db.meta],
    async () => {
      const conflicto = await db.conflictos.get(conflictoIdTexto);
      if (conflicto === undefined) {
        return fallo({
          codigo: 'CONFLICTO_NO_ENCONTRADO',
          mensaje: `El conflicto ${conflictoIdTexto} no existe`,
        });
      }
      if (conflicto.estado === 'RESUELTO') {
        return fallo({
          codigo: 'CONFLICTO_YA_RESUELTO',
          mensaje: 'Este conflicto ya fue resuelto',
        });
      }

      const codigo: CodigoPieza = crearCodigoPieza(conflicto.codigo);
      const pieza = await db.piezas.get(codigo);
      if (pieza === undefined) {
        return fallo({
          codigo: 'PIEZA_NO_ENCONTRADA',
          mensaje: `La pieza ${conflicto.codigo} no existe`,
        });
      }

      const r = await escribirEventoPieza(
        db,
        pieza,
        {
          tipo: 'RESOLUCION_MANUAL',
          codigo,
          estadoAdjudicado: datos.estadoAdjudicado,
          ubicacion: datos.ubicacion,
          maletaId: datos.maletaId,
          motivo: datos.motivo,
        },
        sesion,
        relojPared,
        opciones,
      );
      if (!r.ok) return fallo({ codigo: 'TRANSICION_RECHAZADA', mensaje: r.error.mensaje });

      await db.conflictos.update(conflictoIdTexto, { estado: 'RESUELTO' });
      return ok(r.valor.pieza);
    },
  );
}
