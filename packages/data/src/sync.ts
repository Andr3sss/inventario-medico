import {
  aplicarEvento,
  centavos,
  codigoPieza as crearCodigoPieza,
  conflictoId as crearConflictoId,
  eventoId as crearEventoId,
  facturaId as crearFacturaId,
  hospitalId as crearHospitalId,
  maletaId as crearMaletaId,
  serializar,
  sku as crearSku,
  usuarioId as crearUsuarioId,
  esquemaEvento,
  esquemaEventoMaleta,
  type DispositivoId,
  type Evento,
  type EventoMaleta,
  type Factura,
  type Hospital,
  type LoteSync,
  type Maleta,
  type Pieza,
} from '@crearcos/core';
import { esquemaLoteSync } from '@crearcos/core';
import type { BaseLocal, EventoSincronizable, FilaInboxSync, FilaOperacionSync } from './db.js';
import {
  CLAVE_CURSOR,
  CLAVE_ULTIMA_DESCARGA_EXITOSA,
  CLAVE_ULTIMO_ENVIO_EXITOSO,
  CLAVE_ULTIMO_ERROR_SYNC,
  CLAVE_ULTIMO_INTENTO_SYNC,
} from './db.js';
import { avanzarReloj, fusionarRelojRemoto } from './reloj.js';
import { AZAR_CRIPTOGRAFICO, uuidV7, type FuenteAzar } from './identificadores.js';
import { encolarOperacion, esEventoPieza } from './operaciones.js';
import { revocarAccesoOffline } from './acceso-offline.js';

export interface EventoRechazado {
  readonly eventoId?: string;
  readonly operacionId?: string;
  readonly codigo?: string;
  readonly motivo: string;
}

export interface ConflictoReportado {
  readonly eventoId: string;
  readonly codigo: string;
  readonly conflictoId: string;
  readonly detalle: unknown;
}

export interface CambioSync {
  readonly ordinal: number;
  readonly entidadTipo: string;
  readonly entidadId: string;
  readonly version: number | string;
  readonly eliminado: boolean;
  readonly payload: unknown;
}

export interface CommitSync {
  readonly secuenciaServidor: number | string;
  readonly commitId: string;
  readonly creadoEn: string;
  readonly cambios: readonly CambioSync[];
}

export interface ResultadoOperacionSync {
  readonly operacionId: string;
  readonly estado: 'PENDIENTE' | 'APLICADA' | 'RECHAZADA' | 'CONFLICTO';
  readonly codigo?: string;
  readonly idempotente?: boolean;
  readonly secuenciaServidor?: number | string;
}

export interface RespuestaSync {
  readonly aceptados: readonly string[];
  readonly rechazados: readonly EventoRechazado[];
  readonly conflictos: readonly ConflictoReportado[];
  readonly operaciones?: readonly ResultadoOperacionSync[];
  /** Compatibilidad temporal con el endpoint que solo devolvia piezas. */
  readonly piezas: readonly Pieza[];
  readonly commits?: readonly CommitSync[];
  readonly cursorServidor: string | null;
  readonly hayMas?: boolean;
}

export interface OperacionPush {
  readonly operacionId: string;
  readonly secuenciaCliente: string;
  readonly eventos: readonly EventoSincronizable[];
  readonly tipo?: 'EMITIR_FACTURA';
  readonly facturaId?: string;
  readonly numeroFactura?: string;
}

export interface SolicitudSync extends LoteSync {
  readonly operaciones: readonly OperacionPush[];
  readonly nombreDispositivo?: string;
  readonly plataforma?: string;
  readonly versionApp?: string;
}

export interface Transporte {
  enviar: (lote: SolicitudSync) => Promise<RespuestaSync>;
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
  readonly erroresProyeccion: number;
  readonly mensaje: string | null;
  readonly hayMas: boolean;
}

export interface OpcionesSync {
  readonly dispositivoId: DispositivoId;
  readonly ahora: () => number;
  readonly tamanoLote?: number;
  readonly azar?: FuenteAzar;
  readonly nombreDispositivo?: string;
  readonly plataforma?: string;
  readonly versionApp?: string;
}

const TAMANO_LOTE = 200;
const RETRASO_BASE_MS = 2_000;
const RETRASO_MAXIMO_MS = 5 * 60 * 1000;
const enCurso = new Set<BaseLocal>();

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
  erroresProyeccion: 0,
  mensaje,
  hayMas: false,
});

