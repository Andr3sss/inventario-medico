import {
  centavos,
  fallo,
  hospitalId as crearHospitalId,
  ok,
  sku as crearSku,
  type EstadoAprobacion,
  type Resultado,
  type Rol,
} from '@crearcos/core';
import type { BaseLocal, FilaExcepcionPrecio } from './db.js';
import type { Sesion } from './escaneo.js';
import { AZAR_CRIPTOGRAFICO, codigoCortoDesde, uuidV7, type FuenteAzar } from './identificadores.js';

/**
 * Alta y aprobacion de precios "aleatorios" (brief §7 y punto abierto §11.3).
 *
 * Decision tomada con el usuario (no inventada en silencio): aprueba el
 * Administrador -no se agrega un rol "Gerencia" nuevo, que no existe en las 5
 * posiciones del brief-. Toda excepcion nace `PENDIENTE`, incluso si la crea
 * el propio Administrador: la aprobacion es un paso separado y auditable, no
 * algo implicito en el alta. El motor de precios (`resolverPrecio`, ya
 * probado) es quien decide que una excepcion `PENDIENTE` bloquea la factura
 * en vez de caer al precio habitual (decision 12 de decisiones.md).
 */
export interface OpcionesExcepcion {
  readonly ahora: () => number;
  readonly azar?: FuenteAzar;
}

export type CodigoErrorExcepcion =
  | 'NO_AUTORIZADO'
  | 'EXCEPCION_NO_ENCONTRADA'
  | 'ESTADO_INVALIDO'
  | 'VALOR_INVALIDO';

export interface ErrorExcepcion {
  readonly codigo: CodigoErrorExcepcion;
  readonly mensaje: string;
}

/** Quien puede negociar y registrar una excepcion. La aprobacion es aparte, solo Administrador. */
const ROLES_PROPONEN: readonly Rol[] = ['ADMINISTRADOR', 'CONTABLE'];

function exigirRolProponente(sesion: Sesion): Resultado<true, ErrorExcepcion> {
  if (!ROLES_PROPONEN.includes(sesion.rol)) {
    return fallo({ codigo: 'NO_AUTORIZADO', mensaje: 'Solo Contable o Administrador registran precios negociados' });
  }
  return ok(true);
}

function exigirAdministrador(sesion: Sesion): Resultado<true, ErrorExcepcion> {
  if (sesion.rol !== 'ADMINISTRADOR') {
    return fallo({ codigo: 'NO_AUTORIZADO', mensaje: 'Solo el Administrador aprueba o rechaza precios negociados' });
  }
  return ok(true);
}

export interface DatosExcepcionNueva {
  readonly sku: string;
  readonly hospitalId: string;
  /** Centavos enteros negociados puntualmente (decision 6: nunca decimales). */
  readonly valor: number;
  readonly vigenteDesde: string;
  readonly vigenteHasta?: string | null;
}

/** Registra una negociacion puntual de precio. Siempre queda `PENDIENTE`. */
export async function proponerExcepcionPrecio(
  db: BaseLocal,
  datos: DatosExcepcionNueva,
  sesion: Sesion,
  opciones: OpcionesExcepcion,
): Promise<Resultado<FilaExcepcionPrecio, ErrorExcepcion>> {
  const permiso = exigirRolProponente(sesion);
  if (!permiso.ok) return permiso;

  if (!Number.isInteger(datos.valor) || datos.valor < 0) {
    return fallo({ codigo: 'VALOR_INVALIDO', mensaje: 'El valor negociado debe ser un entero de centavos, no negativo' });
  }

  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const relojPared = opciones.ahora();
  const fila: FilaExcepcionPrecio = {
    id: `EXC-${codigoCortoDesde(uuidV7(relojPared, azar))}`,
    sku: crearSku(datos.sku),
    hospitalId: crearHospitalId(datos.hospitalId),
    valor: centavos(datos.valor),
    estado: 'PENDIENTE',
    vigenteDesde: datos.vigenteDesde,
    vigenteHasta: datos.vigenteHasta ?? null,
    motivoRechazo: null,
  };
  await db.excepcionesPrecio.add(fila);
  return ok(fila);
}

export interface FiltroExcepciones {
  readonly estado?: EstadoAprobacion;
  readonly hospitalId?: string;
}

/** Mas reciente primero por `vigenteDesde`. */
export async function listarExcepcionesPrecio(
  db: BaseLocal,
  filtro: FiltroExcepciones = {},
): Promise<readonly FilaExcepcionPrecio[]> {
  const todas =
    filtro.estado === undefined
      ? await db.excepcionesPrecio.toArray()
      : await db.excepcionesPrecio.where('estado').equals(filtro.estado).toArray();
  const filtradas =
    filtro.hospitalId === undefined ? todas : todas.filter((e) => e.hospitalId === filtro.hospitalId);
  return [...filtradas].sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde));
}

export async function obtenerExcepcionPrecio(
  db: BaseLocal,
  idTexto: string,
): Promise<FilaExcepcionPrecio | undefined> {
  return db.excepcionesPrecio.get(idTexto);
}

async function resolverAprobacion(
  db: BaseLocal,
  idTexto: string,
  destino: 'APROBADO' | 'RECHAZADO',
  motivoRechazo: string | null,
  sesion: Sesion,
): Promise<Resultado<FilaExcepcionPrecio, ErrorExcepcion>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;

  const fila = await db.excepcionesPrecio.get(idTexto);
  if (fila === undefined) {
    return fallo({ codigo: 'EXCEPCION_NO_ENCONTRADA', mensaje: `La excepcion ${idTexto} no existe` });
  }
  if (fila.estado !== 'PENDIENTE') {
    return fallo({
      codigo: 'ESTADO_INVALIDO',
      mensaje: `La excepcion ya esta ${fila.estado}, no admite otra decision`,
    });
  }

  const actualizada: FilaExcepcionPrecio = { ...fila, estado: destino, motivoRechazo };
  await db.excepcionesPrecio.put(actualizada);
  return ok(actualizada);
}

/** Aprueba una excepcion pendiente. Idempotente en el sentido de que una ya decidida nunca se pisa (ver `ESTADO_INVALIDO`). */
export async function aprobarExcepcionPrecio(
  db: BaseLocal,
  idTexto: string,
  sesion: Sesion,
): Promise<Resultado<FilaExcepcionPrecio, ErrorExcepcion>> {
  return resolverAprobacion(db, idTexto, 'APROBADO', null, sesion);
}

/** Rechaza una excepcion pendiente. `motivo` es texto libre, solo para trazabilidad administrativa. */
export async function rechazarExcepcionPrecio(
  db: BaseLocal,
  idTexto: string,
  motivo: string,
  sesion: Sesion,
): Promise<Resultado<FilaExcepcionPrecio, ErrorExcepcion>> {
  return resolverAprobacion(db, idTexto, 'RECHAZADO', motivo, sesion);
}
