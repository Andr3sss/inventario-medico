import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hospitalId } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import {
  eliminarHospitalOffline,
  guardarHospital,
  guardarHospitalOffline,
  listarHospitales,
  obtenerHospital,
} from './hospitales.js';
import { AZAR_FIJO, SESION, baseDePrueba, relojFalso } from './pruebas/entorno.js';

const ADMIN = { ...SESION, rol: 'ADMINISTRADOR' } as const;

let db: BaseLocal;

beforeEach(async () => {
  db = await baseDePrueba();
});

afterEach(() => {
  db.close();
});

describe('guardarHospital', () => {
  it('el Administrador da de alta un hospital', async () => {
    const r = await guardarHospital(
      db,
      {
        id: hospitalId('HOSP-1'),
        nombre: 'Hospital San Juan',
        ciudad: 'Guayaquil',
        nivelPorDefecto: 'HABITUAL',
      },
      ADMIN,
    );
    expect(r.ok).toBe(true);
    expect(await listarHospitales(db)).toHaveLength(1);
    expect((await obtenerHospital(db, 'HOSP-1'))?.nombre).toBe('Hospital San Juan');
  });

  it('un rol distinto de Administrador no puede gestionar hospitales', async () => {
    const r = await guardarHospital(
      db,
      { id: hospitalId('HOSP-1'), nombre: 'x', ciudad: 'Guayaquil', nivelPorDefecto: 'HABITUAL' },
      SESION, // AUXILIAR
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('NO_AUTORIZADO');
  });

  it('guarda sin red y encola un comando con identidad central estable', async () => {
    const reloj = relojFalso();
    const r = await guardarHospitalOffline(
      db,
      {
        id: hospitalId('HOSP-NUEVO'),
        nombre: 'Hospital Offline',
        ciudad: 'Cuenca',
        nivelPorDefecto: 'PROVINCIA',
      },
      'HOSP-NUEVO',
      ADMIN,
      { ahora: reloj.ahora, azar: AZAR_FIJO },
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await db.hospitales.get(r.valor.id)).toEqual(r.valor);
    expect(await db.hospitales.get(hospitalId('HOSP-NUEVO'))).toBeUndefined();
    const operaciones = await db.operacionesSync.toArray();
    expect(operaciones).toHaveLength(1);
    expect(operaciones[0]?.clase).toBe('GUARDAR_HOSPITAL');
    expect(operaciones[0]?.eventoIds).toEqual([]);
    expect(operaciones[0]?.hospital).toEqual({
      id: r.valor.id,
      codigo: 'HOSP-NUEVO',
      nombre: 'Hospital Offline',
      ciudad: 'Cuenca',
      nivelPrecio: 'PROVINCIA',
      versionEsperada: null,
    });
  });

  it('elimina sin red y encola la baja con la version central conocida', async () => {
    const reloj = relojFalso();
    const hospital = {
      id: hospitalId('01994a64-8780-7000-8000-000000000050'),
      nombre: 'Hospital temporal',
      ciudad: 'Quito',
      nivelPorDefecto: 'HABITUAL' as const,
    };
    await db.hospitales.put(hospital);
    await db.replicaCentral.put({
      clave: `HOSPITAL:${hospital.id}`,
      entidadTipo: 'HOSPITAL',
      entidadId: hospital.id,
      version: 4,
      eliminado: false,
      payload: { id: hospital.id },
    });

    const resultado = await eliminarHospitalOffline(db, hospital, ADMIN, {
      ahora: reloj.ahora,
      azar: AZAR_FIJO,
    });

    expect(resultado.ok).toBe(true);
    await expect(db.hospitales.get(hospital.id)).resolves.toBeUndefined();
    expect((await db.operacionesSync.toArray())[0]?.maestro).toEqual({
      tipo: 'ELIMINAR_HOSPITAL',
      entidadId: hospital.id,
      payload: { hospitalId: hospital.id, versionEsperada: 4 },
    });
  });
});