/**
 * PUSH de operaciones atomicas + PULL incremental. El cursor solo se persiste
 * en la misma transaccion que el inbox crudo, antes de proyectar las replicas.
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
    await db.meta.put({ clave: CLAVE_ULTIMO_INTENTO_SYNC, valor: ahora });
    await migrarPendientesLegados(db, ahora);
    const pendientes = (await db.operacionesSync.orderBy('seq').toArray())
      .filter((fila) => fila.proximoIntento <= ahora)
      .slice(0, opciones.tamanoLote ?? TAMANO_LOTE);
    const cursorGuardado = await db.meta.get(CLAVE_CURSOR);
    const cursor = typeof cursorGuardado?.valor === 'string' ? cursorGuardado.valor : null;
    const lote: SolicitudSync = {
      dispositivoId: opciones.dispositivoId,
      cursorServidor: cursor,
      eventos: pendientes.flatMap((fila) => fila.eventos.filter(esEventoPieza)),
      operaciones: pendientes.map(aOperacionPush),
      ...(opciones.nombreDispositivo === undefined
        ? {}
        : { nombreDispositivo: opciones.nombreDispositivo }),
      ...(opciones.plataforma === undefined ? {} : { plataforma: opciones.plataforma }),
      ...(opciones.versionApp === undefined ? {} : { versionApp: opciones.versionApp }),
    };

    const validado = esquemaLoteSync.safeParse(lote);
    if (!validado.success) {
      const mensaje = validado.error.issues[0]?.message ?? 'Lote invalido';
      await registrarErrorSync(db, mensaje, opciones.ahora());
      return vacio('LOTE_INVALIDO', mensaje);
    }

    let respuesta: RespuestaSync;
    try {
      respuesta = await transporte.enviar(lote);
    } catch (causa) {
      const mensaje = causa instanceof Error ? causa.message : 'Fallo de red';
      await reprogramar(db, pendientes, opciones.ahora(), mensaje, azar);
      await registrarErrorSync(db, mensaje, opciones.ahora());
      return { ...vacio('SIN_CONEXION', mensaje), enviados: pendientes.length };
    }

    await persistirRespuestaAntesDelCursor(db, respuesta);
    const aceptados = await confirmarAceptados(db, respuesta.aceptados);
    const rechazados = await archivarRechazados(db, respuesta.rechazados, opciones.ahora());
    const conflictos = await marcarConflictos(db, respuesta.conflictos, opciones, azar);
    await finalizarOperaciones(db, respuesta);
    const { actualizadas, omitidas, errores, ultimoError } = await proyectarInbox(db, opciones);
    const mensajeFinal =
      ultimoError ??
      (rechazados > 0 ? `${rechazados.toString()} evento(s) rechazado(s) por el servidor` : null);
    await registrarResultadoSync(db, {
      ahora: opciones.ahora(),
      huboEnvio: pendientes.length > 0,
      error: mensajeFinal,
    });

    return {
      estado: 'COMPLETADO',
      enviados: pendientes.length,
      aceptados,
      rechazados,
      conflictos,
      piezasActualizadas: actualizadas,
      piezasOmitidas: omitidas,
      erroresProyeccion: errores,
      mensaje: mensajeFinal,
      hayMas: respuesta.hayMas ?? false,
    };
  } catch (causa) {
    const mensaje = causa instanceof Error ? causa.message : 'ERROR_SYNC_INESPERADO';
    try {
      await registrarErrorSync(db, mensaje, opciones.ahora());
    } catch {
      // El error original es mas util que un fallo secundario al guardar telemetria local.
    }
    throw causa;
  } finally {
    enCurso.delete(db);
  }
}

async function registrarErrorSync(
  db: BaseLocal,
  mensaje: string,
  ocurridoEn: number,
): Promise<void> {
  await db.meta.put({
    clave: CLAVE_ULTIMO_ERROR_SYNC,
    valor: { mensaje, ocurridoEn },
  });
}

async function registrarResultadoSync(
  db: BaseLocal,
  resultado: { readonly ahora: number; readonly huboEnvio: boolean; readonly error: string | null },
): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    await db.meta.put({ clave: CLAVE_ULTIMA_DESCARGA_EXITOSA, valor: resultado.ahora });
    if (resultado.huboEnvio) {
      await db.meta.put({ clave: CLAVE_ULTIMO_ENVIO_EXITOSO, valor: resultado.ahora });
    }
    if (resultado.error === null) await db.meta.delete(CLAVE_ULTIMO_ERROR_SYNC);
    else await registrarErrorSync(db, resultado.error, resultado.ahora);
  });
}

function aOperacionPush(fila: FilaOperacionSync): OperacionPush {
  const base = {
    operacionId: fila.operacionId,
    secuenciaCliente: fila.secuenciaCliente,
    eventos: fila.eventos,
  };
  if (fila.clase === 'EMITIR_FACTURA' && fila.facturaId !== null && fila.numeroFactura !== null) {
    return {
      ...base,
      tipo: 'EMITIR_FACTURA',
      facturaId: fila.facturaId,
      numeroFactura: fila.numeroFactura,
    };
  }
  return base;
}

/** Convierte el outbox de instalaciones v1-v4 sin duplicar grupos v5. */
async function migrarPendientesLegados(db: BaseLocal, ahora: number): Promise<void> {
  await db.transaction(
    'rw',
    [db.eventos, db.eventosMaleta, db.outbox, db.operacionesSync],
    async () => {
      for (const pendiente of await db.outbox.orderBy('seq').toArray()) {
        const fila = await db.eventos.get(pendiente.eventoId);
        if (fila === undefined) {
          if (pendiente.seq !== undefined) await db.outbox.delete(pendiente.seq);
          continue;
        }
        const operacionId = fila.operacionId || fila.eventoId;
        if ((await db.operacionesSync.where('operacionId').equals(operacionId).count()) === 0) {
          await encolarOperacion(db, operacionId, [fila.evento], ahora);
        }
      }
      for (const fila of await db.eventosMaleta.where('enviado').equals(0).toArray()) {
        const operacionId = fila.operacionId || fila.eventoId;
        if ((await db.operacionesSync.where('operacionId').equals(operacionId).count()) === 0) {
          await encolarOperacion(db, operacionId, [fila.evento], ahora);
        }
      }
    },
  );
}

