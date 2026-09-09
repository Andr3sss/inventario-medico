import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  BarraBusqueda,
  Boton,
  EncabezadoPagina,
  Estado,
  Vacio,
  type TonoEstado,
} from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';

interface Instrumento {
  readonly codigo: string;
  readonly nombre: string;
  readonly categoria: string;
  readonly estado: string;
  readonly tono: TonoEstado;
  readonly ubicacion: string;
  readonly movimiento: string;
}

const INSTRUMENTOS: readonly Instrumento[] = [
  {
    codigo: 'INS-002381',
    nombre: 'Pinza Kelly curva 14 cm',
    categoria: 'Instrumental',
    estado: 'En cirugía',
    tono: 'info',
    ubicacion: 'Hospital Metropolitano',
    movimiento: 'Hace 12 min',
  },
  {
    codigo: 'INS-002416',
    nombre: 'Separador Farabeuf par',
    categoria: 'Instrumental',
    estado: 'Disponible',
    tono: 'exito',
    ubicacion: 'Bodega central · A3',
    movimiento: 'Hoy, 08:45',
  },
  {
    codigo: 'KIT-000104',
    nombre: 'Kit osteosíntesis 3.5',
    categoria: 'Kit · 14 piezas',
    estado: 'En maleta',
    tono: 'aviso',
    ubicacion: 'Maleta MQ-2051',
    movimiento: 'Hoy, 08:31',
  },
  {
    codigo: 'INS-002294',
    nombre: 'Porta agujas Mayo-Hegar',
    categoria: 'Instrumental',
    estado: 'Reprocesamiento',
    tono: 'violeta',
    ubicacion: 'Central esterilización',
    movimiento: 'Ayer, 17:22',
  },
  {
    codigo: 'CNS-001582',
    nombre: 'Sutura Vicryl 3-0',
    categoria: 'Consumible',
    estado: 'Disponible',
    tono: 'exito',
    ubicacion: 'Bodega central · B1',
    movimiento: 'Ayer, 16:08',
  },
  {
    codigo: 'INS-002118',
    nombre: 'Tijera Metzenbaum 18 cm',
    categoria: 'Instrumental',
    estado: 'Conflicto',
    tono: 'peligro',
    ubicacion: 'Ubicación por resolver',
    movimiento: 'Ayer, 15:44',
  },
  {
    codigo: 'INS-002507',
    nombre: 'Gubia Stille-Luer',
    categoria: 'Instrumental',
    estado: 'Bodega instrumentista',
    tono: 'neutral',
    ubicacion: 'Bodega · Marcia Loor',
    movimiento: '06 sep, 12:20',
  },
];

const HISTORIAL = [
  {
    titulo: 'Hospital Metropolitano',
    detalle: 'Cirugía · MQ-2048',
    fecha: 'Hoy, 08:42',
    icono: 'hospital' as const,
    actual: true,
  },
  {
    titulo: 'Maleta MQ-2048',
    detalle: 'Asignado por Marcia Loor',
    fecha: 'Hoy, 07:51',
    icono: 'maleta' as const,
    actual: false,
  },
  {
    titulo: 'Bodega central',
    detalle: 'Estante A3 · Control aprobado',
    fecha: '07 sep, 16:18',
    icono: 'inventario' as const,
    actual: false,
  },
  {
    titulo: 'Reprocesamiento',
    detalle: 'Lote RP-081 · Ciclo completado',
    fecha: '07 sep, 14:06',
    icono: 'reprocesar' as const,
    actual: false,
  },
];

