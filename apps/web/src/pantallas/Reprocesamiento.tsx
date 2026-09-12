import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { usuarioId, type Pagina, type Pieza, type Ubicacion } from '@crearcos/core';
import {
  finReproceso,
  ingresoReproceso,
  listarCatalogo,
  listarEnReprocesamiento,
  listarUsuariosBasico,
  type FilaCatalogo,
  type UsuarioBasico,
} from '@crearcos/data';
import {
  Boton,
  CargandoPanel,
  EncabezadoPagina,
  Estado,
  MensajeEstado,
  Vacio,
} from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';
import { useApp } from '../datos/contexto.js';
import { mensajeExcepcion } from '../datos/presentacion.js';

const POR_PAGINA = 12;

export function Reprocesamiento(): ReactElement {
  const { db, sesion, ahora } = useApp();
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState<Pagina<Pieza> | null>(null);
  const [catalogo, setCatalogo] = useState<readonly FilaCatalogo[]>([]);
  const [instrumentistas, setInstrumentistas] = useState<readonly UsuarioBasico[]>([]);
  const [seleccionados, setSeleccionados] = useState<readonly string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [destinoAbierto, setDestinoAbierto] = useState(false);
  const [tipoDestino, setTipoDestino] = useState<'CENTRAL' | 'INSTRUMENTISTA'>('CENTRAL');
  const [instrumentistaId, setInstrumentistaId] = useState('');
  const [ingresoAbierto, setIngresoAbierto] = useState(false);
  const [codigoIngreso, setCodigoIngreso] = useState('');
  const [mensaje, setMensaje] = useState<{
    tipo: 'exito' | 'error' | 'info';
    titulo: string;
    texto?: string;
  } | null>(null);

  const mapaCatalogo = useMemo(
    () => new Map(catalogo.map((producto) => [producto.sku, producto])),
    [catalogo],
  );
  const usuariosPorId = useMemo(
    () => new Map(instrumentistas.map((usuario) => [usuario.usuarioId, usuario.nombre])),
    [instrumentistas],
  );

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true);
    try {
      const [piezas, productos, auxiliares] = await Promise.all([
        listarEnReprocesamiento(db, { pagina, porPagina: POR_PAGINA }),
        listarCatalogo(db),
        listarUsuariosBasico(db, { rol: 'AUXILIAR' }),
      ]);
      setResultado(piezas);
      setCatalogo(productos);
      setInstrumentistas(auxiliares);
      setInstrumentistaId((actual) => actual || auxiliares[0]?.usuarioId || '');
      setSeleccionados((actuales) =>
        actuales.filter((codigo) => piezas.items.some((pieza) => pieza.codigo === codigo)),
      );
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo cargar reprocesamiento',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setCargando(false);
    }
  }, [db, pagina]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const alternar = (codigo: string): void => {
    setSeleccionados((actual) =>
      actual.includes(codigo) ? actual.filter((valor) => valor !== codigo) : [...actual, codigo],
    );
  };

  const finalizar = async (): Promise<void> => {
    if (sesion === null || seleccionados.length === 0) return;
    if (tipoDestino === 'INSTRUMENTISTA' && instrumentistaId.trim() === '') {
      setMensaje({
        tipo: 'error',
        titulo: 'Selecciona un instrumentista',
        texto: 'La bodega personal necesita un auxiliar activo como responsable.',
      });
      return;
    }
    const destino: Ubicacion =
      tipoDestino === 'CENTRAL'
        ? { clase: 'BODEGA_CENTRAL' }
        : { clase: 'BODEGA_INSTRUMENTISTA', usuarioId: usuarioId(instrumentistaId) };
    setProcesando(true);
    setMensaje(null);
    let completados = 0;
    const errores: string[] = [];
    try {
      for (const codigo of seleccionados) {
        const respuesta = await finReproceso(db, codigo, destino, sesion, { ahora });
        if (respuesta.ok) completados += 1;
        else errores.push(`${codigo}: ${respuesta.error.mensaje}`);
      }
      setDestinoAbierto(false);
      setSeleccionados([]);
      setMensaje(
        errores.length === 0
          ? {
              tipo: 'exito',
              titulo: 'Reprocesamiento finalizado',
              texto: `${String(completados)} piezas regresaron a su destino.`,
            }
          : {
              tipo: 'error',
              titulo: `${String(completados)} piezas procesadas; ${String(errores.length)} pendientes`,
              texto: errores.join(' · '),
            },
      );
      await cargar();
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo finalizar el reprocesamiento',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const registrarIngreso = async (): Promise<void> => {
    if (sesion === null || codigoIngreso.trim() === '') return;
    setProcesando(true);
    setMensaje(null);
    try {
      const respuesta = await ingresoReproceso(
        db,
        codigoIngreso.trim().toLocaleUpperCase(),
        sesion,
        { ahora },
      );
      if (!respuesta.ok) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudo registrar el ingreso',
          texto: respuesta.error.mensaje,
        });
        return;
      }
      setIngresoAbierto(false);
      setCodigoIngreso('');
      setMensaje({
        tipo: 'exito',
        titulo: 'Pieza recibida',
        texto: `${respuesta.valor.pieza.codigo} ingresó a reprocesamiento.`,
      });
      await cargar();
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo registrar el ingreso',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const totalPaginas =
    resultado === null ? 1 : Math.max(1, Math.ceil(resultado.total / resultado.porPagina));
  return (
    <div className="pagina">
      <EncabezadoPagina
        sobrelinea="Central de esterilización"
        titulo="Reprocesamiento"
        descripcion="Libera cada pieza procesada y registra el destino al que debe regresar."
        acciones={
          <Boton
            icono="mas"
            onClick={() => {
              setIngresoAbierto(true);
            }}
          >
            Ingreso manual
          </Boton>
        }
      />
      {mensaje !== null && <MensajeEstado {...mensaje} />}
      <section className="metricas metricas--tres reproceso-metricas">
        <article className="metrica metrica--horizontal">
          <span className="metrica__icono metrica__icono--aviso">
            <Icono nombre="reloj" />
          </span>
          <span>
            <small>Pendientes</small>
            <strong>{resultado?.total ?? 0}</strong>
          </span>
          <span className="metrica__detalle">Piezas individuales</span>
        </article>
        <article className="metrica metrica--horizontal">
          <span className="metrica__icono metrica__icono--info">
            <Icono nombre="reprocesar" />
          </span>
          <span>
            <small>Seleccionadas</small>
            <strong>{seleccionados.length}</strong>
          </span>
          <span className="metrica__detalle">Para liberar</span>
        </article>
      </section>
      <section className="panel tabla-panel reproceso-panel">
        {seleccionados.length > 0 && (
          <div className="seleccion-multiple">
            <span>
              <strong>{seleccionados.length}</strong>{' '}
              {seleccionados.length === 1 ? 'pieza seleccionada' : 'piezas seleccionadas'}
            </span>
            <div>
              <button
                type="button"
                onClick={() => {
                  setDestinoAbierto(true);
                }}
              >
                Finalizar ciclo
              </button>
              <button
                type="button"
                onClick={() => {
                  setSeleccionados([]);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        {cargando ? (
          <CargandoPanel filas={7} />
        ) : resultado === null || resultado.items.length === 0 ? (
          <Vacio
            icono="reprocesar"
            titulo="No hay elementos esperando reprocesamiento"
            texto="Las piezas no utilizadas aparecerán aquí al cerrar una maleta."
          />
        ) : (
          <>
            <div className="reproceso-lista">
              {resultado.items.map((pieza) => {
                const producto = mapaCatalogo.get(pieza.sku);
                const marcado = seleccionados.includes(pieza.codigo);
                return (
                  <article
                    className={`lote${marcado ? ' lote--seleccionado' : ''}`}
                    key={pieza.codigo}
                  >
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => {
                          alternar(pieza.codigo);
                        }}
                      />
                      <span>
                        <Icono nombre="check" tamano={13} />
                      </span>
                    </label>
                    <div className="lote__identidad">
                      <span className="lote__icono">
                        <Icono nombre="reprocesar" />
                      </span>
                      <span>
                        <code>{pieza.codigo}</code>
                        <strong>{producto?.nombre ?? pieza.sku}</strong>
                        <small>
                          {pieza.tipo} · {pieza.sku}
                        </small>
                      </span>
                    </div>
                    <div className="lote__progreso">
                      <div className="reproceso-estado-lineal">
                        <span className="completo">
                          <i />
                          <small>Recibido</small>
                        </span>
                        <span className="completo">
                          <i />
                          <small>En reprocesamiento</small>
                        </span>
                        <span>
                          <i />
                          <small>Destino pendiente</small>
                        </span>
                      </div>
                    </div>
                    <div className="lote__responsable">
                      <small>Bodega de retorno</small>
                      <strong>
                        {pieza.ubicacion.clase === 'BODEGA_CENTRAL'
                          ? 'Bodega central'
                          : (usuariosPorId.get(pieza.ubicacion.usuarioId) ??
                            pieza.ubicacion.usuarioId)}
                      </strong>
                    </div>
                    <Estado tono="violeta">Pendiente</Estado>
                    <button
                      type="button"
                      className="boton-icono"
                      aria-label={`Finalizar ${pieza.codigo}`}
                      onClick={() => {
                        setSeleccionados([pieza.codigo]);
                        setDestinoAbierto(true);
                      }}
                    >
                      <Icono nombre="chevron" tamano={16} />
                    </button>
                  </article>
                );
              })}
            </div>
            <footer className="paginacion">
              <span>{resultado.total} piezas pendientes</span>
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

      {destinoAbierto && (
        <div
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Finalizar reprocesamiento"
        >
          <button
            className="drawer__fondo"
            type="button"
            aria-label="Cerrar"
            onClick={() => {
              setDestinoAbierto(false);
            }}
          />
          <aside className="drawer__panel drawer__panel--formulario">
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">{seleccionados.length} piezas</p>
                <h2>Elegir destino</h2>
              </div>
              <button
                className="boton-icono"
                type="button"
                onClick={() => {
                  setDestinoAbierto(false);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <div className="drawer__contenido formulario-drawer">
              <label className="opcion-destino">
                <input
                  type="radio"
                  name="destino"
                  checked={tipoDestino === 'CENTRAL'}
                  onChange={() => {
                    setTipoDestino('CENTRAL');
                  }}
                />
                <span className="opcion-destino__icono">
                  <Icono nombre="inventario" />
                </span>
                <span>
                  <strong>Bodega central</strong>
                  <small>Disponible para nuevas operaciones</small>
                </span>
              </label>
              <label className="opcion-destino">
                <input
                  type="radio"
                  name="destino"
                  checked={tipoDestino === 'INSTRUMENTISTA'}
                  onChange={() => {
                    setTipoDestino('INSTRUMENTISTA');
                    setInstrumentistaId((actual) => actual || instrumentistas[0]?.usuarioId || '');
                  }}
                />
                <span className="opcion-destino__icono">
                  <Icono nombre="usuarios" />
                </span>
                <span>
                  <strong>Bodega del instrumentista</strong>
                  <small>Asignar a una bodega personal</small>
                </span>
              </label>
              {tipoDestino === 'INSTRUMENTISTA' && (
                <label className="campo-ui">
                  <span>Instrumentista responsable</span>
                  <select
                    value={instrumentistaId}
                    disabled={instrumentistas.length === 0}
                    onChange={(evento) => {
                      setInstrumentistaId(evento.target.value);
                    }}
                  >
                    <option value="" disabled>
                      {instrumentistas.length === 0
                        ? 'No hay auxiliares activos'
                        : 'Selecciona un instrumentista'}
                    </option>
                    {instrumentistas.map((instrumentista) => (
                      <option value={instrumentista.usuarioId} key={instrumentista.usuarioId}>
                        {instrumentista.nombre} · {instrumentista.usuarioId}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="aviso-inline aviso-inline--info">
                <Icono nombre="alerta" />
                <p>El destino se registrará en la trazabilidad individual de cada pieza.</p>
              </div>
            </div>
            <footer className="drawer__pie">
              <Boton
                variante="secundario"
                onClick={() => {
                  setDestinoAbierto(false);
                }}
              >
                Cancelar
              </Boton>
              <Boton
                icono="check"
                disabled={
                  procesando || (tipoDestino === 'INSTRUMENTISTA' && instrumentistas.length === 0)
                }
                onClick={() => {
                  void finalizar();
                }}
              >
                {procesando ? 'Guardando…' : 'Confirmar destino'}
              </Boton>
            </footer>
          </aside>
        </div>
      )}

      {ingresoAbierto && (
        <div
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Ingreso manual a reprocesamiento"
        >
          <button
            className="drawer__fondo"
            type="button"
            aria-label="Cerrar"
            onClick={() => {
              setIngresoAbierto(false);
            }}
          />
          <aside className="drawer__panel drawer__panel--formulario">
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">Recepción</p>
                <h2>Ingresar pieza suelta</h2>
              </div>
              <button
                className="boton-icono"
                type="button"
                onClick={() => {
                  setIngresoAbierto(false);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <div className="drawer__contenido formulario-drawer">
              <label className="campo-ui">
                <span>Código de pieza</span>
                <input
                  autoFocus
                  value={codigoIngreso}
                  onChange={(evento) => {
                    setCodigoIngreso(evento.target.value);
                  }}
                  placeholder="Escanea o escribe el código"
                />
              </label>
              <p className="texto-ayuda">
                Utiliza esta acción para una pieza recuperada fuera del cierre normal de una maleta.
              </p>
            </div>
            <footer className="drawer__pie">
              <Boton
                variante="secundario"
                onClick={() => {
                  setIngresoAbierto(false);
                }}
              >
                Cancelar
              </Boton>
              <Boton
                icono="reprocesar"
                disabled={procesando || codigoIngreso.trim() === ''}
                onClick={() => {
                  void registrarIngreso();
                }}
              >
                {procesando ? 'Registrando…' : 'Registrar ingreso'}
              </Boton>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