async function reprogramar(
  db: BaseLocal,
  pendientes: readonly FilaOperacionSync[],
  ahora: number,
  mensaje: string,
  azar: FuenteAzar,
): Promise<void> {
  await db.transaction('rw', [db.operacionesSync, db.outbox], async () => {
    for (const fila of pendientes) {
      if (fila.seq === undefined) continue;
      const intentos = fila.intentos + 1;
      const proximoIntento = ahora + retrasoReintento(intentos, azar);
      await db.operacionesSync.update(fila.seq, { intentos, proximoIntento, ultimoError: mensaje });
      for (const eventoId of fila.eventoIds) {
        for (const salida of await db.outbox.where('eventoId').equals(eventoId).toArray()) {
          if (salida.seq !== undefined) {
            await db.outbox.update(salida.seq, { intentos, proximoIntento, ultimoError: mensaje });
          }
        }
      }
    }
  });
}

async function confirmarAceptados(db: BaseLocal, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  await db.transaction('rw', [db.eventos, db.eventosMaleta, db.outbox], async () => {
    for (const id of ids) {
      await db.eventos.update(id, { enviado: 1 });
      await db.eventosMaleta.update(id, { enviado: 1 });
      await db.outbox.where('eventoId').equals(id).delete();
    }
  });
  return ids.length;
}

async function archivarRechazados(
  db: BaseLocal,
  rechazados: readonly EventoRechazado[],
  ahora: number,
): Promise<number> {
  let archivados = 0;
  await db.transaction(
    'rw',
    [db.eventos, db.eventosMaleta, db.outbox, db.operacionesSync, db.fallidos],
    async () => {
      for (const rechazo of rechazados) {
        const ids = new Set<string>();
        if (rechazo.eventoId !== undefined) ids.add(rechazo.eventoId);
        if (rechazo.operacionId !== undefined) {
          const operacion = await db.operacionesSync
            .where('operacionId')
            .equals(rechazo.operacionId)
            .first();
          for (const id of operacion?.eventoIds ?? []) ids.add(id);
        }
        for (const id of ids) {
          const pieza = await db.eventos.get(id);
          const maleta = pieza === undefined ? await db.eventosMaleta.get(id) : undefined;
          const evento = pieza?.evento ?? maleta?.evento;
          if (evento !== undefined) {
            const operacionId = rechazo.operacionId ?? pieza?.operacionId ?? maleta?.operacionId;
            await db.fallidos.put({
              eventoId: id,
              ...(operacionId === undefined ? {} : { operacionId }),
              codigo: pieza?.codigo ?? maleta?.maletaId ?? 'SIN_AGREGADO',
              ...(rechazo.codigo === undefined ? {} : { codigoError: rechazo.codigo }),
              motivo: rechazo.motivo,
              evento,
              registradoEn: ahora,
            });
            archivados += 1;
          }
          await db.outbox.where('eventoId').equals(id).delete();
        }
      }
    },
  );
  return archivados;
}