export function Inventario(): ReactElement {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('Todos');
  const [seleccionado, setSeleccionado] = useState<Instrumento | null>(null);
  const visibles = useMemo(() => {
    const termino = busqueda.toLocaleLowerCase();
    return INSTRUMENTOS.filter((instrumento) => {
      const coincideTexto = `${instrumento.codigo} ${instrumento.nombre} ${instrumento.ubicacion}`
        .toLocaleLowerCase()
        .includes(termino);
      const coincideFiltro = filtro === 'Todos' || instrumento.estado === filtro;
      return coincideTexto && coincideFiltro;
    });
  }, [busqueda, filtro]);

  return (
    <div className="pagina">
      <EncabezadoPagina
        sobrelinea="Catálogo maestro · 221 unidades"
        titulo="Inventario"
        descripcion="Consulta la disponibilidad, ubicación y trazabilidad de cada pieza individual."
        acciones={
          <>
            <Boton variante="secundario" icono="descargar">
              Exportar
            </Boton>
            <Boton icono="mas">Registrar pieza</Boton>
          </>
        }
      />

      <section className="resumen-lineal" aria-label="Estados del inventario">
        <button
          type="button"
          className={filtro === 'Todos' ? 'resumen-lineal__item activo' : 'resumen-lineal__item'}
          onClick={() => {
            setFiltro('Todos');
          }}
        >
          <span>Total</span>
          <strong>221</strong>
        </button>
        <button
          type="button"
          className={
            filtro === 'Disponible' ? 'resumen-lineal__item activo' : 'resumen-lineal__item'
          }
          onClick={() => {
            setFiltro('Disponible');
          }}
        >
          <span>
            <i className="punto punto--exito" />
            Disponibles
          </span>
          <strong>164</strong>
        </button>
        <button
          type="button"
          className={
            filtro === 'En maleta' ? 'resumen-lineal__item activo' : 'resumen-lineal__item'
          }
          onClick={() => {
            setFiltro('En maleta');
          }}
        >
          <span>
            <i className="punto punto--aviso" />
            En maleta
          </span>
          <strong>37</strong>
        </button>
        <button
          type="button"
          className={
            filtro === 'Reprocesamiento' ? 'resumen-lineal__item activo' : 'resumen-lineal__item'
          }
          onClick={() => {
            setFiltro('Reprocesamiento');
          }}
        >
          <span>
            <i className="punto punto--violeta" />
            Reproceso
          </span>
          <strong>18</strong>
        </button>
        <button
          type="button"
          className={
            filtro === 'Conflicto' ? 'resumen-lineal__item activo' : 'resumen-lineal__item'
          }
          onClick={() => {
            setFiltro('Conflicto');
          }}
        >
          <span>
            <i className="punto punto--peligro" />
            Conflictos
          </span>
          <strong>2</strong>
        </button>
      </section>

      <section className="panel tabla-panel">
        <div className="herramientas-tabla">
          <BarraBusqueda
            valor={busqueda}
            alCambiar={setBusqueda}
            placeholder="Buscar por código, nombre o ubicación…"
          />
          <div className="herramientas-tabla__derecha">
            <button type="button" className="control-filtro">
              <Icono nombre="filtros" />
              <span>Filtros</span>
              <span className="contador">2</span>
            </button>
            <select
              className="select-control"
              aria-label="Ordenar inventario"
              defaultValue="Recientes"
            >
              <option>Recientes</option>
              <option>Nombre A–Z</option>
              <option>Estado</option>
            </select>
          </div>
        </div>

        {visibles.length === 0 ? (
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
                    <th>Categoría</th>
                    <th>Estado</th>
                    <th>Ubicación actual</th>
                    <th>Último movimiento</th>
                    <th>
                      <span className="solo-lector">Acción</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((instrumento) => (
                    <tr
                      key={instrumento.codigo}
                      onClick={() => {
                        setSeleccionado(instrumento);
                      }}
                    >
                      <td>
                        <code className="codigo">{instrumento.codigo}</code>
                      </td>
                      <td>
                        <button type="button" className="nombre-enlace">
                          {instrumento.nombre}
                        </button>
                      </td>
                      <td className="texto-suave">{instrumento.categoria}</td>
                      <td>
                        <Estado tono={instrumento.tono}>{instrumento.estado}</Estado>
                      </td>
                      <td>
                        <span className="ubicacion-celda">
                          <Icono nombre="ubicacion" tamano={15} />
                          {instrumento.ubicacion}
                        </span>
                      </td>
                      <td className="texto-suave">{instrumento.movimiento}</td>
                      <td>
                        <button
                          type="button"
                          className="boton-icono boton-icono--sutil"
                          aria-label={`Ver ${instrumento.nombre}`}
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
              {visibles.map((instrumento) => (
                <button
                  type="button"
                  className="fila-movil"
                  key={instrumento.codigo}
                  onClick={() => {
                    setSeleccionado(instrumento);
                  }}
                >
                  <span className="fila-movil__principal">
                    <code>{instrumento.codigo}</code>
                    <strong>{instrumento.nombre}</strong>
                    <small>
                      <Icono nombre="ubicacion" tamano={14} />
                      {instrumento.ubicacion}
                    </small>
                  </span>
                  <span className="fila-movil__lateral">
                    <Estado tono={instrumento.tono}>{instrumento.estado}</Estado>
                    <Icono nombre="chevron" tamano={16} />
                  </span>
                </button>
              ))}
            </div>

            <footer className="paginacion">
              <span>Mostrando 1–7 de 221 piezas</span>
              <div>
                <button type="button" disabled>
                  <Icono nombre="flecha" tamano={16} />
                </button>
                <button type="button" className="activo">
                  1
                </button>
                <button type="button">2</button>
                <button type="button">3</button>
                <button type="button">
                  <Icono nombre="chevron" tamano={16} />
                </button>
              </div>
            </footer>
          </>
        )}
      </section>

      {seleccionado !== null && (
        <div
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label={`Detalle de ${seleccionado.nombre}`}
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
                <code>{seleccionado.codigo}</code>
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
                  <Icono nombre="inventario" tamano={25} />
                </span>
                <div>
                  <h2>{seleccionado.nombre}</h2>
                  <p>{seleccionado.categoria}</p>
                </div>
              </div>
              <div className="detalle-estado">
                <span>
                  <small>Estado actual</small>
                  <Estado tono={seleccionado.tono}>{seleccionado.estado}</Estado>
                </span>
                <span>
                  <small>Ubicación</small>
                  <strong>{seleccionado.ubicacion}</strong>
                </span>
              </div>
              <div className="detalle-datos">
                <div>
                  <span>SKU</span>
                  <code>PINZA-KELLY-14</code>
                </div>
                <div>
                  <span>Propiedad</span>
                  <strong>Activo fijo</strong>
                </div>
                <div>
                  <span>Último control</span>
                  <strong>08 sep 2026</strong>
                </div>
                <div>
                  <span>Ciclos registrados</span>
                  <strong>18</strong>
                </div>
              </div>
              <section className="historial">
                <div className="historial__cabecera">
                  <div>
                    <p className="sobrelinea">Trazabilidad</p>
                    <h3>Historial de movimientos</h3>
                  </div>
                  <button type="button" className="enlace-accion">
                    Ver auditoría
                  </button>
                </div>
                <div className="timeline">
                  {HISTORIAL.map((evento) => (
                    <div
                      className={`timeline__item${evento.actual ? ' timeline__item--actual' : ''}`}
                      key={evento.titulo + evento.fecha}
                    >
                      <span className="timeline__icono">
                        <Icono nombre={evento.icono} tamano={16} />
                      </span>
                      <span className="timeline__texto">
                        <strong>{evento.titulo}</strong>
                        <small>{evento.detalle}</small>
                      </span>
                      <time>{evento.fecha}</time>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <footer className="drawer__pie">
              <Boton variante="secundario" icono="editar">
                Editar información
              </Boton>
              <Boton variante="fantasma" icono="descargar">
                Descargar historial
              </Boton>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
