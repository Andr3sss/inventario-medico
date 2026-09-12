import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Factura, Maleta } from '@crearcos/core';
import {
  contarPiezasPorEstado,
  listarConflictos,
  listarFacturas,
  listarMaletas,
  listarUsuariosBasico,
  type ConflictoConPieza,
  type UsuarioBasico,
} from '@crearcos/data';
import {
  CargandoPanel,
  Boton,
  EncabezadoPagina,
  Estado,
  MensajeEstado,
  Vacio,
  type TonoEstado,
} from '../componentes/UI.js';
import { Icono, type NombreIcono } from '../componentes/Icono.js';
import { ExcepcionesPrecio } from '../componentes/ExcepcionesPrecio.js';
import { GestorFreelance } from '../componentes/GestorFreelance.js';
import {
  ETIQUETA_ESTADO_MALETA,
  TONO_ESTADO_MALETA,
  formatearFecha,
  mensajeExcepcion,
} from '../datos/presentacion.js';
import { useApp } from '../datos/contexto.js';

interface DatosTablero {
  readonly total: number;
  readonly enBodega: number;
  readonly fueraBodega: number;
  readonly reproceso: number;
  readonly conflictosPiezas: number;
  readonly otros: number;
  readonly maletas: readonly Maleta[];
  readonly conflictos: readonly ConflictoConPieza[];
  readonly facturas: readonly Factura[];
  readonly usuarios: readonly UsuarioBasico[];
}

const DATOS_VACIOS: DatosTablero = {
  total: 0,
  enBodega: 0,
  fueraBodega: 0,
  reproceso: 0,
  conflictosPiezas: 0,
  otros: 0,
  maletas: [],
  conflictos: [],
  facturas: [],
  usuarios: [],
};

function Metrica({
  etiqueta,
  valor,
  detalle,
  tono,
  icono,
}: {
  readonly etiqueta: string;
  readonly valor: number;
  readonly detalle: string;
  readonly tono: TonoEstado;
  readonly icono: NombreIcono;
}): ReactElement {
  return (
    <article className="metrica">
      <div className="metrica__cabecera">
        <span>{etiqueta}</span>
        <span className={`metrica__icono metrica__icono--${tono}`}>
          <Icono nombre={icono} />
        </span>
      </div>
      <strong className="metrica__valor">{valor}</strong>
      <span className="metrica__detalle">
        <span className={`punto punto--${tono}`} />
        {detalle}
      </span>
    </article>
  );
}

