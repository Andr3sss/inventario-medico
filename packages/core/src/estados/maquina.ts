import { casoNoCubierto, fallo, ok, type Resultado } from '../comun/resultado.js';
import { ROLES_PERMITIDOS, type Evento } from '../eventos/tipos.js';
import { esTerminal, estadoEnReposo, type EstadoPieza, type Pieza } from './tipos.js';

export type CodigoErrorTransicion =
  | 'CODIGO_NO_COINCIDE'
  | 'ROL_NO_AUTORIZADO'
  | 'PIEZA_EN_ESTADO_TERMINAL'
  | 'PIEZA_CONGELADA'
  | 'TRANSICION_ILEGAL'
  | 'MALETA_NO_COINCIDE'
  | 'PIEZA_SIN_MALETA'
  | 'ESTADO_ADJUDICADO_INVALIDO';

export interface ErrorTransicion {
  readonly codigo: CodigoErrorTransicion;
  readonly mensaje: string;
  readonly estadoActual: EstadoPieza;
  readonly evento: string;
}

const error = (
  codigo: CodigoErrorTransicion,
  mensaje: string,
  pieza: Pieza,
  evento: Evento,
): Resultado<never, ErrorTransicion> =>
  fallo({ codigo, mensaje, estadoActual: pieza.estado, evento: evento.cuerpo.tipo });

/** Estados en los que una pieza puede quedar tras una resolucion manual. */
const ESTADOS_ADJUDICABLES: readonly EstadoPieza[] = [
  'EN_BODEGA_CENTRAL',
  'EN_BODEGA_INSTRUMENTISTA',
  'EN_MALETA_ACTIVA',
  'USADA_PENDIENTE_VALORACION',
  'EN_REPROCESAMIENTO',
  'EXTRAVIADA',
];

function avanzar(
  pieza: Pieza,
  evento: Evento,
  cambios: Partial<Pick<Pieza, 'estado' | 'ubicacion' | 'maletaId'>>,
): Resultado<Pieza, ErrorTransicion> {
  return ok({
    ...pieza,
    ...cambios,
    version: pieza.version + 1,
    hlc: evento.sobre.hlc,
  });
}

/**
 * Unica puerta de entrada para cambiar el estado de una pieza.
 *
 * Funcion pura: mismos argumentos, mismo resultado, sin leer reloj ni base de
 * datos. Eso permite probar las 11 transiciones en milisegundos y reproducir
 * exactamente lo que paso en un dispositivo a partir de su log de eventos.
 *
 * Prohibido escribir `pieza.estado` desde cualquier otro lugar del sistema.
 */
