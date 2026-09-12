import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { EstadoFactura, Factura, Hospital, LineaFactura } from '@crearcos/core';
import { emitirFactura, listarFacturas, listarHospitales, obtenerFactura } from '@crearcos/data';
import {
  Boton,
  CargandoPanel,
  EncabezadoPagina,
  Estado,
  MensajeEstado,
  Vacio,
} from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';
import { ExcepcionesPrecio } from '../componentes/ExcepcionesPrecio.js';
import { useApp } from '../datos/contexto.js';
import {
  ETIQUETA_ESTADO_FACTURA,
  ETIQUETA_PRECIO_APLICADO,
  formatearFecha,
  formatearUSD,
  mensajeExcepcion,
} from '../datos/presentacion.js';

interface GrupoFactura {
  readonly clave: string;
  readonly sku: string;
  readonly nombre: string;
  readonly precio: LineaFactura['precio'];
  readonly codigos: readonly string[];
  readonly total: number;
}

function agruparLineas(lineas: readonly LineaFactura[]): readonly GrupoFactura[] {
  const grupos = new Map<
    string,
    {
      sku: string;
      nombre: string;
      precio: LineaFactura['precio'];
      codigos: string[];
      total: number;
    }
  >();
  for (const linea of lineas) {
    const clave = `${linea.sku}:${String(linea.precio.valor)}:${linea.precio.tipo}`;
    const existente = grupos.get(clave);
    if (existente === undefined) {
      grupos.set(clave, {
        sku: linea.sku,
        nombre: linea.nombre,
        precio: linea.precio,
        codigos: [linea.codigoPieza],
        total: linea.precio.valor,
      });
    } else {
      existente.codigos.push(linea.codigoPieza);
      existente.total += linea.precio.valor;
    }
  }
  return [...grupos.entries()].map(([clave, grupo]) => ({ clave, ...grupo }));
}

