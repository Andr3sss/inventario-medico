import type { Evento } from '@crearcos/core';
import type { BaseLocal, EventoSincronizable, FilaOperacionSync } from './db.js';

/** Convierte el HLC en una secuencia monotona por dispositivo sin usar Number. */
export function secuenciaClienteDesdeHlc(hlc: string): string {
  const [milisTexto, contadorTexto] = hlc.split(':');
  if (!/^\d+$/.test(milisTexto ?? '') || !/^\d+$/.test(contadorTexto ?? '')) {
    throw new Error('HLC_INVALIDO_PARA_SECUENCIA');
  }
  return (BigInt(milisTexto ?? '0') * 100_000n + BigInt(contadorTexto ?? '0')).toString();
}

export function esEventoPieza(evento: EventoSincronizable): evento is Evento {
  return !evento.cuerpo.tipo.startsWith('MALETA_');
}

/**
 * Persiste una operacion completa dentro de la transaccion Dexie del flujo de
 * negocio. El orden del arreglo es el orden transaccional del servidor.
 */
export async function encolarOperacion(
  db: BaseLocal,
  operacionId: string,
  eventos: readonly EventoSincronizable[],
  ahora: number,
  especial: {
    readonly clase: 'EMITIR_FACTURA';
    readonly facturaId: string;
    readonly numeroFactura: string;
  } | null = null,
): Promise<void> {
  const primero = eventos[0];
  if (primero === undefined) throw new Error('OPERACION_SIN_EVENTOS');
  const fila: FilaOperacionSync = {
    operacionId,
    secuenciaCliente: secuenciaClienteDesdeHlc(primero.sobre.hlc),
    eventoIds: eventos.map((evento) => evento.sobre.eventoId),
    eventos,
    clase: especial?.clase ?? 'EVENTOS',
    facturaId: especial?.facturaId ?? null,
    numeroFactura: especial?.numeroFactura ?? null,
    creadoEn: ahora,
    intentos: 0,
    proximoIntento: ahora,
    ultimoError: null,
  };
  await db.operacionesSync.add(fila);
}