async function marcarConflictos(
  db: BaseLocal,
  conflictos: readonly ConflictoReportado[],
  opciones: OpcionesSync,
  azar: FuenteAzar,
): Promise<number> {
  let aplicados = 0;
  for (const conflicto of conflictos) {
    const relojPared = opciones.ahora();
    await db.transaction(
      'rw',
      [db.piezas, db.eventos, db.outbox, db.conflictos, db.meta],
      async () => {
        await db.eventos.update(conflicto.eventoId, { enviado: 1 });
        await db.outbox.where('eventoId').equals(conflicto.eventoId).delete();
        const pieza = await db.piezas.get(crearCodigoPieza(conflicto.codigo));
        if (pieza === undefined || pieza.estado === 'EN_CONFLICTO') return;
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
        // La transicion se refleja de inmediato, pero no se agrega este evento
        // sintetico al historial: el PULL proyecta el evento central canonico y
        // asi todos los dispositivos terminan con exactamente el mismo log.
        await db.piezas.put(transicion.valor);
        await db.conflictos.put({
          conflictoId: conflicto.conflictoId,
          codigo: pieza.codigo,
          detectadoEn: relojPared,
          detalle: conflicto.detalle,
          estado: 'ABIERTO',
        });
        aplicados += 1;
      },
    );
  }
  return aplicados;
}

async function finalizarOperaciones(db: BaseLocal, respuesta: RespuestaSync): Promise<void> {
  const terminales = new Set(
    (respuesta.operaciones ?? [])
      .filter((fila) => fila.estado !== 'PENDIENTE')
      .map((fila) => fila.operacionId),
  );
  const eventosTerminales = new Set([
    ...respuesta.aceptados,
    ...respuesta.conflictos.map((fila) => fila.eventoId),
    ...respuesta.rechazados.flatMap((fila) => (fila.eventoId === undefined ? [] : [fila.eventoId])),
  ]);
  await db.transaction('rw', db.operacionesSync, async () => {
    for (const fila of await db.operacionesSync.toArray()) {
      if (
        terminales.has(fila.operacionId) ||
        fila.eventoIds.every((id) => eventosTerminales.has(id))
      ) {
        if (fila.seq !== undefined) await db.operacionesSync.delete(fila.seq);
      }
    }
  });
}

async function persistirRespuestaAntesDelCursor(
  db: BaseLocal,
  respuesta: RespuestaSync,
): Promise<void> {
  const filas: FilaInboxSync[] = [];
  for (const commit of respuesta.commits ?? []) {
    for (const cambio of commit.cambios) {
      filas.push({
        id: `${String(commit.secuenciaServidor)}:${cambio.ordinal.toString().padStart(6, '0')}`,
        secuenciaServidor: String(commit.secuenciaServidor),
        ordinal: cambio.ordinal,
        entidadTipo: cambio.entidadTipo,
        entidadId: cambio.entidadId,
        version: numeroSeguro(cambio.version),
        eliminado: cambio.eliminado,
        payload: cambio.payload,
        aplicado: 0,
        error: null,
      });
    }
  }
  if (filas.length === 0 && respuesta.piezas.length > 0) {
    respuesta.piezas.forEach((pieza, indice) => {
      filas.push({
        id: `legacy:${respuesta.cursorServidor ?? 'sin-cursor'}:${indice.toString()}:${pieza.codigo}`,
        secuenciaServidor: respuesta.cursorServidor ?? '0',
        ordinal: indice,
        entidadTipo: 'PIEZA',
        entidadId: pieza.codigo,
        version: pieza.version,
        eliminado: false,
        payload: pieza,
        aplicado: 0,
        error: null,
      });
    });
  }
  await db.transaction('rw', [db.inboxSync, db.meta], async () => {
    if (filas.length > 0) await db.inboxSync.bulkPut(filas);
    if (respuesta.cursorServidor !== null) {
      await db.meta.put({ clave: CLAVE_CURSOR, valor: respuesta.cursorServidor });
    }
  });
}

async function proyectarInbox(
  db: BaseLocal,
  opciones: OpcionesSync,
): Promise<{
  actualizadas: number;
  omitidas: number;
  errores: number;
  ultimoError: string | null;
}> {
  let actualizadas = 0;
  let omitidas = 0;
  let errores = 0;
  let ultimoError: string | null = null;
  for (const fila of await db.inboxSync.where('aplicado').equals(0).sortBy('id')) {
    try {
      const resultado = await db.transaction(
        'rw',
        [
          db.inboxSync,
          db.replicaCentral,
          db.piezas,
          db.maletas,
          db.eventos,
          db.catalogo,
          db.hospitales,
          db.excepcionesPrecio,
          db.facturas,
          db.perfilesCentrales,
          db.credencialesOffline,
          db.auditoriaAcceso,
          db.outbox,
          db.eventosMaleta,
          db.operacionesSync,
          db.conflictos,
          db.meta,
        ],
        async () => proyectarCambio(db, fila, opciones),
      );
      if (resultado === 'PIEZA_ACTUALIZADA') actualizadas += 1;
      if (resultado === 'PIEZA_PENDIENTE') omitidas += 1;
    } catch (causa) {
      const mensaje = causa instanceof Error ? causa.message : 'CAMBIO_REMOTO_INVALIDO';
      await db.inboxSync.update(fila.id, { error: mensaje });
      errores += 1;
      ultimoError = mensaje;
    }
  }
  return { actualizadas, omitidas, errores, ultimoError };
}

