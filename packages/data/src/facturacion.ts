import {
  aplicarEventoMaleta,
  armarBorrador,
  centavos,
  emitirFactura as emitirFacturaPura,
  eventoId as crearEventoId,
  facturaId as crearFacturaId,
  hospitalId as crearHospitalId,
  maletaId as crearMaletaId,
  ok,
  fallo,
  resolverPrecio,
  serializar,
  type ExcepcionPrecio,
  type Factura,
  type LineaFactura,
  type Maleta,
  type Resultado,
} from '@crearcos/core';
import type { BaseLocal, EventoSincronizable } from './db.js';
import { escribirEventoPieza, type Sesion } from './escaneo.js';
import { avanzarReloj } from './reloj.js';
import { AZAR_CRIPTOGRAFICO, uuidV7, type FuenteAzar } from './identificadores.js';
import { encolarOperacion } from './operaciones.js';

export interface OpcionesFacturacion {
  readonly ahora: () => number;
  readonly azar?: FuenteAzar;
}

export type CodigoErrorFacturacion =
  | 'MALETA_NO_ENCONTRADA'
  | 'ESTADO_INVALIDO'
  | 'HOSPITAL_NO_ENCONTRADO'
  | 'COSTO_NO_DEFINIDO'
  | 'FACTURA_NO_ENCONTRADA'
  | 'LINEA_BLOQUEADA_POR_APROBACION'
  | 'TRANSICION_RECHAZADA';

export interface ErrorFacturacion {
  readonly codigo: CodigoErrorFacturacion;
  readonly mensaje: string;
  /** Solo con LINEA_BLOQUEADA_POR_APROBACION: codigos de pieza bloqueados. */
  readonly codigosBloqueados?: readonly string[] | undefined;
}

const errorFact = (
  codigo: CodigoErrorFacturacion,
  mensaje: string,
  codigosBloqueados?: readonly string[],
): ErrorFacturacion => ({
  codigo,
  mensaje,
  codigosBloqueados,
});

/**
 * Ciudad sede de la empresa, para el piso de provincia del motor de precios.
 * Punto abierto: el brief no fija el valor. Se guarda en `meta` con un
 * default explicito en vez de asumirlo en silencio, y el Administrador puede
 * cambiarlo con `definirCiudadBase`.
 */
const CLAVE_CIUDAD_BASE = 'ciudad-base';
const CIUDAD_BASE_DEFECTO = 'Guayaquil';

export async function leerCiudadBase(db: BaseLocal): Promise<string> {
  const fila = await db.meta.get(CLAVE_CIUDAD_BASE);
  return typeof fila?.valor === 'string' ? fila.valor : CIUDAD_BASE_DEFECTO;
}

export async function definirCiudadBase(db: BaseLocal, ciudad: string): Promise<void> {
  await db.meta.put({ clave: CLAVE_CIUDAD_BASE, valor: ciudad });
}

async function excepcionVigenteParaSku(
  db: BaseLocal,
  skuTexto: string,
  hospitalIdTexto: string,
  ahora: Date,
): Promise<ExcepcionPrecio | null> {
  const filas = await db.excepcionesPrecio
    .where('[sku+hospitalId]')
    .equals([skuTexto, hospitalIdTexto])
    .toArray();
  // Una fila rechazada o vencida no debe ocultar una aprobada mas antigua que
  // aun este vigente. El motor vuelve a validar la seleccion como defensa.
  const instante = ahora.getTime();
  const ordenadas = filas
    .filter((fila) => {
      if (fila.estado === 'RECHAZADO') return false;
      const desde = Date.parse(fila.vigenteDesde);
      const hasta =
        fila.vigenteHasta === null ? Number.POSITIVE_INFINITY : Date.parse(fila.vigenteHasta);
      return !Number.isNaN(desde) && !Number.isNaN(hasta) && desde <= instante && instante <= hasta;
    })
    .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde));
  return ordenadas[0] ?? null;
}

export interface ResumenCierreMaleta {
  readonly maleta: Maleta;
  readonly factura: Factura | null;
  readonly piezasReprocesadas: number;
}

/**
 * Cierra la maleta al regreso de cirugia: punto 8.3-8.4 del brief en una sola
 * transaccion.
 *
 *  1. Lo no usado (EN_MALETA_ACTIVA) pasa a EN_REPROCESAMIENTO.
 *  2. La maleta se cierra y recien aqui se le asigna el hospital.
 *  3. Se genera el borrador de factura con el precio ya resuelto por linea
 *     (motor de precios de `core`, nunca en el frontend).
 *
 * Si nada se uso, cierra igual y `factura` viene null: es un caso valido, no
 * un error (una maleta puede volver intacta).
 */
