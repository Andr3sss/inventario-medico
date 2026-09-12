import { casoNoCubierto, fallo, ok, type Resultado } from '../comun/resultado.js';
import type { EventoMaleta } from './eventos.js';
import { ROLES_PERMITIDOS_MALETA } from './eventos.js';
import { ESTADOS_TERMINALES_MALETA, type Maleta } from './tipos.js';

export type CodigoErrorTransicionMaleta =
  | 'MALETA_NO_COINCIDE'
  | 'ROL_NO_AUTORIZADO'
  | 'MALETA_EN_ESTADO_TERMINAL'
  | 'TRANSICION_ILEGAL';

export interface ErrorTransicionMaleta {
  readonly codigo: CodigoErrorTransicionMaleta;
  readonly mensaje: string;
  readonly estadoActual: Maleta['estado'];
  readonly evento: string;
}

const error = (
  codigo: CodigoErrorTransicionMaleta,
  mensaje: string,
  maleta: Maleta,
  evento: EventoMaleta,
): Resultado<never, ErrorTransicionMaleta> =>
  fallo({ codigo, mensaje, estadoActual: maleta.estado, evento: evento.cuerpo.tipo });

/**
 * Unica puerta de entrada para cambiar el estado de una maleta ya abierta.
 * Espejo deliberado de `aplicarEvento` en estados/maquina.ts: misma forma,
 * mismas garantias, para que quien conozca una maquina reconozca la otra.
 */
export function aplicarEventoMaleta(
  maleta: Maleta,
  evento: EventoMaleta,
): Resultado<Maleta, ErrorTransicionMaleta> {
  const cuerpo = evento.cuerpo;

  if (cuerpo.maletaId !== maleta.id) {
    return error(
      'MALETA_NO_COINCIDE',
      `El evento apunta a ${cuerpo.maletaId} y la maleta es ${maleta.id}`,
      maleta,
      evento,
    );
  }

  const permitidos = ROLES_PERMITIDOS_MALETA[cuerpo.tipo];
  if (!permitidos.includes(evento.sobre.rol)) {
    return error(
      'ROL_NO_AUTORIZADO',
      `El rol ${evento.sobre.rol} no puede emitir ${cuerpo.tipo}`,
      maleta,
      evento,
    );
  }

  if ((ESTADOS_TERMINALES_MALETA as readonly Maleta['estado'][]).includes(maleta.estado)) {
    return error(
      'MALETA_EN_ESTADO_TERMINAL',
      `La maleta esta ${maleta.estado} y no admite mas eventos`,
      maleta,
      evento,
    );
  }

  switch (cuerpo.tipo) {
    case 'MALETA_ABIERTA':
      // No se llega aca en operacion normal: MALETA_ABIERTA crea la maleta,
      // no la transiciona. Se cubre el caso para que el switch sea exhaustivo.
      return error('TRANSICION_ILEGAL', 'MALETA_ABIERTA no es una transicion', maleta, evento);

    case 'MALETA_SALIO': {
      if (maleta.estado !== 'EN_ARMADO') {
        return error(
          'TRANSICION_ILEGAL',
          'Solo se confirma la salida de una maleta en armado',
          maleta,
          evento,
        );
      }
      return ok({
        ...maleta,
        estado: 'EN_CIRUGIA',
        salioEn: evento.sobre.registradoEn,
        version: maleta.version + 1,
      });
    }

    case 'MALETA_CERRADA': {
      if (maleta.estado !== 'EN_CIRUGIA') {
        return error(
          'TRANSICION_ILEGAL',
          'Solo se cierra una maleta que esta en cirugia',
          maleta,
          evento,
        );
      }
      return ok({
        ...maleta,
        estado: 'CERRADA',
        hospitalId: cuerpo.hospitalId,
        cerradaEn: evento.sobre.registradoEn,
        version: maleta.version + 1,
      });
    }

    case 'MALETA_CANCELADA': {
      if (maleta.estado !== 'EN_ARMADO') {
        return error(
          'TRANSICION_ILEGAL',
          'Solo se cancela una maleta que todavia no salio de bodega',
          maleta,
          evento,
        );
      }
      return ok({
        ...maleta,
        estado: 'CANCELADA',
        canceladaEn: evento.sobre.registradoEn,
        version: maleta.version + 1,
      });
    }

    default:
      return casoNoCubierto(cuerpo, 'aplicarEventoMaleta');
  }
}