type ResultadoProyeccion = 'APLICADO' | 'PIEZA_ACTUALIZADA' | 'PIEZA_PENDIENTE';

async function proyectarCambio(
  db: BaseLocal,
  fila: FilaInboxSync,
  opciones: OpcionesSync,
): Promise<ResultadoProyeccion> {
  await db.replicaCentral.put({
    clave: `${fila.entidadTipo}:${fila.entidadId}`,
    entidadTipo: fila.entidadTipo,
    entidadId: fila.entidadId,
    version: fila.version,
    eliminado: fila.eliminado,
    payload: fila.payload,
  });

  if (fila.entidadTipo === 'PIEZA') {
    const remota = mapearPieza(fila.payload);
    const codigo = remota?.codigo ?? textoDe(fila.payload, 'codigo');
    if (codigo === null) throw new Error('SNAPSHOT_PIEZA_INVALIDO');
    if ((await db.outbox.where('codigo').equals(codigo).count()) > 0) {
      return 'PIEZA_PENDIENTE';
    }
    if (fila.eliminado) {
      await db.piezas.delete(crearCodigoPieza(codigo));
      await db.inboxSync.update(fila.id, { aplicado: 1, error: null });
      return 'PIEZA_ACTUALIZADA';
    }
    if (remota === null) throw new Error('SNAPSHOT_PIEZA_INVALIDO');
    const local = await db.piezas.get(remota.codigo);
    if (local === undefined || local.version < remota.version) {
      await db.piezas.put(remota);
      await fusionarRelojRemoto(db, opciones.dispositivoId, remota.hlc, opciones.ahora());
      await db.inboxSync.update(fila.id, { aplicado: 1, error: null });
      return 'PIEZA_ACTUALIZADA';
    }
  } else if (fila.entidadTipo === 'MALETA') {
    const remota = mapearMaleta(fila.payload);
    const id = remota?.id ?? fila.entidadId;
    const pendiente = await db.eventosMaleta
      .where('maletaId')
      .equals(id)
      .and((evento) => evento.enviado === 0)
      .count();
    if (pendiente > 0) return 'APLICADO';
    if (fila.eliminado) await db.maletas.delete(crearMaletaId(id));
    else if (remota !== null) await db.maletas.put(remota);
    else throw new Error('SNAPSHOT_MALETA_INVALIDO');
    const hlc = textoDe(fila.payload, 'hlc');
    if (hlc !== null) {
      await fusionarRelojRemoto(db, opciones.dispositivoId, hlc, opciones.ahora());
    }
  } else if (fila.entidadTipo === 'HOSPITAL') {
    const hospital = mapearHospital(fila.payload);
    if (fila.eliminado) await db.hospitales.delete(crearHospitalId(fila.entidadId));
    else if (hospital !== null) await db.hospitales.put(hospital);
    else throw new Error('SNAPSHOT_HOSPITAL_INVALIDO');
  } else if (fila.entidadTipo === 'PRODUCTO') {
    const producto = mapearProducto(fila.payload);
    if (producto !== null) await db.catalogo.put(producto);
    else if (!fila.eliminado) throw new Error('SNAPSHOT_PRODUCTO_INVALIDO');
  } else if (fila.entidadTipo === 'FACTURA') {
    const factura = mapearFactura(fila.payload);
    const emisionPendiente = (await db.operacionesSync.toArray()).some(
      (operacion) => operacion.facturaId === fila.entidadId,
    );
    if (!emisionPendiente) {
      if (fila.eliminado) await db.facturas.delete(crearFacturaId(fila.entidadId));
      else if (factura !== null) await db.facturas.put(factura);
      else throw new Error('SNAPSHOT_FACTURA_INVALIDO');
    }
  } else if (fila.entidadTipo === 'EXCEPCION_PRECIO') {
    await proyectarExcepcion(db, fila);
  } else if (fila.entidadTipo === 'PERFIL') {
    await proyectarPerfil(db, fila, opciones.ahora());
  } else if (fila.entidadTipo === 'CONFLICTO') {
    await proyectarConflicto(db, fila, opciones.ahora());
  } else if (fila.entidadTipo === 'EVENTO_DOMINIO') {
    await proyectarEventoDominio(db, fila, opciones);
  }
  await db.inboxSync.update(fila.id, { aplicado: 1, error: null });
  return 'APLICADO';
}

type ResultadoEventoCentral = 'ACEPTADO' | 'RECHAZADO' | 'CONFLICTO';

/**
 * Proyecta el sobre central de auditoria en el log local especializado.
 * El UUID del evento es la clave idempotente; una reutilizacion con contenido
 * distinto se deja en inbox con error en vez de alterar un historial previo.
 */
