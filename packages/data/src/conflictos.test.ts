import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BODEGA_CENTRAL } from '@crearcos/core';
import type { BaseLocal } from './db.js';
import { listarConflictos, obtenerConflicto, resolverConflicto } from './conflictos.js';
import { AZAR_FIJO, SESION, baseDePrueba, piezaDe, relojFalso } from './pruebas/entorno.js';

const COORDINADORA = { ...SESION, rol: 'COORDINADORA' } as const;

let db: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;

beforeEach(async () => {
  db = await baseDePrueba();
  reloj = relojFalso();
  await db.piezas.put(piezaDe({ estado: 'EN_CONFLICTO' }));
  await db.conflictos.put({
    conflictoId: 'CFL-1',
    codigo: 'INS-4471',
    detectadoEn: reloj.ahora(),
    detalle: { maletaA: 'MAL-1', maletaB: 'MAL-2' },
    estado: 'ABIERTO',
  });
});

afterEach(() => {
  db.close();
});

const opciones = () => ({ ahora: reloj.ahora, azar: AZAR_FIJO });

describe('listarConflictos y obtenerConflicto', () => {
  it('trae el conflicto con la pieza asociada', async () => {
    const abiertos = await listarConflictos(db, { estado: 'ABIERTO' });
    expect(abiertos).toHaveLength(1);
    expect(abiertos[0]?.pieza?.codigo).toBe('INS-4471');

    const uno = await obtenerConflicto(db, 'CFL-1');
    expect(uno?.conflicto.conflictoId).toBe('CFL-1');
  });
});

describe('resolverConflicto', () => {
  it('libera la pieza al estado adjudicado y marca el conflicto RESUELTO', async () => {
    const r = await resolverConflicto(
      db,
      'CFL-1',
      { estadoAdjudicado: 'EN_BODEGA_CENTRAL', ubicacion: BODEGA_CENTRAL, maletaId: null, motivo: 'Etiqueta fisica duplicada' },
      COORDINADORA,
      opciones(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.estado).toBe('EN_BODEGA_CENTRAL');

    const conflicto = await db.conflictos.get('CFL-1');
    expect(conflicto?.estado).toBe('RESUELTO');

    const listaAbiertos = await listarConflictos(db, { estado: 'ABIERTO' });
    expect(listaAbiertos).toHaveLength(0);
  });

  it('rechaza resolver un conflicto que no existe', async () => {
    const r = await resolverConflicto(
      db,
      'CFL-FANTASMA',
      { estadoAdjudicado: 'EN_BODEGA_CENTRAL', ubicacion: BODEGA_CENTRAL, maletaId: null, motivo: 'x' },
      COORDINADORA,
      opciones(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('CONFLICTO_NO_ENCONTRADO');
  });

  it('rechaza resolver dos veces el mismo conflicto', async () => {
    await resolverConflicto(
      db,
      'CFL-1',
      { estadoAdjudicado: 'EN_BODEGA_CENTRAL', ubicacion: BODEGA_CENTRAL, maletaId: null, motivo: 'x' },
      COORDINADORA,
      opciones(),
    );
    reloj.avanzar(200);
    const r = await resolverConflicto(
      db,
      'CFL-1',
      { estadoAdjudicado: 'EN_BODEGA_CENTRAL', ubicacion: BODEGA_CENTRAL, maletaId: null, motivo: 'x' },
      COORDINADORA,
      opciones(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('CONFLICTO_YA_RESUELTO');
  });

  it('un rol no autorizado no puede resolver conflictos', async () => {
    const r = await resolverConflicto(
      db,
      'CFL-1',
      { estadoAdjudicado: 'EN_BODEGA_CENTRAL', ubicacion: BODEGA_CENTRAL, maletaId: null, motivo: 'x' },
      SESION, // AUXILIAR
      opciones(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('TRANSICION_RECHAZADA');
  });
});
