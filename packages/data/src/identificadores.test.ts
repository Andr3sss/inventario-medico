import { describe, expect, it } from 'vitest';
import { codigoCortoDesde, uuidV7 } from './identificadores.js';
import type { FuenteAzar } from './identificadores.js';

/**
 * LCG deliberadamente simple, igual en espiritu a AZAR_FIJO de
 * pruebas/entorno.ts. Se usa aqui a proposito: un generador criptografico
 * real no habria mostrado el problema que este archivo prueba.
 */
function azarDebil(): FuenteAzar {
  let paso = 0;
  return {
    enteroAleatorio: (maximo: number) => {
      paso = (paso * 1103515245 + 12345) >>> 0;
      return paso % maximo;
    },
  };
}

describe('codigoCortoDesde', () => {
  it('no colisiona para dos uuids generados a un segundo de distancia', () => {
    // Bug real (1a version): tomar los primeros 8 caracteres del uuid captura
    // solo el timestamp de grano grueso, que no cambia en una ventana de
    // segundos.
    const azar = azarDebil();
    const a = uuidV7(1_700_000_000_000, azar);
    const b = uuidV7(1_700_000_001_000, azar);
    expect(codigoCortoDesde(a)).not.toBe(codigoCortoDesde(b));
  });

  it('no colisiona en una racha larga con una fuente de azar debil', () => {
    // Bug real (2a version): tomar los ultimos 8 caracteres (la cola
    // aleatoria) tampoco alcanza con un LCG, porque sus bits bajos estan
    // correlacionados entre llamadas consecutivas. Se reprodujo escribiendo
    // maletas.test.ts: crear dos maletas seguidas colisionaba despues de que
    // otras pruebas ya habian consumido varios cientos de valores del mismo
    // generador. 2000 creaciones seguidas es un margen amplio sobre eso.
    const azar = azarDebil();
    let milis = 1_700_000_000_000;
    const codigos = new Set<string>();
    for (let i = 0; i < 2_000; i += 1) {
      milis += 137; // paso irregular, no multiplo redondo
      codigos.add(codigoCortoDesde(uuidV7(milis, azar)));
    }
    expect(codigos.size).toBe(2_000);
  });

  it('quita los guiones y devuelve 8 caracteres en mayuscula', () => {
    const azar = azarDebil();
    const codigo = codigoCortoDesde(uuidV7(1_700_000_000_000, azar));
    expect(codigo).toMatch(/^[0-9A-F]{8}$/);
  });
});
