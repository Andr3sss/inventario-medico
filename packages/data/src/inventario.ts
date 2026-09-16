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
import type { BaseLocal, FilaCatalogo, TipoComandoMaestro } from './db.js';
import type { Sesion } from './escaneo.js';
import { AZAR_CRIPTOGRAFICO, uuidV7, type FuenteAzar } from './identificadores.js';
import { secuenciaClienteDesdeHlc } from './operaciones.js';
import { avanzarReloj, serializarHlc } from './reloj.js';

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
  const items = ordenadas
    .slice(inicio, inicio + porPagina)
    .map((pieza) => ({ pieza, producto: catalogo.get(pieza.sku) }));

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
export async function contarPiezasPorEstado(
  db: BaseLocal,
): Promise<Readonly<Record<EstadoPieza, number>>> {
  const conteo = Object.fromEntries(ESTADOS_PIEZA.map((estado) => [estado, 0])) as Record<
    EstadoPieza,
    number
  >;
  const piezas = await db.piezas.toArray();
  for (const pieza of piezas) {
    conteo[pieza.estado] += 1;
  }
  return conteo;
}

export async function obtenerPieza(
  db: BaseLocal,
  codigo: string,
): Promise<PiezaConProducto | undefined> {
  const pieza = await db.piezas.get(crearCodigoPieza(codigo));
  if (pieza === undefined) return undefined;
  const producto = await db.catalogo.get(pieza.sku);
  return { pieza, producto };
}

/**
 * Componentes hijos de un kit (punto 5.3 del brief): al escanear la caja, el
 * auxiliar tiene que ver esto para elegir solo lo efectivamente usado.
 */
