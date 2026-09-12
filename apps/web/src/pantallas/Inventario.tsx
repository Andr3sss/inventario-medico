import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { EstadoPieza, Evento, Pagina, TipoPieza } from '@crearcos/core';
import {
  componentesDeKit,
  contarPiezasPorEstado,
  crearProducto,
  historialDePieza,
  listarCatalogo,
  listarPiezas,
  registrarPieza,
  type CodigoErrorInventario,
  type FilaCatalogo,
  type PiezaConProducto,
} from '@crearcos/data';
import {
  BarraBusqueda,
  Boton,
  CargandoPanel,
  EncabezadoPagina,
  Estado,
  MensajeEstado,
  Vacio,
} from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';
import { useApp } from '../datos/contexto.js';
import {
  ETIQUETA_ESTADO_PIEZA,
  ETIQUETA_EVENTO,
  TONO_ESTADO_PIEZA,
  formatearFecha,
  formatearUSD,
  mensajeExcepcion,
  ubicacionVisible,
} from '../datos/presentacion.js';

const POR_PAGINA = 12;

type ModoAlta = 'producto' | 'pieza';

interface MensajeAlta {
  readonly tipo: 'exito' | 'error' | 'info';
  readonly titulo: string;
  readonly texto: string;
}

const TITULO_ERROR_ALTA: Readonly<Record<CodigoErrorInventario, string>> = {
  NO_AUTORIZADO: 'Acción no autorizada',
  PRODUCTO_YA_EXISTE: 'El producto ya existe',
  PRODUCTO_NO_ENCONTRADO: 'Producto no encontrado',
  PIEZA_YA_EXISTE: 'La pieza ya existe',
  PADRE_NO_ENCONTRADO: 'Kit padre no encontrado',
  COSTO_INVALIDO: 'Costo base inválido',
};

interface ConteosInventario {
  readonly total: number;
  readonly central: number;
  readonly instrumentista: number;
  readonly reproceso: number;
  readonly conflictos: number;
}

const CONTEOS_VACIOS: ConteosInventario = {
  total: 0,
  central: 0,
  instrumentista: 0,
  reproceso: 0,
  conflictos: 0,
};

function detalleEvento(evento: Evento): string {
  const cuerpo = evento.cuerpo;
  switch (cuerpo.tipo) {
    case 'ESCANEO_ARMADO':
      return `Maleta ${cuerpo.maletaId}`;
    case 'ESCANEO_ARMADO_REVERSO':
      return 'Retirada durante el armado';
    case 'CONFIRMAR_SALIDA':
      return `Maleta ${cuerpo.maletaId}`;
    case 'ESCANEO_USO':
      return `Uso en ${cuerpo.maletaId}`;
    case 'CIERRE_MALETA_SIN_USO':
      return `Regreso de ${cuerpo.maletaId}`;
    case 'CONFIRMAR_FACTURA':
      return 'Pieza confirmada en factura';
    case 'INGRESO_REPROCESO':
      return 'Ingreso a reprocesamiento registrado';
    case 'FIN_REPROCESO':
      return cuerpo.destino.clase === 'BODEGA_CENTRAL'
        ? 'Destino: bodega central'
        : `Destino: ${cuerpo.destino.usuarioId}`;
    case 'RESOLUCION_MANUAL':
      return cuerpo.motivo;
    case 'MARCAR_EXTRAVIADA':
      return cuerpo.motivo;
    case 'CONFLICTO_SYNC':
      return `Conflicto ${cuerpo.conflictoId}`;
    default:
      return `Registrado por ${evento.sobre.usuarioId}`;
  }
}

