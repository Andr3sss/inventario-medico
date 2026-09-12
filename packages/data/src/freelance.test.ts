import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BaseLocal } from './db.js';
import {
  entrarConToken,
  generarTokenFreelance,
  listarTokensFreelance,
  revocarTokenFreelance,
  validarTokenFreelance,
} from './freelance.js';
import { cancelarMaleta, crearMaleta } from './maletas.js';
import { AZAR_FIJO, SESION, baseDePrueba, relojFalso } from './pruebas/entorno.js';

const CONTABLE = { ...SESION, rol: 'CONTABLE' } as const;

let db: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;

beforeEach(async () => {
  db = await baseDePrueba();
  reloj = relojFalso();
});

afterEach(() => {
  db.close();
});

const opciones = () => ({ ahora: reloj.ahora, azar: AZAR_FIJO });

async function maletaAbierta() {
  const r = await crearMaleta(db, { responsableId: 'u-aux-1', procedimiento: null }, SESION, opciones());
  if (!r.ok) throw new Error('setup');
  return r.valor;
}

describe('generarTokenFreelance', () => {
  it('Contable genera un enlace para una maleta abierta', async () => {
    const maleta = await maletaAbierta();
    const r = await generarTokenFreelance(db, maleta.id, CONTABLE, opciones());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.maletaId).toBe(maleta.id);
      expect(r.valor.token).not.toBe(maleta.id); // no se deriva del id visible
    }
  });

  it('rechaza a un rol que no valida freelance', async () => {
    const maleta = await maletaAbierta();
    const r = await generarTokenFreelance(db, maleta.id, SESION, opciones()); // AUXILIAR
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('NO_AUTORIZADO');
  });

  it('rechaza una maleta que no existe', async () => {
    const r = await generarTokenFreelance(db, 'MAL-NO-EXISTE', CONTABLE, opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('MALETA_NO_ENCONTRADA');
  });

  it('rechaza una maleta ya cancelada', async () => {
    const maleta = await maletaAbierta();
    await cancelarMaleta(db, maleta.id, 'error de armado', SESION, opciones());
    const r = await generarTokenFreelance(db, maleta.id, CONTABLE, opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('MALETA_EN_ESTADO_TERMINAL');
  });
});

describe('validarTokenFreelance / entrarConToken', () => {
  it('valida un token vigente y abre sesion FREELANCE con el nombre dado', async () => {
    const maleta = await maletaAbierta();
    const creado = await generarTokenFreelance(db, maleta.id, CONTABLE, opciones());
    if (!creado.ok) throw new Error('setup');

    const valido = await validarTokenFreelance(db, creado.valor.token);
    expect(valido.ok).toBe(true);

    const sesion = await entrarConToken(db, creado.valor.token, 'Dr. Ríos', opciones());
    expect(sesion.ok).toBe(true);
    if (sesion.ok) {
      expect(sesion.valor.rol).toBe('FREELANCE');
      expect(sesion.valor.nombre).toBe('Dr. Ríos');
    }
  });

  it('rechaza un token que no existe', async () => {
    const r = await validarTokenFreelance(db, 'token-inventado');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('TOKEN_INVALIDO');
  });

  it('rechaza un token cuya maleta ya se cerro/cancelo', async () => {
    const maleta = await maletaAbierta();
    const creado = await generarTokenFreelance(db, maleta.id, CONTABLE, opciones());
    if (!creado.ok) throw new Error('setup');

    await cancelarMaleta(db, maleta.id, 'error', SESION, opciones());

    const r = await entrarConToken(db, creado.valor.token, 'Dr. Ríos', opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('MALETA_EN_ESTADO_TERMINAL');
  });

  it('exige un nombre no vacio', async () => {
    const maleta = await maletaAbierta();
    const creado = await generarTokenFreelance(db, maleta.id, CONTABLE, opciones());
    if (!creado.ok) throw new Error('setup');

    const r = await entrarConToken(db, creado.valor.token, '   ', opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('NOMBRE_REQUERIDO');
  });
});

describe('revocarTokenFreelance', () => {
  it('un token revocado ya no permite entrar', async () => {
    const maleta = await maletaAbierta();
    const creado = await generarTokenFreelance(db, maleta.id, CONTABLE, opciones());
    if (!creado.ok) throw new Error('setup');

    const revocado = await revocarTokenFreelance(db, creado.valor.token, CONTABLE);
    expect(revocado.ok).toBe(true);

    const r = await entrarConToken(db, creado.valor.token, 'Dr. Ríos', opciones());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('TOKEN_REVOCADO');
  });

  it('rechaza a quien no puede revocar', async () => {
    const maleta = await maletaAbierta();
    const creado = await generarTokenFreelance(db, maleta.id, CONTABLE, opciones());
    if (!creado.ok) throw new Error('setup');

    const r = await revocarTokenFreelance(db, creado.valor.token, SESION);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('NO_AUTORIZADO');
  });
});

describe('listarTokensFreelance', () => {
  it('lista los enlaces generados para una maleta', async () => {
    const maleta = await maletaAbierta();
    await generarTokenFreelance(db, maleta.id, CONTABLE, opciones());
    reloj.avanzar(10);
    await generarTokenFreelance(db, maleta.id, CONTABLE, opciones());

    const tokens = await listarTokensFreelance(db, maleta.id);
    expect(tokens).toHaveLength(2);
  });
});
