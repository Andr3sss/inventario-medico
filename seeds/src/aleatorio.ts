/**
 * Generador pseudoaleatorio con semilla fija (mulberry32).
 *
 * Math.random() haria que cada desarrollador probara contra un inventario
 * distinto y que un error no se pudiera reproducir. Con semilla fija, todo el
 * equipo trabaja sobre exactamente las mismas 200 piezas.
 */
export function crearAleatorio(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function elegir<T>(azar: () => number, opciones: readonly T[]): T {
  if (opciones.length === 0) throw new Error('No hay opciones para elegir');
  const indice = Math.floor(azar() * opciones.length);
  const valor = opciones[Math.min(indice, opciones.length - 1)];
  if (valor === undefined) throw new Error('Indice fuera de rango');
  return valor;
}

export function enteroEntre(azar: () => number, minimo: number, maximo: number): number {
  return minimo + Math.floor(azar() * (maximo - minimo + 1));
}
