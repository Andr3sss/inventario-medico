import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  BODEGA_CENTRAL,
  codigoPieza,
  dispositivoId,
  usuarioId,
  type CodigoPieza,
  type Rol,
} from '@crearcos/core';
import { BaseLocal } from '../db.js';
import type { Sesion } from '../escaneo.js';
import { cerrarMaleta, emitirFactura } from '../facturacion.js';
import { resolverConflicto } from '../conflictos.js';
import { confirmarSalidaMaleta, crearMaleta, escanearArmado, escanearUso } from '../maletas.js';
import { crearTransporteSupabase } from '../supabase/transporte.js';
import type { ClienteSupabase } from '../supabase/cliente.js';
import type { Database } from '../supabase/database.types.js';
import { sincronizar, type OpcionesSync, type RespuestaSync, type Transporte } from '../sync.js';
import { historialDeMaleta, historialDePieza } from '../trazabilidad.js';

const EJECUTAR = process.env.CREARCOS_E2E_SUPABASE_LOCAL === 'true';
const describir = EJECUTAR ? describe : describe.skip;
const CONTRASENA = 'Crearcos-E2E-local-2026!';
const MAX_PAGINAS = 25;

interface IdentidadPrueba {
  readonly id: string;
  readonly correo: string;
  readonly rol: Exclude<Rol, 'SISTEMA' | 'FREELANCE'>;
}

interface ReplicaPrueba {
  db: BaseLocal;
  readonly cliente: ClienteSupabase;
  readonly transporte: Transporte;
  readonly sesion: Sesion;
  readonly opciones: OpcionesSync;
  readonly reloj: ReturnType<typeof relojControlado>;
}

let servicio: ClienteSupabase;
let url = '';
let claveAnonima = '';
let hospitalId = '';
let admin: IdentidadPrueba;
let auxiliarA: IdentidadPrueba;
let auxiliarB: IdentidadPrueba;
let coordinadora: IdentidadPrueba;
let contable: IdentidadPrueba;
let bases: BaseLocal[] = [];

function relojControlado(inicio: number) {
  let actual = inicio;
  return {
    ahora: () => actual,
    avanzar: (milisegundos = 1_000) => {
      actual += milisegundos;
    },
  };
}

