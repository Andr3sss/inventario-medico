import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { maletaId, usuarioId, type EstadoPieza, type Ubicacion } from '@crearcos/core';
import {
  listarConflictos,
  listarUsuariosBasico,
  obtenerConflicto,
  resolverConflicto,
  type ConflictoConPieza,
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
import {
  ETIQUETA_ESTADO_PIEZA,
  formatearFecha,
  mensajeExcepcion,
  ubicacionVisible,
} from '../datos/presentacion.js';

type EstadoResoluble = Extract<
  EstadoPieza,
  | 'EN_BODEGA_CENTRAL'
  | 'EN_BODEGA_INSTRUMENTISTA'
  | 'EN_MALETA_ACTIVA'
  | 'USADA_PENDIENTE_VALORACION'
  | 'EN_REPROCESAMIENTO'
  | 'EXTRAVIADA'
>;

function depurar(detalle: unknown): string {
  if (detalle === undefined) return 'Sin detalle enviado por sincronización';
  try {
    return JSON.stringify(detalle, null, 2);
  } catch {
    return 'El detalle no se puede representar todavía.';
  }
}

export function Conflictos(): ReactElement {
  const { db, sesion, ahora } = useApp();
  const [conflictos, setConflictos] = useState<readonly ConflictoConPieza[]>([]);
  const [seleccionado, setSeleccionado] = useState<ConflictoConPieza | null>(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [estado, setEstado] = useState<EstadoResoluble>('EN_BODEGA_CENTRAL');
  const [tipoUbicacion, setTipoUbicacion] = useState<'CENTRAL' | 'INSTRUMENTISTA'>('CENTRAL');
  const [instrumentistaId, setInstrumentistaId] = useState('');
  const [instrumentistas, setInstrumentistas] = useState<readonly UsuarioBasico[]>([]);
  const [maletaIdTexto, setMaletaIdTexto] = useState('');
  const [motivo, setMotivo] = useState('Etiqueta física duplicada');
  const [motivoOtro, setMotivoOtro] = useState('');
  const [mensaje, setMensaje] = useState<{
    tipo: 'exito' | 'error' | 'info';
    titulo: string;
    texto?: string;
  } | null>(null);

  const cargar = useCallback(
    async (mantenerId?: string): Promise<void> => {
      setCargando(true);
      try {
        const [filas, auxiliares] = await Promise.all([
          listarConflictos(db, { estado: 'ABIERTO' }),
          listarUsuariosBasico(db, { rol: 'AUXILIAR' }),
        ]);
        setConflictos(filas);
        setInstrumentistas(auxiliares);
        setInstrumentistaId((actual) => actual || auxiliares[0]?.usuarioId || '');
        const candidata =
          filas.find(({ conflicto }) => conflicto.conflictoId === mantenerId) ?? filas[0];
        if (candidata === undefined) setSeleccionado(null);
        else
          setSeleccionado(
            (await obtenerConflicto(db, candidata.conflicto.conflictoId)) ?? candidata,
          );
      } catch (error) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudieron cargar los conflictos',
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

  const usuariosPorId = useMemo(
    () => new Map(instrumentistas.map((usuario) => [usuario.usuarioId, usuario.nombre])),
    [instrumentistas],
  );

  const seleccionar = async (caso: ConflictoConPieza): Promise<void> => {
    try {
      setSeleccionado((await obtenerConflicto(db, caso.conflicto.conflictoId)) ?? caso);
      setMensaje(null);
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo abrir el conflicto',
        texto: mensajeExcepcion(error),
      });
    }
  };

  const resolver = async (): Promise<void> => {
    if (sesion === null || seleccionado === null) return;
    const motivoFinal = motivo === 'Otro' ? motivoOtro.trim() : motivo;
    if (motivoFinal === '') {
      setMensaje({ tipo: 'error', titulo: 'Indica el motivo de resolución' });
      return;
    }
    if (tipoUbicacion === 'INSTRUMENTISTA' && instrumentistaId.trim() === '') {
      setMensaje({ tipo: 'error', titulo: 'Selecciona un instrumentista activo' });
      return;
    }
    const ubicacion: Ubicacion =
      tipoUbicacion === 'CENTRAL'
        ? { clase: 'BODEGA_CENTRAL' }
        : { clase: 'BODEGA_INSTRUMENTISTA', usuarioId: usuarioId(instrumentistaId) };
    setProcesando(true);
    setMensaje(null);
    try {
      const respuesta = await resolverConflicto(
        db,
        seleccionado.conflicto.conflictoId,
        {
          estadoAdjudicado: estado,
          ubicacion,
          maletaId: maletaIdTexto.trim() === '' ? null : maletaId(maletaIdTexto),
          motivo: motivoFinal,
        },
        sesion,
        { ahora },
      );
      if (!respuesta.ok) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudo resolver el conflicto',
          texto: respuesta.error.mensaje,
        });
        return;
      }
      setMensaje({
        tipo: 'exito',
        titulo: 'Conflicto resuelto',
        texto: `${respuesta.valor.codigo} quedó en ${ETIQUETA_ESTADO_PIEZA[respuesta.valor.estado].toLocaleLowerCase()}.`,
      });
      await cargar();
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo resolver el conflicto',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="pagina">
      <EncabezadoPagina
        sobrelinea="Control de trazabilidad"
        titulo="Conflictos"
        descripcion="Revisa la información recibida y adjudica manualmente el estado válido de cada pieza."
      />
      {mensaje !== null && <MensajeEstado {...mensaje} />}
      {cargando ? (
        <section className="panel">
          <CargandoPanel filas={6} />
        </section>
      ) : conflictos.length === 0 ? (
        <section className="panel">
          <Vacio
            icono="check"
            titulo="No existen conflictos pendientes"
            texto="Las piezas que requieran resolución manual aparecerán aquí al sincronizar."
          />
        </section>
      ) : (
        <div className="conflictos-layout">
          <aside className="panel conflictos-bandeja">
            <header className="panel__cabecera">
              <h2>Pendientes</h2>
              <span className="contador contador--peligro">{conflictos.length}</span>
            </header>
            <div>
              {conflictos.map((caso) => (
                <button
                  type="button"
                  className={`caso-conflicto${seleccionado?.conflicto.conflictoId === caso.conflicto.conflictoId ? ' activo' : ''}`}
                  key={caso.conflicto.conflictoId}
                  onClick={() => {
                    void seleccionar(caso);
                  }}
                >
                  <span>
                    <code>{caso.conflicto.conflictoId}</code>
                    <time>{formatearFecha(caso.conflicto.detectadoEn)}</time>
                  </span>
                  <strong>{caso.pieza?.sku ?? 'Pieza sin catálogo'}</strong>
                  <small>{caso.conflicto.codigo}</small>
                  <Estado tono="peligro">Ubicación en conflicto</Estado>
                </button>
              ))}
            </div>
          </aside>
          {seleccionado !== null && (
            <section className="panel conflicto-detalle">
              <header className="conflicto-detalle__cabecera">
                <div>
                  <span className="conflicto-detalle__alerta">
                    <Icono nombre="conflicto" />
                  </span>
                  <span>
                    <p className="sobrelinea">
                      {seleccionado.conflicto.conflictoId} ·{' '}
                      {formatearFecha(seleccionado.conflicto.detectadoEn)}
                    </p>
                    <h2>Esta pieza requiere adjudicación manual</h2>
                    <p>
                      El instrumento permanece bloqueado hasta registrar un estado y ubicación
                      válidos.
                    </p>
                  </span>
                </div>
                <Estado tono="peligro">Pendiente</Estado>
              </header>
              <div className="pieza-conflicto">
                <span className="detalle-identidad__icono">
                  <Icono nombre="inventario" />
                </span>
                <span>
                  <code>{seleccionado.conflicto.codigo}</code>
                  <strong>
                    {seleccionado.pieza?.sku ?? 'Pieza no encontrada en este dispositivo'}
                  </strong>
                  <small>
                    {seleccionado.pieza === undefined
                      ? 'Sin estado local disponible'
                      : `${ETIQUETA_ESTADO_PIEZA[seleccionado.pieza.estado]} · ${
                          seleccionado.pieza.ubicacion.clase === 'BODEGA_INSTRUMENTISTA'
                            ? `Bodega · ${usuariosPorId.get(seleccionado.pieza.ubicacion.usuarioId) ?? seleccionado.pieza.ubicacion.usuarioId}`
                            : ubicacionVisible(seleccionado.pieza)
                        }`}
                  </small>
                </span>
              </div>
              <section className="detalle-depuracion">
                <div>
                  <p className="sobrelinea">Información recibida</p>
                  <h3>Detalle de sincronización</h3>
                  <p>
                    Su estructura todavía no es un contrato estable; se muestra sin interpretar.
                  </p>
                </div>
                <pre>{depurar(seleccionado.conflicto.detalle)}</pre>
              </section>
              <div className="resolucion-formulario">
                <div className="resolucion-grid">
                  <label className="campo-ui">
                    <span>Estado adjudicado</span>
                    <select
                      value={estado}
                      onChange={(evento) => {
                        setEstado(evento.target.value as EstadoResoluble);
                      }}
                    >
                      <option value="EN_BODEGA_CENTRAL">En bodega central</option>
                      <option value="EN_BODEGA_INSTRUMENTISTA">En bodega del instrumentista</option>
                      <option value="EN_MALETA_ACTIVA">En maleta activa</option>
                      <option value="USADA_PENDIENTE_VALORACION">
                        Usada · pendiente de valoración
                      </option>
                      <option value="EN_REPROCESAMIENTO">En reprocesamiento</option>
                      <option value="EXTRAVIADA">Extraviada</option>
                    </select>
                  </label>
                  <label className="campo-ui">
                    <span>Ubicación de retorno</span>
                    <select
                      value={tipoUbicacion}
                      onChange={(evento) => {
                        setTipoUbicacion(evento.target.value as 'CENTRAL' | 'INSTRUMENTISTA');
                        if (evento.target.value === 'INSTRUMENTISTA') {
                          setInstrumentistaId(
                            (actual) => actual || instrumentistas[0]?.usuarioId || '',
                          );
                        }
                      }}
                    >
                      <option value="CENTRAL">Bodega central</option>
                      <option value="INSTRUMENTISTA">Bodega del instrumentista</option>
                    </select>
                  </label>
                </div>
                {tipoUbicacion === 'INSTRUMENTISTA' && (
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
                <label className="campo-ui">
                  <span>
                    ID de maleta <small>Solo cuando corresponda</small>
                  </span>
                  <input
                    value={maletaIdTexto}
                    onChange={(evento) => {
                      setMaletaIdTexto(evento.target.value);
                    }}
                    placeholder="Ej. MAL-A1B2C3D4"
                  />
                </label>
                <label className="campo-ui">
                  <span>Motivo de resolución</span>
                  <select
                    value={motivo}
                    onChange={(evento) => {
                      setMotivo(evento.target.value);
                    }}
                  >
                    <option>Etiqueta física duplicada</option>
                    <option>Movimiento offline confirmado físicamente</option>
                    <option>Error de lectura o digitación</option>
                    <option>Otro</option>
                  </select>
                </label>
                {motivo === 'Otro' && (
                  <label className="campo-ui">
                    <span>Describe el motivo</span>
                    <textarea
                      value={motivoOtro}
                      onChange={(evento) => {
                        setMotivoOtro(evento.target.value);
                      }}
                      placeholder="Explica brevemente la decisión…"
                    />
                  </label>
                )}
                <div className="resolucion-acciones">
                  <p>
                    <Icono nombre="alerta" tamano={15} />
                    La resolución quedará registrada en la trazabilidad.
                  </p>
                  <Boton
                    icono="check"
                    disabled={
                      procesando ||
                      (tipoUbicacion === 'INSTRUMENTISTA' && instrumentistas.length === 0)
                    }
                    onClick={() => {
                      void resolver();
                    }}
                  >
                    {procesando ? 'Resolviendo…' : 'Resolver conflicto'}
                  </Boton>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
