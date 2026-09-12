import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { EstadoAprobacion, Hospital } from '@crearcos/core';
import {
  aprobarExcepcionPrecio,
  listarCatalogo,
  listarExcepcionesPrecio,
  listarHospitales,
  obtenerExcepcionPrecio,
  proponerExcepcionPrecio,
  rechazarExcepcionPrecio,
  type FilaCatalogo,
  type FilaExcepcionPrecio,
} from '@crearcos/data';
import { useApp } from '../datos/contexto.js';
import {
  ETIQUETA_ESTADO_EXCEPCION,
  TONO_ESTADO_EXCEPCION,
  formatearFechaCalendario,
  formatearUSD,
  mensajeExcepcion,
} from '../datos/presentacion.js';
import { Icono } from './Icono.js';
import { Boton, CargandoPanel, Estado, MensajeEstado, Vacio } from './UI.js';

type ModoExcepciones = 'facturacion' | 'administracion';
type FiltroEstado = EstadoAprobacion | '';

interface Mensaje {
  readonly tipo: 'exito' | 'error' | 'info';
  readonly titulo: string;
  readonly texto?: string;
}

function fechaParaInput(instante: number): string {
  const fecha = new Date(instante);
  const ano = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${String(ano)}-${mes}-${dia}`;
}

export function ExcepcionesPrecio({ modo }: { readonly modo: ModoExcepciones }): ReactElement {
  const { db, sesion, ahora, administracionCentral } = useApp();
  const [filas, setFilas] = useState<readonly FilaExcepcionPrecio[]>([]);
  const [hospitales, setHospitales] = useState<readonly Hospital[]>([]);
  const [catalogo, setCatalogo] = useState<readonly FilaCatalogo[]>([]);
  const [filtro, setFiltro] = useState<FiltroEstado>(modo === 'administracion' ? 'PENDIENTE' : '');
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [rechazando, setRechazando] = useState<FilaExcepcionPrecio | null>(null);
  const [motivo, setMotivo] = useState('');
  const [sku, setSku] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const [valorUSD, setValorUSD] = useState('');
  const [vigenteDesde, setVigenteDesde] = useState(() => fechaParaInput(ahora()));
  const [vigenteHasta, setVigenteHasta] = useState('');

  const puedeProponer = sesion?.rol === 'CONTABLE' || sesion?.rol === 'ADMINISTRADOR';
  const puedeDecidir = sesion?.rol === 'ADMINISTRADOR';

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true);
    try {
      const [excepciones, instituciones, productos] = await Promise.all([
        listarExcepcionesPrecio(db, filtro === '' ? {} : { estado: filtro }),
        listarHospitales(db),
        listarCatalogo(db),
      ]);
      setFilas(excepciones);
      setHospitales(instituciones);
      setCatalogo(productos);
    } catch (excepcion) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudieron cargar los precios negociados',
        texto: mensajeExcepcion(excepcion),
      });
    } finally {
      setCargando(false);
    }
  }, [db, filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hospitalesPorId = useMemo(
    () => new Map(hospitales.map((hospital) => [hospital.id, hospital])),
    [hospitales],
  );
  const productosPorSku = useMemo(
    () => new Map(catalogo.map((producto) => [producto.sku, producto])),
    [catalogo],
  );

  const abrirPropuesta = (): void => {
    setSku(catalogo[0]?.sku ?? '');
    setHospitalId(hospitales[0]?.id ?? '');
    setValorUSD('');
    setVigenteDesde(fechaParaInput(ahora()));
    setVigenteHasta('');
    setMensaje(null);
    setFormularioAbierto(true);
  };

  const proponer = async (): Promise<void> => {
    if (sesion === null) return;
    setProcesandoId('nueva');
    setMensaje(null);
    try {
      const dolares = Number(valorUSD.replace(',', '.'));
      const datos = {
        sku,
        hospitalId,
        valor: Math.round(dolares * 100),
        vigenteDesde,
        vigenteHasta: vigenteHasta === '' ? null : vigenteHasta,
      };
      const resultado =
        administracionCentral === null
          ? await proponerExcepcionPrecio(db, datos, sesion, { ahora })
          : {
              ok: true as const,
              valor: await administracionCentral.proponerExcepcion(datos),
            };
      if (!resultado.ok) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudo registrar la propuesta',
          texto: resultado.error.mensaje,
        });
        return;
      }
      setFormularioAbierto(false);
      setFiltro(modo === 'administracion' ? 'PENDIENTE' : '');
      setMensaje({
        tipo: 'exito',
        titulo: 'Precio enviado a aprobación',
        texto: `${resultado.valor.id} quedó pendiente de decisión administrativa.`,
      });
      await cargar();
    } catch (excepcion) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo registrar la propuesta',
        texto: mensajeExcepcion(excepcion),
      });
    } finally {
      setProcesandoId(null);
    }
  };

  const aprobar = async (fila: FilaExcepcionPrecio): Promise<void> => {
    if (sesion === null) return;
    setProcesandoId(fila.id);
    setMensaje(null);
    try {
      const vigente = await obtenerExcepcionPrecio(db, fila.id);
      if (vigente === undefined) {
        setMensaje({ tipo: 'error', titulo: 'La propuesta ya no está disponible' });
        return;
      }
      const resultado =
        administracionCentral === null
          ? await aprobarExcepcionPrecio(db, vigente.id, sesion)
          : {
              ok: true as const,
              valor: await administracionCentral.decidirExcepcion(vigente, 'APROBADO'),
            };
      if (!resultado.ok) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudo aprobar el precio',
          texto: resultado.error.mensaje,
        });
        return;
      }
      setMensaje({
        tipo: 'exito',
        titulo: 'Precio excepcional aprobado',
        texto: resultado.valor.id,
      });
      await cargar();
    } catch (excepcion) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo aprobar el precio',
        texto: mensajeExcepcion(excepcion),
      });
    } finally {
      setProcesandoId(null);
    }
  };

  const rechazar = async (): Promise<void> => {
    if (sesion === null || rechazando === null) return;
    setProcesandoId(rechazando.id);
    setMensaje(null);
    try {
      const vigente = await obtenerExcepcionPrecio(db, rechazando.id);
      if (vigente === undefined) {
        setMensaje({ tipo: 'error', titulo: 'La propuesta ya no está disponible' });
        return;
      }
      const resultado =
        administracionCentral === null
          ? await rechazarExcepcionPrecio(db, vigente.id, motivo.trim(), sesion)
          : {
              ok: true as const,
              valor: await administracionCentral.decidirExcepcion(
                vigente,
                'RECHAZADO',
                motivo.trim(),
              ),
            };
      if (!resultado.ok) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudo rechazar el precio',
          texto: resultado.error.mensaje,
        });
        return;
      }
      setRechazando(null);
      setMotivo('');
      setMensaje({ tipo: 'info', titulo: 'Propuesta rechazada', texto: resultado.valor.id });
      await cargar();
    } catch (excepcion) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo rechazar el precio',
        texto: mensajeExcepcion(excepcion),
      });
    } finally {
      setProcesandoId(null);
    }
  };

  return (
    <section className={`panel excepciones-precio excepciones-precio--${modo}`}>
      <header className="panel__cabecera excepciones-precio__cabecera">
        <div>
          <p className="sobrelinea">Precios por institución</p>
          <h2>{modo === 'administracion' ? 'Aprobaciones pendientes' : 'Precios negociados'}</h2>
          <p className="panel__descripcion">
            {modo === 'administracion'
              ? 'Revisa el importe y la vigencia antes de tomar una decisión.'
              : 'Propón y consulta excepciones para combinaciones específicas de producto y hospital.'}
          </p>
        </div>
        {puedeProponer && (
          <Boton icono="mas" variante="secundario" onClick={abrirPropuesta}>
            Proponer precio
          </Boton>
        )}
      </header>
      {mensaje !== null && (
        <div className="excepciones-precio__mensaje">
          <MensajeEstado {...mensaje} />
        </div>
      )}
      <div className="tabs-bar excepciones-precio__filtros">
        <div className="tabs">
          {(
            [
              ['', 'Todas'],
              ['PENDIENTE', 'Pendientes'],
              ['APROBADO', 'Aprobadas'],
              ['RECHAZADO', 'Rechazadas'],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              type="button"
              className={filtro === valor ? 'activo' : ''}
              key={valor || 'todas'}
              onClick={() => {
                setFiltro(valor);
              }}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <span className="panel__nota">{filas.length} registros</span>
      </div>
      {cargando ? (
        <CargandoPanel filas={3} />
      ) : filas.length === 0 ? (
        <Vacio
          icono={filtro === 'PENDIENTE' ? 'check' : 'factura'}
          titulo={
            filtro === 'PENDIENTE'
              ? 'No hay aprobaciones pendientes'
              : 'No hay precios en este estado'
          }
          texto="Las propuestas aparecerán aquí con su importe, institución y periodo de vigencia."
        />
      ) : (
        <>
          <div className="tabla-contenedor">
            <table className="tabla tabla--excepciones">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Institución</th>
                  <th>Vigencia</th>
                  <th className="alinear-derecha">Valor</th>
                  <th>Estado</th>
                  {puedeDecidir && (
                    <th>
                      <span className="solo-lector">Decisión</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.id}>
                    <td>
                      <span className="producto-celda">
                        <code>{fila.sku}</code>
                        <strong>
                          {productosPorSku.get(fila.sku)?.nombre ?? 'Producto sin nombre local'}
                        </strong>
                        <small>{fila.id}</small>
                      </span>
                    </td>
                    <td>
                      <span className="hospital-resumen">
                        <strong>
                          {hospitalesPorId.get(fila.hospitalId)?.nombre ?? fila.hospitalId}
                        </strong>
                        <small>
                          {hospitalesPorId.get(fila.hospitalId)?.ciudad ?? fila.hospitalId}
                        </small>
                      </span>
                    </td>
                    <td>
                      <span className="vigencia-precio">
                        <strong>Desde {formatearFechaCalendario(fila.vigenteDesde)}</strong>
                        <small>Hasta {formatearFechaCalendario(fila.vigenteHasta)}</small>
                      </span>
                    </td>
                    <td className="alinear-derecha numero numero--fuerte">
                      {formatearUSD(fila.valor)}
                    </td>
                    <td>
                      <Estado tono={TONO_ESTADO_EXCEPCION[fila.estado]}>
                        {ETIQUETA_ESTADO_EXCEPCION[fila.estado]}
                      </Estado>
                      {fila.motivoRechazo !== null && (
                        <small className="motivo-rechazo">{fila.motivoRechazo}</small>
                      )}
                    </td>
                    {puedeDecidir && (
                      <td>
                        {fila.estado === 'PENDIENTE' && (
                          <div className="acciones-decision">
                            <button
                              type="button"
                              className="boton-icono boton-icono--aprobar"
                              aria-label={`Aprobar ${fila.id}`}
                              disabled={procesandoId !== null}
                              onClick={() => {
                                void aprobar(fila);
                              }}
                            >
                              <Icono nombre="check" tamano={16} />
                            </button>
                            <button
                              type="button"
                              className="boton-icono boton-icono--rechazar"
                              aria-label={`Rechazar ${fila.id}`}
                              disabled={procesandoId !== null}
                              onClick={() => {
                                setRechazando(fila);
                                setMotivo('');
                              }}
                            >
                              <Icono nombre="cerrar" tamano={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lista-movil excepciones-lista-movil">
            {filas.map((fila) => (
              <article className="excepcion-movil" key={fila.id}>
                <div>
                  <code>{fila.sku}</code>
                  <Estado tono={TONO_ESTADO_EXCEPCION[fila.estado]}>
                    {ETIQUETA_ESTADO_EXCEPCION[fila.estado]}
                  </Estado>
                </div>
                <strong>{productosPorSku.get(fila.sku)?.nombre ?? fila.sku}</strong>
                <span>{hospitalesPorId.get(fila.hospitalId)?.nombre ?? fila.hospitalId}</span>
                <div className="excepcion-movil__pie">
                  <small>Desde {formatearFechaCalendario(fila.vigenteDesde)}</small>
                  <b>{formatearUSD(fila.valor)}</b>
                </div>
                {puedeDecidir && fila.estado === 'PENDIENTE' && (
                  <div className="excepcion-movil__acciones">
                    <Boton
                      variante="secundario"
                      disabled={procesandoId !== null}
                      onClick={() => {
                        setRechazando(fila);
                        setMotivo('');
                      }}
                    >
                      Rechazar
                    </Boton>
                    <Boton
                      disabled={procesandoId !== null}
                      onClick={() => {
                        void aprobar(fila);
                      }}
                    >
                      Aprobar
                    </Boton>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {formularioAbierto && (
        <div
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Proponer precio negociado"
        >
          <button
            type="button"
            className="drawer__fondo"
            aria-label="Cerrar formulario"
            onClick={() => {
              setFormularioAbierto(false);
            }}
          />
          <form
            className="drawer__panel drawer__panel--formulario"
            onSubmit={(evento) => {
              evento.preventDefault();
              void proponer();
            }}
          >
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">Nueva negociación</p>
                <h2>Proponer precio</h2>
              </div>
              <button
                type="button"
                className="boton-icono"
                aria-label="Cerrar"
                onClick={() => {
                  setFormularioAbierto(false);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <div className="drawer__contenido formulario-drawer">
              <div className="aviso-inline aviso-inline--info">
                <Icono nombre="factura" />
                <p>
                  La propuesta se registra como pendiente. El Administrador toma la decisión final.
                </p>
              </div>
              <label className="campo-ui">
                <span>Producto</span>
                <select
                  value={sku}
                  onChange={(evento) => {
                    setSku(evento.target.value);
                  }}
                  disabled={catalogo.length === 0}
                >
                  <option value="" disabled>
                    Selecciona un producto
                  </option>
                  {catalogo.map((producto) => (
                    <option value={producto.sku} key={producto.sku}>
                      {producto.nombre} · {producto.sku}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo-ui">
                <span>Hospital</span>
                <select
                  value={hospitalId}
                  onChange={(evento) => {
                    setHospitalId(evento.target.value);
                  }}
                  disabled={hospitales.length === 0}
                >
                  <option value="" disabled>
                    Selecciona una institución
                  </option>
                  {hospitales.map((hospital) => (
                    <option value={hospital.id} key={hospital.id}>
                      {hospital.nombre} · {hospital.ciudad}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo-ui">
                <span>Valor negociado (USD)</span>
                <span className="campo-monetario">
                  <i>$</i>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={valorUSD}
                    onChange={(evento) => {
                      setValorUSD(evento.target.value);
                    }}
                    placeholder="0.00"
                  />
                </span>
                <small>Se enviará como centavos enteros.</small>
              </label>
              <div className="formulario-dos-columnas">
                <label className="campo-ui">
                  <span>Vigente desde</span>
                  <input
                    type="date"
                    value={vigenteDesde}
                    onChange={(evento) => {
                      setVigenteDesde(evento.target.value);
                    }}
                  />
                </label>
                <label className="campo-ui">
                  <span>
                    Vigente hasta <small>(opcional)</small>
                  </span>
                  <input
                    type="date"
                    value={vigenteHasta}
                    onChange={(evento) => {
                      setVigenteHasta(evento.target.value);
                    }}
                  />
                </label>
              </div>
            </div>
            <footer className="drawer__pie">
              <Boton
                type="button"
                variante="secundario"
                onClick={() => {
                  setFormularioAbierto(false);
                }}
              >
                Cancelar
              </Boton>
              <Boton
                type="submit"
                icono="flechaDerecha"
                disabled={
                  procesandoId !== null ||
                  sku === '' ||
                  hospitalId === '' ||
                  valorUSD === '' ||
                  vigenteDesde === ''
                }
              >
                {procesandoId === 'nueva' ? 'Enviando…' : 'Enviar a aprobación'}
              </Boton>
            </footer>
          </form>
        </div>
      )}

      {rechazando !== null && (
        <div
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label={`Rechazar ${rechazando.id}`}
        >
          <button
            type="button"
            className="drawer__fondo"
            aria-label="Cerrar decisión"
            onClick={() => {
              setRechazando(null);
            }}
          />
          <form
            className="drawer__panel drawer__panel--formulario"
            onSubmit={(evento) => {
              evento.preventDefault();
              void rechazar();
            }}
          >
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">Decisión administrativa</p>
                <h2>Rechazar propuesta</h2>
              </div>
              <button
                type="button"
                className="boton-icono"
                aria-label="Cerrar"
                onClick={() => {
                  setRechazando(null);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <div className="drawer__contenido formulario-drawer">
              <div className="resumen-decision">
                <code>{rechazando.sku}</code>
                <strong>{formatearUSD(rechazando.valor)}</strong>
                <span>
                  {hospitalesPorId.get(rechazando.hospitalId)?.nombre ?? rechazando.hospitalId}
                </span>
              </div>
              <label className="campo-ui">
                <span>
                  Motivo del rechazo <small>(opcional)</small>
                </span>
                <textarea
                  value={motivo}
                  onChange={(evento) => {
                    setMotivo(evento.target.value);
                  }}
                  placeholder="Deja una referencia clara para Contabilidad."
                  autoFocus
                />
              </label>
            </div>
            <footer className="drawer__pie">
              <Boton
                type="button"
                variante="secundario"
                onClick={() => {
                  setRechazando(null);
                }}
              >
                Cancelar
              </Boton>
              <Boton type="submit" variante="peligro" disabled={procesandoId !== null}>
                {procesandoId === rechazando.id ? 'Rechazando…' : 'Confirmar rechazo'}
              </Boton>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