export function Facturacion(): ReactElement {
  const { db, sesion, ahora } = useApp();
  const [facturas, setFacturas] = useState<readonly Factura[]>([]);
  const [hospitales, setHospitales] = useState<readonly Hospital[]>([]);
  const [seleccionada, setSeleccionada] = useState<Factura | null>(null);
  const [filtro, setFiltro] = useState<EstadoFactura | ''>('BORRADOR');
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<{
    tipo: 'exito' | 'error' | 'info';
    titulo: string;
    texto?: string;
  } | null>(null);
  const [bloqueados, setBloqueados] = useState<readonly string[]>([]);

  const cargar = useCallback(
    async (mantenerId?: string): Promise<void> => {
      setCargando(true);
      try {
        const [filas, instituciones] = await Promise.all([
          listarFacturas(db, filtro === '' ? {} : { estado: filtro }),
          listarHospitales(db),
        ]);
        setFacturas(filas);
        setHospitales(instituciones);
        const candidata = filas.find((factura) => factura.id === mantenerId) ?? filas[0];
        if (candidata === undefined) setSeleccionada(null);
        else setSeleccionada((await obtenerFactura(db, candidata.id)) ?? candidata);
      } catch (error) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudieron cargar las facturas',
          texto: mensajeExcepcion(error),
        });
      } finally {
        setCargando(false);
      }
    },
    [db, filtro],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const seleccionar = async (factura: Factura): Promise<void> => {
    try {
      setSeleccionada((await obtenerFactura(db, factura.id)) ?? factura);
      setBloqueados([]);
      setMensaje(null);
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo abrir la factura',
        texto: mensajeExcepcion(error),
      });
    }
  };

  const emitir = async (): Promise<void> => {
    if (sesion === null || seleccionada === null) return;
    setProcesando(true);
    setMensaje(null);
    setBloqueados([]);
    try {
      const respuesta = await emitirFactura(db, seleccionada.id, sesion, { ahora });
      if (!respuesta.ok) {
        const codigos = respuesta.error.codigosBloqueados ?? [];
        setBloqueados(codigos);
        setMensaje({
          tipo: 'error',
          titulo:
            respuesta.error.codigo === 'LINEA_BLOQUEADA_POR_APROBACION'
              ? 'La factura tiene precios pendientes de aprobación'
              : 'No se pudo emitir la factura',
          texto: respuesta.error.mensaje,
        });
        return;
      }
      setMensaje({
        tipo: 'exito',
        titulo: 'Factura emitida',
        texto: `${respuesta.valor.id} quedó confirmada en este dispositivo.`,
      });
      await cargar(respuesta.valor.id);
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo emitir la factura',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const hospital =
    seleccionada === null
      ? undefined
      : hospitales.find((item) => item.id === seleccionada.hospitalId);
  const grupos = useMemo(() => agruparLineas(seleccionada?.lineas ?? []), [seleccionada]);

  return (
    <div className="pagina">
      <EncabezadoPagina
        sobrelinea="Cierre y emisión"
        titulo="Facturación"
        descripcion="Revisa los valores calculados por el dominio y emite las facturas listas."
        acciones={
          seleccionada === null ? undefined : (
            <Estado tono={seleccionada.estado === 'EMITIDA' ? 'exito' : 'aviso'}>
              {ETIQUETA_ESTADO_FACTURA[seleccionada.estado]}
            </Estado>
          )
        }
      />
      {mensaje !== null && <MensajeEstado {...mensaje} />}
      {bloqueados.length > 0 && (
        <div className="bloqueos-factura" role="alert">
          <div>
            <Icono nombre="conflicto" />
            <span>
              <strong>Piezas bloqueadas</strong>
              <p>Estos precios requieren aprobación antes de emitir.</p>
            </span>
          </div>
          <div>
            {bloqueados.map((codigo) => (
              <code key={codigo}>{codigo}</code>
            ))}
          </div>
        </div>
      )}
      <ExcepcionesPrecio modo="facturacion" />
      <section className="panel facturas-selector">
        <div className="tabs-bar">
          <div className="tabs">
            <button
              type="button"
              className={filtro === 'BORRADOR' ? 'activo' : ''}
              onClick={() => {
                setFiltro('BORRADOR');
              }}
            >
              Por revisar
            </button>
            <button
              type="button"
              className={filtro === 'EMITIDA' ? 'activo' : ''}
              onClick={() => {
                setFiltro('EMITIDA');
              }}
            >
              Emitidas
            </button>
            <button
              type="button"
              className={filtro === '' ? 'activo' : ''}
              onClick={() => {
                setFiltro('');
              }}
            >
              Todas
            </button>
          </div>
          <span className="panel__nota">{facturas.length} en este dispositivo</span>
        </div>
        {cargando ? (
          <CargandoPanel filas={3} />
        ) : facturas.length === 0 ? (
          <Vacio
            icono="factura"
            titulo="No hay facturas en este estado"
            texto="Las prefacturas aparecen cuando una maleta con piezas utilizadas se cierra."
          />
        ) : (
          <div className="facturas-tira">
            {facturas.map((factura) => (
              <button
                type="button"
                className={`factura-resumen${seleccionada?.id === factura.id ? ' activo' : ''}`}
                key={factura.id}
                onClick={() => {
                  void seleccionar(factura);
                }}
              >
                <span>
                  <code>{factura.id}</code>
                  <Estado tono={factura.estado === 'EMITIDA' ? 'exito' : 'aviso'}>
                    {ETIQUETA_ESTADO_FACTURA[factura.estado]}
                  </Estado>
                </span>
                <strong>{formatearUSD(factura.total)}</strong>
                <small>
                  {factura.maletaId} · {factura.lineas.length} piezas
                </small>
              </button>
            ))}
          </div>
        )}
      </section>

      {seleccionada !== null && (
        <div className="factura-grid">
          <div className="factura-grid__principal">
            <section className="panel resumen-operacion">
              <header className="panel__cabecera">
                <div>
                  <p className="sobrelinea">Factura {seleccionada.id}</p>
                  <h2>Operación vinculada</h2>
                </div>
                <span className="panel__nota">Creada {formatearFecha(seleccionada.creadaEn)}</span>
              </header>
              <div className="resumen-operacion__datos">
                <span>
                  <Icono nombre="maleta" />
                  <small>Maleta</small>
                  <strong>{seleccionada.maletaId}</strong>
                </span>
                <span>
                  <Icono nombre="hospital" />
                  <small>Institución</small>
                  <strong>{hospital?.nombre ?? seleccionada.hospitalId}</strong>
                </span>
                <span>
                  <Icono nombre="reloj" />
                  <small>Emisión</small>
                  <strong>{formatearFecha(seleccionada.emitidaEn)}</strong>
                </span>
              </div>
            </section>
            <section className="panel factura-lineas">
              <header className="panel__cabecera">
                <div>
                  <p className="sobrelinea">Detalle real</p>
                  <h2>Instrumentos y productos</h2>
                </div>
                <span className="panel__nota">
                  {seleccionada.lineas.length} códigos individuales · {grupos.length} productos
                </span>
              </header>
              <div className="tabla-contenedor">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Código / producto</th>
                      <th className="alinear-centro">Cantidad</th>
                      <th className="alinear-derecha">Precio unitario</th>
                      <th className="alinear-derecha">Total</th>
                      <th>Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((grupo) => (
                      <tr key={grupo.clave}>
                        <td>
                          <span className="producto-celda">
                            <code>{grupo.codigos.join(' · ')}</code>
                            <strong>{grupo.nombre}</strong>
                            <small>{grupo.sku}</small>
                          </span>
                        </td>
                        <td className="alinear-centro">
                          <span className="cantidad">{grupo.codigos.length}</span>
                        </td>
                        <td className="alinear-derecha numero">
                          {formatearUSD(grupo.precio.valor)}
                        </td>
                        <td className="alinear-derecha numero numero--fuerte">
                          {formatearUSD(grupo.total)}
                        </td>
                        <td>
                          <Estado tono={grupo.precio.requiereAprobacion ? 'peligro' : 'neutral'}>
                            {grupo.precio.requiereAprobacion
                              ? 'Requiere aprobación'
                              : ETIQUETA_PRECIO_APLICADO[grupo.precio.tipo]}
                          </Estado>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="lista-movil">
                {grupos.map((grupo) => (
                  <div className="fila-movil" key={grupo.clave}>
                    <span className="fila-movil__principal">
                      <code>{grupo.codigos.join(' · ')}</code>
                      <strong>{grupo.nombre}</strong>
                      <small>
                        {grupo.codigos.length} × {formatearUSD(grupo.precio.valor)} ·{' '}
                        {ETIQUETA_PRECIO_APLICADO[grupo.precio.tipo]}
                      </small>
                    </span>
                    <strong>{formatearUSD(grupo.total)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <aside className="panel resumen-factura">
            <header>
              <p className="sobrelinea">Resumen</p>
              <h2>Datos de facturación</h2>
            </header>
            <div className="factura-dato-real">
              <span className="institucion-card__icono">
                <Icono nombre="hospital" />
              </span>
              <span>
                <small>Institución</small>
                <strong>{hospital?.nombre ?? seleccionada.hospitalId}</strong>
                <p>{hospital?.ciudad ?? 'Ciudad no disponible'}</p>
              </span>
            </div>
            <div className="totales">
              <div>
                <span>Piezas facturadas</span>
                <strong>{seleccionada.lineas.length}</strong>
              </div>
              <div className="totales__total">
                <span>Total</span>
                <strong>{formatearUSD(seleccionada.total)}</strong>
              </div>
            </div>
            {seleccionada.lineas.some((linea) => linea.precio.requiereAprobacion) && (
              <div className="aviso-inline aviso-inline--peligro">
                <Icono nombre="conflicto" />
                <p>
                  Hay precios aleatorios pendientes de aprobación. La emisión permanecerá bloqueada.
                </p>
              </div>
            )}
            <div className="resumen-factura__acciones">
              <Boton
                icono="check"
                disabled={procesando || seleccionada.estado === 'EMITIDA'}
                onClick={() => {
                  void emitir();
                }}
              >
                {procesando
                  ? 'Emitiendo…'
                  : seleccionada.estado === 'EMITIDA'
                    ? 'Factura emitida'
                    : 'Aprobar y emitir'}
              </Boton>
            </div>
            <p className="resumen-factura__pie">
              <Icono nombre="check" tamano={14} />
              Valores calculados por el motor de precios
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
