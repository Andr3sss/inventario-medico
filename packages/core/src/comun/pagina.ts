/**
 * Forma unica de respuesta paginada. Toda lista que pueda crecer sin limite
 * (piezas, maletas, facturas) la devuelve asi, para que Codex escriba un solo
 * componente de paginacion y lo reutilice en cualquier pantalla.
 */
export interface Pagina<T> {
  readonly items: readonly T[];
  readonly total: number;
  /** 1-indexado. */
  readonly pagina: number;
  readonly porPagina: number;
}

export interface OpcionesPagina {
  readonly pagina?: number;
  readonly porPagina?: number;
}

export const POR_PAGINA_DEFECTO = 25;
export const POR_PAGINA_MAXIMO = 200;

export function normalizarPagina(opciones: OpcionesPagina = {}): { pagina: number; porPagina: number } {
  const pagina = Math.max(1, Math.floor(opciones.pagina ?? 1));
  const porPagina = Math.min(
    POR_PAGINA_MAXIMO,
    Math.max(1, Math.floor(opciones.porPagina ?? POR_PAGINA_DEFECTO)),
  );
  return { pagina, porPagina };
}

export function paginar<T>(items: readonly T[], total: number, opciones: OpcionesPagina = {}): Pagina<T> {
  const { pagina, porPagina } = normalizarPagina(opciones);
  return { items, total, pagina, porPagina };
}