export async function componentesDeKit(
  db: BaseLocal,
  codigoKit: string,
): Promise<readonly PiezaConProducto[]> {
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
  | 'COSTO_INVALIDO'
  | 'PRODUCTO_TIENE_PIEZAS'
  | 'PIEZA_NO_EDITABLE'
  | 'PIEZA_TIENE_COMPONENTES';

export interface ErrorInventario {
  readonly codigo: CodigoErrorInventario;
  readonly mensaje: string;
}

function exigirAdministrador(sesion: Sesion): Resultado<true, ErrorInventario> {
  if (sesion.rol !== 'ADMINISTRADOR') {
    return fallo({
      codigo: 'NO_AUTORIZADO',
      mensaje: 'Solo el Administrador da de alta catalogo e inventario',
    });
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
    return fallo({
      codigo: 'COSTO_INVALIDO',
      mensaje: 'El costo base debe ser un entero de centavos, no negativo',
    });
  }

  const existente = await db.catalogo.get(datos.sku);
  if (existente !== undefined) {
    return fallo({
      codigo: 'PRODUCTO_YA_EXISTE',
      mensaje: `Ya existe un producto con sku ${datos.sku}`,
    });
  }

  const fila: FilaCatalogo = {
    sku: datos.sku,
    nombre: datos.nombre,
    tipo: datos.tipo,
    costoBase: datos.costoBase,
  };
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

export interface OpcionesInventarioOffline {
  readonly ahora: () => number;
  readonly azar?: FuenteAzar;
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
    return fallo({
      codigo: 'PRODUCTO_NO_ENCONTRADO',
      mensaje: `El sku ${datos.sku} no existe en el catalogo`,
    });
  }

  const codigo = crearCodigoPieza(datos.codigo);
  const existente = await db.piezas.get(codigo);
  if (existente !== undefined) {
    return fallo({
      codigo: 'PIEZA_YA_EXISTE',
      mensaje: `Ya existe una pieza con codigo ${datos.codigo}`,
    });
  }

  let parentCodigo = null as Pieza['parentCodigo'];
  if (datos.parentCodigo !== undefined && datos.parentCodigo !== null) {
    const padre = await db.piezas.get(crearCodigoPieza(datos.parentCodigo));
    if (padre === undefined) {
      return fallo({
        codigo: 'PADRE_NO_ENCONTRADO',
        mensaje: `El kit padre ${datos.parentCodigo} no existe`,
      });
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

function costoValido(costo: number): boolean {
  return Number.isInteger(costo) && costo >= 0;
}

export async function actualizarProducto(
  db: BaseLocal,
  producto: FilaCatalogo,
  datos: DatosProductoNuevo,
  sesion: Sesion,
): Promise<Resultado<FilaCatalogo, ErrorInventario>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;
  if (!costoValido(datos.costoBase)) {
    return fallo({
      codigo: 'COSTO_INVALIDO',
      mensaje: 'El costo base debe ser un entero de centavos, no negativo',
    });
  }
  if ((await db.catalogo.get(producto.sku)) === undefined) {
    return fallo({
      codigo: 'PRODUCTO_NO_ENCONTRADO',
      mensaje: `El sku ${producto.sku} ya no existe`,
    });
  }
  if (
    producto.tipo !== datos.tipo &&
    (await db.piezas.where('sku').equals(producto.sku).count()) > 0
  ) {
    return fallo({
      codigo: 'PRODUCTO_TIENE_PIEZAS',
      mensaje: 'No se puede cambiar el tipo mientras existan piezas vinculadas a este producto',
    });
  }
  const resultado: FilaCatalogo = {
    sku: producto.sku,
    nombre: datos.nombre.trim(),
    tipo: datos.tipo,
    costoBase: datos.costoBase,
  };
  await db.catalogo.put(resultado);
  return ok(resultado);
}

export async function eliminarProducto(
  db: BaseLocal,
  producto: FilaCatalogo,
  sesion: Sesion,
): Promise<Resultado<true, ErrorInventario>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;
  if ((await db.catalogo.get(producto.sku)) === undefined) {
    return fallo({
      codigo: 'PRODUCTO_NO_ENCONTRADO',
      mensaje: `El sku ${producto.sku} ya no existe`,
    });
  }
  if ((await db.piezas.where('sku').equals(producto.sku).count()) > 0) {
    return fallo({
      codigo: 'PRODUCTO_TIENE_PIEZAS',
      mensaje: 'Retira primero todas las piezas vinculadas a este producto',
    });
  }
  await db.catalogo.delete(producto.sku);
  return ok(true);
}

async function validarEdicionPieza(
  db: BaseLocal,
  pieza: Pieza,
  datos: DatosPiezaNueva,
): Promise<Resultado<Pieza, ErrorInventario>> {
  const actual = await db.piezas.get(pieza.codigo);
  if (actual === undefined) {
    return fallo({
      codigo: 'PIEZA_NO_EDITABLE',
      mensaje: 'La pieza ya no existe en este dispositivo',
    });
  }
  if (actual.estado !== 'EN_BODEGA_CENTRAL' || actual.maletaId !== null) {
    return fallo({
      codigo: 'PIEZA_NO_EDITABLE',
      mensaje: 'Solo se puede editar o eliminar una pieza disponible en bodega central',
    });
  }
  const producto = await db.catalogo.get(datos.sku);
  if (producto === undefined) {
    return fallo({
      codigo: 'PRODUCTO_NO_ENCONTRADO',
      mensaje: `El sku ${datos.sku} no existe en el catalogo`,
    });
  }
  if (
    actual.sku !== datos.sku &&
    (await db.eventos.where('codigo').equals(actual.codigo).count()) > 0
  ) {
    return fallo({
      codigo: 'PIEZA_NO_EDITABLE',
      mensaje: 'Una pieza con historial no puede cambiar de producto',
    });
  }
  let parentCodigo = null as Pieza['parentCodigo'];
  if (
    datos.parentCodigo !== undefined &&
    datos.parentCodigo !== null &&
    datos.parentCodigo.trim() !== ''
  ) {
    const padre = await db.piezas.get(crearCodigoPieza(datos.parentCodigo));
    if (padre === undefined || padre.tipo !== 'KIT' || padre.codigo === actual.codigo) {
      return fallo({
        codigo: 'PADRE_NO_ENCONTRADO',
        mensaje: `El kit padre ${datos.parentCodigo} no existe`,
      });
    }
    parentCodigo = padre.codigo;
  }
  return ok({
    ...actual,
    sku: crearSku(datos.sku),
    tipo: producto.tipo,
    parentCodigo,
    version: actual.version + 1,
  });
}

export async function actualizarPieza(
  db: BaseLocal,
  pieza: Pieza,
  datos: DatosPiezaNueva,
  sesion: Sesion,
): Promise<Resultado<Pieza, ErrorInventario>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;
  const validada = await validarEdicionPieza(db, pieza, datos);
  if (!validada.ok) return validada;
  await db.piezas.put(validada.valor);
  return validada;
}

export async function eliminarPieza(
  db: BaseLocal,
  pieza: Pieza,
  sesion: Sesion,
): Promise<Resultado<true, ErrorInventario>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;
  const validada = await validarEdicionPieza(db, pieza, {
    codigo: pieza.codigo,
    sku: pieza.sku,
    parentCodigo: pieza.parentCodigo,
  });
  if (!validada.ok) return validada;
  if ((await db.piezas.where('parentCodigo').equals(pieza.codigo).count()) > 0) {
    return fallo({
      codigo: 'PIEZA_TIENE_COMPONENTES',
      mensaje: 'Retira primero los componentes vinculados a este kit',
    });
  }
  await db.piezas.delete(pieza.codigo);
  return ok(true);
}

