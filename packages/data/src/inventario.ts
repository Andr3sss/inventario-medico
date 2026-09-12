import {
  BODEGA_CENTRAL,
  codigoPieza as crearCodigoPieza,
  estadoEnReposo,
  fallo,
  normalizarPagina,
  ok,
  sku as crearSku,
  type EstadoPieza,
  type Pagina,
  type Pieza,
  type Resultado,
  type TipoPieza,
  type Ubicacion,
} from '@crearcos/core';
import type { BaseLocal, FilaCatalogo } from './db.js';
import type { Sesion } from './escaneo.js';

export interface PiezaConProducto {
  readonly pieza: Pieza;
  readonly producto: FilaCatalogo | undefined;
}

export interface FiltroInventario {
  readonly estado?: EstadoPieza;
  readonly tipo?: TipoPieza;
  /** Busca por coincidencia parcial en el codigo de la pieza o el nombre del producto, sin distinguir mayusculas. */
  readonly texto?: string;
  readonly sku?: string;
}

/**
 * Lista el inventario del dispositivo con filtro y paginacion.
 *
 * El volumen esperado por dispositivo es de cientos de piezas (la semilla trae
 * 221), asi que filtrar en memoria despues de un `where` de Dexie es
 * proporcional; no hace falta un motor de busqueda para esta escala.
 */
export async function listarPiezas(
  db: BaseLocal,
  filtro: FiltroInventario = {},
  paginacion: { readonly pagina?: number; readonly porPagina?: number } = {},
): Promise<Pagina<PiezaConProducto>> {
  const base =
    filtro.estado === undefined
      ? await db.piezas.toArray()
      : await db.piezas.where('estado').equals(filtro.estado).toArray();

  const catalogo = new Map((await db.catalogo.toArray()).map((c) => [c.sku, c]));
  const texto = filtro.texto?.trim().toLocaleLowerCase();

  const filtradas = base.filter((pieza) => {
    if (filtro.sku !== undefined && pieza.sku !== filtro.sku) return false;
    if (filtro.tipo !== undefined && pieza.tipo !== filtro.tipo) return false;
    if (texto === undefined || texto === '') return true;
    const nombre = catalogo.get(pieza.sku)?.nombre.toLocaleLowerCase() ?? '';
    return pieza.codigo.toLocaleLowerCase().includes(texto) || nombre.includes(texto);
  });

  const ordenadas = [...filtradas].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const { pagina, porPagina } = normalizarPagina(paginacion);
  const inicio = (pagina - 1) * porPagina;
  const items = ordenadas.slice(inicio, inicio + porPagina).map((pieza) => ({ pieza, producto: catalogo.get(pieza.sku) }));

  return { items, total: ordenadas.length, pagina, porPagina };
}

const ESTADOS_PIEZA = [
  'EN_BODEGA_CENTRAL',
  'EN_BODEGA_INSTRUMENTISTA',
  'ASIGNADA_A_MALETA',
  'EN_MALETA_ACTIVA',
  'USADA_PENDIENTE_VALORACION',
  'FACTURADA',
  'CONSUMIDA',
  'EN_REPROCESAMIENTO',
  'EN_CONFLICTO',
  'EXTRAVIADA',
] as const satisfies readonly EstadoPieza[];

/**
 * Conteo por estado en una sola pasada, para tableros/resumenes que hoy
 * piden 5 paginas de `listarPiezas` solo para leer `total` de cada una.
 * Los conteos son globales -no aplican `FiltroInventario`- porque los
 * resumenes que los consumen (Inventario, Tablero) siempre muestran la
 * distribucion completa, independiente del filtro de busqueda activo.
 */
export async function contarPiezasPorEstado(db: BaseLocal): Promise<Readonly<Record<EstadoPieza, number>>> {
  const conteo = Object.fromEntries(ESTADOS_PIEZA.map((estado) => [estado, 0])) as Record<EstadoPieza, number>;
  const piezas = await db.piezas.toArray();
  for (const pieza of piezas) {
    conteo[pieza.estado] += 1;
  }
  return conteo;
}

export async function obtenerPieza(db: BaseLocal, codigo: string): Promise<PiezaConProducto | undefined> {
  const pieza = await db.piezas.get(crearCodigoPieza(codigo));
  if (pieza === undefined) return undefined;
  const producto = await db.catalogo.get(pieza.sku);
  return { pieza, producto };
}

/**
 * Componentes hijos de un kit (punto 5.3 del brief): al escanear la caja, el
 * auxiliar tiene que ver esto para elegir solo lo efectivamente usado.
 */
export async function componentesDeKit(db: BaseLocal, codigoKit: string): Promise<readonly PiezaConProducto[]> {
  const hijos = await db.piezas.where('parentCodigo').equals(codigoKit).toArray();
  const catalogo = new Map((await db.catalogo.toArray()).map((c) => [c.sku, c]));
  return hijos.map((pieza) => ({ pieza, producto: catalogo.get(pieza.sku) }));
}

export async function listarCatalogo(db: BaseLocal): Promise<readonly FilaCatalogo[]> {
  return db.catalogo.toArray();
}

/**
 * Alta de catalogo e inventario, autoservicio del Administrador (brief §4:
 * "Gestiona usuarios y catalogo de inventario. No requiere programador").
 * Un solo codigo de error para las dos operaciones, mismo criterio que
 * `maletas.ts`: quien consume esto programa contra una forma unica.
 */
