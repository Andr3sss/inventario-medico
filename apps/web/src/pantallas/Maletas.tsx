import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { EstadoMaleta, Hospital, Maleta, Pieza } from '@crearcos/core';
import {
  componentesDeKit,
  confirmarSalidaMaleta,
  crearMaleta,
  escanearArmado,
  listarCatalogo,
  listarHospitales,
  listarMaletas,
  listarUsuariosBasico,
  obtenerMaleta,
  obtenerPieza,
  retirarDeArmado,
  type DetalleMaleta,
  type FilaCatalogo,
  type RespuestaEscaneo,
  type UsuarioBasico,
} from '@crearcos/data';
import {
  Avatar,
  Boton,
  CargandoPanel,
  EncabezadoPagina,
  Estado,
  MensajeEstado,
  Vacio,
} from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';
import { Escaner, type ResultadoVisualEscaneo } from '../componentes/Escaner.js';
import { useApp } from '../datos/contexto.js';
import {
  ETIQUETA_ESTADO_MALETA,
  TONO_ESTADO_MALETA,
  formatearFecha,
  mensajeExcepcion,
} from '../datos/presentacion.js';

interface MaletaConConteo {
  readonly maleta: Maleta;
  readonly piezas: number;
}

interface SelectorKit {
  readonly codigo: string;
  readonly piezas: readonly {
    readonly pieza: Pieza;
    readonly producto: FilaCatalogo | undefined;
  }[];
}

function resultadoVisual(respuesta: RespuestaEscaneo, nombre?: string): ResultadoVisualEscaneo {
  const referencia =
    respuesta.pieza === null
      ? respuesta.mensaje
      : `${respuesta.pieza.codigo}${nombre === undefined ? '' : ` · ${nombre}`}`;
  switch (respuesta.codigo) {
    case 'EXITO':
      return { codigo: respuesta.codigo, titulo: 'Instrumento agregado', detalle: referencia };
    case 'REBOTE_IGNORADO':
      return {
        codigo: respuesta.codigo,
        titulo: 'Lectura duplicada ignorada',
        detalle: 'El lector envió dos veces el mismo código. No se realizaron cambios.',
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
        titulo: 'El instrumento no está disponible',
        detalle: respuesta.mensaje,
      };
    case 'NO_AUTORIZADO':
      return {
        codigo: respuesta.codigo,
        titulo: 'Tu rol no puede registrar esta pieza',
        detalle: respuesta.mensaje,
      };
  }
}

