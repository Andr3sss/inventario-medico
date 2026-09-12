import Dexie, { type EntityTable } from 'dexie';
import type {
  Evento,
  EventoMaleta,
  ExcepcionPrecio,
  Factura,
  Hospital,
  Maleta,
  Pieza,
  Rol,
} from '@crearcos/core';

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
  /** Agrupa eventos que el servidor debe confirmar o rechazar como una unidad. */
  readonly operacionId: string;
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
  readonly evento: EventoSincronizable;
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

/**
 * Evento de maleta almacenado, espejo de FilaEvento. Log de solo agregado,
 * local por ahora: ver la nota "Pendiente" en sync.ts sobre por que todavia no
 * viaja por el mismo outbox que los eventos de pieza.
 */
export interface FilaEventoMaleta {
  readonly eventoId: string;
  /** Agrupa este evento con los movimientos de pieza de la misma operacion. */
  readonly operacionId: string;
  readonly maletaId: string;
  readonly tipo: string;
  readonly evento: EventoMaleta;
  enviado: 0 | 1;
}

export type EventoSincronizable = Evento | EventoMaleta;

/**
 * Unidad atomica de PUSH. Se conserva hasta recibir una respuesta definitiva;
 * un timeout solo incrementa el reintento y el mismo UUID vuelve a enviarse.
 */
export interface FilaOperacionSync {
  seq?: number;
  readonly operacionId: string;
  readonly secuenciaCliente: string;
  readonly eventoIds: readonly string[];
  readonly eventos: readonly EventoSincronizable[];
  readonly clase: 'EVENTOS' | 'EMITIR_FACTURA';
  readonly facturaId: string | null;
  readonly numeroFactura: string | null;
  intentos: number;
  proximoIntento: number;
  ultimoError: string | null;
}

/** Cambio remoto persistido antes de confirmar el cursor al servidor. */
export interface FilaInboxSync {
  readonly id: string;
  readonly secuenciaServidor: string;
  readonly ordinal: number;
  readonly entidadTipo: string;
  readonly entidadId: string;
  readonly version: number;
  readonly eliminado: boolean;
  readonly payload: unknown;
  aplicado: 0 | 1;
  error: string | null;
}

/** Copia durable de agregados centrales que aun no tienen una tabla Dexie propia. */
export interface FilaReplicaCentral {
  readonly clave: string;
  readonly entidadTipo: string;
  readonly entidadId: string;
  readonly version: number;
  readonly eliminado: boolean;
  readonly payload: unknown;
}

/** Perfil de Supabase Auth disponible offline; nunca contiene contrasenas. */
export interface FilaPerfilCentral {
  readonly usuarioId: string;
  readonly nombre: string;
  readonly rol: Rol;
  readonly activo: boolean;
  readonly validoHasta: number;
}

/**
 * Excepcion de precio con un id propio porque Dexie necesita una clave y el
 * par (sku, hospitalId) no es unico en el tiempo: la misma combinacion puede
 * tener varias vigencias historicas.
 */
export interface FilaExcepcionPrecio extends ExcepcionPrecio {
  readonly id: string;
  /** Solo relevante si `estado === 'RECHAZADO'`. Texto libre del Administrador. */
  readonly motivoRechazo: string | null;
}

/**
 * Enlace temporal de instrumentista freelance (brief §11.4, decision tomada
 * con el usuario: el token vive atado a una maleta, no a un plazo fijo).
 * `token` es el secreto que va en la URL -alta entropia (uuidV7 completo, no
 * el codigo corto de 32 bits que usan Maleta/Factura, que ahi alcanza porque
 * no protege nada)-, nunca se deriva del `maletaId` para que no sea
 * adivinable a partir de un id que si es corto y visible en pantalla.
 */
export interface FilaTokenFreelance {
  readonly token: string;
  /** Identidad central del acceso; permite revocarlo sin persistir hashes. */
  readonly accesoId?: string;
  /** El servidor solo devuelve el secreto una vez. */
  readonly secretoDisponible?: boolean;
  readonly tokenPrefijo?: string;
  readonly maletaId: string;
  readonly creadoPorId: string;
  readonly creadoEn: number;
  readonly expiraEn?: number;
  revocado: boolean;
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
  maletas!: EntityTable<Maleta, 'id'>;
  eventosMaleta!: EntityTable<FilaEventoMaleta, 'eventoId'>;
  hospitales!: EntityTable<Hospital, 'id'>;
  excepcionesPrecio!: EntityTable<FilaExcepcionPrecio, 'id'>;
  facturas!: EntityTable<Factura, 'id'>;
  tokensFreelance!: EntityTable<FilaTokenFreelance, 'token'>;
  operacionesSync!: EntityTable<FilaOperacionSync, 'seq'>;
  inboxSync!: EntityTable<FilaInboxSync, 'id'>;
  replicaCentral!: EntityTable<FilaReplicaCentral, 'clave'>;
  perfilesCentrales!: EntityTable<FilaPerfilCentral, 'usuarioId'>;

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

    // Version 3: maleta como entidad propia, catalogo de hospitales, precios
    // negociados y facturas. Rebanada 2-3 del README.
    this.version(3).stores({
      maletas: 'id, estado, responsableId, hospitalId',
      eventosMaleta: 'eventoId, maletaId',
      hospitales: 'id, ciudad',
      excepcionesPrecio: 'id, sku, hospitalId, estado, [sku+hospitalId]',
      facturas: 'id, maletaId, hospitalId, estado',
    });

    // Version 4: enlace temporal de instrumentista freelance (§11.4 del brief).
    this.version(4).stores({
      tokensFreelance: 'token, maletaId',
    });

    // Version 5: protocolo central. El outbox legado sigue existiendo porque
    // alimenta el contador visible y permite actualizar instalaciones previas.
    this.version(5)
      .stores({
        eventos: 'eventoId, operacionId, codigo, hlc, enviado, [codigo+hlc]',
        eventosMaleta: 'eventoId, operacionId, maletaId, enviado',
        operacionesSync: '++seq, &operacionId, proximoIntento',
        inboxSync: 'id, aplicado, entidadTipo, [secuenciaServidor+ordinal]',
        replicaCentral: 'clave, entidadTipo, entidadId, [entidadTipo+entidadId]',
        perfilesCentrales: 'usuarioId, rol, activo, validoHasta',
      })
      .upgrade(async (transaccion) => {
        // Los registros anteriores a v5 no conocian el agrupador. Cada evento de
        // pieza se convierte de forma conservadora en una operacion individual.
        await transaccion
          .table<FilaEvento, string>('eventos')
          .toCollection()
          .modify((fila) => {
            if (typeof fila.operacionId !== 'string') {
              Object.assign(fila, { operacionId: fila.eventoId });
            }
          });
        await transaccion
          .table<FilaEventoMaleta, string>('eventosMaleta')
          .toCollection()
          .modify((fila) => {
            const enviadoAnterior = (fila as { enviado?: unknown }).enviado;
            const faltantes = {
              ...(typeof fila.operacionId === 'string' ? {} : { operacionId: fila.eventoId }),
              ...(enviadoAnterior === 0 || enviadoAnterior === 1 ? {} : { enviado: 0 as const }),
            };
            Object.assign(fila, faltantes);
          });
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