export type CodigoErrorInventario =
  | 'NO_AUTORIZADO'
  | 'PRODUCTO_YA_EXISTE'
  | 'PRODUCTO_NO_ENCONTRADO'
  | 'PIEZA_YA_EXISTE'
  | 'PADRE_NO_ENCONTRADO'
  | 'COSTO_INVALIDO';

export interface ErrorInventario {
  readonly codigo: CodigoErrorInventario;
  readonly mensaje: string;
}

function exigirAdministrador(sesion: Sesion): Resultado<true, ErrorInventario> {
  if (sesion.rol !== 'ADMINISTRADOR') {
    return fallo({ codigo: 'NO_AUTORIZADO', mensaje: 'Solo el Administrador da de alta catalogo e inventario' });
  }
  return ok(true);
}

export interface DatosProductoNuevo {
  readonly sku: string;
  readonly nombre: string;
  readonly tipo: TipoPieza;
  /** Centavos enteros (decision 6: el dinero nunca se guarda en decimales). */
  readonly costoBase: number;
}

/**
 * Da de alta un producto nuevo en el catalogo. No crea ninguna pieza fisica
 * por si solo -eso es `registrarPieza`- porque un sku puede existir en el
 * catalogo (para cotizar, para armar una excepcion de precio) antes de que
 * llegue mercaderia fisica con ese codigo.
 */
export async function crearProducto(
  db: BaseLocal,
  datos: DatosProductoNuevo,
  sesion: Sesion,
): Promise<Resultado<FilaCatalogo, ErrorInventario>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;

  if (!Number.isInteger(datos.costoBase) || datos.costoBase < 0) {
    return fallo({ codigo: 'COSTO_INVALIDO', mensaje: 'El costo base debe ser un entero de centavos, no negativo' });
  }

  const existente = await db.catalogo.get(datos.sku);
  if (existente !== undefined) {
    return fallo({ codigo: 'PRODUCTO_YA_EXISTE', mensaje: `Ya existe un producto con sku ${datos.sku}` });
  }

  const fila: FilaCatalogo = { sku: datos.sku, nombre: datos.nombre, tipo: datos.tipo, costoBase: datos.costoBase };
  await db.catalogo.put(fila);
  return ok(fila);
}

export interface DatosPiezaNueva {
  /** Codigo ya impreso/grabado en la pieza fisica -no se genera aqui, decision 2. */
  readonly codigo: string;
  readonly sku: string;
  /** Solo si esta pieza es un componente hijo de un kit ya existente en este dispositivo. */
  readonly parentCodigo?: string | null;
  /** Bodega central por defecto; puede darse de alta directo en la bodega de un instrumentista. */
  readonly ubicacion?: Ubicacion;
}

/**
 * Da de alta una pieza fisica nueva, en reposo, tomando tipo y costo del
 * producto de catalogo al que pertenece.
 *
 * A proposito no pasa por `aplicarEvento`: no hay una pieza previa cuyo estado
 * transicionar, esta es la primera fila que existe para ese codigo. El alta en
 * si no genera un evento de trazabilidad -todavia no hay historial que
 * contar-, a diferencia de cada movimiento posterior, que si pasa por la
 * maquina de estados via `escaneo.ts`/`maletas.ts`.
 */
export async function registrarPieza(
  db: BaseLocal,
  datos: DatosPiezaNueva,
  sesion: Sesion,
): Promise<Resultado<Pieza, ErrorInventario>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;

  const producto = await db.catalogo.get(datos.sku);
  if (producto === undefined) {
    return fallo({ codigo: 'PRODUCTO_NO_ENCONTRADO', mensaje: `El sku ${datos.sku} no existe en el catalogo` });
  }

  const codigo = crearCodigoPieza(datos.codigo);
  const existente = await db.piezas.get(codigo);
  if (existente !== undefined) {
    return fallo({ codigo: 'PIEZA_YA_EXISTE', mensaje: `Ya existe una pieza con codigo ${datos.codigo}` });
  }

  let parentCodigo = null as Pieza['parentCodigo'];
  if (datos.parentCodigo !== undefined && datos.parentCodigo !== null) {
    const padre = await db.piezas.get(crearCodigoPieza(datos.parentCodigo));
    if (padre === undefined) {
      return fallo({ codigo: 'PADRE_NO_ENCONTRADO', mensaje: `El kit padre ${datos.parentCodigo} no existe` });
    }
    parentCodigo = padre.codigo;
  }

  const ubicacion = datos.ubicacion ?? BODEGA_CENTRAL;
  const pieza: Pieza = {
    codigo,
    sku: crearSku(datos.sku),
    tipo: producto.tipo,
    estado: estadoEnReposo(ubicacion),
    ubicacion,
    maletaId: null,
    parentCodigo,
    version: 1,
    // Placeholder de "genesis", mismo criterio que la semilla (seeds/generar.ts):
    // no hay un evento real que explique esta fila todavia, y cualquier evento
    // futuro ordena despues de esto sin ambiguedad.
    hlc: '000000000000000:00000:ALTA_MANUAL',
  };
  await db.piezas.put(pieza);
  return ok(pieza);
}
