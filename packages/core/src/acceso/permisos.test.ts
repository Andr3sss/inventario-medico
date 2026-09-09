import { describe, expect, it } from 'vitest';
import { AREAS, areaDeRuta, areaInicial, areasDe, puedeAcceder, type Area } from './permisos.js';
import type { Rol } from '../estados/tipos.js';

const ROLES: readonly Rol[] = [
  'SISTEMA',
  'ADMINISTRADOR',
  'AUXILIAR',
  'COORDINADORA',
  'CONTABLE',
  'SUPERVISOR',
  'FREELANCE',
];

describe('matriz de acceso', () => {
  it('SISTEMA no tiene ninguna pantalla porque no es una persona', () => {
    expect(areasDe('SISTEMA')).toEqual([]);
    expect(areaInicial('SISTEMA')).toBeNull();
    for (const area of Object.keys(AREAS) as Area[]) {
      expect(puedeAcceder('SISTEMA', area)).toBe(false);
    }
  });

  it('el freelance solo ve la cirugia', () => {
    expect(areasDe('FREELANCE')).toEqual(['cirugia']);
    expect(puedeAcceder('FREELANCE', 'facturacion')).toBe(false);
    expect(puedeAcceder('FREELANCE', 'inventario')).toBe(false);
  });

  it('el supervisor no puede tocar nada operativo', () => {
    expect(areasDe('SUPERVISOR')).toEqual(['tablero']);
    expect(puedeAcceder('SUPERVISOR', 'maletas')).toBe(false);
    expect(puedeAcceder('SUPERVISOR', 'conflictos')).toBe(false);
  });

  it('solo la coordinadora entra a conflictos', () => {
    const conAcceso = ROLES.filter((rol) => puedeAcceder(rol, 'conflictos'));
    expect(conAcceso).toEqual(['COORDINADORA']);
  });

  it('solo el contable entra a facturacion', () => {
    const conAcceso = ROLES.filter((rol) => puedeAcceder(rol, 'facturacion'));
    expect(conAcceso).toEqual(['CONTABLE']);
  });

  it('todo rol que inicia sesion aterriza en una pantalla que si puede ver', () => {
    for (const rol of ROLES.filter((r) => r !== 'SISTEMA')) {
      const inicial = areaInicial(rol);
      expect(inicial).not.toBeNull();
      if (inicial !== null) expect(puedeAcceder(rol, inicial)).toBe(true);
    }
  });

  it('cada ruta declarada resuelve a su area', () => {
    for (const [area, definicion] of Object.entries(AREAS)) {
      expect(areaDeRuta(definicion.ruta)).toBe(area);
    }
    expect(areaDeRuta('/ruta-que-no-existe')).toBeNull();
  });
});