function exigirEntornoLocal(): void {
  url = process.env.SUPABASE_URL ?? '';
  claveAnonima = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
  const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !claveAnonima || !claveServicio) {
    throw new Error('E2E_LOCAL_REQUIERE_SUPABASE_URL_ANON_KEY_Y_SERVICE_ROLE_KEY');
  }
  const destino = new URL(url);
  if (
    destino.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '::1'].includes(destino.hostname) ||
    destino.port !== '54321'
  ) {
    throw new Error('E2E_DESTRUCTIVO_SOLO_PERMITE_SUPABASE_LOCAL_EN_PUERTO_54321');
  }
  servicio = createClient<Database>(url, claveServicio, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function crearIdentidad(
  prefijo: string,
  rol: IdentidadPrueba['rol'],
): Promise<IdentidadPrueba> {
  const idUnico = randomUUID().replaceAll('-', '');
  const correo = `${prefijo}.${idUnico}@crearcos.local`;
  const creada = await servicio.auth.admin.createUser({
    email: correo,
    password: CONTRASENA,
    email_confirm: true,
  });
  if (creada.error || creada.data.user === null) {
    throw new Error(`NO_SE_PUDO_CREAR_${prefijo.toUpperCase()}: ${creada.error?.message ?? ''}`);
  }
  const perfil = await servicio.rpc('provisionar_perfil', {
    p_usuario_id: creada.data.user.id,
    p_nombre: `E2E ${prefijo}`,
    p_rol: rol,
  });
  if (perfil.error) throw new Error(`NO_SE_PUDO_PROVISIONAR_${prefijo}: ${perfil.error.message}`);
  return { id: creada.data.user.id, correo, rol };
}

async function clienteAutenticado(identidad: IdentidadPrueba): Promise<ClienteSupabase> {
  const cliente = createClient<Database>(url, claveAnonima, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const acceso = await cliente.auth.signInWithPassword({
    email: identidad.correo,
    password: CONTRASENA,
  });
  if (acceso.error) throw new Error(`LOGIN_E2E_FALLO: ${acceso.error.message}`);
  return cliente;
}

async function crearReplica(
  nombre: string,
  identidad: IdentidadPrueba,
  inicioReloj: number,
): Promise<ReplicaPrueba> {
  const db = new BaseLocal(`e2e-${nombre}-${randomUUID()}`);
  await db.open();
  bases.push(db);
  const cliente = await clienteAutenticado(identidad);
  const id = dispositivoId(randomUUID());
  const reloj = relojControlado(inicioReloj);
  return {
    db,
    cliente,
    transporte: crearTransporteSupabase(cliente),
    sesion: { usuarioId: usuarioId(identidad.id), rol: identidad.rol, dispositivoId: id },
    opciones: {
      dispositivoId: id,
      ahora: reloj.ahora,
      nombreDispositivo: `E2E ${nombre}`,
      plataforma: 'GitHub Actions',
      versionApp: 'fase-5',
    },
    reloj,
  };
}

async function reiniciarReplica(replica: ReplicaPrueba): Promise<void> {
  const nombre = replica.db.name;
  replica.db.close();
  const reabierta = new BaseLocal(nombre);
  await reabierta.open();
  bases = bases.filter((db) => db.name !== nombre);
  bases.push(reabierta);
  replica.db = reabierta;
}

async function sincronizarCompleto(replica: ReplicaPrueba): Promise<void> {
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const resultado = await sincronizar(replica.db, replica.transporte, replica.opciones);
    expect(resultado.estado).toBe('COMPLETADO');
    expect(resultado.rechazados).toBe(0);
    expect(resultado.erroresProyeccion).toBe(0);
    if (!resultado.hayMas) return;
  }
  throw new Error('PULL_E2E_NO_TERMINO_DENTRO_DEL_LIMITE');
}

function exigirExito(resultado: { readonly ok: boolean }, operacion: string): void {
  if (!resultado.ok) throw new Error(`${operacion}_LOCAL_FALLO`);
}

async function prepararPiezas(etiqueta: string): Promise<{
  readonly codigoConflicto: CodigoPieza;
  readonly codigoApoyo: CodigoPieza;
}> {
  const adminDispositivo = randomUUID();
  const registroDispositivo = await servicio.rpc('registrar_dispositivo', {
    p_actor_id: admin.id,
    p_dispositivo_id: adminDispositivo,
    p_nombre: `E2E maestro ${etiqueta}`,
    p_plataforma: 'CI',
    p_clave_publica: 'solo-pruebas-locales',
    p_valido_hasta: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    p_metadata: { escenario: etiqueta },
  });
  if (registroDispositivo.error) throw new Error(registroDispositivo.error.message);

  const sku = `E2E-${etiqueta}-${randomUUID().slice(0, 8)}`.toUpperCase();
  const producto = await servicio.rpc('crear_producto_central', {
    p_actor_id: admin.id,
    p_producto_id: randomUUID(),
    p_sku: sku,
    p_nombre: `Instrumental E2E ${etiqueta}`,
    p_tipo: 'INSTRUMENTAL',
    p_costo_base_centavos: 12_500,
  });
  if (producto.error) throw new Error(producto.error.message);

  const codigoConflicto = codigoPieza(
    `E2E-${etiqueta}-CONFLICTO-${randomUUID().slice(0, 8)}`.toUpperCase(),
  );
  const codigoApoyo = codigoPieza(
    `E2E-${etiqueta}-APOYO-${randomUUID().slice(0, 8)}`.toUpperCase(),
  );
  for (const codigo of [codigoConflicto, codigoApoyo]) {
    const pieza = await servicio.rpc('registrar_pieza_central', {
      p_actor_id: admin.id,
      p_dispositivo_id: adminDispositivo,
      p_pieza_id: randomUUID(),
      p_codigo: codigo,
      p_sku: sku,
    });
    if (pieza.error) throw new Error(pieza.error.message);
  }
  return { codigoConflicto, codigoApoyo };
}

async function verificarReplicaSana(replica: ReplicaPrueba): Promise<void> {
  expect(await replica.db.outbox.count()).toBe(0);
  expect(await replica.db.operacionesSync.count()).toBe(0);
  expect(await replica.db.fallidos.count()).toBe(0);
  expect(await replica.db.inboxSync.where('aplicado').equals(0).count()).toBe(0);
  expect(await replica.db.inboxSync.filter((fila) => fila.error !== null).count()).toBe(0);
}

describir('sincronizacion E2E multidispositivo con Supabase local', () => {
  beforeAll(async () => {
    exigirEntornoLocal();
    admin = await crearIdentidad('admin', 'ADMINISTRADOR');
    auxiliarA = await crearIdentidad('aux-a', 'AUXILIAR');
    auxiliarB = await crearIdentidad('aux-b', 'AUXILIAR');
    coordinadora = await crearIdentidad('coordinadora', 'COORDINADORA');
    contable = await crearIdentidad('contable', 'CONTABLE');

    const bodegas = await servicio.from('bodegas').select('id').eq('tipo', 'CENTRAL').limit(1);
    if (bodegas.error) throw new Error(bodegas.error.message);
    if ((bodegas.data?.length ?? 0) === 0) {
      const semilla = await servicio.rpc('cargar_datos_demo', { p_actor_id: admin.id });
      if (semilla.error) throw new Error(`SEMILLA_DEMO_FALLO: ${semilla.error.message}`);
    }
    const hospital = await servicio
      .from('hospitales')
      .select('id')
      .eq('codigo', 'HOSP-DEMO-GYE')
      .single();
    if (hospital.error) throw new Error(`HOSPITAL_E2E_AUSENTE: ${hospital.error.message}`);
    hospitalId = hospital.data.id;
  }, 60_000);

  afterEach(async () => {
    const actuales = [...bases];
    bases = [];
    await Promise.all(
      actuales.map(async (db) => {
        db.close();
        await db.delete();
      }),
    );
  });

  it.each([
    ['A', 'B'],
    ['B', 'A'],
  ] as const)(
    'converge cuando reconecta %s antes que %s, incluso tras perder la respuesta',
    async (primero, segundo) => {
      const inicio = Date.now();
      const { codigoConflicto, codigoApoyo } = await prepararPiezas(`${primero}-${segundo}`);
      const replicaA = await crearReplica('A', auxiliarA, inicio);
      const replicaB = await crearReplica('B', auxiliarB, inicio + 10);
      const replicaCoordinadora = await crearReplica('COORDINADORA', coordinadora, inicio + 20);
      const replicaContable = await crearReplica('CONTABLE', contable, inicio + 30);
      const porNombre = { A: replicaA, B: replicaB };
      const ganadora = porNombre[primero];
      const perdedora = porNombre[segundo];

      await Promise.all([
        sincronizarCompleto(replicaA),
        sincronizarCompleto(replicaB),
        sincronizarCompleto(replicaCoordinadora),
        sincronizarCompleto(replicaContable),
      ]);

      const maletaA = await crearMaleta(
        replicaA.db,
        { responsableId: replicaA.sesion.usuarioId, procedimiento: 'Escenario E2E A' },
        replicaA.sesion,
        { ahora: replicaA.reloj.ahora },
      );
      const maletaB = await crearMaleta(
        replicaB.db,
        { responsableId: replicaB.sesion.usuarioId, procedimiento: 'Escenario E2E B' },
        replicaB.sesion,
        { ahora: replicaB.reloj.ahora },
      );
      exigirExito(maletaA, 'CREAR_MALETA_A');
      exigirExito(maletaB, 'CREAR_MALETA_B');
      if (!maletaA.ok || !maletaB.ok) throw new Error('MALETAS_E2E_AUSENTES');
      const maletaGanadora = primero === 'A' ? maletaA.valor : maletaB.valor;

      const armadoA = await escanearArmado(
        replicaA.db,
        codigoConflicto,
        maletaA.valor.id,
        replicaA.sesion,
        { ahora: replicaA.reloj.ahora },
      );
      const armadoB = await escanearArmado(
        replicaB.db,
        codigoConflicto,
        maletaB.valor.id,
        replicaB.sesion,
        { ahora: replicaB.reloj.ahora },
      );
      expect(armadoA.ok && armadoA.valor.codigo).toBe('EXITO');
      expect(armadoB.ok && armadoB.valor.codigo).toBe('EXITO');

      let perderRespuesta = true;
      const captura: { respuesta?: RespuestaSync } = {};
      const transporteBase = ganadora.transporte;
      const transporteInestable: Transporte = {
        enviar: async (lote) => {
          const respuesta = await transporteBase.enviar(lote);
          if (perderRespuesta) {
            perderRespuesta = false;
            throw new Error('RESPUESTA_PERDIDA_DESPUES_DEL_COMMIT');
          }
          captura.respuesta = respuesta;
          return respuesta;
        },
      };
      const primerIntento = await sincronizar(ganadora.db, transporteInestable, ganadora.opciones);
      expect(primerIntento.estado).toBe('SIN_CONEXION');
      await reiniciarReplica(ganadora);
      ganadora.reloj.avanzar(10_000);
      const reintento = await sincronizar(ganadora.db, transporteInestable, ganadora.opciones);
      expect(reintento.estado).toBe('COMPLETADO');
      const operacionesReintentadas = captura.respuesta?.operaciones ?? [];
      expect(operacionesReintentadas.length).toBeGreaterThan(0);
      expect(operacionesReintentadas.every((fila) => fila.idempotente === true)).toBe(true);

      perdedora.reloj.avanzar(11_000);
      const segundoResultado = await sincronizar(
        perdedora.db,
        perdedora.transporte,
        perdedora.opciones,
      );
      expect(segundoResultado.estado).toBe('COMPLETADO');
      expect(segundoResultado.conflictos).toBe(1);
      await Promise.all([sincronizarCompleto(replicaA), sincronizarCompleto(replicaB)]);

      const conflictoA = await replicaA.db.conflictos.where('estado').equals('ABIERTO').first();
      const conflictoB = await replicaB.db.conflictos.where('estado').equals('ABIERTO').first();
      expect(conflictoA?.conflictoId).toBe(conflictoB?.conflictoId);
      expect((await replicaA.db.piezas.get(codigoConflicto))?.estado).toBe('EN_CONFLICTO');
      expect((await replicaB.db.piezas.get(codigoConflicto))?.estado).toBe('EN_CONFLICTO');
      if (conflictoA === undefined) throw new Error('CONFLICTO_E2E_AUSENTE');
      const candidatos = await servicio
        .from('conflicto_candidatos')
        .select('id,maleta_id,evento_id')
        .eq('conflicto_id', conflictoA.conflictoId);
      if (candidatos.error) throw new Error(candidatos.error.message);
      expect(candidatos.data).toHaveLength(2);
      expect(new Set(candidatos.data.map((fila) => fila.maleta_id)).size).toBe(2);

      const armadoApoyo = await escanearArmado(
        ganadora.db,
        codigoApoyo,
        maletaGanadora.id,
        ganadora.sesion,
        { ahora: ganadora.reloj.ahora },
      );
      expect(armadoApoyo.ok && armadoApoyo.valor.codigo).toBe('EXITO');
      await sincronizarCompleto(ganadora);
      ganadora.reloj.avanzar();
      const salida = await confirmarSalidaMaleta(ganadora.db, maletaGanadora.id, ganadora.sesion, {
        ahora: ganadora.reloj.ahora,
      });
      exigirExito(salida, 'CONFIRMAR_SALIDA');
      await sincronizarCompleto(ganadora);

      await sincronizarCompleto(replicaCoordinadora);
      replicaCoordinadora.reloj.avanzar(2_000);
      const resolucion = await resolverConflicto(
        replicaCoordinadora.db,
        conflictoA.conflictoId,
        {
          estadoAdjudicado: 'EN_MALETA_ACTIVA',
          ubicacion: BODEGA_CENTRAL,
          maletaId: maletaGanadora.id,
          motivo: `E2E adjudica la evidencia de ${primero}`,
        },
        replicaCoordinadora.sesion,
        { ahora: replicaCoordinadora.reloj.ahora },
      );
      exigirExito(resolucion, 'RESOLVER_CONFLICTO');
      await sincronizarCompleto(replicaCoordinadora);
      await Promise.all([sincronizarCompleto(replicaA), sincronizarCompleto(replicaB)]);
      expect((await replicaA.db.conflictos.get(conflictoA.conflictoId))?.estado).toBe('RESUELTO');
      expect((await replicaB.db.conflictos.get(conflictoA.conflictoId))?.estado).toBe('RESUELTO');

      ganadora.reloj.avanzar(2_000);
      const uso = await escanearUso(
        ganadora.db,
        codigoConflicto,
        maletaGanadora.id,
        ganadora.sesion,
        { ahora: ganadora.reloj.ahora },
      );
      expect(uso.ok && uso.valor.codigo).toBe('EXITO');
      await sincronizarCompleto(ganadora);
      ganadora.reloj.avanzar();
      const cierre = await cerrarMaleta(
        ganadora.db,
        maletaGanadora.id,
        hospitalId,
        ganadora.sesion,
        { ahora: ganadora.reloj.ahora },
      );
      exigirExito(cierre, 'CERRAR_MALETA');
      if (!cierre.ok || cierre.valor.factura === null) throw new Error('FACTURA_E2E_NO_GENERADA');
      const facturaId = cierre.valor.factura.id;
      await sincronizarCompleto(ganadora);

      await sincronizarCompleto(replicaContable);
      replicaContable.reloj.avanzar(3_000);
      const emision = await emitirFactura(replicaContable.db, facturaId, replicaContable.sesion, {
        ahora: replicaContable.reloj.ahora,
      });
      exigirExito(emision, 'EMITIR_FACTURA');
      await sincronizarCompleto(replicaContable);
      await Promise.all([sincronizarCompleto(replicaA), sincronizarCompleto(replicaB)]);

      expect((await replicaA.db.piezas.get(codigoConflicto))?.estado).toBe('FACTURADA');
      expect((await replicaB.db.piezas.get(codigoConflicto))?.estado).toBe('FACTURADA');
      expect((await replicaA.db.facturas.get(facturaId))?.estado).toBe('EMITIDA');
      expect((await replicaB.db.facturas.get(facturaId))?.estado).toBe('EMITIDA');
      expect(await historialDePieza(replicaA.db, codigoConflicto)).toEqual(
        await historialDePieza(replicaB.db, codigoConflicto),
      );
      expect(await historialDeMaleta(replicaA.db, maletaGanadora.id)).toEqual(
        await historialDeMaleta(replicaB.db, maletaGanadora.id),
      );
      await Promise.all([
        verificarReplicaSana(replicaA),
        verificarReplicaSana(replicaB),
        verificarReplicaSana(replicaCoordinadora),
        verificarReplicaSana(replicaContable),
      ]);
    },
    120_000,
  );
});
