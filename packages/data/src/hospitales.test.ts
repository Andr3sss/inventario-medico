import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hospitalId } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import { guardarHospital, listarHospitales, obtenerHospital } from './hospitales.js';
import { SESION, baseDePrueba } from './pruebas/entorno.js';

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
      { id: hospitalId('HOSP-1'), nombre: 'Hospital San Juan', ciudad: 'Guayaquil', nivelPorDefecto: 'HABITUAL' },
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
});