export async function cerrarMaleta(
  db: BaseLocal,
  maletaIdTexto: string,
  hospitalIdTexto: string,
  sesion: Sesion,
  opciones: OpcionesFacturacion,
): Promise<Resultado<ResumenCierreMaleta, ErrorFacturacion>> {
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const relojPared = opciones.ahora();
  const idHospital = crearHospitalId(hospitalIdTexto);
  const idMaleta = crearMaletaId(maletaIdTexto);
  const operacionId = uuidV7(relojPared, azar);
  const idFactura = crearFacturaId(uuidV7(relojPared, azar));

  return db.transaction(
    'rw',
    [
      db.maletas,
      db.eventosMaleta,
      db.piezas,
      db.eventos,
      db.outbox,
      db.operacionesSync,
      db.meta,
      db.hospitales,
      db.catalogo,
      db.excepcionesPrecio,
      db.facturas,
    ],
    async () => {
      const maleta = await db.maletas.get(idMaleta);
      if (maleta === undefined)
        return fallo(errorFact('MALETA_NO_ENCONTRADA', `La maleta ${maletaIdTexto} no existe`));
      if (maleta.estado !== 'EN_CIRUGIA') {
        return fallo(
          errorFact('ESTADO_INVALIDO', `La maleta esta ${maleta.estado}, no se puede cerrar`),
        );
      }

      const hospital = await db.hospitales.get(idHospital);
      if (hospital === undefined) {
        return fallo(
          errorFact('HOSPITAL_NO_ENCONTRADO', `El hospital ${hospitalIdTexto} no existe`),
        );
      }

      const piezasDeLaMaleta = await db.piezas.where('maletaId').equals(idMaleta).toArray();
      const sinUsar = piezasDeLaMaleta.filter((p) => p.estado === 'EN_MALETA_ACTIVA');
      const usadas = piezasDeLaMaleta.filter((p) => p.estado === 'USADA_PENDIENTE_VALORACION');

      const eventosPieza: EventoSincronizable[] = [];
      for (const pieza of sinUsar) {
        const r = await escribirEventoPieza(
          db,
          pieza,
          { tipo: 'CIERRE_MALETA_SIN_USO', codigo: pieza.codigo, maletaId: maleta.id },
          sesion,
          relojPared,
          { ...opciones, operacionId, encolarOperacion: false },
        );
        if (!r.ok) return fallo(errorFact('TRANSICION_RECHAZADA', r.error.mensaje));
        eventosPieza.push(r.valor.evento);
      }

      const ciudadBase = await leerCiudadBase(db);
      const lineas: LineaFactura[] = [];
      for (const pieza of usadas) {
        const producto = await db.catalogo.get(pieza.sku);
        if (producto === undefined) {
          return fallo(
            errorFact(
              'COSTO_NO_DEFINIDO',
              `La pieza ${pieza.codigo} tiene un sku sin catalogo: ${pieza.sku}`,
            ),
          );
        }
        const excepcion = await excepcionVigenteParaSku(
          db,
          pieza.sku,
          hospitalIdTexto,
          new Date(relojPared),
        );
        const precio = resolverPrecio({
          sku: pieza.sku,
          costoBase: centavos(producto.costoBase),
          hospital,
          ciudadBase,
          excepcion,
          ahora: new Date(relojPared),
        });
        if (!precio.ok) {
          return fallo(errorFact('COSTO_NO_DEFINIDO', precio.error.mensaje));
        }
        lineas.push({
          codigoPieza: pieza.codigo,
          sku: pieza.sku,
          nombre: producto.nombre,
          precio: precio.valor,
        });
      }

      const borrador =
        lineas.length === 0
          ? null
          : armarBorrador(
              idFactura,
              maleta.id,
              idHospital,
              lineas,
              new Date(relojPared).toISOString(),
            );
      if (borrador !== null && !borrador.ok) {
        return fallo(errorFact('COSTO_NO_DEFINIDO', borrador.error.mensaje));
      }

      // Maleta se cierra siempre, aunque no haya nada que facturar.
      const cuerpoEvento =
        borrador === null
          ? { tipo: 'MALETA_CERRADA' as const, maletaId: maleta.id, hospitalId: idHospital }
          : {
              tipo: 'MALETA_CERRADA' as const,
              maletaId: maleta.id,
              hospitalId: idHospital,
              facturaId: idFactura,
            };
      const eventoMaleta = {
        sobre: {
          eventoId: crearEventoId(uuidV7(relojPared, azar)),
          hlc: serializar(await avanzarReloj(db, sesion.dispositivoId, relojPared)),
          dispositivoId: sesion.dispositivoId,
          usuarioId: sesion.usuarioId,
          rol: sesion.rol,
          registradoEn: new Date(relojPared).toISOString(),
        },
        cuerpo: cuerpoEvento,
      };
      const transicionMaleta = aplicarEventoMaleta(maleta, eventoMaleta);
      if (!transicionMaleta.ok) {
        return fallo(errorFact('ESTADO_INVALIDO', transicionMaleta.error.mensaje));
      }
      await db.eventosMaleta.add({
        eventoId: eventoMaleta.sobre.eventoId,
        operacionId,
        maletaId: maleta.id,
        tipo: 'MALETA_CERRADA',
        hlc: eventoMaleta.sobre.hlc,
        evento: eventoMaleta,
        enviado: 0,
      });
      await db.maletas.put(transicionMaleta.valor);
      await encolarOperacion(db, operacionId, [...eventosPieza, eventoMaleta], relojPared);

      if (borrador === null) {
        return ok<ResumenCierreMaleta>({
          maleta: transicionMaleta.valor,
          factura: null,
          piezasReprocesadas: sinUsar.length,
        });
      }
      await db.facturas.add(borrador.valor);

      return ok<ResumenCierreMaleta>({
        maleta: transicionMaleta.valor,
        factura: borrador.valor,
        piezasReprocesadas: sinUsar.length,
      });
    },
  );
}