async function proyectarEventoDominio(
  db: BaseLocal,
  fila: FilaInboxSync,
  opciones: OpcionesSync,
): Promise<void> {
  if (fila.eliminado) throw new Error('EVENTO_DOMINIO_NO_PUEDE_ELIMINARSE');
  const central = registro(fila.payload);
  const eventoId = cadena(central?.id);
  const operacionId = cadena(central?.operacion_id);
  const tipoAgregado = cadena(central?.tipo_agregado);
  const resultado = resultadoEventoCentral(central?.resultado);
  const recibidoEnServidor = cadena(central?.recibido_en_servidor);
  if (
    central === null ||
    eventoId === null ||
    eventoId !== fila.entidadId ||
    operacionId === null ||
    tipoAgregado === null ||
    resultado === null
  ) {
    throw new Error('EVENTO_DOMINIO_INVALIDO');
  }

  if (tipoAgregado === 'PIEZA') {
    const validado = esquemaEvento.safeParse(central.payload);
    if (!validado.success || validado.data.sobre.eventoId !== eventoId) {
      throw new Error('EVENTO_PIEZA_REMOTO_INVALIDO');
    }
    const evento = validado.data as Evento;
    const existente = await db.eventos.get(evento.sobre.eventoId);
    if (existente !== undefined && jsonCanonico(existente.evento) !== jsonCanonico(evento)) {
      throw new Error('EVENTO_PIEZA_REMOTO_DIVERGENTE');
    }
    await db.eventos.put({
      eventoId: evento.sobre.eventoId,
      operacionId,
      codigo: evento.cuerpo.codigo,
      tipo: evento.cuerpo.tipo,
      hlc: evento.sobre.hlc,
      evento,
      resultadoCentral: resultado,
      ...(recibidoEnServidor === null ? {} : { recibidoEnServidor }),
      enviado: 1,
    });
    await fusionarRelojRemoto(db, opciones.dispositivoId, evento.sobre.hlc, opciones.ahora());
    return;
  }

  if (tipoAgregado === 'MALETA') {
    const validado = esquemaEventoMaleta.safeParse(central.payload);
    if (!validado.success || validado.data.sobre.eventoId !== eventoId) {
      throw new Error('EVENTO_MALETA_REMOTO_INVALIDO');
    }
    const evento = validado.data as EventoMaleta;
    const existente = await db.eventosMaleta.get(evento.sobre.eventoId);
    if (existente !== undefined && jsonCanonico(existente.evento) !== jsonCanonico(evento)) {
      throw new Error('EVENTO_MALETA_REMOTO_DIVERGENTE');
    }
    await db.eventosMaleta.put({
      eventoId: evento.sobre.eventoId,
      operacionId,
      maletaId: evento.cuerpo.maletaId,
      tipo: evento.cuerpo.tipo,
      hlc: evento.sobre.hlc,
      evento,
      resultadoCentral: resultado,
      ...(recibidoEnServidor === null ? {} : { recibidoEnServidor }),
      enviado: 1,
    });
    await fusionarRelojRemoto(db, opciones.dispositivoId, evento.sobre.hlc, opciones.ahora());
    return;
  }

  throw new Error('TIPO_AGREGADO_HISTORICO_NO_SOPORTADO');
}

function resultadoEventoCentral(valor: unknown): ResultadoEventoCentral | null {
  return valor === 'ACEPTADO' || valor === 'RECHAZADO' || valor === 'CONFLICTO' ? valor : null;
}

function jsonCanonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  const objeto = registro(valor);
  if (objeto !== null) {
    return `{${Object.keys(objeto)
      .sort()
      .map((clave) => `${JSON.stringify(clave)}:${jsonCanonico(objeto[clave])}`)
      .join(',')}}`;
  }
  return JSON.stringify(valor);
}

async function proyectarExcepcion(db: BaseLocal, fila: FilaInboxSync): Promise<void> {
  if (fila.eliminado) {
    await db.excepcionesPrecio.delete(fila.entidadId);
    return;
  }
  const payload = registro(fila.payload);
  const productoId = cadena(payload?.producto_id);
  const hospital = cadena(payload?.hospital_id);
  const estado = cadena(payload?.estado);
  const producto =
    productoId === null ? undefined : await db.replicaCentral.get(`PRODUCTO:${productoId}`);
  const sku = textoDe(producto?.payload, 'sku');
  if (payload === null || hospital === null || sku === null || !esEstadoAprobacion(estado)) {
    throw new Error('SNAPSHOT_EXCEPCION_INVALIDO');
  }
  await db.excepcionesPrecio.put({
    id: fila.entidadId,
    sku: crearSku(sku),
    hospitalId: crearHospitalId(hospital),
    valor: centavos(numeroSeguro(payload.valor_centavos)),
    estado,
    vigenteDesde: cadena(payload.vigente_desde) ?? '',
    vigenteHasta: cadena(payload.vigente_hasta),
    motivoRechazo: cadena(payload.motivo_decision),
  });
}

