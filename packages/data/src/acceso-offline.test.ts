import { dispositivoId, usuarioId } from '@crearcos/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BLOQUEO_PIN_MS,
  INTENTOS_PIN_MAXIMOS,
  VIGENCIA_ACCESO_OFFLINE_MS,
  confirmarPinAdministrador,
  configurarAccesoOffline,
  consolidarRevalidacionCentral,
  iniciarSesionOffline,
  listarAuditoriaAcceso,
  renovarAccesoOffline,
  revocarAccesoOffline,
} from './acceso-offline.js';
import { sesionActual, type SesionActiva } from './autenticacion.js';
import type { BaseLocal } from './db.js';
import { baseDePrueba, relojFalso } from './pruebas/entorno.js';

const USUARIO_ID = usuarioId('u-central-1');
const DISPOSITIVO_ID = dispositivoId('018bcfe5-6800-7000-8000-000000000001');
const CORREO = 'auxiliar@crearcos.test';
const PIN = '48273916';

let db: BaseLocal;
let reloj: ReturnType<typeof relojFalso>;
let sesionCentral: SesionActiva;

const opciones = () => ({ ahora: reloj.ahora, iteraciones: 1_000 });

beforeEach(async () => {
  db = await baseDePrueba();
  reloj = relojFalso();
  await db.meta.put({ clave: 'dispositivo-id', valor: DISPOSITIVO_ID });
  await db.perfilesCentrales.put({
    usuarioId: USUARIO_ID,
    nombre: 'Marcia Loor',
    rol: 'AUXILIAR',
    activo: true,
    validoHasta: reloj.ahora() + VIGENCIA_ACCESO_OFFLINE_MS,
  });
  sesionCentral = {
    usuarioId: USUARIO_ID,
    nombre: 'Marcia Loor',
    rol: 'AUXILIAR',
    dispositivoId: DISPOSITIVO_ID,
    expiraEn: reloj.ahora() + 12 * 60 * 60 * 1_000,
    origen: 'CENTRAL',
    identificador: CORREO,
  };
});

afterEach(() => {
  db.close();
});

describe('enrolamiento del acceso offline', () => {
  it.each(['12345678', '34567890', '99999999', '1234', 'abcdefgh'])(
    'rechaza el PIN debil %s',
    async (pin) => {
      const resultado = await configurarAccesoOffline(db, sesionCentral, pin, opciones());
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) expect(resultado.error.codigo).toBe('PIN_DEBIL');
    },
  );

  it('solo guarda un derivado ligado al usuario y dispositivo', async () => {
    const resultado = await configurarAccesoOffline(db, sesionCentral, PIN, opciones());
    expect(resultado.ok).toBe(true);

    const fila = await db.credencialesOffline.get(USUARIO_ID);
    expect(fila).toMatchObject({
      identificador: CORREO,
      dispositivoId: DISPOSITIVO_ID,
      iteraciones: 1_000,
      validaHasta: reloj.ahora() + VIGENCIA_ACCESO_OFFLINE_MS,
    });
    expect(JSON.stringify(fila)).not.toContain(PIN);
    expect(fila?.hash).not.toBe(PIN);
  });

  it('no permite que una sesion local cree una credencial offline', async () => {
    const resultado = await configurarAccesoOffline(
      db,
      { ...sesionCentral, origen: 'LOCAL' },
      PIN,
      opciones(),
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe('ACCESO_OFFLINE_NO_CONFIGURADO');
  });

  it('no permite enrolar con una sesion central vencida', async () => {
    const resultado = await configurarAccesoOffline(
      db,
      { ...sesionCentral, expiraEn: reloj.ahora() },
      PIN,
      opciones(),
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe('ACCESO_OFFLINE_NO_CONFIGURADO');
  });
});

describe('desbloqueo offline', () => {
  beforeEach(async () => {
    await configurarAccesoOffline(db, sesionCentral, PIN, opciones());
  });

  it('abre una sesion acotada aun cuando la sesion central original ya vencio', async () => {
    reloj.avanzar(13 * 60 * 60 * 1_000);
    const resultado = await iniciarSesionOffline(db, CORREO.toUpperCase(), PIN, opciones());

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor.origen).toBe('OFFLINE');
      expect(resultado.valor.expiraEn).toBe(reloj.ahora() + 12 * 60 * 60 * 1_000);
    }
  });

  it('bloquea tras cinco intentos y libera solo al terminar la espera', async () => {
    for (let intento = 0; intento < INTENTOS_PIN_MAXIMOS; intento += 1) {
      const rechazado = await iniciarSesionOffline(db, CORREO, '61582749', opciones());
      expect(rechazado.ok).toBe(false);
    }

    const bloqueado = await iniciarSesionOffline(db, CORREO, PIN, opciones());
    expect(bloqueado.ok).toBe(false);
    if (!bloqueado.ok) {
      expect(bloqueado.error.codigo).toBe('USUARIO_BLOQUEADO');
      expect(bloqueado.error.esperaMs).toBe(BLOQUEO_PIN_MS);
    }

    reloj.avanzar(BLOQUEO_PIN_MS + 1);
    expect((await iniciarSesionOffline(db, CORREO, PIN, opciones())).ok).toBe(true);
  });

  it('rechaza la credencial al cumplirse siete dias y audita la expiracion', async () => {
    reloj.avanzar(VIGENCIA_ACCESO_OFFLINE_MS);
    const resultado = await iniciarSesionOffline(db, CORREO, PIN, opciones());

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe('CREDENCIAL_OFFLINE_EXPIRADA');
    expect((await listarAuditoriaAcceso(db, USUARIO_ID))[0]?.accion).toBe('EXPIRACION_OFFLINE');
  });

  it('no acepta una credencial copiada a otro dispositivo', async () => {
    await db.meta.put({
      clave: 'dispositivo-id',
      valor: '018bcfe5-6800-7000-8000-000000000099',
    });
    const resultado = await iniciarSesionOffline(db, CORREO, PIN, opciones());

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe('ACCESO_OFFLINE_NO_CONFIGURADO');
  });

  it('invalida una sesion ya abierta cuando llega una revocacion', async () => {
    expect((await iniciarSesionOffline(db, CORREO, PIN, opciones())).ok).toBe(true);
    await revocarAccesoOffline(db, USUARIO_ID, reloj.ahora(), 'PERFIL_INACTIVO');

    const resultado = await sesionActual(db, opciones());
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe('CREDENCIAL_OFFLINE_REVOCADA');
    expect(await db.meta.get('sesion-activa')).toBeUndefined();
  });

  it('revoca al detectar que el perfil sincronizado quedo inactivo', async () => {
    await db.perfilesCentrales.update(USUARIO_ID, { activo: false });
    const resultado = await iniciarSesionOffline(db, CORREO, PIN, opciones());

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe('CREDENCIAL_OFFLINE_REVOCADA');
    expect((await db.credencialesOffline.get(USUARIO_ID))?.motivoRevocacion).toBe(
      'PERFIL_CENTRAL_NO_AUTORIZADO',
    );
  });
});

