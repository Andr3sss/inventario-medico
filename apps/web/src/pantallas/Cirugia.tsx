import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Factura, Hospital, Pieza } from '@crearcos/core';
import {
  cerrarMaleta,
  componentesDeKit,
  escanearUso,
  listarCatalogo,
  listarHospitales,
  listarMaletas,
  obtenerMaleta,
  obtenerPieza,
  type DetalleMaleta,
  type FilaCatalogo,
  type RespuestaEscaneo,
} from '@crearcos/data';
import { Boton, CargandoPanel, Estado, MensajeEstado, Vacio } from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';
import { Escaner, type ResultadoVisualEscaneo } from '../componentes/Escaner.js';
import { useApp } from '../datos/contexto.js';
import { formatearFecha, mensajeExcepcion } from '../datos/presentacion.js';

function aResultadoVisual(respuesta: RespuestaEscaneo, nombre?: string): ResultadoVisualEscaneo {
  const detalle =
    respuesta.pieza === null
      ? respuesta.mensaje
      : `${respuesta.pieza.codigo}${nombre === undefined ? '' : ` · ${nombre}`}`;
  switch (respuesta.codigo) {
    case 'EXITO':
      return { codigo: respuesta.codigo, titulo: 'Uso registrado', detalle };
    case 'REBOTE_IGNORADO':
      return {
        codigo: respuesta.codigo,
        titulo: 'Lectura duplicada ignorada',
        detalle: 'No se guardó un segundo registro.',
      };
    case 'PIEZA_NO_ENCONTRADA':
      return {
        codigo: respuesta.codigo,
        titulo: 'Código no registrado',
        detalle: respuesta.mensaje,
      };
    case 'ESTADO_INVALIDO':
      return {
        codigo: respuesta.codigo,
        titulo: 'La pieza no puede registrarse como usada',
        detalle: respuesta.mensaje,
      };
    case 'NO_AUTORIZADO':
      return {
        codigo: respuesta.codigo,
        titulo: 'Tu rol no puede registrar el uso',
        detalle: respuesta.mensaje,
      };
  }
}