async function replicaPorCampo(
  db: BaseLocal,
  entidadTipo: 'PRODUCTO' | 'PIEZA',
  campo: 'sku' | 'codigo',
  valor: string,
) {
  return db.replicaCentral
    .where('entidadTipo')
    .equals(entidadTipo)
    .filter((replica) => {
      const payload = replica.payload;
      return (
        typeof payload === 'object' &&
        payload !== null &&
        (payload as Record<string, unknown>)[campo] === valor
      );
    })
    .first();
}

function datosOperacion(
  tipo: TipoComandoMaestro,
  entidadId: string,
  payload: Readonly<Record<string, unknown>>,
  operacionId: string,
  secuenciaCliente: string,
  ahora: number,
) {
  return {
    operacionId,
    secuenciaCliente,
    eventoIds: [],
    eventos: [],
    clase: 'COMANDO_MAESTRO' as const,
    facturaId: null,
    numeroFactura: null,
    maestro: { tipo, entidadId, payload },
    creadoEn: ahora,
    intentos: 0,
    proximoIntento: ahora,
    ultimoError: null,
  };
}

export async function crearProductoOffline(
  db: BaseLocal,
  datos: DatosProductoNuevo,
  sesion: Sesion,
  opciones: OpcionesInventarioOffline,
): Promise<Resultado<FilaCatalogo, ErrorInventario>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;
  if (!costoValido(datos.costoBase)) {
    return fallo({
      codigo: 'COSTO_INVALIDO',
      mensaje: 'El costo base debe ser un entero de centavos, no negativo',
    });
  }
  if ((await db.catalogo.get(datos.sku)) !== undefined) {
    return fallo({
      codigo: 'PRODUCTO_YA_EXISTE',
      mensaje: `Ya existe un producto con sku ${datos.sku}`,
    });
  }
  const ahora = opciones.ahora();
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const productoId = uuidV7(ahora, azar);
  const operacionId = uuidV7(ahora, azar);
  const fila: FilaCatalogo = { ...datos, sku: datos.sku.trim(), nombre: datos.nombre.trim() };
  await db.transaction('rw', [db.catalogo, db.operacionesSync, db.meta], async () => {
    const reloj = await avanzarReloj(db, sesion.dispositivoId, ahora);
    await db.catalogo.put(fila);
    await db.operacionesSync.add(
      datosOperacion(
        'CREAR_PRODUCTO',
        fila.sku,
        {
          productoId,
          sku: fila.sku,
          nombre: fila.nombre,
          tipoProducto: fila.tipo,
          costoBaseCentavos: fila.costoBase,
        },
        operacionId,
        secuenciaClienteDesdeHlc(serializarHlc(reloj)),
        ahora,
      ),
    );
  });
  return ok(fila);
}

export async function actualizarProductoOffline(
  db: BaseLocal,
  producto: FilaCatalogo,
  datos: DatosProductoNuevo,
  sesion: Sesion,
  opciones: OpcionesInventarioOffline,
): Promise<Resultado<FilaCatalogo, ErrorInventario>> {
  const validado = await actualizarProducto(db, producto, datos, sesion);
  if (!validado.ok) return validado;
  const ahora = opciones.ahora();
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const replica = await replicaPorCampo(db, 'PRODUCTO', 'sku', producto.sku);
  await db.transaction('rw', [db.operacionesSync, db.meta], async () => {
    const reloj = await avanzarReloj(db, sesion.dispositivoId, ahora);
    await db.operacionesSync.add(
      datosOperacion(
        'ACTUALIZAR_PRODUCTO',
        producto.sku,
        {
          sku: producto.sku,
          nombre: validado.valor.nombre,
          tipoProducto: validado.valor.tipo,
          costoBaseCentavos: validado.valor.costoBase,
          versionEsperada: replica?.version ?? null,
        },
        uuidV7(ahora, azar),
        secuenciaClienteDesdeHlc(serializarHlc(reloj)),
        ahora,
      ),
    );
  });
  return validado;
}

export async function eliminarProductoOffline(
  db: BaseLocal,
  producto: FilaCatalogo,
  sesion: Sesion,
  opciones: OpcionesInventarioOffline,
): Promise<Resultado<true, ErrorInventario>> {
  const validado = await eliminarProducto(db, producto, sesion);
  if (!validado.ok) return validado;
  const ahora = opciones.ahora();
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const replica = await replicaPorCampo(db, 'PRODUCTO', 'sku', producto.sku);
  await db.transaction('rw', [db.operacionesSync, db.meta], async () => {
    const reloj = await avanzarReloj(db, sesion.dispositivoId, ahora);
    await db.operacionesSync.add(
      datosOperacion(
        'ELIMINAR_PRODUCTO',
        producto.sku,
        { sku: producto.sku, versionEsperada: replica?.version ?? null },
        uuidV7(ahora, azar),
        secuenciaClienteDesdeHlc(serializarHlc(reloj)),
        ahora,
      ),
    );
  });
  return validado;
}