export function Inventario(): ReactElement {
  const { db, sesion, administracionCentral } = useApp();
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoPieza | ''>('');
  const [tipo, setTipo] = useState<TipoPieza | ''>('');
  const [resultado, setResultado] = useState<Pagina<PiezaConProducto> | null>(null);
  const [conteos, setConteos] = useState<ConteosInventario>(CONTEOS_VACIOS);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<PiezaConProducto | null>(null);
  const [historial, setHistorial] = useState<readonly Evento[]>([]);
  const [componentes, setComponentes] = useState<readonly PiezaConProducto[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [catalogo, setCatalogo] = useState<readonly FilaCatalogo[]>([]);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [modoAlta, setModoAlta] = useState<ModoAlta>('pieza');
  const [procesandoAlta, setProcesandoAlta] = useState(false);
  const [mensajeAlta, setMensajeAlta] = useState<MensajeAlta | null>(null);
  const [productoSku, setProductoSku] = useState('');
  const [productoNombre, setProductoNombre] = useState('');
  const [productoTipo, setProductoTipo] = useState<TipoPieza>('INSTRUMENTAL');
  const [productoCosto, setProductoCosto] = useState('');
  const [piezaCodigo, setPiezaCodigo] = useState('');
  const [piezaSku, setPiezaSku] = useState('');
  const [piezaPadre, setPiezaPadre] = useState('');

  const cargarConteos = useCallback(async (): Promise<void> => {
    const conteo = await contarPiezasPorEstado(db);
    setConteos({
      total: Object.values(conteo).reduce((total, cantidad) => total + cantidad, 0),
      central: conteo.EN_BODEGA_CENTRAL,
      instrumentista: conteo.EN_BODEGA_INSTRUMENTISTA,
      reproceso: conteo.EN_REPROCESAMIENTO,
      conflictos: conteo.EN_CONFLICTO,
    });
  }, [db]);

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true);
    setError(null);
    try {
      const filtro = {
        ...(estado === '' ? {} : { estado }),
        ...(tipo === '' ? {} : { tipo }),
        ...(busqueda.trim() === '' ? {} : { texto: busqueda.trim() }),
      };
      const [datos, productos] = await Promise.all([
        listarPiezas(db, filtro, { pagina, porPagina: POR_PAGINA }),
        listarCatalogo(db),
      ]);
      setResultado(datos);
      setCatalogo(productos);
      await cargarConteos();
    } catch (excepcion) {
      setError(mensajeExcepcion(excepcion));
    } finally {
      setCargando(false);
    }
  }, [busqueda, cargarConteos, db, estado, pagina, tipo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrirDetalle = async (pieza: PiezaConProducto): Promise<void> => {
    setSeleccionado(pieza);
    setCargandoDetalle(true);
    setHistorial([]);
    setComponentes([]);
    try {
      const [eventos, hijos] = await Promise.all([
        historialDePieza(db, pieza.pieza.codigo),
        pieza.pieza.tipo === 'KIT' ? componentesDeKit(db, pieza.pieza.codigo) : Promise.resolve([]),
      ]);
      setHistorial(eventos);
      setComponentes(hijos);
    } catch (excepcion) {
      setError(mensajeExcepcion(excepcion));
    } finally {
      setCargandoDetalle(false);
    }
  };

  const abrirAlta = (modo: ModoAlta): void => {
    setSeleccionado(null);
    setModoAlta(modo);
    setMensajeAlta(null);
    setAltaAbierta(true);
    if (modo === 'pieza' && piezaSku === '' && catalogo[0] !== undefined) {
      setPiezaSku(catalogo[0].sku);
    }
  };

  const guardarProducto = async (): Promise<void> => {
    if (
      sesion === null ||
      productoSku.trim() === '' ||
      productoNombre.trim() === '' ||
      productoCosto === ''
    )
      return;
    setProcesandoAlta(true);
    setMensajeAlta(null);
    try {
      const dolares = Number(productoCosto.replace(',', '.'));
      const datos = {
        sku: productoSku.trim(),
        nombre: productoNombre.trim(),
        tipo: productoTipo,
        costoBase: Math.round(dolares * 100),
      };
      const respuesta =
        administracionCentral === null
          ? await crearProducto(db, datos, sesion)
          : { ok: true as const, valor: await administracionCentral.crearProducto(datos) };
      if (!respuesta.ok) {
        setMensajeAlta({
          tipo: 'error',
          titulo: TITULO_ERROR_ALTA[respuesta.error.codigo],
          texto: respuesta.error.mensaje,
        });
        return;
      }
      const productos = await listarCatalogo(db);
      setCatalogo(productos);
      setPiezaSku(respuesta.valor.sku);
      setProductoSku('');
      setProductoNombre('');
      setProductoCosto('');
      setModoAlta('pieza');
      setMensajeAlta({
        tipo: 'exito',
        titulo: 'Producto agregado al catálogo',
        texto: `${respuesta.valor.sku} · ${formatearUSD(respuesta.valor.costoBase)}. Ya puedes registrar su primera pieza.`,
      });
    } catch (excepcion) {
      setMensajeAlta({
        tipo: 'error',
        titulo: 'No se pudo crear el producto',
        texto: mensajeExcepcion(excepcion),
      });
    } finally {
      setProcesandoAlta(false);
    }
  };

  const guardarPieza = async (): Promise<void> => {
    if (sesion === null || piezaCodigo.trim() === '' || piezaSku === '') return;
    setProcesandoAlta(true);
    setMensajeAlta(null);
    try {
      const datos = {
        codigo: piezaCodigo.trim(),
        sku: piezaSku,
        ...(piezaPadre.trim() === '' ? {} : { parentCodigo: piezaPadre.trim() }),
      };
      const respuesta =
        administracionCentral === null
          ? await registrarPieza(db, datos, sesion)
          : {
              ok: true as const,
              valor: await administracionCentral.registrarPieza(datos, sesion.dispositivoId),
            };
      if (!respuesta.ok) {
        setMensajeAlta({
          tipo: 'error',
          titulo: TITULO_ERROR_ALTA[respuesta.error.codigo],
          texto: respuesta.error.mensaje,
        });
        return;
      }
      setPiezaCodigo('');
      setPiezaPadre('');
      setMensajeAlta({
        tipo: 'exito',
        titulo: 'Pieza registrada',
        texto: `${respuesta.valor.codigo} quedó disponible en bodega central.`,
      });
      setPagina(1);
      await cargar();
    } catch (excepcion) {
      setMensajeAlta({
        tipo: 'error',
        titulo: 'No se pudo registrar la pieza',
        texto: mensajeExcepcion(excepcion),
      });
    } finally {
      setProcesandoAlta(false);
    }
  };

  const totalPaginas =
    resultado === null ? 1 : Math.max(1, Math.ceil(resultado.total / resultado.porPagina));
  const desde =
    resultado === null || resultado.total === 0
      ? 0
      : (resultado.pagina - 1) * resultado.porPagina + 1;
  const hasta =
    resultado === null ? 0 : Math.min(resultado.pagina * resultado.porPagina, resultado.total);

  return (
    <div className="pagina">
      <EncabezadoPagina
        sobrelinea={`Catálogo del dispositivo · ${String(conteos.total)} unidades`}
        titulo="Inventario"
        descripcion="Consulta la disponibilidad, ubicación y trazabilidad de cada pieza individual."
        acciones={
          sesion?.rol === 'ADMINISTRADOR' ? (
            <div className="acciones-inventario">
              <Boton
                variante="secundario"
                icono="mas"
                onClick={() => {
                  abrirAlta('producto');
                }}
              >
                Nuevo producto
              </Boton>
              <Boton
                icono="inventario"
                onClick={() => {
                  abrirAlta('pieza');
                }}
              >
                Nueva pieza
              </Boton>
            </div>
          ) : undefined
        }
      />
      <section className="resumen-lineal" aria-label="Estados del inventario">
        <button
          type="button"
          className={estado === '' ? 'resumen-lineal__item activo' : 'resumen-lineal__item'}
          onClick={() => {
            setEstado('');
            setPagina(1);
          }}
        >
          <span>Total</span>
          <strong>{conteos.total}</strong>
        </button>
        <button
          type="button"
          className={
            estado === 'EN_BODEGA_CENTRAL' ? 'resumen-lineal__item activo' : 'resumen-lineal__item'
          }
          onClick={() => {
            setEstado('EN_BODEGA_CENTRAL');
            setPagina(1);
          }}
        >
          <span>
            <i className="punto punto--exito" />
            Bodega central
          </span>
          <strong>{conteos.central}</strong>
        </button>
        <button
          type="button"
          className={
            estado === 'EN_BODEGA_INSTRUMENTISTA'
              ? 'resumen-lineal__item activo'
              : 'resumen-lineal__item'
          }
          onClick={() => {
            setEstado('EN_BODEGA_INSTRUMENTISTA');
            setPagina(1);
          }}
        >
          <span>
            <i className="punto" />
            Bodega instrumentista
          </span>
          <strong>{conteos.instrumentista}</strong>
        </button>
        <button
          type="button"
          className={
            estado === 'EN_REPROCESAMIENTO' ? 'resumen-lineal__item activo' : 'resumen-lineal__item'
          }
          onClick={() => {
            setEstado('EN_REPROCESAMIENTO');
            setPagina(1);
          }}
        >
          <span>
            <i className="punto punto--violeta" />
            Reproceso
          </span>
          <strong>{conteos.reproceso}</strong>
        </button>
        <button
          type="button"
          className={
            estado === 'EN_CONFLICTO' ? 'resumen-lineal__item activo' : 'resumen-lineal__item'
          }
          onClick={() => {
            setEstado('EN_CONFLICTO');
            setPagina(1);
          }}
        >
          <span>
            <i className="punto punto--peligro" />
            Conflictos
          </span>
          <strong>{conteos.conflictos}</strong>
        </button>
      </section>
      <section className="panel tabla-panel">
        <div className="herramientas-tabla">
          <BarraBusqueda
            valor={busqueda}
            alCambiar={(valor) => {
              setBusqueda(valor);
              setPagina(1);
            }}
            placeholder="Buscar por código o nombre…"
          />
          <div className="herramientas-tabla__derecha">
            <select
              className="select-control"
              aria-label="Filtrar por estado"
              value={estado}
              onChange={(evento) => {
                setEstado(evento.target.value as EstadoPieza | '');
                setPagina(1);
              }}
            >
              <option value="">Todos los estados</option>
              {Object.entries(ETIQUETA_ESTADO_PIEZA).map(([valor, etiqueta]) => (
                <option value={valor} key={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
            <select
              className="select-control"
              aria-label="Filtrar por tipo"
              value={tipo}
              onChange={(evento) => {
                setTipo(evento.target.value as TipoPieza | '');
                setPagina(1);
              }}
            >
              <option value="">Todos los tipos</option>
              <option value="INSTRUMENTAL">Instrumental</option>
              <option value="INSUMO">Insumo</option>
              <option value="KIT">Kit</option>
            </select>
          </div>
        </div>
        {error !== null && (
          <MensajeEstado tipo="error" titulo="No se pudo cargar el inventario" texto={error} />
        )}
        {cargando ? (
          <CargandoPanel filas={7} />
        ) : resultado === null || resultado.items.length === 0 ? (
          <Vacio
            icono="buscar"
            titulo="No se encontraron instrumentos"
            texto="Prueba otro código, nombre o elimina los filtros activos."
          />
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Instrumento</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Ubicación actual</th>
                    <th>Versión</th>
                    <th>
                      <span className="solo-lector">Acción</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.items.map((item) => (
                    <tr
                      key={item.pieza.codigo}
                      onClick={() => {
                        void abrirDetalle(item);
                      }}
                    >
                      <td>
                        <code className="codigo">{item.pieza.codigo}</code>
                      </td>
                      <td>
                        <button type="button" className="nombre-enlace">
                          {item.producto?.nombre ?? 'Producto no encontrado en catálogo'}
                        </button>
                        <small className="subdato-tabla">{item.pieza.sku}</small>
                      </td>
                      <td className="texto-suave">{item.pieza.tipo}</td>
                      <td>
                        <Estado tono={TONO_ESTADO_PIEZA[item.pieza.estado]}>
                          {ETIQUETA_ESTADO_PIEZA[item.pieza.estado]}
                        </Estado>
                      </td>
                      <td>
                        <span className="ubicacion-celda">
                          <Icono nombre="ubicacion" tamano={15} />
                          {ubicacionVisible(item.pieza)}
                        </span>
                      </td>
                      <td>
                        <code>v{item.pieza.version}</code>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="boton-icono boton-icono--sutil"
                          aria-label={`Ver ${item.pieza.codigo}`}
                        >
                          <Icono nombre="chevron" tamano={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lista-movil">
              {resultado.items.map((item) => (
                <button
                  type="button"
                  className="fila-movil"
                  key={item.pieza.codigo}
                  onClick={() => {
                    void abrirDetalle(item);
                  }}
                >
                  <span className="fila-movil__principal">
                    <code>{item.pieza.codigo}</code>
                    <strong>{item.producto?.nombre ?? item.pieza.sku}</strong>
                    <small>
                      <Icono nombre="ubicacion" tamano={14} />
                      {ubicacionVisible(item.pieza)}
                    </small>
                  </span>
                  <span className="fila-movil__lateral">
                    <Estado tono={TONO_ESTADO_PIEZA[item.pieza.estado]}>
                      {ETIQUETA_ESTADO_PIEZA[item.pieza.estado]}
                    </Estado>
                    <Icono nombre="chevron" tamano={16} />
                  </span>
                </button>
              ))}
            </div>
            <footer className="paginacion">
              <span>
                Mostrando {desde}–{hasta} de {resultado.total} piezas
              </span>
              <div>
                <button
                  type="button"
                  disabled={pagina <= 1}
                  onClick={() => {
                    setPagina((actual) => Math.max(1, actual - 1));
                  }}
                >
                  <Icono nombre="flecha" tamano={16} />
                </button>
                <span className="paginacion__pagina">
                  Página {pagina} de {totalPaginas}
                </span>
                <button
                  type="button"
                  disabled={pagina >= totalPaginas}
                  onClick={() => {
                    setPagina((actual) => Math.min(totalPaginas, actual + 1));
                  }}
                >
                  <Icono nombre="chevron" tamano={16} />
                </button>
              </div>
            </footer>
          </>
        )}
      </section>

      {altaAbierta && (
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Alta de inventario">
          <button
            type="button"
            className="drawer__fondo"
            aria-label="Cerrar alta de inventario"
            onClick={() => {
              setAltaAbierta(false);
            }}
          />
          <form
            className="drawer__panel drawer__panel--formulario"
            onSubmit={(evento) => {
              evento.preventDefault();
              void (modoAlta === 'producto' ? guardarProducto() : guardarPieza());
            }}
          >
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">Administración de inventario</p>
                <h2>{modoAlta === 'producto' ? 'Nuevo producto' : 'Nueva pieza'}</h2>
              </div>
              <button
                type="button"
                className="boton-icono"
                aria-label="Cerrar"
                onClick={() => {
                  setAltaAbierta(false);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <div className="drawer__contenido formulario-drawer">
              <div className="tabs tabs--ancho" role="tablist" aria-label="Tipo de alta">
                <button
                  type="button"
                  role="tab"
                  aria-selected={modoAlta === 'producto'}
                  className={modoAlta === 'producto' ? 'activo' : ''}
                  onClick={() => {
                    setModoAlta('producto');
                    setMensajeAlta(null);
                  }}
                >
                  Producto de catálogo
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={modoAlta === 'pieza'}
                  className={modoAlta === 'pieza' ? 'activo' : ''}
                  onClick={() => {
                    setModoAlta('pieza');
                    setMensajeAlta(null);
                    if (piezaSku === '' && catalogo[0] !== undefined) setPiezaSku(catalogo[0].sku);
                  }}
                >
                  Pieza física
                </button>
              </div>

              {mensajeAlta !== null && <MensajeEstado {...mensajeAlta} />}

              {modoAlta === 'producto' ? (
                <>
                  <div className="aviso-inline aviso-inline--info">
                    <Icono nombre="caja" />
                    <p>
                      Primero crea la referencia comercial. Después podrás registrar una o varias
                      piezas físicas con ese SKU.
                    </p>
                  </div>
                  <label className="campo-ui">
                    <span>SKU</span>
                    <input
                      value={productoSku}
                      onChange={(evento) => {
                        setProductoSku(evento.target.value);
                      }}
                      placeholder="Ej. PINZA-KELLY-14"
                      autoCapitalize="characters"
                      autoFocus
                    />
                    <small>Identificador único del producto en el catálogo.</small>
                  </label>
                  <label className="campo-ui">
                    <span>Nombre del producto</span>
                    <input
                      value={productoNombre}
                      onChange={(evento) => {
                        setProductoNombre(evento.target.value);
                      }}
                      placeholder="Ej. Pinza Kelly curva 14 cm"
                    />
                  </label>
                  <div className="formulario-dos-columnas">
                    <label className="campo-ui">
                      <span>Tipo</span>
                      <select
                        value={productoTipo}
                        onChange={(evento) => {
                          setProductoTipo(evento.target.value as TipoPieza);
                        }}
                      >
                        <option value="INSTRUMENTAL">Instrumental</option>
                        <option value="INSUMO">Insumo</option>
                        <option value="KIT">Kit</option>
                      </select>
                    </label>
                    <label className="campo-ui">
                      <span>Costo base (USD)</span>
                      <span className="campo-monetario">
                        <i>$</i>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={productoCosto}
                          onChange={(evento) => {
                            setProductoCosto(evento.target.value);
                          }}
                          placeholder="0.00"
                        />
                      </span>
                      <small>Se guardará como centavos enteros.</small>
                    </label>
                  </div>
                </>
              ) : (
                <>
                  {catalogo.length === 0 ? (
                    <MensajeEstado
                      tipo="info"
                      titulo="Primero crea un producto"
                      texto="No hay referencias de catálogo disponibles para vincular esta pieza."
                    />
                  ) : (
                    <div className="aviso-inline aviso-inline--info">
                      <Icono nombre="ubicacion" />
                      <p>
                        La pieza quedará disponible en bodega central. Su tipo y costo se toman del
                        producto seleccionado.
                      </p>
                    </div>
                  )}
                  <label className="campo-ui">
                    <span>Código físico</span>
                    <input
                      value={piezaCodigo}
                      onChange={(evento) => {
                        setPiezaCodigo(evento.target.value);
                      }}
                      placeholder="Ej. INS-002381"
                      autoCapitalize="characters"
                      autoFocus
                    />
                    <small>Usa exactamente el código impreso o grabado en la pieza.</small>
                  </label>
                  <label className="campo-ui">
                    <span>Producto del catálogo</span>
                    <select
                      value={piezaSku}
                      disabled={catalogo.length === 0}
                      onChange={(evento) => {
                        setPiezaSku(evento.target.value);
                      }}
                    >
                      <option value="" disabled>
                        Selecciona un producto
                      </option>
                      {catalogo.map((producto) => (
                        <option value={producto.sku} key={producto.sku}>
                          {producto.nombre} · {producto.sku} · {formatearUSD(producto.costoBase)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campo-ui">
                    <span>Kit padre (opcional)</span>
                    <input
                      value={piezaPadre}
                      onChange={(evento) => {
                        setPiezaPadre(evento.target.value);
                      }}
                      placeholder="Ej. KIT-000142"
                      autoCapitalize="characters"
                    />
                    <small>
                      Complétalo únicamente si esta pieza pertenece a un kit ya registrado.
                    </small>
                  </label>
                </>
              )}
            </div>
            <footer className="drawer__pie drawer__pie--distribuido">
              <span className="drawer__contexto">
                {modoAlta === 'producto'
                  ? 'Catálogo comercial'
                  : `${String(catalogo.length)} productos disponibles`}
              </span>
              <div>
                <Boton
                  type="button"
                  variante="secundario"
                  onClick={() => {
                    setAltaAbierta(false);
                  }}
                >
                  Cancelar
                </Boton>
                <Boton
                  type="submit"
                  icono="check"
                  disabled={
                    procesandoAlta ||
                    (modoAlta === 'producto'
                      ? productoSku.trim() === '' ||
                        productoNombre.trim() === '' ||
                        productoCosto === ''
                      : piezaCodigo.trim() === '' || piezaSku === '')
                  }
                >
                  {procesandoAlta
                    ? 'Guardando…'
                    : modoAlta === 'producto'
                      ? 'Crear producto'
                      : 'Registrar pieza'}
                </Boton>
              </div>
            </footer>
          </form>
        </div>
      )}

      {seleccionado !== null && (
        <div
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label={`Detalle de ${seleccionado.pieza.codigo}`}
        >
          <button
            type="button"
            className="drawer__fondo"
            aria-label="Cerrar detalle"
            onClick={() => {
              setSeleccionado(null);
            }}
          />
          <aside className="drawer__panel">
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">Detalle de instrumento</p>
                <code>{seleccionado.pieza.codigo}</code>
              </div>
              <button
                type="button"
                className="boton-icono"
                aria-label="Cerrar"
                onClick={() => {
                  setSeleccionado(null);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <div className="drawer__contenido">
              <div className="detalle-identidad">
                <span className="detalle-identidad__icono">
                  <Icono
                    nombre={seleccionado.pieza.tipo === 'KIT' ? 'caja' : 'inventario'}
                    tamano={25}
                  />
                </span>
                <div>
                  <h2>{seleccionado.producto?.nombre ?? 'Sin nombre de catálogo'}</h2>
                  <p>
                    {seleccionado.pieza.tipo} · {seleccionado.pieza.sku}
                  </p>
                </div>
              </div>
              <div className="detalle-estado">
                <span>
                  <small>Estado actual</small>
                  <Estado tono={TONO_ESTADO_PIEZA[seleccionado.pieza.estado]}>
                    {ETIQUETA_ESTADO_PIEZA[seleccionado.pieza.estado]}
                  </Estado>
                </span>
                <span>
                  <small>Ubicación</small>
                  <strong>{ubicacionVisible(seleccionado.pieza)}</strong>
                </span>
              </div>
              <div className="detalle-datos">
                <div>
                  <span>SKU</span>
                  <code>{seleccionado.pieza.sku}</code>
                </div>
                <div>
                  <span>Tipo</span>
                  <strong>{seleccionado.pieza.tipo}</strong>
                </div>
                <div>
                  <span>Versión local</span>
                  <strong>{seleccionado.pieza.version}</strong>
                </div>
                <div>
                  <span>Kit padre</span>
                  <code>{seleccionado.pieza.parentCodigo ?? 'No aplica'}</code>
                </div>
              </div>
              {seleccionado.pieza.tipo === 'KIT' && (
                <section className="componentes-kit-detalle">
                  <div className="historial__cabecera">
                    <div>
                      <p className="sobrelinea">Composición física</p>
                      <h3>Componentes del kit</h3>
                    </div>
                    <span className="contador">{componentes.length}</span>
                  </div>
                  {cargandoDetalle ? (
                    <CargandoPanel filas={3} />
                  ) : componentes.length === 0 ? (
                    <p className="texto-ayuda">
                      No hay componentes vinculados en este dispositivo.
                    </p>
                  ) : (
                    <div className="componentes-kit-lista">
                      {componentes.map((item) => (
                        <div key={item.pieza.codigo}>
                          <code>{item.pieza.codigo}</code>
                          <span>
                            <strong>{item.producto?.nombre ?? item.pieza.sku}</strong>
                            <small>{ETIQUETA_ESTADO_PIEZA[item.pieza.estado]}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
              <section className="historial">
                <div className="historial__cabecera">
                  <div>
                    <p className="sobrelinea">Trazabilidad</p>
                    <h3>Historial de movimientos</h3>
                  </div>
                  <span className="panel__nota">Orden lógico confirmado</span>
                </div>
                {cargandoDetalle ? (
                  <CargandoPanel filas={4} />
                ) : historial.length === 0 ? (
                  <Vacio
                    icono="reloj"
                    titulo="Sin movimientos registrados"
                    texto="Esta pieza todavía no tiene eventos de trazabilidad."
                  />
                ) : (
                  <div className="timeline">
                    {historial.map((evento, indice) => (
                      <div
                        className={`timeline__item${indice === historial.length - 1 ? ' timeline__item--actual' : ''}`}
                        key={evento.sobre.eventoId}
                      >
                        <span className="timeline__icono">
                          <Icono
                            nombre={
                              evento.cuerpo.tipo === 'CONFLICTO_SYNC'
                                ? 'conflicto'
                                : evento.cuerpo.tipo.includes('REPROCESO')
                                  ? 'reprocesar'
                                  : evento.cuerpo.tipo === 'ESCANEO_USO'
                                    ? 'cirugia'
                                    : 'inventario'
                            }
                            tamano={16}
                          />
                        </span>
                        <span className="timeline__texto">
                          <strong>{ETIQUETA_EVENTO[evento.cuerpo.tipo]}</strong>
                          <small>{detalleEvento(evento)}</small>
                        </span>
                        <time>{formatearFecha(evento.sobre.registradoEn)}</time>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
