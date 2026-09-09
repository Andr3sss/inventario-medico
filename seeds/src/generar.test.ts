import { describe, expect, it } from 'vitest';
import { generarSemilla, verificarSemilla } from './generar.js';

describe('conjunto semilla', () => {
  it('es reproducible con la misma semilla', () => {
    expect(generarSemilla(42)).toEqual(generarSemilla(42));
  });

  it('cambia con una semilla distinta', () => {
    expect(generarSemilla(42)).not.toEqual(generarSemilla(43));
  });

  it('cumple todas sus invariantes', () => {
    expect(verificarSemilla(generarSemilla())).toEqual([]);
  });

  it('incluye kits con sus componentes hijos enlazados', () => {
    const conjunto = generarSemilla();
    const kits = conjunto.piezas.filter((p) => p.tipo === 'KIT');
    expect(kits.length).toBeGreaterThan(0);

    for (const kit of kits) {
      const hijos = conjunto.piezas.filter((p) => p.parentCodigo === kit.codigo);
      expect(hijos.length).toBeGreaterThan(0);
      for (const hijo of hijos) {
        expect(hijo.estado).toBe(kit.estado);
      }
    }
  });

  it('genera al menos 180 piezas para que las pruebas de volumen sean realistas', () => {
    expect(generarSemilla().piezas.length).toBeGreaterThanOrEqual(180);
  });
});
