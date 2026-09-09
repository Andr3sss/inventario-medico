import Dexie, { type EntityTable } from 'dexie';
import type { Evento, Pieza, Rol } from '@crearcos/core';

/** Fila del catalogo replicada en el dispositivo. */
export interface FilaCatalogo {
  readonly sku: string;
  readonly nombre: string;
  readonly tipo: 'INSTRUMENTAL' | 'INSUMO' | 'KIT';
  readonly costoBase: number;
}

/**
 * Evento almacenado. `enviado` marca si ya fue confirmado por el servidor.
 * El log es de solo agregado: un evento jamas se edita ni se borra.
 */
export interface FilaEvento {
  readonly eventoId: string;
  readonly codigo: string;
  readonly tipo: string;
  readonly hlc: string;
  readonly evento: Evento;
  enviado: 0 | 1;
}

/** Cola de salida. `seq` es autoincremental y define el orden de envio. */
export interface FilaOutbox {
  seq?: number;
  readonly eventoId: string;
  readonly codigo: string;
  intentos: number;
  proximoIntento: number;
  ultimoError: string | null;
}

/**
 * Eventos que el servidor rechazo de forma definitiva. No se descartan nunca:
 * un dato perdido en silencio es peor que un dato en cuarentena.
 */
export interface FilaFallido {
  readonly eventoId: string;
  readonly codigo: string;
  readonly motivo: string;
  readonly evento: Evento;
  readonly registradoEn: number;
}

/** Conflicto detectado al sincronizar. Lo resuelve la Coordinadora. */
export interface FilaConflicto {
  readonly conflictoId: string;
  readonly codigo: string;
  readonly detectadoEn: number;
  readonly detalle: unknown;
  estado: 'ABIERTO' | 'RESUELTO';
}

/**
 * Credencial local de un usuario.
 *
 * El hash vive en el dispositivo para permitir entrar sin internet. Es una
 * decision consciente con un costo: quien robe el equipo puede intentar romper
 * el hash sin limite de red. Por eso el derivado es PBKDF2 con iteraciones
 * altas y la sesion caduca, en vez de quedar abierta para siempre.
 */
export interface FilaUsuario {
  readonly usuarioId: string;
  readonly nombre: string;
  readonly rol: Rol;
  activo: boolean;
  readonly hash: string;
  readonly sal: string;
  readonly iteraciones: number;
  intentosFallidos: number;
  bloqueadoHasta: number | null;
}

/** Clave-valor para reloj logico, cursor de sincronizacion y sesion. */
export interface FilaMeta {
  readonly clave: string;
  readonly valor: unknown;
}

export class BaseLocal extends Dexie {
  piezas!: EntityTable<Pieza, 'codigo'>;
  catalogo!: EntityTable<FilaCatalogo, 'sku'>;
  eventos!: EntityTable<FilaEvento, 'eventoId'>;
  outbox!: EntityTable<FilaOutbox, 'seq'>;
  fallidos!: EntityTable<FilaFallido, 'eventoId'>;
  conflictos!: EntityTable<FilaConflicto, 'conflictoId'>;
  meta!: EntityTable<FilaMeta, 'clave'>;
  usuarios!: EntityTable<FilaUsuario, 'usuarioId'>;

  constructor(nombre = 'crearcos-inventario') {
    super(nombre);
    // Version 1. Cada cambio de esquema sube el numero y agrega su upgrade:
    // los dispositivos en campo pueden estar dos versiones atrasados.
    this.version(1).stores({
      piezas: 'codigo, sku, estado, maletaId, parentCodigo',
      catalogo: 'sku, tipo',
      // El indice compuesto [codigo+hlc] permite leer el ultimo evento de una
      // pieza en tiempo logaritmico, sin recorrer todo el historial.
      eventos: 'eventoId, codigo, hlc, enviado, [codigo+hlc]',
      outbox: '++seq, eventoId, codigo, proximoIntento',
      fallidos: 'eventoId, codigo',
      conflictos: 'conflictoId, codigo, estado',
      meta: 'clave',
    });

    // Version 2: credenciales locales para poder entrar sin internet.
    // Cada cambio de esquema sube el numero y deja el anterior intacto, porque
    // un dispositivo en campo puede estar dos versiones atrasado.
    this.version(2).stores({
      usuarios: 'usuarioId, rol, activo',
    });
  }
}

export const CLAVE_RELOJ = 'reloj-hlc';
export const CLAVE_CURSOR = 'cursor-servidor';
export const CLAVE_SESION = 'sesion-activa';

/**
 * Pide al navegador que no desaloje el almacenamiento.
 *
 * Sin esto, Safari y algunos Android borran IndexedDB por presion de espacio o
 * por inactividad, y con ello una maleta entera. Devuelve false cuando el
 * navegador no concede la persistencia, y en ese caso la app debe avisarlo.
 */
export async function asegurarPersistencia(): Promise<boolean> {
  // Navegadores viejos no traen la API, por eso el tipo es opcional a proposito.
  const almacenamiento = (globalThis.navigator as { storage?: StorageManager }).storage;
  if (typeof almacenamiento?.persist !== 'function') return false;
  if (await almacenamiento.persisted()) return true;
  return almacenamiento.persist();
}