async function proyectarPerfil(db: BaseLocal, fila: FilaInboxSync, ahora: number): Promise<void> {
  if (fila.eliminado) {
    await db.perfilesCentrales.delete(fila.entidadId);
    await revocarAccesoOffline(db, fila.entidadId, ahora, 'PERFIL_CENTRAL_ELIMINADO');
    return;
  }
  const payload = registro(fila.payload);
  const rol = cadena(payload?.rol);
  if (payload === null || !esRol(rol)) throw new Error('SNAPSHOT_PERFIL_INVALIDO');
  await db.perfilesCentrales.put({
    usuarioId: fila.entidadId,
    nombre: cadena(payload.nombre) ?? fila.entidadId,
    rol,
    activo: payload.activo === true,
    validoHasta: Number.MAX_SAFE_INTEGER,
  });
  if (payload.activo !== true) {
    await revocarAccesoOffline(db, fila.entidadId, ahora, 'PERFIL_CENTRAL_INACTIVO');
  }
}

async function proyectarConflicto(
  db: BaseLocal,
  fila: FilaInboxSync,
  ahora: number,
): Promise<void> {
  const payload = registro(fila.payload);
  const codigo = cadena(payload?.codigo) ?? cadena(payload?.pieza_codigo);
  if (codigo === null) return;
  await db.conflictos.put({
    conflictoId: fila.entidadId,
    codigo,
    detectadoEn: Date.parse(cadena(payload?.detectado_en) ?? '') || ahora,
    detalle: fila.payload,
    estado: cadena(payload?.estado) === 'RESUELTO' ? 'RESUELTO' : 'ABIERTO',
  });
}

function mapearPieza(valor: unknown): Pieza | null {
  const fila = registro(valor);
  const codigo = cadena(fila?.codigo);
  const sku = cadena(fila?.sku);
  const tipo = cadena(fila?.tipo);
  const estado = cadena(fila?.estado);
  const ubicacion = registro(fila?.ubicacion);
  const clase = cadena(ubicacion?.clase);
  const hlc = cadena(fila?.hlc);
  if (
    fila === null ||
    codigo === null ||
    sku === null ||
    !esTipoProducto(tipo) ||
    !esEstadoPieza(estado) ||
    hlc === null ||
    (clase !== 'BODEGA_CENTRAL' && clase !== 'BODEGA_INSTRUMENTISTA')
  )
    return null;
  const ubicacionDominio =
    clase === 'BODEGA_CENTRAL'
      ? ({ clase } as const)
      : ({
          clase,
          usuarioId: crearUsuarioId(cadena(ubicacion?.usuarioId) ?? 'desconocido'),
        } as const);
  const maleta = cadena(fila.maletaId);
  const padre = cadena(fila.parentCodigo);
  return {
    codigo: crearCodigoPieza(codigo),
    sku: crearSku(sku),
    tipo,
    estado,
    ubicacion: ubicacionDominio,
    maletaId: maleta === null ? null : crearMaletaId(maleta),
    parentCodigo: padre === null ? null : crearCodigoPieza(padre),
    version: numeroSeguro(fila.version),
    hlc,
  };
}

function mapearMaleta(valor: unknown): Maleta | null {
  const fila = registro(valor);
  const id = cadena(fila?.id);
  const responsable = cadena(fila?.responsableId);
  const estado = cadena(fila?.estado);
  const creadaEn = cadena(fila?.creadaEn);
  if (
    fila === null ||
    id === null ||
    responsable === null ||
    !esEstadoMaleta(estado) ||
    creadaEn === null
  )
    return null;
  const hospital = cadena(fila.hospitalId);
  return {
    id: crearMaletaId(id),
    responsableId: crearUsuarioId(responsable),
    procedimiento: cadena(fila.procedimiento),
    hospitalId: hospital === null ? null : crearHospitalId(hospital),
    estado,
    creadaEn,
    salioEn: cadena(fila.salioEn),
    cerradaEn: cadena(fila.cerradaEn),
    canceladaEn: cadena(fila.canceladaEn),
    version: numeroSeguro(fila.version),
  };
}

function mapearHospital(valor: unknown): Hospital | null {
  const fila = registro(valor);
  const id = cadena(fila?.id);
  const nombre = cadena(fila?.nombre);
  const ciudad = cadena(fila?.ciudad);
  const nivel = cadena(fila?.nivel_precio) ?? cadena(fila?.nivelPorDefecto);
  if (id === null || nombre === null || ciudad === null || !esNivelPrecio(nivel)) return null;
  return { id: crearHospitalId(id), nombre, ciudad, nivelPorDefecto: nivel };
}

