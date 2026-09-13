import { describe, expect, it } from 'vitest';
import {
  evaluarMuestraLector,
  normalizarCodigoLector,
  resumirMuestrasLector,
  serializarMuestrasLectorCsv,
  sufijoDeTecla,
} from './lector-hid.js';

describe('lector HID', () => {
  it('normaliza espacios y mayúsculas sin alterar separadores', () => {
    expect(normalizarCodigoLector('  ins-44/71\n')).toBe('INS-44/71');
  });

  it('acepta Enter y Tab como sufijos configurables', () => {
    expect(sufijoDeTecla('Enter')).toBe('ENTER');
    expect(sufijoDeTecla('Tab')).toBe('TAB');
    expect(sufijoDeTecla('Escape')).toBeNull();
  });

  it('reconoce una lectura exacta en ráfaga', () => {
    expect(
      evaluarMuestraLector({
        esperado: 'INS-4471',
        recibido: 'INS-4471',
        sufijo: 'ENTER',
        instantes: [10, 15, 20, 25, 30, 35, 40, 45],
      }),
    ).toMatchObject({
      recibidoNormalizado: 'INS-4471',
      coincideExacto: true,
      coincideNormalizado: true,
      sufijo: 'ENTER',
      caracteres: 8,
      duracionMs: 35,
      intervaloMaximoMs: 5,
      cadencia: 'RAFAGA_COMPATIBLE',
    });
  });

  it('no oculta diferencias de mayúsculas aunque el flujo las normalice', () => {
    const muestra = evaluarMuestraLector({
      esperado: 'Qr-AbC',
      recibido: 'qr-abc',
      sufijo: 'ENTER',
      instantes: [0, 4, 8, 12, 16, 20],
    });
    expect(muestra.coincideExacto).toBe(false);
    expect(muestra.coincideNormalizado).toBe(true);
  });

  it('no confunde escritura manual con una prueba de hardware', () => {
    const muestra = evaluarMuestraLector({
      esperado: 'INS-4471',
      recibido: 'INS-4471',
      sufijo: 'NINGUNO',
      instantes: [10, 120, 230, 340, 450, 560, 670, 780],
    });
    expect(muestra.coincideExacto).toBe(true);
    expect(muestra.cadencia).toBe('MANUAL_O_DESCONOCIDA');
  });

  it('hace visible una sustitución causada por distribución de teclado', () => {
    const muestra = evaluarMuestraLector({
      esperado: 'LOTE-12/34',
      recibido: 'LOTE-12&34',
      sufijo: 'TAB',
      instantes: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27],
    });
    expect(muestra.coincideExacto).toBe(false);
    expect(muestra.coincideNormalizado).toBe(false);
  });

  it('resume coincidencia, sufijo y cadencia por separado', () => {
    const rapida = evaluarMuestraLector({
      esperado: 'ABC',
      recibido: 'ABC',
      sufijo: 'ENTER',
      instantes: [0, 5, 10],
    });
    const manual = evaluarMuestraLector({
      esperado: 'XYZ',
      recibido: 'XY2',
      sufijo: 'NINGUNO',
      instantes: [0, 100, 200],
    });
    expect(resumirMuestrasLector([rapida, manual])).toEqual({
      total: 2,
      coincidenciasExactas: 1,
      conSufijo: 1,
      rafagasCompatibles: 1,
    });
  });

  it('exporta CSV escapado y neutraliza fórmulas provenientes de un QR', () => {
    const muestra = evaluarMuestraLector({
      esperado: '=CMD()',
      recibido: '=CMD()',
      sufijo: 'ENTER',
      instantes: [],
    });
    const csv = serializarMuestrasLectorCsv([muestra], {
      navegador: 'Browser, versión "1"',
      pantalla: '1280x720',
    });
    expect(csv).toContain('"\'=CMD()"');
    expect(csv).toContain('"Browser, versión ""1"""');
  });
});