export async function obtenerFactura(
  db: BaseLocal,
  facturaIdTexto: string,
): Promise<Factura | undefined> {
  return db.facturas.get(crearFacturaId(facturaIdTexto));
}

export interface FiltroFacturas {
  readonly estado?: Factura['estado'];
  readonly hospitalId?: string;
}

export async function listarFacturas(
  db: BaseLocal,
  filtro: FiltroFacturas = {},
): Promise<readonly Factura[]> {
  const todas =
    filtro.estado === undefined
      ? await db.facturas.toArray()
      : await db.facturas.where('estado').equals(filtro.estado).toArray();
  const filtradas =
    filtro.hospitalId === undefined
      ? todas
      : todas.filter((f) => f.hospitalId === filtro.hospitalId);
  return [...filtradas].sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
}

/**
 * Emite la factura: aplica CONFIRMAR_FACTURA a cada pieza de la linea (solo
 * rol CONTABLE, exigido por la maquina de estados de Pieza) y marca la
 * factura EMITIDA. Se valida primero con el motor puro (`emitirFacturaPura`):
 * si hay una linea con precio aleatorio pendiente de aprobacion, no se escribe
 * nada (decision 12).
 *
 * Idempotente: una factura ya EMITIDA se devuelve tal cual, sin volver a
 * tocar las piezas.
 */
export async function emitirFactura(
  db: BaseLocal,
  facturaIdTexto: string,
  sesion: Sesion,
  opciones: OpcionesFacturacion,
): Promise<Resultado<Factura, ErrorFacturacion>> {
  const relojPared = opciones.ahora();

  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const operacionId = uuidV7(relojPared, azar);

  return db.transaction(
    'rw',
    [db.facturas, db.piezas, db.eventos, db.outbox, db.operacionesSync, db.meta],
    async () => {
      const factura = await db.facturas.get(crearFacturaId(facturaIdTexto));
      if (factura === undefined)
        return fallo(errorFact('FACTURA_NO_ENCONTRADA', `La factura ${facturaIdTexto} no existe`));
      if (factura.estado === 'EMITIDA') return ok(factura);

      const emitida = emitirFacturaPura(factura, new Date(relojPared).toISOString());
      if (!emitida.ok) {
        return fallo(
          errorFact(
            'LINEA_BLOQUEADA_POR_APROBACION',
            emitida.error.mensaje,
            emitida.error.codigosBloqueados,
          ),
        );
      }

      const eventos: EventoSincronizable[] = [];
      for (const linea of factura.lineas) {
        const pieza = await db.piezas.get(linea.codigoPieza);
        if (pieza === undefined) {
          return fallo(
            errorFact(
              'TRANSICION_RECHAZADA',
              `La pieza ${linea.codigoPieza} de la factura no existe en la replica local`,
            ),
          );
        }
        const r = await escribirEventoPieza(
          db,
          pieza,
          { tipo: 'CONFIRMAR_FACTURA', codigo: pieza.codigo },
          sesion,
          relojPared,
          { ...opciones, operacionId, encolarOperacion: false },
        );
        if (!r.ok) return fallo(errorFact('TRANSICION_RECHAZADA', r.error.mensaje));
        eventos.push(r.valor.evento);
      }

      await db.facturas.put(emitida.valor);
      await encolarOperacion(db, operacionId, eventos, relojPared, {
        clase: 'EMITIR_FACTURA',
        facturaId: factura.id,
        // El dominio local aun no pide una numeracion fiscal independiente. El
        // UUID estable evita duplicados hasta que Contabilidad defina la serie.
        numeroFactura: factura.id,
      });
      return ok(emitida.valor);
    },
  );
}