function mapearProducto(valor: unknown) {
  const fila = registro(valor);
  const sku = cadena(fila?.sku);
  const nombre = cadena(fila?.nombre);
  const tipo = cadena(fila?.tipo);
  if (sku === null || nombre === null || !esTipoProducto(tipo)) return null;
  return {
    sku,
    nombre,
    tipo,
    costoBase: numeroSeguro(fila?.costo_base_centavos ?? fila?.costoBase),
  };
}

function mapearFactura(valor: unknown): Factura | null {
  const fila = registro(valor);
  const id = cadena(fila?.id);
  const maleta = cadena(fila?.maletaId);
  const hospital = cadena(fila?.hospitalId);
  const estado = cadena(fila?.estado);
  const lineas = Array.isArray(fila?.lineas) ? fila.lineas : null;
  if (
    fila === null ||
    id === null ||
    maleta === null ||
    hospital === null ||
    (estado !== 'BORRADOR' && estado !== 'EMITIDA') ||
    lineas === null
  )
    return null;
  const mapeadas = lineas.flatMap((linea) => {
    const item = registro(linea);
    const precio = registro(item?.precio);
    const codigo = cadena(item?.codigoPieza);
    const sku = cadena(item?.sku);
    const nombre = cadena(item?.nombre);
    const tipo = cadena(precio?.tipo);
    if (codigo === null || sku === null || nombre === null || !esTipoPrecio(tipo)) return [];
    return [
      {
        codigoPieza: crearCodigoPieza(codigo),
        sku: crearSku(sku),
        nombre,
        precio: {
          valor: centavos(numeroSeguro(precio?.valor)),
          tipo,
          requiereAprobacion: precio?.requiereAprobacion === true,
          explicacion: cadena(precio?.explicacion) ?? '',
        },
      },
    ];
  });
  if (mapeadas.length !== lineas.length) return null;
  return {
    id: crearFacturaId(id),
    maletaId: crearMaletaId(maleta),
    hospitalId: crearHospitalId(hospital),
    estado,
    lineas: mapeadas,
    total: centavos(numeroSeguro(fila.total)),
    creadaEn: cadena(fila.creadaEn) ?? '',
    emitidaEn: cadena(fila.emitidaEn),
  };
}

function registro(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}
function cadena(valor: unknown): string | null {
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
}
function textoDe(valor: unknown, clave: string): string | null {
  return cadena(registro(valor)?.[clave]);
}
function numeroSeguro(valor: unknown): number {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isSafeInteger(numero) || numero < 0) throw new Error('ENTERO_REMOTO_INVALIDO');
  return numero;
}
function esTipoProducto(valor: string | null): valor is 'INSTRUMENTAL' | 'INSUMO' | 'KIT' {
  return valor === 'INSTRUMENTAL' || valor === 'INSUMO' || valor === 'KIT';
}
function esEstadoPieza(valor: string | null): valor is Pieza['estado'] {
  return [
    'EN_BODEGA_CENTRAL',
    'EN_BODEGA_INSTRUMENTISTA',
    'ASIGNADA_A_MALETA',
    'EN_MALETA_ACTIVA',
    'USADA_PENDIENTE_VALORACION',
    'FACTURADA',
    'CONSUMIDA',
    'EN_REPROCESAMIENTO',
    'EN_CONFLICTO',
    'EXTRAVIADA',
  ].includes(valor ?? '');
}
function esEstadoMaleta(valor: string | null): valor is Maleta['estado'] {
  return ['EN_ARMADO', 'EN_CIRUGIA', 'CERRADA', 'CANCELADA'].includes(valor ?? '');
}
function esNivelPrecio(valor: string | null): valor is Hospital['nivelPorDefecto'] {
  return valor === 'HABITUAL' || valor === 'PROVINCIA' || valor === 'NOTA_CREDITO';
}
function esEstadoAprobacion(valor: string | null): valor is 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' {
  return valor === 'PENDIENTE' || valor === 'APROBADO' || valor === 'RECHAZADO';
}
function esTipoPrecio(
  valor: string | null,
): valor is 'HABITUAL' | 'PROVINCIA' | 'NOTA_CREDITO' | 'ALEATORIO' {
  return esNivelPrecio(valor) || valor === 'ALEATORIO';
}
function esRol(
  valor: string | null,
): valor is
  | 'SISTEMA'
  | 'ADMINISTRADOR'
  | 'AUXILIAR'
  | 'COORDINADORA'
  | 'CONTABLE'
  | 'SUPERVISOR'
  | 'FREELANCE' {
  return [
    'SISTEMA',
    'ADMINISTRADOR',
    'AUXILIAR',
    'COORDINADORA',
    'CONTABLE',
    'SUPERVISOR',
    'FREELANCE',
  ].includes(valor ?? '');
}
