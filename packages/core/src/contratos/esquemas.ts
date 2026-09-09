import { z } from 'zod';

/**
 * Validacion de frontera. Todo lo que entra desde la red, desde IndexedDB o
 * desde el lector fisico se valida aqui antes de tocar el dominio.
 *
 * Motivo: un payload de sincronizacion viejo o un registro escrito por una
 * version anterior de la app entra como `unknown`. Sin esta puerta, el dato
 * corrupto llega hasta la maquina de estados y falla lejos de su origen.
 */
const textoNoVacio = z.string().trim().min(1);

export const esquemaUbicacion = z.discriminatedUnion('clase', [
  z.object({ clase: z.literal('BODEGA_CENTRAL') }),
  z.object({ clase: z.literal('BODEGA_INSTRUMENTISTA'), usuarioId: textoNoVacio }),
]);

export const esquemaRol = z.enum([
  'SISTEMA',
  'ADMINISTRADOR',
  'AUXILIAR',
  'COORDINADORA',
  'CONTABLE',
  'SUPERVISOR',
  'FREELANCE',
]);

export const esquemaEstadoPieza = z.enum([
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
]);

export const esquemaSobre = z.object({
  eventoId: textoNoVacio,
  hlc: z.string().regex(/^\d{15}:\d{5}:.+$/, 'HLC mal formado'),
  dispositivoId: textoNoVacio,
  usuarioId: textoNoVacio,
  rol: esquemaRol,
  registradoEn: z.string().datetime({ offset: true }),
});

export const esquemaCuerpoEvento = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('ESCANEO_ARMADO'), codigo: textoNoVacio, maletaId: textoNoVacio }),
  z.object({ tipo: z.literal('ESCANEO_ARMADO_REVERSO'), codigo: textoNoVacio }),
  z.object({ tipo: z.literal('CONFIRMAR_SALIDA'), codigo: textoNoVacio, maletaId: textoNoVacio }),
  z.object({ tipo: z.literal('ESCANEO_USO'), codigo: textoNoVacio, maletaId: textoNoVacio }),
  z.object({
    tipo: z.literal('CIERRE_MALETA_SIN_USO'),
    codigo: textoNoVacio,
    maletaId: textoNoVacio,
  }),
  z.object({ tipo: z.literal('CONFIRMAR_FACTURA'), codigo: textoNoVacio }),
  z.object({ tipo: z.literal('INGRESO_REPROCESO'), codigo: textoNoVacio }),
  z.object({ tipo: z.literal('FIN_REPROCESO'), codigo: textoNoVacio, destino: esquemaUbicacion }),
  z.object({
    tipo: z.literal('CONFLICTO_SYNC'),
    codigo: textoNoVacio,
    conflictoId: textoNoVacio,
  }),
  z.object({
    tipo: z.literal('RESOLUCION_MANUAL'),
    codigo: textoNoVacio,
    estadoAdjudicado: esquemaEstadoPieza,
    ubicacion: esquemaUbicacion,
    maletaId: textoNoVacio.nullable(),
    motivo: textoNoVacio,
  }),
  z.object({ tipo: z.literal('MARCAR_EXTRAVIADA'), codigo: textoNoVacio, motivo: textoNoVacio }),
]);

export const esquemaEvento = z.object({
  sobre: esquemaSobre,
  cuerpo: esquemaCuerpoEvento,
});

/** Lote de sincronizacion. El servidor deduplica por eventoId, nunca por posicion. */
export const esquemaLoteSync = z.object({
  dispositivoId: textoNoVacio,
  cursorServidor: z.string().nullable(),
  // Puede ir vacio: un lote sin eventos es una sincronizacion de solo lectura,
  // util cuando el dispositivo no tiene nada pendiente pero quiere recibir cambios.
  eventos: z.array(esquemaEvento).max(500),
});

export type LoteSync = z.infer<typeof esquemaLoteSync>;
