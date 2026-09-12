import {
  ESTADOS_TERMINALES_MALETA,
  fallo,
  maletaId as crearMaletaId,
  ok,
  usuarioId as crearUsuarioId,
  type Maleta,
  type Resultado,
  type Rol,
} from '@crearcos/core';
import { CLAVE_SESION, type BaseLocal, type FilaTokenFreelance } from './db.js';
import { idDispositivo, VIGENCIA_FREELANCE_MS, type SesionActiva } from './autenticacion.js';
import type { Sesion } from './escaneo.js';
import { AZAR_CRIPTOGRAFICO, uuidV7, type FuenteAzar } from './identificadores.js';

/**
 * Enlace temporal de instrumentista freelance (brief §11.4, punto que estaba
 * abierto). Decision tomada con el usuario: el token vive atado a la maleta,
 * no a un plazo fijo -expira cuando la maleta llega a un estado terminal
 * (`CERRADA`/`CANCELADA`), no a una hora fija de reloj-.
 *
 * Quien lo genera: el brief (§4) asigna explicitamente "valida instrumentistas
 * freelance" al rol Contable, no a la Coordinadora -se incluye Administrador
 * como respaldo, mismo criterio que el resto de altas administrativas-.
 *
 * El token NO reemplaza el chequeo de rol en cada evento: `escanearUso` sigue
 * exigiendo que el rol de la sesion (FREELANCE) este en `ROLES_PERMITIDOS`
 * para ese tipo de evento, exactamente igual que para un Auxiliar. El token
 * solo gobierna la entrada; lo que se puede hacer una vez dentro ya estaba
 * resuelto por la maquina de estados existente.
 */
export interface OpcionesFreelance {
  readonly ahora: () => number;
  readonly azar?: FuenteAzar;
}

export type CodigoErrorFreelance =
  | 'NO_AUTORIZADO'
  | 'MALETA_NO_ENCONTRADA'
  | 'MALETA_EN_ESTADO_TERMINAL'
  | 'TOKEN_INVALIDO'
  | 'TOKEN_REVOCADO'
  | 'NOMBRE_REQUERIDO';

export interface ErrorFreelance {
  readonly codigo: CodigoErrorFreelance;
  readonly mensaje: string;
}

const ROLES_GENERAN_TOKEN: readonly Rol[] = ['CONTABLE', 'ADMINISTRADOR'];

export interface TokenFreelanceCreado {
  readonly token: string;
  readonly maletaId: string;
}

/** Genera un enlace nuevo para una maleta que todavia no llego a un estado terminal. */
export async function generarTokenFreelance(
  db: BaseLocal,
  maletaIdTexto: string,
  sesion: Sesion,
  opciones: OpcionesFreelance,
): Promise<Resultado<TokenFreelanceCreado, ErrorFreelance>> {
  if (!ROLES_GENERAN_TOKEN.includes(sesion.rol)) {
    return fallo({
      codigo: 'NO_AUTORIZADO',
      mensaje: 'Solo Contable o Administrador generan enlaces de freelance',
    });
  }

  const idMaleta = crearMaletaId(maletaIdTexto);
  const maleta = await db.maletas.get(idMaleta);
  if (maleta === undefined) {
    return fallo({
      codigo: 'MALETA_NO_ENCONTRADA',
      mensaje: `La maleta ${maletaIdTexto} no existe`,
    });
  }
  if ((ESTADOS_TERMINALES_MALETA as readonly Maleta['estado'][]).includes(maleta.estado)) {
    return fallo({
      codigo: 'MALETA_EN_ESTADO_TERMINAL',
      mensaje: `La maleta esta ${maleta.estado}, ya no admite un enlace nuevo`,
    });
  }

  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const relojPared = opciones.ahora();
  // Token de alta entropia: el uuidV7 completo, no el pliegue de 32 bits que
  // usan Maleta/Factura -ese pliegue esta bien para un codigo que se lee en
  // pantalla, mal para un secreto que otorga acceso de escritura.
  const token = uuidV7(relojPared, azar);

  const fila: FilaTokenFreelance = {
    token,
    maletaId: idMaleta,
    creadoPorId: sesion.usuarioId,
    creadoEn: relojPared,
    revocado: false,
  };
  await db.tokensFreelance.put(fila);
  return ok({ token, maletaId: idMaleta });
}

