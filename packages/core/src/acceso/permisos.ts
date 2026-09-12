import type { Rol } from '../estados/tipos.js';

/**
 * Areas funcionales de la app. Una area es una pantalla o un grupo de pantallas
 * con una ruta propia, no un permiso fino: el permiso fino sobre cada evento ya
 * vive en ROLES_PERMITIDOS.
 */
export type Area =
  | 'tablero'
  | 'maletas'
  | 'cirugia'
  | 'inventario'
  | 'reprocesamiento'
  | 'conflictos'
  | 'facturacion'
  | 'usuarios'
  | 'hospitales';

export const AREAS: Readonly<Record<Area, { readonly titulo: string; readonly ruta: string }>> = {
  tablero: { titulo: 'Tablero', ruta: '/tablero' },
  maletas: { titulo: 'Maletas', ruta: '/maletas' },
  cirugia: { titulo: 'Cirugia', ruta: '/cirugia' },
  inventario: { titulo: 'Inventario', ruta: '/inventario' },
  reprocesamiento: { titulo: 'Reprocesamiento', ruta: '/reprocesamiento' },
  conflictos: { titulo: 'Conflictos', ruta: '/conflictos' },
  facturacion: { titulo: 'Facturacion', ruta: '/facturacion' },
  usuarios: { titulo: 'Usuarios', ruta: '/usuarios' },
  // Administra hospitales/nivel de precio por defecto (brief §7). Vive junto a
  // Usuarios porque las dos son pantallas de autoservicio del Administrador
  // sobre datos maestros, no operativas del dia a dia (decisiones.md, punto
  // antes abierto "donde vive en la navegacion la administracion de hospitales").
  hospitales: { titulo: 'Hospitales', ruta: '/hospitales' },
};

/**
 * Que ve cada rol, en el orden en que le importa.
 *
 * El primer elemento es la pantalla de aterrizaje: el auxiliar entra directo a
 * maletas porque es donde pasa el ochenta por ciento de su turno, y el freelance
 * entra a cirugia porque no tiene nada mas que hacer en la app.
 *
 * SISTEMA no aparece. No es una persona y no inicia sesion.
 */
const MAPA: Readonly<Record<Rol, readonly Area[]>> = {
  SISTEMA: [],
  ADMINISTRADOR: ['usuarios', 'inventario', 'hospitales', 'tablero'],
  AUXILIAR: ['maletas', 'cirugia', 'inventario'],
  COORDINADORA: ['conflictos', 'reprocesamiento', 'maletas', 'inventario', 'tablero'],
  CONTABLE: ['facturacion', 'tablero'],
  SUPERVISOR: ['tablero'],
  FREELANCE: ['cirugia'],
};

export function areasDe(rol: Rol): readonly Area[] {
  return MAPA[rol];
}

export function puedeAcceder(rol: Rol, area: Area): boolean {
  return MAPA[rol].includes(area);
}

/** Pantalla a la que se manda al usuario despues de entrar. */
export function areaInicial(rol: Rol): Area | null {
  return MAPA[rol][0] ?? null;
}

export function areaDeRuta(ruta: string): Area | null {
  const entrada = Object.entries(AREAS).find(([, valor]) => valor.ruta === ruta);
  return entrada === undefined ? null : (entrada[0] as Area);
}