export function Cirugia(): ReactElement {
  const { db, sesion, ahora } = useApp();
  const [maletas, setMaletas] = useState<readonly DetalleMaleta[]>([]);
  const [seleccionada, setSeleccionada] = useState<DetalleMaleta | null>(null);
  const [catalogo, setCatalogo] = useState<readonly FilaCatalogo[]>([]);
  const [hospitales, setHospitales] = useState<readonly Hospital[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoVisualEscaneo | null>(null);
  const [mensaje, setMensaje] = useState<{
    tipo: 'exito' | 'error' | 'info';
    titulo: string;
    texto?: string;
  } | null>(null);
  const [cierreAbierto, setCierreAbierto] = useState(false);
  const [hospitalId, setHospitalId] = useState('');
  const [kit, setKit] = useState<
    readonly { readonly pieza: Pieza; readonly producto: FilaCatalogo | undefined }[] | null
  >(null);
  const [seleccionKit, setSeleccionKit] = useState<readonly string[]>([]);

  const mapaCatalogo = useMemo(
    () => new Map(catalogo.map((producto) => [producto.sku, producto])),
    [catalogo],
  );

  const cargar = useCallback(
    async (mantenerId?: string): Promise<void> => {
      setCargando(true);
      try {
        const [filas, productos, instituciones] = await Promise.all([
          listarMaletas(db, { estado: 'EN_CIRUGIA' }),
          listarCatalogo(db),
          listarHospitales(db),
        ]);
        const detalles = (
          await Promise.all(filas.map((maleta) => obtenerMaleta(db, maleta.id)))
        ).filter((detalle): detalle is DetalleMaleta => detalle !== undefined);
        setMaletas(detalles);
        setCatalogo(productos);
        setHospitales(instituciones);
        const siguiente =
          detalles.find(({ maleta }) => maleta.id === mantenerId) ?? detalles[0] ?? null;
        setSeleccionada(siguiente);
        const primeraInstitucion = instituciones[0];
        if (primeraInstitucion !== undefined) {
          setHospitalId((actual) => (actual === '' ? primeraInstitucion.id : actual));
        }
      } catch (error) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudieron cargar las cirugías',
          texto: mensajeExcepcion(error),
        });
      } finally {
        setCargando(false);
      }
    },
    [db],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const escanear = async (codigo: string): Promise<void> => {
    if (sesion === null || seleccionada === null) return;
    setProcesando(true);
    setResultado(null);
    try {
      const consultada = await obtenerPieza(db, codigo);
      if (consultada?.pieza.tipo === 'KIT') {
        const componentes = await componentesDeKit(db, consultada.pieza.codigo);
        if (componentes.length > 0) {
          setKit(componentes);
          setSeleccionKit([]);
          setResultado({
            codigo: 'KIT',
            titulo: 'Kit identificado',
            detalle: `${consultada.pieza.codigo} · selecciona únicamente lo utilizado.`,
          });
          return;
        }
      }
      const respuesta = await escanearUso(db, codigo, seleccionada.maleta.id, sesion, { ahora });
      if (!respuesta.ok) {
        setResultado({
          codigo: 'FALLO',
          titulo: 'No se pudo registrar el uso',
          detalle: respuesta.error.mensaje,
        });
        return;
      }
      const producto =
        respuesta.valor.pieza === null ? undefined : mapaCatalogo.get(respuesta.valor.pieza.sku);
      setResultado(aResultadoVisual(respuesta.valor, producto?.nombre));
      if (respuesta.valor.codigo === 'EXITO' && respuesta.valor.pieza !== null) {
        await cargar(seleccionada.maleta.id);
      }
    } catch (error) {
      setResultado({
        codigo: 'FALLO',
        titulo: 'Error al registrar el uso',
        detalle: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const registrarComponentes = async (): Promise<void> => {
    if (sesion === null || seleccionada === null || kit === null) return;
    setProcesando(true);
    let registrados = 0;
    let ultimoError: string | null = null;
    try {
      for (const codigo of seleccionKit) {
        const respuesta = await escanearUso(db, codigo, seleccionada.maleta.id, sesion, { ahora });
        if (respuesta.ok && respuesta.valor.codigo === 'EXITO') registrados += 1;
        else ultimoError = respuesta.ok ? respuesta.valor.mensaje : respuesta.error.mensaje;
      }
      setKit(null);
      setSeleccionKit([]);
      setResultado({
        codigo: ultimoError === null ? 'EXITO' : 'ESTADO_INVALIDO',
        titulo: `${String(registrados)} componentes registrados`,
        detalle: ultimoError ?? 'La selección del kit quedó guardada.',
      });
      await cargar(seleccionada.maleta.id);
    } catch (error) {
      setResultado({
        codigo: 'FALLO',
        titulo: 'No se completó el registro del kit',
        detalle: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const cerrar = async (): Promise<void> => {
    if (sesion === null || seleccionada === null || hospitalId === '') return;
    setProcesando(true);
    setMensaje(null);
    try {
      const respuesta = await cerrarMaleta(db, seleccionada.maleta.id, hospitalId, sesion, {
        ahora,
      });
      if (!respuesta.ok) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudo cerrar la maleta',
          texto: respuesta.error.mensaje,
        });
        return;
      }
      const factura: Factura | null = respuesta.valor.factura;
      setCierreAbierto(false);
      setMensaje(
        factura === null
          ? {
              tipo: 'exito',
              titulo: 'Maleta cerrada sin factura',
              texto: `No hubo piezas utilizadas. ${String(respuesta.valor.piezasReprocesadas)} piezas pasaron a reprocesamiento.`,
            }
          : {
              tipo: 'exito',
              titulo: 'Maleta cerrada y prefactura creada',
              texto: `${factura.id} contiene ${String(factura.lineas.length)} piezas utilizadas.`,
            },
      );
      await cargar();
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo cerrar la maleta',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  if (cargando && seleccionada === null)
    return (
      <section className="panel">
        <CargandoPanel filas={6} />
      </section>
    );
  if (seleccionada === null) {
    return (
      <div className="pagina">
        <div className="cirugia-vacia">
          <Vacio
            icono="cirugia"
            titulo="No hay cirugías activas"
            texto="Las maletas aparecerán aquí después de confirmar su salida de bodega."
          />
          {mensaje !== null && <MensajeEstado {...mensaje} />}
        </div>
      </div>
    );
  }

  const utilizadas = seleccionada.piezas.filter(
    (pieza) => pieza.estado === 'USADA_PENDIENTE_VALORACION',
  );
  return (
    <div className="cirugia-foco">
      {mensaje !== null && <MensajeEstado {...mensaje} />}
      <header className="cirugia-foco__cabecera">
        <div className="cirugia-foco__identidad">
          <span className="cirugia-foco__cruz">
            <Icono nombre="cirugia" tamano={22} />
          </span>
          <span>
            <p className="sobrelinea">Cirugía en curso</p>
            <h1>{seleccionada.maleta.procedimiento ?? 'Procedimiento no especificado'}</h1>
            <p>
              <Icono nombre="maleta" tamano={15} />
              La institución se asignará al cerrar la maleta
            </p>
          </span>
        </div>
        <div className="cirugia-foco__estado">
          <Estado tono="info">En cirugía</Estado>
          <select
            className="selector-maleta"
            value={seleccionada.maleta.id}
            onChange={(evento) => {
              setSeleccionada(
                maletas.find(({ maleta }) => maleta.id === evento.target.value) ?? seleccionada,
              );
            }}
          >
            {maletas.map(({ maleta }) => (
              <option key={maleta.id} value={maleta.id}>
                {maleta.id}
              </option>
            ))}
          </select>
        </div>
      </header>
      <div className="cirugia-foco__metricas">
        <div>
          <span>Utilizados</span>
          <strong>{utilizadas.length}</strong>
          <small>piezas individuales</small>
        </div>
        <div>
          <span>En la maleta</span>
          <strong>{seleccionada.piezas.length}</strong>
          <small>piezas totales</small>
        </div>
        <div>
          <span>Salida confirmada</span>
          <strong className="fecha-metrica">{formatearFecha(seleccionada.maleta.salioEn)}</strong>
          <small>registro local</small>
        </div>
      </div>
      <Escaner
        titulo="Registrar instrumento utilizado"
        ayuda="Escanea únicamente lo que fue utilizado durante el procedimiento."
        resultado={resultado}
        procesando={procesando}
        onEscanear={escanear}
        onLimpiarResultado={() => {
          setResultado(null);
        }}
      />
      <section className="panel utilizados-panel">
        <header className="panel__cabecera">
          <div>
            <p className="sobrelinea">Registro de uso</p>
            <h2>Instrumentos utilizados</h2>
          </div>
          <span className="panel__nota">{utilizadas.length} registros confirmados</span>
        </header>
        {utilizadas.length === 0 ? (
          <Vacio
            icono="scanner"
            titulo="Aún no hay piezas utilizadas"
            texto="Cada escaneo confirmado aparecerá en este registro."
          />
        ) : (
          <div className="utilizados-lista">
            {utilizadas.map((pieza, indice) => {
              const producto = mapaCatalogo.get(pieza.sku);
              return (
                <div className="utilizado" key={pieza.codigo}>
                  <span className="utilizado__check">
                    <Icono nombre="check" tamano={14} />
                  </span>
                  <span className="utilizado__orden">{String(indice + 1).padStart(2, '0')}</span>
                  <span className="utilizado__pieza">
                    <code>{pieza.codigo}</code>
                    <strong>{producto?.nombre ?? pieza.sku}</strong>
                  </span>
                  <span className="utilizado__cantidad">1 un.</span>
                  <span className="estado-dato">Guardado</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <footer className="barra-accion barra-accion--cirugia">
        <span className="guardado-local">
          <Icono nombre="check" tamano={15} />
          <span>
            <strong>Trabajo guardado</strong>
            <small>Disponible incluso sin conexión</small>
          </span>
        </span>
        <div>
          <Boton
            icono="check"
            onClick={() => {
              setCierreAbierto(true);
            }}
          >
            Finalizar cirugía
          </Boton>
        </div>
      </footer>

      {cierreAbierto && (
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Cerrar maleta">
          <button
            className="drawer__fondo"
            type="button"
            aria-label="Cerrar"
            onClick={() => {
              setCierreAbierto(false);
            }}
          />
          <aside className="drawer__panel drawer__panel--formulario">
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">Cierre de {seleccionada.maleta.id}</p>
                <h2>Asignar institución</h2>
              </div>
              <button
                className="boton-icono"
                type="button"
                onClick={() => {
                  setCierreAbierto(false);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <div className="drawer__contenido formulario-drawer">
              <div className="aviso-inline aviso-inline--info">
                <Icono nombre="alerta" />
                <p>
                  Al cerrar, las piezas no utilizadas pasarán a reprocesamiento y se creará una
                  prefactura solo si hubo uso.
                </p>
              </div>
              <label className="campo-ui">
                <span>Institución donde se realizó la cirugía</span>
                <select
                  value={hospitalId}
                  onChange={(evento) => {
                    setHospitalId(evento.target.value);
                  }}
                >
                  <option value="" disabled>
                    Seleccionar institución
                  </option>
                  {hospitales.map((hospital) => (
                    <option key={hospital.id} value={hospital.id}>
                      {hospital.nombre} · {hospital.ciudad}
                    </option>
                  ))}
                </select>
              </label>
              <div className="cierre-resumen">
                <span>
                  <small>Utilizadas</small>
                  <strong>{utilizadas.length}</strong>
                </span>
                <span>
                  <small>A reprocesamiento</small>
                  <strong>{seleccionada.piezas.length - utilizadas.length}</strong>
                </span>
              </div>
            </div>
            <footer className="drawer__pie">
              <Boton
                variante="secundario"
                onClick={() => {
                  setCierreAbierto(false);
                }}
              >
                Cancelar
              </Boton>
              <Boton
                icono="check"
                disabled={procesando || hospitalId === ''}
                onClick={() => {
                  void cerrar();
                }}
              >
                {procesando ? 'Cerrando…' : 'Cerrar maleta'}
              </Boton>
            </footer>
          </aside>
        </div>
      )}

      {kit !== null && (
        <div
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Componentes utilizados del kit"
        >
          <button
            className="drawer__fondo"
            type="button"
            aria-label="Cerrar"
            onClick={() => {
              setKit(null);
            }}
          />
          <aside className="drawer__panel drawer__panel--formulario">
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">Caja o kit</p>
                <h2>¿Qué componentes se utilizaron?</h2>
              </div>
              <button
                className="boton-icono"
                type="button"
                onClick={() => {
                  setKit(null);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <div className="drawer__contenido">
              <p className="texto-ayuda">
                Cada componente tiene su propio código. Selecciona únicamente lo utilizado por el
                doctor.
              </p>
              <div className="selector-kit">
                {kit.map(({ pieza, producto }) => (
                  <label key={pieza.codigo}>
                    <span className="checkbox">
                      <input
                        type="checkbox"
                        checked={seleccionKit.includes(pieza.codigo)}
                        onChange={() => {
                          setSeleccionKit((actual) =>
                            actual.includes(pieza.codigo)
                              ? actual.filter((codigo) => codigo !== pieza.codigo)
                              : [...actual, pieza.codigo],
                          );
                        }}
                      />
                      <span>
                        <Icono nombre="check" tamano={13} />
                      </span>
                    </span>
                    <span>
                      <code>{pieza.codigo}</code>
                      <strong>{producto?.nombre ?? pieza.sku}</strong>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <footer className="drawer__pie">
              <Boton
                variante="secundario"
                onClick={() => {
                  setKit(null);
                }}
              >
                Ninguno
              </Boton>
              <Boton
                icono="check"
                disabled={procesando || seleccionKit.length === 0}
                onClick={() => {
                  void registrarComponentes();
                }}
              >
                Registrar selección
              </Boton>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