export async function registrarPiezaOffline(
  db: BaseLocal,
  datos: DatosPiezaNueva,
  sesion: Sesion,
  opciones: OpcionesInventarioOffline,
): Promise<Resultado<Pieza, ErrorInventario>> {
  const validado = await registrarPieza(db, datos, sesion);
  if (!validado.ok) return validado;
  const ahora = opciones.ahora();
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const piezaId = uuidV7(ahora, azar);
  await db.transaction('rw', [db.piezas, db.operacionesSync, db.meta], async () => {
    const reloj = await avanzarReloj(db, sesion.dispositivoId, ahora);
    const pieza = { ...validado.valor, hlc: serializarHlc(reloj) };
    await db.piezas.put(pieza);
    await db.operacionesSync.add(
      datosOperacion(
        'REGISTRAR_PIEZA',
        pieza.codigo,
        {
          piezaId,
          codigo: pieza.codigo,
          sku: pieza.sku,
          kitPadreCodigo: pieza.parentCodigo,
        },
        uuidV7(ahora, azar),
        secuenciaClienteDesdeHlc(pieza.hlc),
        ahora,
      ),
    );
  });
  return ok((await db.piezas.get(validado.valor.codigo)) ?? validado.valor);
}

export async function actualizarPiezaOffline(
  db: BaseLocal,
  pieza: Pieza,
  datos: DatosPiezaNueva,
  sesion: Sesion,
  opciones: OpcionesInventarioOffline,
): Promise<Resultado<Pieza, ErrorInventario>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;
  const validada = await validarEdicionPieza(db, pieza, datos);
  if (!validada.ok) return validada;
  const ahora = opciones.ahora();
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const replica = await replicaPorCampo(db, 'PIEZA', 'codigo', pieza.codigo);
  let resultado = validada.valor;
  await db.transaction('rw', [db.piezas, db.operacionesSync, db.meta], async () => {
    const reloj = await avanzarReloj(db, sesion.dispositivoId, ahora);
    resultado = { ...validada.valor, hlc: serializarHlc(reloj) };
    await db.piezas.put(resultado);
    await db.operacionesSync.add(
      datosOperacion(
        'ACTUALIZAR_PIEZA',
        pieza.codigo,
        {
          codigo: pieza.codigo,
          sku: resultado.sku,
          kitPadreCodigo: resultado.parentCodigo,
          versionEsperada: replica?.version ?? pieza.version,
        },
        uuidV7(ahora, azar),
        secuenciaClienteDesdeHlc(resultado.hlc),
        ahora,
      ),
    );
  });
  return ok(resultado);
}

export async function eliminarPiezaOffline(
  db: BaseLocal,
  pieza: Pieza,
  sesion: Sesion,
  opciones: OpcionesInventarioOffline,
): Promise<Resultado<true, ErrorInventario>> {
  const permiso = exigirAdministrador(sesion);
  if (!permiso.ok) return permiso;
  const validada = await validarEdicionPieza(db, pieza, {
    codigo: pieza.codigo,
    sku: pieza.sku,
    parentCodigo: pieza.parentCodigo,
  });
  if (!validada.ok) return validada;
  if ((await db.piezas.where('parentCodigo').equals(pieza.codigo).count()) > 0) {
    return fallo({
      codigo: 'PIEZA_TIENE_COMPONENTES',
      mensaje: 'Retira primero los componentes vinculados a este kit',
    });
  }
  const ahora = opciones.ahora();
  const azar = opciones.azar ?? AZAR_CRIPTOGRAFICO;
  const replica = await replicaPorCampo(db, 'PIEZA', 'codigo', pieza.codigo);
  await db.transaction('rw', [db.piezas, db.operacionesSync, db.meta], async () => {
    const reloj = await avanzarReloj(db, sesion.dispositivoId, ahora);
    await db.piezas.delete(pieza.codigo);
    await db.operacionesSync.add(
      datosOperacion(
        'ELIMINAR_PIEZA',
        pieza.codigo,
        { codigo: pieza.codigo, versionEsperada: replica?.version ?? pieza.version },
        uuidV7(ahora, azar),
        secuenciaClienteDesdeHlc(serializarHlc(reloj)),
        ahora,
      ),
    );
  });
  return ok(true);
}
