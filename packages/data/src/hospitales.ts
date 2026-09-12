import { fallo, hospitalId as crearHospitalId, ok, type Hospital, type Resultado } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import type { Sesion } from './escaneo.js';

export type CodigoErrorHospital = 'NO_AUTORIZADO' | 'HOSPITAL_NO_ENCONTRADO';

export interface ErrorHospital {
  readonly codigo: CodigoErrorHospital;
  readonly mensaje: string;
}

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
    return fallo({ codigo: 'NO_AUTORIZADO', mensaje: 'Solo el Administrador gestiona instituciones' });
  }
  await db.hospitales.put(hospital);
  return ok(hospital);
}
