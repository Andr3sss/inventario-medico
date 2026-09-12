import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import {
  UMBRAL_MALETA_DEMORADA_MS_DEFECTO,
  obtenerNotificaciones,
  type Notificaciones,
} from '@crearcos/data';
import { useApp } from '../datos/contexto.js';
import {
  ETIQUETA_ESTADO_FACTURA,
  ETIQUETA_ESTADO_MALETA,
  formatearFecha,
  formatearUSD,
  mensajeExcepcion,
} from '../datos/presentacion.js';
import { Icono } from './Icono.js';
import { CargandoPanel, Vacio } from './UI.js';

const VACIAS: Notificaciones = {
  conflictosAbiertos: [],
  maletasDemoradas: [],
  facturasBloqueadas: [],
  total: 0,
};

export function NotificacionesSupervisor(): ReactElement {
  const { db, ahora } = useApp();
  const [abiertas, setAbiertas] = useState(false);
  const [datos, setDatos] = useState<Notificaciones>(VACIAS);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await obtenerNotificaciones(db, { ahora }));
    } catch (excepcion) {
      setError(mensajeExcepcion(excepcion));
    } finally {
      setCargando(false);
    }
  }, [ahora, db]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!abiertas) return undefined;
    const cerrarAlSalir = (evento: PointerEvent): void => {
      if (contenedor.current?.contains(evento.target as Node) === false) setAbiertas(false);
    };
    globalThis.document.addEventListener('pointerdown', cerrarAlSalir);
    return () => {
      globalThis.document.removeEventListener('pointerdown', cerrarAlSalir);
    };
  }, [abiertas]);

  const horas = UMBRAL_MALETA_DEMORADA_MS_DEFECTO / 3_600_000;

  return (
    <div className="notificaciones" ref={contenedor}>
      <button
        type="button"
        className={`boton-icono${abiertas ? ' boton-icono--activo' : ''}`}
        aria-label={`Notificaciones${datos.total > 0 ? `, ${String(datos.total)} pendientes` : ''}`}
        aria-expanded={abiertas}
        onClick={() => {
          setAbiertas((valor) => !valor);
          if (!abiertas) void cargar();
        }}
      >
        <Icono nombre="campana" />
        {datos.total > 0 && (
          <span className="notificaciones__contador">{datos.total > 99 ? '99+' : datos.total}</span>
        )}
      </button>
      {abiertas && (
        <aside className="notificaciones__panel" aria-label="Alertas operativas">
          <header>
            <div>
              <p className="sobrelinea">Lectura operativa</p>
              <h2>Notificaciones</h2>
            </div>
            <span>{datos.total} activas</span>
          </header>
          <div className="notificaciones__resumen">
            <span>
              <b>{datos.conflictosAbiertos.length}</b> Conflictos
            </span>
            <span>
              <b>{datos.maletasDemoradas.length}</b> Demoradas
            </span>
            <span>
              <b>{datos.facturasBloqueadas.length}</b> Bloqueadas
            </span>
          </div>
          <div className="notificaciones__contenido">
            {cargando ? (
              <CargandoPanel filas={4} />
            ) : error !== null ? (
              <div className="notificaciones__error">
                <Icono nombre="alerta" />
                <strong>No se pudieron cargar las alertas</strong>
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    void cargar();
                  }}
                >
                  Reintentar
                </button>
              </div>
            ) : datos.total === 0 ? (
              <Vacio
                icono="check"
                titulo="Todo está bajo control"
                texto="No hay conflictos, demoras ni facturas bloqueadas."
              />
            ) : (
              <div className="notificaciones__lista">
                {datos.conflictosAbiertos.map(({ conflicto, pieza }) => (
                  <article key={conflicto.conflictoId}>
                    <span className="notificacion-icono notificacion-icono--peligro">
                      <Icono nombre="conflicto" tamano={16} />
                    </span>
                    <div>
                      <strong>Conflicto abierto</strong>
                      <p>
                        {conflicto.codigo} · {pieza?.sku ?? 'Pieza sin catálogo'}
                      </p>
                      <time>{formatearFecha(conflicto.detectadoEn)}</time>
                    </div>
                  </article>
                ))}
                {datos.maletasDemoradas.map((maleta) => (
                  <article key={maleta.id}>
                    <span className="notificacion-icono notificacion-icono--aviso">
                      <Icono nombre="reloj" tamano={16} />
                    </span>
                    <div>
                      <strong>Maleta demorada · más de {horas} h</strong>
                      <p>
                        {maleta.id} ·{' '}
                        {maleta.procedimiento ?? ETIQUETA_ESTADO_MALETA[maleta.estado]}
                      </p>
                      <time>Salió {formatearFecha(maleta.salioEn)}</time>
                    </div>
                  </article>
                ))}
                {datos.facturasBloqueadas.map((factura) => (
                  <article key={factura.id}>
                    <span className="notificacion-icono notificacion-icono--info">
                      <Icono nombre="factura" tamano={16} />
                    </span>
                    <div>
                      <strong>Factura bloqueada</strong>
                      <p>
                        {factura.id} · {formatearUSD(factura.total)} ·{' '}
                        {ETIQUETA_ESTADO_FACTURA[factura.estado]}
                      </p>
                      <time>Creada {formatearFecha(factura.creadaEn)}</time>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
          <footer>
            <span>Actualizado con datos de este dispositivo</span>
            <button
              type="button"
              onClick={() => {
                void cargar();
              }}
              disabled={cargando}
            >
              Actualizar
            </button>
          </footer>
        </aside>
      )}
    </div>
  );
}