export async function listarTokensFreelance(
  db: BaseLocal,
  maletaIdTexto: string,
): Promise<readonly FilaTokenFreelance[]> {
  return db.tokensFreelance.where('maletaId').equals(maletaIdTexto).toArray();
}

/** Revocacion manual, antes de que la maleta llegue a un estado terminal (ej. link compartido por error). */
export async function revocarTokenFreelance(
  db: BaseLocal,
  token: string,
  sesion: Sesion,
): Promise<Resultado<true, ErrorFreelance>> {
  if (!ROLES_GENERAN_TOKEN.includes(sesion.rol)) {
    return fallo({
      codigo: 'NO_AUTORIZADO',
      mensaje: 'Solo Contable o Administrador revocan enlaces de freelance',
    });
  }
  const fila = await db.tokensFreelance.get(token);
  if (fila === undefined) {
    return fallo({ codigo: 'TOKEN_INVALIDO', mensaje: 'El enlace no existe en este dispositivo' });
  }
  await db.tokensFreelance.update(token, { revocado: true });
  return ok(true);
}

async function validar(
  db: BaseLocal,
  token: string,
): Promise<Resultado<FilaTokenFreelance, ErrorFreelance>> {
  const fila = await db.tokensFreelance.get(token);
  if (fila === undefined) {
    return fallo({
      codigo: 'TOKEN_INVALIDO',
      mensaje: 'El enlace no es valido en este dispositivo',
    });
  }
  if (fila.revocado) {
    return fallo({ codigo: 'TOKEN_REVOCADO', mensaje: 'Este enlace fue revocado' });
  }
  const maleta = await db.maletas.get(crearMaletaId(fila.maletaId));
  if (
    maleta === undefined ||
    (ESTADOS_TERMINALES_MALETA as readonly Maleta['estado'][]).includes(maleta.estado)
  ) {
    return fallo({
      codigo: 'MALETA_EN_ESTADO_TERMINAL',
      mensaje: 'La cirugia asociada a este enlace ya terminó',
    });
  }
  return ok(fila);
}

/**
 * Verificacion de solo lectura, para que la pantalla de acceso decida que
 * mostrar (formulario de nombre vs. "enlace vencido") antes de pedir nada.
 */
export async function validarTokenFreelance(
  db: BaseLocal,
  token: string,
): Promise<Resultado<{ readonly maletaId: string }, ErrorFreelance>> {
  const r = await validar(db, token);
  if (!r.ok) return r;
  return ok({ maletaId: r.valor.maletaId });
}

/**
 * Redime el enlace y abre sesion como FREELANCE, sin usuario ni contrasena.
 * `nombre` lo escribe la persona al entrar -no hay cuenta previa que lo
 * traiga- y queda en la sesion para que el resto de la app lo muestre igual
 * que el de cualquier otro usuario.
 *
 * La identidad (`usuarioId`) es efimera, derivada del token: no crea una fila
 * en `usuarios`, a proposito. Nada en el resto del sistema exige que
 * `sobre.usuarioId` de un evento corresponda a una fila de `usuarios` -la
 * autorizacion de cada evento se decide por `sobre.rol`, nunca por una
 * consulta a esa tabla-, asi que esta identidad efimera es valida para
 * escribir eventos igual que cualquier otra.
 */
export async function entrarConToken(
  db: BaseLocal,
  token: string,
  nombre: string,
  opciones: OpcionesFreelance,
): Promise<Resultado<SesionActiva, ErrorFreelance>> {
  const nombreLimpio = nombre.trim();
  if (nombreLimpio === '') {
    return fallo({ codigo: 'NOMBRE_REQUERIDO', mensaje: 'Escribe tu nombre para continuar' });
  }

  const r = await validar(db, token);
  if (!r.ok) return r;

  const relojPared = opciones.ahora();
  const sesion: SesionActiva = {
    usuarioId: crearUsuarioId(`freelance-${token.slice(0, 8)}`),
    nombre: nombreLimpio,
    rol: 'FREELANCE',
    dispositivoId: await idDispositivo(db),
    expiraEn: relojPared + VIGENCIA_FREELANCE_MS,
    origen: 'FREELANCE_LOCAL',
  };
  await db.meta.put({ clave: CLAVE_SESION, valor: sesion });
  return ok(sesion);
}
