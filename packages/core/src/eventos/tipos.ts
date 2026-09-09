import type {
  CodigoPieza,
  ConflictoId,
  DispositivoId,
  EventoId,
  MaletaId,
  UsuarioId,
} from '../comun/marcas.js';
import type { EstadoPieza, Rol, Ubicacion } from '../estados/tipos.js';

/**
 * Metadatos que acompanan a todo evento. Se generan en el dispositivo, nunca en
 * el servidor: una maleta completa se puede armar sin internet y sus
 * identificadores tienen que seguir siendo validos al sincronizar horas despues.
 */
export interface Sobre {
  readonly eventoId: EventoId;
  /** HLC serializado. Unica fuente de orden entre dispositivos. */
  readonly hlc: string;
  readonly dispositivoId: DispositivoId;
  readonly usuarioId: UsuarioId;
  readonly rol: Rol;
  /** Reloj de pared local. Solo informativo, jamas se usa para ordenar. */
  readonly registradoEn: string;
}

export type CuerpoEvento =
  | { readonly tipo: 'ESCANEO_ARMADO'; readonly codigo: CodigoPieza; readonly maletaId: MaletaId }
  | { readonly tipo: 'ESCANEO_ARMADO_REVERSO'; readonly codigo: CodigoPieza }
  | { readonly tipo: 'CONFIRMAR_SALIDA'; readonly codigo: CodigoPieza; readonly maletaId: MaletaId }
  | { readonly tipo: 'ESCANEO_USO'; readonly codigo: CodigoPieza; readonly maletaId: MaletaId }
  | {
      readonly tipo: 'CIERRE_MALETA_SIN_USO';
      readonly codigo: CodigoPieza;
      readonly maletaId: MaletaId;
    }
  | { readonly tipo: 'CONFIRMAR_FACTURA'; readonly codigo: CodigoPieza }
  | { readonly tipo: 'INGRESO_REPROCESO'; readonly codigo: CodigoPieza }
  | {
      readonly tipo: 'FIN_REPROCESO';
      readonly codigo: CodigoPieza;
      readonly destino: Ubicacion;
    }
  | {
      readonly tipo: 'CONFLICTO_SYNC';
      readonly codigo: CodigoPieza;
      readonly conflictoId: ConflictoId;
    }
  | {
      readonly tipo: 'RESOLUCION_MANUAL';
      readonly codigo: CodigoPieza;
      readonly estadoAdjudicado: EstadoPieza;
      readonly ubicacion: Ubicacion;
      readonly maletaId: MaletaId | null;
      readonly motivo: string;
    }
  | { readonly tipo: 'MARCAR_EXTRAVIADA'; readonly codigo: CodigoPieza; readonly motivo: string };

export type TipoEvento = CuerpoEvento['tipo'];

export interface Evento {
  readonly sobre: Sobre;
  readonly cuerpo: CuerpoEvento;
}

/**
 * Quien puede emitir cada evento. Esto no reemplaza la autorizacion del
 * servidor, la duplica a proposito: el dispositivo esta offline y tiene que
 * poder rechazar la operacion en el momento, no diez horas despues.
 */
export const ROLES_PERMITIDOS: Readonly<Record<TipoEvento, readonly Rol[]>> = {
  ESCANEO_ARMADO: ['AUXILIAR', 'COORDINADORA', 'ADMINISTRADOR'],
  ESCANEO_ARMADO_REVERSO: ['AUXILIAR', 'COORDINADORA', 'ADMINISTRADOR'],
  CONFIRMAR_SALIDA: ['AUXILIAR', 'COORDINADORA'],
  ESCANEO_USO: ['AUXILIAR', 'COORDINADORA', 'FREELANCE'],
  CIERRE_MALETA_SIN_USO: ['AUXILIAR', 'COORDINADORA', 'FREELANCE'],
  CONFIRMAR_FACTURA: ['CONTABLE'],
  INGRESO_REPROCESO: ['COORDINADORA', 'AUXILIAR'],
  FIN_REPROCESO: ['COORDINADORA'],
  CONFLICTO_SYNC: ['SISTEMA'],
  RESOLUCION_MANUAL: ['COORDINADORA'],
  MARCAR_EXTRAVIADA: ['COORDINADORA'],
};
