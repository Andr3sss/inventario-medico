import type {
  EstadoFactura,
  EstadoMaleta,
  EstadoPieza,
  EstadoAprobacion,
  NivelFacturable,
  Pieza,
  TipoEvento,
  TipoPrecioAplicado,
} from '@crearcos/core';
import type { TonoEstado } from '../componentes/UI.js';

export const ETIQUETA_ESTADO_PIEZA: Readonly<Record<EstadoPieza, string>> = {
  EN_BODEGA_CENTRAL: 'Bodega central',
  EN_BODEGA_INSTRUMENTISTA: 'Bodega instrumentista',
  ASIGNADA_A_MALETA: 'Asignada a maleta',
  EN_MALETA_ACTIVA: 'En maleta activa',
  USADA_PENDIENTE_VALORACION: 'Usada · pendiente de valoración',
  FACTURADA: 'Facturada',
  CONSUMIDA: 'Consumida',
  EN_REPROCESAMIENTO: 'En reprocesamiento',
  EN_CONFLICTO: 'En conflicto',
  EXTRAVIADA: 'Extraviada',
};

export const TONO_ESTADO_PIEZA: Readonly<Record<EstadoPieza, TonoEstado>> = {
  EN_BODEGA_CENTRAL: 'exito',
  EN_BODEGA_INSTRUMENTISTA: 'neutral',
  ASIGNADA_A_MALETA: 'aviso',
  EN_MALETA_ACTIVA: 'info',
  USADA_PENDIENTE_VALORACION: 'info',
  FACTURADA: 'exito',
  CONSUMIDA: 'neutral',
  EN_REPROCESAMIENTO: 'violeta',
  EN_CONFLICTO: 'peligro',
  EXTRAVIADA: 'peligro',
};

export const ETIQUETA_ESTADO_MALETA: Readonly<Record<EstadoMaleta, string>> = {
  EN_ARMADO: 'En armado',
  EN_CIRUGIA: 'En cirugía',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

export const TONO_ESTADO_MALETA: Readonly<Record<EstadoMaleta, TonoEstado>> = {
  EN_ARMADO: 'aviso',
  EN_CIRUGIA: 'info',
  CERRADA: 'exito',
  CANCELADA: 'neutral',
};

export const ETIQUETA_ESTADO_FACTURA: Readonly<Record<EstadoFactura, string>> = {
  BORRADOR: 'Pendiente de revisión',
  EMITIDA: 'Emitida',
};

export const ETIQUETA_NIVEL_PRECIO: Readonly<Record<NivelFacturable, string>> = {
  HABITUAL: 'Precio habitual',
  PROVINCIA: 'Precio provincia',
  NOTA_CREDITO: 'Nota de crédito',
};

export const ETIQUETA_PRECIO_APLICADO: Readonly<Record<TipoPrecioAplicado, string>> = {
  ...ETIQUETA_NIVEL_PRECIO,
  ALEATORIO: 'Precio excepcional',
};

export const ETIQUETA_ESTADO_EXCEPCION: Readonly<Record<EstadoAprobacion, string>> = {
  PENDIENTE: 'Pendiente de aprobación',
  APROBADO: 'Aprobada',
  RECHAZADO: 'Rechazada',
};

export const TONO_ESTADO_EXCEPCION: Readonly<Record<EstadoAprobacion, TonoEstado>> = {
  PENDIENTE: 'aviso',
  APROBADO: 'exito',
  RECHAZADO: 'peligro',
};

export const ETIQUETA_EVENTO: Readonly<Record<TipoEvento, string>> = {
  ESCANEO_ARMADO: 'Agregada a maleta',
  ESCANEO_ARMADO_REVERSO: 'Retirada del armado',
  CONFIRMAR_SALIDA: 'Salida de bodega confirmada',
  ESCANEO_USO: 'Uso registrado en cirugía',
  CIERRE_MALETA_SIN_USO: 'Enviada a reprocesamiento',
  CONFIRMAR_FACTURA: 'Facturación confirmada',
  INGRESO_REPROCESO: 'Ingresó a reprocesamiento',
  FIN_REPROCESO: 'Reprocesamiento finalizado',
  CONFLICTO_SYNC: 'Conflicto de sincronización',
  RESOLUCION_MANUAL: 'Conflicto resuelto manualmente',
  MARCAR_EXTRAVIADA: 'Marcada como extraviada',
};

export function formatearFecha(valor: string | number | null): string {
  if (valor === null) return 'Sin registrar';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fecha);
}

/** Fechas contractuales YYYY-MM-DD, sin convertirlas a otro huso horario. */
export function formatearFechaCalendario(valor: string | null): string {
  if (valor === null) return 'Sin fecha de cierre';
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (coincidencia === null) return valor;
  return `${coincidencia[3] ?? ''}/${coincidencia[2] ?? ''}/${coincidencia[1] ?? ''}`;
}

/** Presentación únicamente: el dominio ya entrega y redondea centavos enteros. */
export function formatearUSD(centavos: number): string {
  return `$${(centavos / 100).toFixed(2)}`;
}

export function ubicacionVisible(pieza: Pieza): string {
  if (pieza.estado === 'EN_CONFLICTO') return 'Ubicación por resolver';
  if (pieza.estado === 'EN_REPROCESAMIENTO') return 'Central de esterilización';
  if (pieza.maletaId !== null) return `Maleta ${pieza.maletaId}`;
  if (pieza.ubicacion.clase === 'BODEGA_INSTRUMENTISTA') {
    return `Bodega · ${pieza.ubicacion.usuarioId}`;
  }
  return 'Bodega central';
}

export function mensajeExcepcion(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
