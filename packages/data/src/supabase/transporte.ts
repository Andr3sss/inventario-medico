import type { RespuestaSync, SolicitudSync, Transporte } from '../sync.js';
import type { ClienteSupabase } from './cliente.js';

/** La UI nunca consulta tablas para sincronizar; toda mutacion pasa por Edge. */
export function crearTransporteSupabase(
  cliente: ClienteSupabase,
  alInvalidarSesion?: () => void,
): Transporte {
  return {
    enviar: async (lote: SolicitudSync): Promise<RespuestaSync> => {
      const resultado: unknown = await cliente.functions.invoke<unknown>('sync', {
        body: lote,
      });
      if (typeof resultado !== 'object' || resultado === null) {
        throw new Error('SYNC_CENTRAL_SIN_RESPUESTA');
      }
      const envoltura = resultado as { readonly data?: unknown; readonly error?: unknown };
      if (envoltura.error !== null && envoltura.error !== undefined) {
        if (esRespuestaHttp(envoltura.error, 401)) alInvalidarSesion?.();
        throw new Error(`SYNC_CENTRAL: ${mensajeError(envoltura.error)}`);
      }
      const data = envoltura.data;
      if (!esRespuestaSync(data)) throw new Error('RESPUESTA_SYNC_INVALIDA');
      return data;
    },
  };
}

function esRespuestaHttp(valor: unknown, estado: number): boolean {
  if (typeof valor !== 'object' || valor === null) return false;
  const context = (valor as { readonly context?: unknown }).context;
  return context instanceof Response && context.status === estado;
}

function mensajeError(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  if (valor instanceof Error) return valor.message;
  if (typeof valor === 'object' && valor !== null) {
    const mensaje = (valor as { readonly message?: unknown }).message;
    if (typeof mensaje === 'string') return mensaje;
  }
  return 'error remoto';
}

function esRespuestaSync(valor: unknown): valor is RespuestaSync {
  if (typeof valor !== 'object' || valor === null) return false;
  const fila = valor as Record<string, unknown>;
  return (
    Array.isArray(fila.aceptados) &&
    Array.isArray(fila.rechazados) &&
    Array.isArray(fila.conflictos) &&
    Array.isArray(fila.piezas) &&
    (typeof fila.cursorServidor === 'string' || fila.cursorServidor === null)
  );
}