describe('confirmación administrativa por PIN', () => {
  let sesionAdmin: SesionActiva;

  beforeEach(async () => {
    sesionAdmin = { ...sesionCentral, rol: 'ADMINISTRADOR', nombre: 'Administradora' };
    await db.perfilesCentrales.update(USUARIO_ID, {
      rol: 'ADMINISTRADOR',
      nombre: 'Administradora',
    });
    await configurarAccesoOffline(db, sesionAdmin, PIN, opciones());
  });

  it('confirma el PIN sin reemplazar la sesión guardada', async () => {
    await db.meta.put({ clave: 'sesion-activa', valor: sesionAdmin });

    await expect(confirmarPinAdministrador(db, sesionAdmin, PIN, opciones())).resolves.toEqual({
      ok: true,
      valor: true,
    });
    await expect(db.meta.get('sesion-activa')).resolves.toMatchObject({
      valor: {
        usuarioId: USUARIO_ID,
        origen: 'CENTRAL',
      },
    });
    expect((await listarAuditoriaAcceso(db, USUARIO_ID)).map((fila) => fila.accion)).toContain(
      'CONFIRMACION_ADMIN',
    );
  });

  it('rechaza un PIN incorrecto y no acepta roles no administrativos', async () => {
    const incorrecto = await confirmarPinAdministrador(
      db,
      sesionAdmin,
      '61582749',
      opciones(),
    );
    expect(incorrecto.ok).toBe(false);
    if (!incorrecto.ok) expect(incorrecto.error.codigo).toBe('PIN_INVALIDO');

    const auxiliar = await confirmarPinAdministrador(db, sesionCentral, PIN, opciones());
    expect(auxiliar.ok).toBe(false);
    if (!auxiliar.ok) expect(auxiliar.error.codigo).toBe('SIN_SESION');
  });
});

describe('revalidacion central', () => {
  beforeEach(async () => {
    await configurarAccesoOffline(db, sesionCentral, PIN, opciones());
  });

  it('renueva siete dias solo para la misma identidad, perfil y dispositivo', async () => {
    reloj.avanzar(2 * 24 * 60 * 60 * 1_000);
    const reautenticada = {
      ...sesionCentral,
      expiraEn: reloj.ahora() + 12 * 60 * 60 * 1_000,
    };
    expect(await renovarAccesoOffline(db, reautenticada, reloj.ahora(), true)).toBe(true);
    expect((await db.credencialesOffline.get(USUARIO_ID))?.validaHasta).toBe(
      reloj.ahora() + VIGENCIA_ACCESO_OFFLINE_MS,
    );

    const otroDispositivo = {
      ...reautenticada,
      dispositivoId: dispositivoId('018bcfe5-6800-7000-8000-000000000099'),
    };
    expect(await renovarAccesoOffline(db, otroDispositivo, reloj.ahora())).toBe(false);
  });

  it('no renueva desde una sesion offline ni desde una sesion central vencida', async () => {
    expect(
      await renovarAccesoOffline(db, { ...sesionCentral, origen: 'OFFLINE' }, reloj.ahora()),
    ).toBe(false);
    expect(
      await renovarAccesoOffline(db, { ...sesionCentral, expiraEn: reloj.ahora() }, reloj.ahora()),
    ).toBe(false);
  });

  it('convierte la sesion offline a central y conserva una auditoria explicita', async () => {
    const acceso = await iniciarSesionOffline(db, CORREO, PIN, opciones());
    expect(acceso.ok).toBe(true);
    if (!acceso.ok) return;

    reloj.avanzar(60_000);
    const consolidada = await consolidarRevalidacionCentral(
      db,
      acceso.valor,
      { usuarioId: USUARIO_ID, nombre: 'Marcia Actualizada', rol: 'AUXILIAR' },
      reloj.ahora(),
    );

    expect(consolidada).toMatchObject({ origen: 'CENTRAL', nombre: 'Marcia Actualizada' });
    expect((await listarAuditoriaAcceso(db, USUARIO_ID))[0]?.accion).toBe('REVALIDACION_CENTRAL');
  });
});