export function Tablero(): ReactElement {
  const { db, ahora, sesion } = useApp();
  const [datos, setDatos] = useState<DatosTablero>(DATOS_VACIOS);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maletaFreelance, setMaletaFreelance] = useState<Maleta | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true);
    setError(null);
    try {
      const [conteo, maletas, conflictos, facturas, usuarios] = await Promise.all([
        contarPiezasPorEstado(db),
        listarMaletas(db),
        listarConflictos(db, { estado: 'ABIERTO' }),
        listarFacturas(db, { estado: 'BORRADOR' }),
        listarUsuariosBasico(db, { incluirInactivos: true }),
      ]);
      const total = Object.values(conteo).reduce((suma, cantidad) => suma + cantidad, 0);
      const enBodega = conteo.EN_BODEGA_CENTRAL + conteo.EN_BODEGA_INSTRUMENTISTA;
      const fueraBodega =
        conteo.ASIGNADA_A_MALETA + conteo.EN_MALETA_ACTIVA + conteo.USADA_PENDIENTE_VALORACION;
      const conocidos = enBodega + fueraBodega + conteo.EN_REPROCESAMIENTO + conteo.EN_CONFLICTO;
      setDatos({
        total,
        enBodega,
        fueraBodega,
        reproceso: conteo.EN_REPROCESAMIENTO,
        conflictosPiezas: conteo.EN_CONFLICTO,
        otros: Math.max(0, total - conocidos),
        maletas,
        conflictos,
        facturas,
        usuarios,
      });
    } catch (excepcion) {
      setError(mensajeExcepcion(excepcion));
    } finally {
      setCargando(false);
    }
  }, [db]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const operaciones = datos.maletas
    .filter((maleta) => maleta.estado === 'EN_ARMADO' || maleta.estado === 'EN_CIRUGIA')
    .slice(0, 5);
  const puedeGestionarFreelance = sesion?.rol === 'CONTABLE' || sesion?.rol === 'ADMINISTRADOR';
  const totalDistribucion = Math.max(1, datos.total);
  const usuariosPorId = useMemo(
    () => new Map(datos.usuarios.map((usuario) => [usuario.usuarioId, usuario.nombre])),
    [datos.usuarios],
  );
  const fecha = useMemo(
    () =>
      new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long' }).format(
        new Date(ahora()),
      ),
    [ahora],
  );

  return (
    <div className="pagina pagina--tablero">
      <EncabezadoPagina
        sobrelinea={fecha}
        titulo="Centro de operaciones"
        descripcion="Estado real del inventario y de los eventos registrados en este dispositivo."
      />
      {error !== null && (
        <MensajeEstado tipo="error" titulo="No se pudo cargar el tablero" texto={error} />
      )}
      {cargando ? (
        <section className="panel">
          <CargandoPanel filas={7} />
        </section>
      ) : (
        <>
          <section className="metricas" aria-label="Resumen operativo">
            <Metrica
              etiqueta="Piezas en bodega"
              valor={datos.enBodega}
              detalle={`${String(datos.total)} registradas`}
              tono="exito"
              icono="inventario"
            />
            <Metrica
              etiqueta="Fuera de bodega"
              valor={datos.fueraBodega}
              detalle="Asignadas o en cirugía"
              tono="info"
              icono="maleta"
            />
            <Metrica
              etiqueta="En reprocesamiento"
              valor={datos.reproceso}
              detalle="Pendientes de liberar"
              tono="violeta"
              icono="reprocesar"
            />
            <Metrica
              etiqueta="Requieren atención"
              valor={datos.conflictos.length + datos.facturas.length}
              detalle={`${String(datos.conflictos.length)} conflictos · ${String(datos.facturas.length)} facturas`}
              tono="aviso"
              icono="alerta"
            />
          </section>
          <div className="tablero-grid">
            <section className="panel panel--operaciones">
              <header className="panel__cabecera">
                <h2>Operaciones activas</h2>
                <span className="contador">{operaciones.length}</span>
              </header>
              {operaciones.length === 0 ? (
                <Vacio
                  icono="maleta"
                  titulo="No hay maletas activas"
                  texto="Las nuevas operaciones aparecerán después de crear una maleta."
                />
              ) : (
                <div className="operaciones">
                  {operaciones.map((maleta) => (
                    <div className="operacion" key={maleta.id}>
                      <span className="operacion__hora">
                        <Icono nombre={maleta.estado === 'EN_CIRUGIA' ? 'cirugia' : 'maleta'} />
                        <small>{maleta.estado === 'EN_CIRUGIA' ? 'Cirugía' : 'Armado'}</small>
                      </span>
                      <span className="operacion__centro">
                        <span className="operacion__linea">
                          <code>{maleta.id}</code>
                          <Estado tono={TONO_ESTADO_MALETA[maleta.estado]}>
                            {ETIQUETA_ESTADO_MALETA[maleta.estado]}
                          </Estado>
                        </span>
                        <strong>{maleta.procedimiento ?? 'Procedimiento no especificado'}</strong>
                        <small>
                          <Icono nombre="reloj" tamano={14} />
                          Creada {formatearFecha(maleta.creadaEn)}
                        </small>
                      </span>
                      <span className="operacion__responsable">
                        <span>
                          <small>Responsable</small>
                          <strong title={maleta.responsableId}>
                            {usuariosPorId.get(maleta.responsableId) ?? maleta.responsableId}
                          </strong>
                        </span>
                      </span>
                      <span className="operacion__piezas">
                        <small>Institución</small>
                        <strong>{maleta.hospitalId ?? 'Al cierre'}</strong>
                      </span>
                      {puedeGestionarFreelance && maleta.estado === 'EN_CIRUGIA' && (
                        <span className="operacion__accion">
                          <Boton
                            variante="fantasma"
                            icono="enlace"
                            onClick={() => {
                              setMaletaFreelance(maleta);
                            }}
                          >
                            Acceso freelance
                          </Boton>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="panel">
              <header className="panel__cabecera">
                <h2>Atención requerida</h2>
                <span className="contador contador--aviso">
                  {datos.conflictos.length + datos.facturas.length}
                </span>
              </header>
              <div className="alertas-lista">
                {datos.conflictos.slice(0, 3).map(({ conflicto, pieza }) => (
                  <div className="alerta-item" key={conflicto.conflictoId}>
                    <span className="alerta-item__icono alerta-item__icono--peligro">
                      <Icono nombre="conflicto" />
                    </span>
                    <span>
                      <strong>Conflicto de inventario</strong>
                      <small>
                        {conflicto.codigo} · {pieza?.sku ?? 'Pieza sin catálogo'}
                      </small>
                      <time>{formatearFecha(conflicto.detectadoEn)}</time>
                    </span>
                  </div>
                ))}
                {datos.facturas.slice(0, 3).map((factura) => (
                  <div className="alerta-item" key={factura.id}>
                    <span className="alerta-item__icono alerta-item__icono--info">
                      <Icono nombre="factura" />
                    </span>
                    <span>
                      <strong>Factura pendiente de revisión</strong>
                      <small>
                        {factura.id} · {factura.lineas.length} piezas
                      </small>
                      <time>{formatearFecha(factura.creadaEn)}</time>
                    </span>
                  </div>
                ))}
                {datos.conflictos.length + datos.facturas.length === 0 && (
                  <Vacio
                    icono="check"
                    titulo="Todo está al día"
                    texto="No hay conflictos ni facturas pendientes en este dispositivo."
                  />
                )}
              </div>
            </section>
            <section className="panel panel--flujo">
              <header className="panel__cabecera">
                <h2>Distribución del inventario</h2>
                <span className="panel__nota">{datos.total} piezas</span>
              </header>
              <div className="flujo-resumen">
                <div className="flujo-barra" aria-label="Distribución de inventario">
                  <span
                    style={{ width: `${String((datos.enBodega / totalDistribucion) * 100)}%` }}
                  />
                  <span
                    style={{ width: `${String((datos.fueraBodega / totalDistribucion) * 100)}%` }}
                  />
                  <span
                    style={{ width: `${String((datos.reproceso / totalDistribucion) * 100)}%` }}
                  />
                  <span
                    style={{
                      width: `${String((datos.conflictosPiezas / totalDistribucion) * 100)}%`,
                    }}
                  />
                  <span style={{ width: `${String((datos.otros / totalDistribucion) * 100)}%` }} />
                </div>
                <div className="flujo-leyenda">
                  <span>
                    <i className="leyenda leyenda--exito" />
                    En bodega <strong>{datos.enBodega}</strong>
                  </span>
                  <span>
                    <i className="leyenda leyenda--info" />
                    En operación <strong>{datos.fueraBodega}</strong>
                  </span>
                  <span>
                    <i className="leyenda leyenda--azul" />
                    Reproceso <strong>{datos.reproceso}</strong>
                  </span>
                  <span>
                    <i className="leyenda leyenda--violeta" />
                    Conflictos <strong>{datos.conflictosPiezas}</strong>
                  </span>
                  <span>
                    <i className="leyenda leyenda--neutral" />
                    Otros <strong>{datos.otros}</strong>
                  </span>
                </div>
              </div>
            </section>
            <section className="panel panel--actividad">
              <header className="panel__cabecera">
                <h2>Estado del dispositivo</h2>
              </header>
              <div className="estado-dispositivo">
                <span>
                  <Icono nombre="inventario" />
                  <small>Inventario local</small>
                  <strong>{datos.total} piezas</strong>
                </span>
                <span>
                  <Icono nombre="maleta" />
                  <small>Maletas registradas</small>
                  <strong>{datos.maletas.length}</strong>
                </span>
                <span>
                  <Icono nombre="factura" />
                  <small>Prefacturas pendientes</small>
                  <strong>{datos.facturas.length}</strong>
                </span>
              </div>
            </section>
          </div>
          {sesion?.rol === 'ADMINISTRADOR' && <ExcepcionesPrecio modo="administracion" />}
        </>
      )}
      {maletaFreelance !== null && (
        <GestorFreelance
          maleta={maletaFreelance}
          alCerrar={() => {
            setMaletaFreelance(null);
          }}
        />
      )}
    </div>
  );
}