export function Maletas(): ReactElement {
  const { db, sesion, ahora } = useApp();
  const [maletas, setMaletas] = useState<readonly MaletaConConteo[]>([]);
  const [catalogo, setCatalogo] = useState<readonly FilaCatalogo[]>([]);
  const [hospitales, setHospitales] = useState<readonly Hospital[]>([]);
  const [usuarios, setUsuarios] = useState<readonly UsuarioBasico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'ACTIVAS' | EstadoMaleta>('ACTIVAS');
  const [armando, setArmando] = useState<DetalleMaleta | null>(null);
  const [resultado, setResultado] = useState<ResultadoVisualEscaneo | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [procedimiento, setProcedimiento] = useState('');
  const [mensajeAccion, setMensajeAccion] = useState<{
    tipo: 'exito' | 'error' | 'info';
    titulo: string;
    texto?: string;
  } | null>(null);
  const [kit, setKit] = useState<SelectorKit | null>(null);
  const [seleccionKit, setSeleccionKit] = useState<readonly string[]>([]);

  const mapaCatalogo = useMemo(
    () => new Map(catalogo.map((producto) => [producto.sku, producto])),
    [catalogo],
  );
  const hospitalesPorId = useMemo(
    () => new Map(hospitales.map((hospital) => [hospital.id, hospital.nombre])),
    [hospitales],
  );
  const usuariosPorId = useMemo(
    () => new Map(usuarios.map((usuario) => [usuario.usuarioId, usuario.nombre])),
    [usuarios],
  );

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const [filas, productos, instituciones, personas] = await Promise.all([
        listarMaletas(db),
        listarCatalogo(db),
        listarHospitales(db),
        listarUsuariosBasico(db, { incluirInactivos: true }),
      ]);
      const detalles = await Promise.all(
        filas.map(async (maleta) => ({
          maleta,
          piezas: (await obtenerMaleta(db, maleta.id))?.piezas.length ?? 0,
        })),
      );
      setMaletas(detalles);
      setCatalogo(productos);
      setHospitales(instituciones);
      setUsuarios(personas);
    } catch (error) {
      setErrorCarga(mensajeExcepcion(error));
    } finally {
      setCargando(false);
    }
  }, [db]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = maletas.filter(({ maleta }) =>
    filtro === 'ACTIVAS'
      ? maleta.estado === 'EN_ARMADO' || maleta.estado === 'EN_CIRUGIA'
      : maleta.estado === filtro,
  );
  const enArmado = maletas.filter(({ maleta }) => maleta.estado === 'EN_ARMADO').length;
  const enCirugia = maletas.filter(({ maleta }) => maleta.estado === 'EN_CIRUGIA').length;
  const cerradas = maletas.filter(({ maleta }) => maleta.estado === 'CERRADA').length;

  const refrescarDetalle = async (maletaId: string): Promise<void> => {
    const detalle = await obtenerMaleta(db, maletaId);
    if (detalle !== undefined) setArmando(detalle);
  };

  const abrirMaleta = async (maleta: Maleta): Promise<void> => {
    setMensajeAccion(null);
    try {
      const detalle = await obtenerMaleta(db, maleta.id);
      if (detalle === undefined) {
        setMensajeAccion({
          tipo: 'error',
          titulo: 'Maleta no encontrada',
          texto: 'El registro ya no existe en este dispositivo.',
        });
        return;
      }
      setArmando(detalle);
    } catch (error) {
      setMensajeAccion({
        tipo: 'error',
        titulo: 'No se pudo abrir la maleta',
        texto: mensajeExcepcion(error),
      });
    }
  };

  const crear = async (): Promise<void> => {
    if (sesion === null) return;
    setProcesando(true);
    setMensajeAccion(null);
    try {
      const respuesta = await crearMaleta(
        db,
        {
          responsableId: sesion.usuarioId,
          procedimiento: procedimiento.trim() === '' ? null : procedimiento.trim(),
        },
        sesion,
        { ahora },
      );
      if (!respuesta.ok) {
        setMensajeAccion({
          tipo: 'error',
          titulo: 'No se pudo crear la maleta',
          texto: respuesta.error.mensaje,
        });
        return;
      }
      setCrearAbierto(false);
      setProcedimiento('');
      await cargar();
      await abrirMaleta(respuesta.valor);
    } catch (error) {
      setMensajeAccion({
        tipo: 'error',
        titulo: 'No se pudo crear la maleta',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const escanear = async (codigo: string): Promise<void> => {
    if (sesion === null || armando === null) return;
    setProcesando(true);
    setResultado(null);
    try {
      const consultada = await obtenerPieza(db, codigo);
      if (consultada?.pieza.tipo === 'KIT') {
        const componentes = await componentesDeKit(db, consultada.pieza.codigo);
        if (componentes.length > 0) {
          setKit({ codigo: consultada.pieza.codigo, piezas: componentes });
          setSeleccionKit([]);
          setResultado({
            codigo: 'KIT',
            titulo: 'Kit identificado',
            detalle: `${consultada.pieza.codigo} · selecciona sus componentes.`,
          });
          return;
        }
      }
      const respuesta = await escanearArmado(db, codigo, armando.maleta.id, sesion, { ahora });
      if (!respuesta.ok) {
        setResultado({
          codigo: 'FALLO',
          titulo: 'No se pudo registrar el escaneo',
          detalle: respuesta.error.mensaje,
        });
        return;
      }
      const producto =
        respuesta.valor.pieza === null ? undefined : mapaCatalogo.get(respuesta.valor.pieza.sku);
      setResultado(resultadoVisual(respuesta.valor, producto?.nombre));
      if (respuesta.valor.codigo === 'EXITO' && respuesta.valor.pieza !== null) {
        await refrescarDetalle(armando.maleta.id);
        await cargar();
      }
    } catch (error) {
      setResultado({
        codigo: 'FALLO',
        titulo: 'Error al registrar el escaneo',
        detalle: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const retirar = async (codigo: string): Promise<void> => {
    if (sesion === null || armando === null) return;
    setProcesando(true);
    try {
      const respuesta = await retirarDeArmado(db, codigo, sesion, { ahora });
      if (!respuesta.ok) {
        setResultado({
          codigo: 'FALLO',
          titulo: 'No se pudo retirar la pieza',
          detalle: respuesta.error.mensaje,
        });
      } else {
        const nombre =
          respuesta.valor.pieza === null
            ? undefined
            : mapaCatalogo.get(respuesta.valor.pieza.sku)?.nombre;
        const visual = resultadoVisual(respuesta.valor, nombre);
        setResultado({
          ...visual,
          titulo: respuesta.valor.codigo === 'EXITO' ? 'Instrumento retirado' : visual.titulo,
        });
      }
      await refrescarDetalle(armando.maleta.id);
      await cargar();
    } catch (error) {
      setResultado({
        codigo: 'FALLO',
        titulo: 'No se pudo retirar la pieza',
        detalle: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const agregarComponentes = async (): Promise<void> => {
    if (sesion === null || armando === null || kit === null) return;
    setProcesando(true);
    let agregados = 0;
    let ultimoError: string | null = null;
    try {
      for (const codigo of seleccionKit) {
        const respuesta = await escanearArmado(db, codigo, armando.maleta.id, sesion, { ahora });
        if (respuesta.ok && respuesta.valor.codigo === 'EXITO') agregados += 1;
        else ultimoError = respuesta.ok ? respuesta.valor.mensaje : respuesta.error.mensaje;
      }
      setKit(null);
      setSeleccionKit([]);
      setResultado({
        codigo: ultimoError === null ? 'EXITO' : 'ESTADO_INVALIDO',
        titulo: `${String(agregados)} componentes agregados`,
        detalle: ultimoError ?? `Selección del kit ${kit.codigo} guardada en este dispositivo.`,
      });
      await refrescarDetalle(armando.maleta.id);
      await cargar();
    } catch (error) {
      setResultado({
        codigo: 'FALLO',
        titulo: 'No se completó la selección del kit',
        detalle: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const confirmarSalida = async (): Promise<void> => {
    if (sesion === null || armando === null) return;
    setProcesando(true);
    setMensajeAccion(null);
    try {
      const respuesta = await confirmarSalidaMaleta(db, armando.maleta.id, sesion, { ahora });
      if (!respuesta.ok) {
        setMensajeAccion({
          tipo: 'error',
          titulo: 'No se pudo confirmar la salida',
          texto: respuesta.error.mensaje,
        });
        return;
      }
      setArmando(null);
      setMensajeAccion({
        tipo: 'exito',
        titulo: 'Salida confirmada',
        texto: `${String(respuesta.valor.piezasConfirmadas)} piezas pasaron a maleta activa.`,
      });
      await cargar();
    } catch (error) {
      setMensajeAccion({
        tipo: 'error',
        titulo: 'No se pudo confirmar la salida',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  if (armando !== null) {
    const piezas = armando.piezas;
    return (
      <div className="pagina pagina--armado">
        <button
          type="button"
          className="volver"
          onClick={() => {
            setArmando(null);
          }}
        >
          <Icono nombre="flecha" />
          Volver a maletas
        </button>
        <header className="cabecera-operacion">
          <div>
            <span className="cabecera-operacion__codigo">
              <Icono nombre="maleta" />
              <code>{armando.maleta.id}</code>
              <Estado tono={TONO_ESTADO_MALETA[armando.maleta.estado]}>
                {ETIQUETA_ESTADO_MALETA[armando.maleta.estado]}
              </Estado>
            </span>
            <h1>{armando.maleta.procedimiento ?? 'Maleta sin procedimiento'}</h1>
            <p>
              <Icono nombre="reloj" tamano={15} />
              Creada {formatearFecha(armando.maleta.creadaEn)}
              {armando.maleta.hospitalId !== null && (
                <>
                  <span aria-hidden="true">·</span>
                  <Icono nombre="hospital" tamano={15} />
                  {hospitalesPorId.get(armando.maleta.hospitalId) ?? armando.maleta.hospitalId}
                </>
              )}
            </p>
          </div>
          <div className="progreso-piezas">
            <span>
              <small>Contenido actual</small>
              <strong>{piezas.length}</strong>
            </span>
            <div>
              <i style={{ width: piezas.length === 0 ? '0%' : '100%' }} />
            </div>
            <small>
              {piezas.length === 0 ? 'Aún no hay piezas' : 'Registro confirmado localmente'}
            </small>
          </div>
        </header>
        <div
          className={`armado-grid${armando.maleta.estado === 'EN_ARMADO' ? '' : ' armado-grid--lectura'}`}
        >
          {armando.maleta.estado === 'EN_ARMADO' && (
            <div className="armado-grid__principal">
              <Escaner
                resultado={resultado}
                procesando={procesando}
                onEscanear={escanear}
                onLimpiarResultado={() => {
                  setResultado(null);
                }}
              />
              {mensajeAccion !== null && <MensajeEstado {...mensajeAccion} />}
              {resultado?.codigo === 'EXITO' && resultado.detalle !== '' && (
                <section className="panel ultimo-escaneo">
                  <header className="panel__cabecera">
                    <div>
                      <p className="sobrelinea">Último escaneo confirmado</p>
                      <h2>Elemento guardado</h2>
                    </div>
                    <Estado tono="exito">
                      <Icono nombre="check" tamano={13} /> Verificado
                    </Estado>
                  </header>
                  <div className="ultimo-escaneo__pieza">
                    <span className="detalle-identidad__icono">
                      <Icono nombre="inventario" />
                    </span>
                    <span>
                      <strong>{resultado.detalle}</strong>
                      <small>Disponible en este dispositivo</small>
                    </span>
                  </div>
                </section>
              )}
            </div>
          )}
          <aside className="panel contenido-maleta">
            <header className="panel__cabecera">
              <div>
                <p className="sobrelinea">Contenido real</p>
                <h2>
                  {piezas.length} {piezas.length === 1 ? 'pieza agregada' : 'piezas agregadas'}
                </h2>
              </div>
            </header>
            {piezas.length === 0 ? (
              <Vacio
                icono={armando.maleta.estado === 'EN_ARMADO' ? 'scanner' : 'maleta'}
                titulo={
                  armando.maleta.estado === 'EN_ARMADO'
                    ? 'La maleta está vacía'
                    : 'No se registraron piezas'
                }
                texto={
                  armando.maleta.estado === 'EN_ARMADO'
                    ? 'Escanea la primera pieza para comenzar el armado.'
                    : 'Esta operación no tiene contenido registrado en el dispositivo.'
                }
              />
            ) : (
              <div className="contenido-maleta__lista">
                {piezas.map((pieza, indice) => {
                  const producto = mapaCatalogo.get(pieza.sku);
                  return (
                    <div className="pieza-agregada" key={pieza.codigo}>
                      <span className="pieza-agregada__orden">
                        {String(indice + 1).padStart(2, '0')}
                      </span>
                      <span>
                        <code>{pieza.codigo}</code>
                        <strong>{producto?.nombre ?? pieza.sku}</strong>
                        <small>{pieza.tipo}</small>
                      </span>
                      {armando.maleta.estado === 'EN_ARMADO' && (
                        <button
                          type="button"
                          disabled={procesando}
                          className="boton-icono boton-icono--sutil"
                          aria-label={`Retirar ${producto?.nombre ?? pieza.codigo}`}
                          onClick={() => {
                            void retirar(pieza.codigo);
                          }}
                        >
                          <Icono nombre="cerrar" tamano={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
        <footer className="barra-accion">
          <span>
            <Avatar
              nombre={
                usuariosPorId.get(armando.maleta.responsableId) ?? armando.maleta.responsableId
              }
              pequeno
            />
            <span>
              <small>Responsable</small>
              <strong>
                {usuariosPorId.get(armando.maleta.responsableId) ??
                  (sesion?.usuarioId === armando.maleta.responsableId
                    ? sesion.nombre
                    : armando.maleta.responsableId)}
              </strong>
            </span>
          </span>
          <div>
            <Boton
              variante="secundario"
              onClick={() => {
                setArmando(null);
              }}
            >
              {armando.maleta.estado === 'EN_ARMADO' ? 'Guardar y salir' : 'Cerrar detalle'}
            </Boton>
            {armando.maleta.estado === 'EN_ARMADO' && (
              <Boton
                icono="check"
                disabled={procesando || piezas.length === 0}
                onClick={() => {
                  void confirmarSalida();
                }}
              >
                {procesando ? 'Confirmando…' : 'Confirmar salida'}
              </Boton>
            )}
          </div>
        </footer>

        {kit !== null && (
          <div className="drawer" role="dialog" aria-modal="true" aria-label="Componentes del kit">
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
                  <p className="sobrelinea">Kit {kit.codigo}</p>
                  <h2>Selecciona sus componentes</h2>
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
                  El kit agrupa piezas con código propio. Marca únicamente las que viajarán en esta
                  maleta.
                </p>
                <div className="selector-kit">
                  {kit.piezas.map(({ pieza, producto }) => (
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
                  Omitir
                </Boton>
                <Boton
                  icono="check"
                  disabled={procesando || seleccionKit.length === 0}
                  onClick={() => {
                    void agregarComponentes();
                  }}
                >
                  Agregar selección
                </Boton>
              </footer>
            </aside>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pagina">
      <EncabezadoPagina
        sobrelinea="Operaciones quirúrgicas"
        titulo="Maletas"
        descripcion="Prepara, verifica y acompaña cada maleta durante todo su recorrido."
        acciones={
          <Boton
            icono="mas"
            onClick={() => {
              setCrearAbierto(true);
            }}
          >
            Nueva maleta
          </Boton>
        }
      />
      {mensajeAccion !== null && <MensajeEstado {...mensajeAccion} />}
      <section className="metricas metricas--tres">
        <article className="metrica metrica--horizontal">
          <span className="metrica__icono metrica__icono--aviso">
            <Icono nombre="maleta" />
          </span>
          <span>
            <small>En armado</small>
            <strong>{enArmado}</strong>
          </span>
          <span className="metrica__detalle">Pendientes de salida</span>
        </article>
        <article className="metrica metrica--horizontal">
          <span className="metrica__icono metrica__icono--info">
            <Icono nombre="cirugia" />
          </span>
          <span>
            <small>En cirugía</small>
            <strong>{enCirugia}</strong>
          </span>
          <span className="metrica__detalle">Fuera de bodega</span>
        </article>
        <article className="metrica metrica--horizontal">
          <span className="metrica__icono metrica__icono--exito">
            <Icono nombre="check" />
          </span>
          <span>
            <small>Cerradas</small>
            <strong>{cerradas}</strong>
          </span>
          <span className="metrica__detalle">En este dispositivo</span>
        </article>
      </section>
      <section className="panel maletas-panel">
        <div className="tabs-bar">
          <div className="tabs">
            <button
              type="button"
              className={filtro === 'ACTIVAS' ? 'activo' : ''}
              onClick={() => {
                setFiltro('ACTIVAS');
              }}
            >
              Activas <span>{enArmado + enCirugia}</span>
            </button>
            <button
              type="button"
              className={filtro === 'EN_ARMADO' ? 'activo' : ''}
              onClick={() => {
                setFiltro('EN_ARMADO');
              }}
            >
              En armado
            </button>
            <button
              type="button"
              className={filtro === 'EN_CIRUGIA' ? 'activo' : ''}
              onClick={() => {
                setFiltro('EN_CIRUGIA');
              }}
            >
              En cirugía
            </button>
            <button
              type="button"
              className={filtro === 'CERRADA' ? 'activo' : ''}
              onClick={() => {
                setFiltro('CERRADA');
              }}
            >
              Cerradas
            </button>
          </div>
        </div>
        {cargando ? (
          <CargandoPanel filas={4} />
        ) : errorCarga !== null ? (
          <MensajeEstado
            tipo="error"
            titulo="No se pudieron cargar las maletas"
            texto={errorCarga}
          />
        ) : visibles.length === 0 ? (
          <Vacio
            icono="maleta"
            titulo="No hay maletas en este estado"
            texto="Crea una nueva maleta o cambia el filtro para revisar el historial local."
          />
        ) : (
          <div className="maletas-lista">
            {visibles.map(({ maleta, piezas }) => (
              <article className="maleta-fila" key={maleta.id}>
                <div className="maleta-fila__identidad">
                  <span
                    className={`maleta-fila__icono maleta-fila__icono--${TONO_ESTADO_MALETA[maleta.estado]}`}
                  >
                    <Icono nombre="maleta" />
                  </span>
                  <span>
                    <code>{maleta.id}</code>
                    <strong>{maleta.procedimiento ?? 'Sin procedimiento'}</strong>
                    <small>
                      <Icono nombre="reloj" tamano={14} />
                      {formatearFecha(maleta.creadaEn)}
                    </small>
                  </span>
                </div>
                <div className="maleta-fila__dato">
                  <small>Responsable</small>
                  <span>
                    <Avatar
                      nombre={
                        usuariosPorId.get(maleta.responsableId) ??
                        (sesion?.usuarioId === maleta.responsableId
                          ? sesion.nombre
                          : maleta.responsableId)
                      }
                      pequeno
                    />
                    {usuariosPorId.get(maleta.responsableId) ??
                      (sesion?.usuarioId === maleta.responsableId
                        ? sesion.nombre
                        : maleta.responsableId)}
                  </span>
                </div>
                <div className="maleta-fila__dato">
                  <small>Institución</small>
                  <strong>
                    {maleta.hospitalId === null
                      ? 'Se asigna al cierre'
                      : (hospitalesPorId.get(maleta.hospitalId) ?? maleta.hospitalId)}
                  </strong>
                </div>
                <div className="maleta-fila__contenido">
                  <span>
                    <small>Contenido</small>
                    <strong>{piezas}</strong>
                  </span>
                  <div>
                    <i style={{ width: piezas === 0 ? '0%' : '100%' }} />
                  </div>
                </div>
                <Estado tono={TONO_ESTADO_MALETA[maleta.estado]}>
                  {ETIQUETA_ESTADO_MALETA[maleta.estado]}
                </Estado>
                <Boton
                  variante="secundario"
                  onClick={() => {
                    void abrirMaleta(maleta);
                  }}
                >
                  {maleta.estado === 'EN_ARMADO' ? 'Continuar armado' : 'Ver detalle'}
                </Boton>
              </article>
            ))}
          </div>
        )}
      </section>

      {crearAbierto && (
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Nueva maleta">
          <button
            className="drawer__fondo"
            type="button"
            aria-label="Cerrar"
            onClick={() => {
              setCrearAbierto(false);
            }}
          />
          <aside className="drawer__panel drawer__panel--formulario">
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">Nueva operación</p>
                <h2>Crear maleta</h2>
              </div>
              <button
                className="boton-icono"
                type="button"
                onClick={() => {
                  setCrearAbierto(false);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <form
              className="drawer__contenido formulario-drawer"
              onSubmit={(evento) => {
                evento.preventDefault();
                void crear();
              }}
            >
              <label className="campo-ui">
                <span>
                  Procedimiento <small>Opcional</small>
                </span>
                <input
                  value={procedimiento}
                  onChange={(evento) => {
                    setProcedimiento(evento.target.value);
                  }}
                  placeholder="Ej. Osteosíntesis de radio"
                />
              </label>
              <div className="aviso-inline aviso-inline--info">
                <Icono nombre="alerta" />
                <p>La institución se asignará cuando la maleta regrese de cirugía.</p>
              </div>
              <div className="campo-ui">
                <span>Responsable</span>
                <div className="responsable-fijo">
                  <Avatar nombre={sesion?.nombre ?? ''} pequeno />
                  <strong>{sesion?.nombre}</strong>
                  <code>{sesion?.usuarioId}</code>
                </div>
              </div>
            </form>
            <footer className="drawer__pie">
              <Boton
                variante="secundario"
                onClick={() => {
                  setCrearAbierto(false);
                }}
              >
                Cancelar
              </Boton>
              <Boton
                icono="mas"
                disabled={procesando}
                onClick={() => {
                  void crear();
                }}
              >
                {procesando ? 'Creando…' : 'Crear y comenzar'}
              </Boton>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
