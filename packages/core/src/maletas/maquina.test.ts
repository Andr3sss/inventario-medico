import { describe, expect, it } from 'vitest';
import { aplicarEventoMaleta } from './maquina.js';
import { eventoMaletaDe, maletaDe } from '../pruebas/fabricas.js';
import { hospitalId, maletaId } from '../comun/marcas.js';

const HOSPITAL = hospitalId('HOSP-1');

const exigirOk = <T>(r: { ok: true; valor: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`Se esperaba ok: ${JSON.stringify(r.error)}`);
  return r.valor;
};

describe('camino feliz de la maleta', () => {
  it('recorre armado, salida y cierre con hospital asignado', () => {
    const armada = maletaDe();

    const enCirugia = exigirOk(
      aplicarEventoMaleta(armada, eventoMaletaDe({ tipo: 'MALETA_SALIO', maletaId: armada.id }, 'AUXILIAR')),
    );
    expect(enCirugia.estado).toBe('EN_CIRUGIA');
    expect(enCirugia.salioEn).not.toBeNull();
    expect(enCirugia.hospitalId).toBeNull();

    const cerrada = exigirOk(
      aplicarEventoMaleta(
        enCirugia,
        eventoMaletaDe({ tipo: 'MALETA_CERRADA', maletaId: armada.id, hospitalId: HOSPITAL }, 'COORDINADORA'),
      ),
    );
    expect(cerrada.estado).toBe('CERRADA');
    expect(cerrada.hospitalId).toBe(HOSPITAL);
    expect(cerrada.version).toBe(armada.version + 2);
  });

  it('se puede cancelar una maleta que todavia no salio de bodega', () => {
    const armada = maletaDe();
    const cancelada = exigirOk(
      aplicarEventoMaleta(
        armada,
        eventoMaletaDe({ tipo: 'MALETA_CANCELADA', maletaId: armada.id, motivo: 'Armada por error' }, 'AUXILIAR'),
      ),
    );
    expect(cancelada.estado).toBe('CANCELADA');
  });
});

describe('guardas', () => {
  it('rechaza cerrar una maleta que todavia no salio', () => {
    const armada = maletaDe();
    const r = aplicarEventoMaleta(
      armada,
      eventoMaletaDe({ tipo: 'MALETA_CERRADA', maletaId: armada.id, hospitalId: HOSPITAL }, 'COORDINADORA'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('TRANSICION_ILEGAL');
  });

  it('rechaza cancelar una maleta que ya salio de bodega', () => {
    const enCirugia = maletaDe({ estado: 'EN_CIRUGIA' });
    const r = aplicarEventoMaleta(
      enCirugia,
      eventoMaletaDe({ tipo: 'MALETA_CANCELADA', maletaId: enCirugia.id, motivo: 'x' }, 'AUXILIAR'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('TRANSICION_ILEGAL');
  });

  it('rechaza un evento cuyo maletaId no coincide', () => {
    const armada = maletaDe();
    const r = aplicarEventoMaleta(
      armada,
      eventoMaletaDe({ tipo: 'MALETA_SALIO', maletaId: maletaId('OTRA') }, 'AUXILIAR'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('MALETA_NO_COINCIDE');
  });

  it('rechaza un rol no autorizado', () => {
    const armada = maletaDe();
    const r = aplicarEventoMaleta(
      armada,
      eventoMaletaDe({ tipo: 'MALETA_SALIO', maletaId: armada.id }, 'SUPERVISOR'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('ROL_NO_AUTORIZADO');
  });

  it('una maleta cerrada no admite mas eventos', () => {
    const cerrada = maletaDe({ estado: 'CERRADA' });
    const r = aplicarEventoMaleta(
      cerrada,
      eventoMaletaDe({ tipo: 'MALETA_SALIO', maletaId: cerrada.id }, 'AUXILIAR'),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('MALETA_EN_ESTADO_TERMINAL');
  });
});