export function aplicarEvento(pieza: Pieza, evento: Evento): Resultado<Pieza, ErrorTransicion> {
  const cuerpo = evento.cuerpo;

  if (cuerpo.codigo !== pieza.codigo) {
    return error(
      'CODIGO_NO_COINCIDE',
      `El evento apunta a ${cuerpo.codigo} y la pieza es ${pieza.codigo}`,
      pieza,
      evento,
    );
  }

  const permitidos = ROLES_PERMITIDOS[cuerpo.tipo];
  if (!permitidos.includes(evento.sobre.rol)) {
    return error(
      'ROL_NO_AUTORIZADO',
      `El rol ${evento.sobre.rol} no puede emitir ${cuerpo.tipo}`,
      pieza,
      evento,
    );
  }

  if (esTerminal(pieza.estado)) {
    return error(
      'PIEZA_EN_ESTADO_TERMINAL',
      `La pieza esta en ${pieza.estado} y no admite mas eventos`,
      pieza,
      evento,
    );
  }

  // Una pieza en conflicto queda congelada hasta que la Coordinadora la libere.
  // Sin esto, un error de sincronizacion se arrastra a las siguientes cirugias.
  if (pieza.estado === 'EN_CONFLICTO' && cuerpo.tipo !== 'RESOLUCION_MANUAL') {
    return error(
      'PIEZA_CONGELADA',
      'La pieza esta en conflicto y solo la Coordinadora puede liberarla',
      pieza,
      evento,
    );
  }

  switch (cuerpo.tipo) {
    case 'CONFLICTO_SYNC':
      return avanzar(pieza, evento, { estado: 'EN_CONFLICTO' });

    case 'ESCANEO_ARMADO': {
      if (pieza.estado !== 'EN_BODEGA_CENTRAL' && pieza.estado !== 'EN_BODEGA_INSTRUMENTISTA') {
        return error(
          'TRANSICION_ILEGAL',
          'Solo se puede cargar a una maleta una pieza que esta en bodega',
          pieza,
          evento,
        );
      }
      return avanzar(pieza, evento, {
        estado: 'ASIGNADA_A_MALETA',
        maletaId: cuerpo.maletaId,
      });
    }

    case 'ESCANEO_ARMADO_REVERSO': {
      if (pieza.estado !== 'ASIGNADA_A_MALETA') {
        return error(
          'TRANSICION_ILEGAL',
          'Solo se puede retirar de la maleta una pieza aun no despachada',
          pieza,
          evento,
        );
      }
      return avanzar(pieza, evento, {
        estado: estadoEnReposo(pieza.ubicacion),
        maletaId: null,
      });
    }

    case 'CONFIRMAR_SALIDA': {
      if (pieza.estado !== 'ASIGNADA_A_MALETA') {
        return error('TRANSICION_ILEGAL', 'La pieza no esta asignada a una maleta', pieza, evento);
      }
      if (pieza.maletaId !== cuerpo.maletaId) {
        return error(
          'MALETA_NO_COINCIDE',
          `La pieza pertenece a ${pieza.maletaId ?? 'ninguna maleta'}`,
          pieza,
          evento,
        );
      }
      return avanzar(pieza, evento, { estado: 'EN_MALETA_ACTIVA' });
    }

    case 'ESCANEO_USO': {
      if (pieza.estado !== 'EN_MALETA_ACTIVA') {
        return error(
          'TRANSICION_ILEGAL',
          'Solo se registra uso de piezas despachadas en una maleta activa',
          pieza,
          evento,
        );
      }
      if (pieza.maletaId === null) {
        return error('PIEZA_SIN_MALETA', 'La pieza no tiene maleta asociada', pieza, evento);
      }
      if (pieza.maletaId !== cuerpo.maletaId) {
        return error(
          'MALETA_NO_COINCIDE',
          `La pieza salio en ${pieza.maletaId}, se intento usar en ${cuerpo.maletaId}`,
          pieza,
          evento,
        );
      }
      return avanzar(pieza, evento, { estado: 'USADA_PENDIENTE_VALORACION' });
    }

    case 'CIERRE_MALETA_SIN_USO': {
      if (pieza.estado !== 'EN_MALETA_ACTIVA') {
        return error(
          'TRANSICION_ILEGAL',
          'Solo se cierra sin uso una pieza que salio en la maleta',
          pieza,
          evento,
        );
      }
      if (pieza.maletaId !== cuerpo.maletaId) {
        return error('MALETA_NO_COINCIDE', 'La maleta del evento no corresponde', pieza, evento);
      }
      return avanzar(pieza, evento, { estado: 'EN_REPROCESAMIENTO', maletaId: null });
    }

    case 'CONFIRMAR_FACTURA': {
      if (pieza.estado !== 'USADA_PENDIENTE_VALORACION') {
        return error('TRANSICION_ILEGAL', 'Solo se factura lo efectivamente usado', pieza, evento);
      }
      // Un insumo sale del inventario al facturarse. El instrumental es activo
      // fijo: se factura y despues vuelve a reprocesamiento, no desaparece.
      const estado: EstadoPieza = pieza.tipo === 'INSUMO' ? 'CONSUMIDA' : 'FACTURADA';
      return avanzar(pieza, evento, { estado, maletaId: null });
    }

    case 'INGRESO_REPROCESO': {
      if (pieza.estado !== 'FACTURADA') {
        return error(
          'TRANSICION_ILEGAL',
          'Al reproceso se ingresa desde FACTURADA o por cierre sin uso',
          pieza,
          evento,
        );
      }
      return avanzar(pieza, evento, { estado: 'EN_REPROCESAMIENTO' });
    }

    case 'FIN_REPROCESO': {
      if (pieza.estado !== 'EN_REPROCESAMIENTO') {
        return error('TRANSICION_ILEGAL', 'La pieza no esta en reprocesamiento', pieza, evento);
      }
      return avanzar(pieza, evento, {
        estado: estadoEnReposo(cuerpo.destino),
        ubicacion: cuerpo.destino,
        maletaId: null,
      });
    }

    case 'MARCAR_EXTRAVIADA':
      return avanzar(pieza, evento, { estado: 'EXTRAVIADA', maletaId: null });

    case 'RESOLUCION_MANUAL': {
      if (pieza.estado !== 'EN_CONFLICTO') {
        return error(
          'TRANSICION_ILEGAL',
          'La resolucion manual solo aplica a piezas en conflicto',
          pieza,
          evento,
        );
      }
      if (!ESTADOS_ADJUDICABLES.includes(cuerpo.estadoAdjudicado)) {
        return error(
          'ESTADO_ADJUDICADO_INVALIDO',
          `No se puede adjudicar el estado ${cuerpo.estadoAdjudicado}`,
          pieza,
          evento,
        );
      }
      return avanzar(pieza, evento, {
        estado: cuerpo.estadoAdjudicado,
        ubicacion: cuerpo.ubicacion,
        maletaId: cuerpo.maletaId,
      });
    }

    default:
      return casoNoCubierto(cuerpo, 'aplicarEvento');
  }
}

/** Reconstruye el estado de una pieza desde su historial. Base de la auditoria. */
export function reproducir(
  inicial: Pieza,
  eventos: readonly Evento[],
): Resultado<Pieza, ErrorTransicion> {
  let actual = inicial;
  for (const evento of eventos) {
    const resultado = aplicarEvento(actual, evento);
    if (!resultado.ok) return resultado;
    actual = resultado.valor;
  }
  return ok(actual);
}
