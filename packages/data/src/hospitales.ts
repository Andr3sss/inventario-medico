import {
  fallo,
  hospitalId as crearHospitalId,
  ok,
  type Hospital,
  type Resultado,
} from '@crearcos/core';
import type { BaseLocal } from './db.js';
import type { Sesion } from './escaneo.js';
import { AZAR_CRIPTOGRAFICO, uuidV7, type FuenteAzar } from './identificadores.js';
import { secuenciaClienteDesdeHlc } from './operaciones.js';
import { avanzarReloj, serializarHlc } from './reloj.js';

export type CodigoErrorHospital = 'NO_AUTORIZADO' | 'HOSPITAL_NO_ENCONTRADO';

export interface ErrorHospital {
  readonly codigo: CodigoErrorHospital;
  readonly mensaje: string;
}

export interface OpcionesHospitalOffline {
  readonly ahora: () => number;
  readonly azar?: FuenteAzar;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Catalogo de instituciones. Todavia no tiene pantalla propia (no existe un
 * Area 'hospitales' en `acceso/permisos.ts`): es una decision de UI pendiente
 * con Codex, documentada en docs/AI_COLLABORATION.md. Por ahora se siembra
 * junto con el catalogo de productos y el Administrador la mantiene desde
 * aqui aunque todavia no haya una pantalla dedicada.
 */
export async function listarHospitales(db: BaseLocal): Promise<readonly Hospital[]> {
  return db.hospitales.toArray();
}

export async function obtenerHospital(db: BaseLocal, id: string): Promise<Hospital | undefined> {
  return db.hospitales.get(crearHospitalId(id));
}

/** Alta o edicion. Solo el Administrador define instituciones y su nivel de precio por defecto. */
export async function guardarHospital(
  db: BaseLocal,
  hospital: Hospital,
  sesion: Sesion,
): Promise<Resultado<Hospital, ErrorHospital>> {
  if (sesion.rol !== 'ADMINISTRADOR') {
    return fallo({
      codigo: 'NO_AUTORIZADO',
      mensaje: 'Solo el Administrador gestiona instituciones',
    });
  }
  await db.hospitales.put(hospital);
  return ok(hospital);
}

export async function eliminarHospital(
  db: BaseLocal,
  hospital: Hospital,
  sesion: Sesion,
): Promise<Resultado<true, ErrorHospital>> {
  if (sesion.rol !== 'ADMINISTRADOR') {
    return fallo({
      codigo: 'NO_AUTORIZADO',
      mensaje: 'Solo el Administrador gestiona instituciones',
    });
  }
  if ((await db.hospitales.get(hospital.id)) === undefined) {
    return fallo({ codigo: 'HOSPITAL_NO_ENCONTRADO', mensaje: 'El hospital ya no existe' });
  }
  await db.hospitales.delete(hospital.id);
  return ok(true);
}

export async function eliminarHospitalOffline(
  db: BaseLocal,
  hospital: Hospital,
  sesion: Sesion,
  opciones: OpcionesHospitalOffline,
): Promise<Resultado<true, ErrorHospital>> {
  if (sesion.rol !== 'ADMINISTRADOR') {
    return fallo({
      codigo: 'NO_AUTORIZADO',
      mensaje: 'Solo el Administrador gestiona instituciones',
    });
  }
  if ((await db.hospitales.get(hospital.id)) === undefined) {
    return fallo({ codigo: 'HOSPITAL_NO_ENCONTRADO', mensaje: 'El hospital ya no existe' });
  }
  const relojPared = opciones.ahora();
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const operacionId = uuidV7(relojPared, azar);
  const replica = await db.replicaCentral.get(`HOSPITAL:${hospital.id}`);
  await db.transaction('rw', [db.hospitales, db.operacionesSync, db.meta], async () => {
    const reloj = await avanzarReloj(db, sesion.dispositivoId, relojPared);
    const hlc = serializarHlc(reloj);
    await db.hospitales.delete(hospital.id);
    await db.operacionesSync.add({
      operacionId,
      secuenciaCliente: secuenciaClienteDesdeHlc(hlc),
      eventoIds: [],
      eventos: [],
      clase: 'COMANDO_MAESTRO',
      facturaId: null,
      numeroFactura: null,
      maestro: {
        tipo: 'ELIMINAR_HOSPITAL',
        entidadId: hospital.id,
        payload: { hospitalId: hospital.id, versionEsperada: replica?.version ?? null },
      },
      creadoEn: relojPared,
      intentos: 0,
      proximoIntento: relojPared,
      ultimoError: null,
    });
  });
  return ok(true);
}

/**
 * Guarda inmediatamente y deja un comando durable para el siguiente PUSH.
 * El UUID central nace en el dispositivo para que cada reintento conserve la
 * misma identidad y el servidor pueda deduplicarlo por `operacionId`.
 */
export async function guardarHospitalOffline(
  db: BaseLocal,
  hospital: Hospital,
  codigoPublico: string,
  sesion: Sesion,
  opciones: OpcionesHospitalOffline,
): Promise<Resultado<Hospital, ErrorHospital>> {
  if (sesion.rol !== 'ADMINISTRADOR') {
    return fallo({
      codigo: 'NO_AUTORIZADO',
      mensaje: 'Solo el Administrador gestiona instituciones',
    });
  }

  const relojPared = opciones.ahora();
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const idRemoto = UUID.test(hospital.id) ? hospital.id : uuidV7(relojPared, azar);
  const resultado: Hospital = { ...hospital, id: crearHospitalId(idRemoto) };
  const operacionId = uuidV7(relojPared, azar);

  await db.transaction(
    'rw',
    [db.hospitales, db.operacionesSync, db.replicaCentral, db.meta],
    async () => {
      const reloj = await avanzarReloj(db, sesion.dispositivoId, relojPared);
      const hlc = serializarHlc(reloj);
      const replica = await db.replicaCentral.get(`HOSPITAL:${idRemoto}`);
      if (hospital.id !== resultado.id) await db.hospitales.delete(hospital.id);
      await db.hospitales.put(resultado);
      await db.operacionesSync.add({
        operacionId,
        secuenciaCliente: secuenciaClienteDesdeHlc(hlc),
        eventoIds: [],
        eventos: [],
        clase: 'GUARDAR_HOSPITAL',
        facturaId: null,
        numeroFactura: null,
        hospital: {
          id: idRemoto,
          codigo: codigoPublico.trim(),
          nombre: resultado.nombre,
          ciudad: resultado.ciudad,
          nivelPrecio: resultado.nivelPorDefecto,
          versionEsperada: replica?.version ?? null,
        },
        creadoEn: relojPared,
        intentos: 0,
        proximoIntento: relojPared,
        ultimoError: null,
      });
    },
  );
  return ok(resultado);
}
