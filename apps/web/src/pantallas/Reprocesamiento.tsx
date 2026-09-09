import { useState } from 'react';
import type { ReactElement } from 'react';
import { Boton, EncabezadoPagina, Estado, type TonoEstado } from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';

const LOTES: readonly {
  lote: string;
  origen: string;
  piezas: number;
  ingreso: string;
  responsable: string;
  estado: string;
  tono: TonoEstado;
  progreso: string;
}[] = [
  {
    lote: 'RP-0087',
    origen: 'Maleta MQ-2046',
    piezas: 21,
    ingreso: 'Hoy · 09:18',
    responsable: 'Marcia Loor',
    estado: 'Pendiente',
    tono: 'aviso',
    progreso: 'Recibido',
  },
  {
    lote: 'RP-0086',
    origen: 'Maleta MQ-2044',
    piezas: 18,
    ingreso: 'Hoy · 08:42',
    responsable: 'Diego Salas',
    estado: 'Procesando',
    tono: 'info',
    progreso: 'Esterilización',
  },
  {
    lote: 'RP-0085',
    origen: 'Maleta MQ-2041',
    piezas: 24,
    ingreso: 'Ayer · 17:30',
    responsable: 'Marcia Loor',
    estado: 'Listo',
    tono: 'exito',
    progreso: 'Control aprobado',
  },
  {
    lote: 'RP-0084',
    origen: 'Maleta MQ-2039',
    piezas: 16,
    ingreso: 'Ayer · 15:14',
    responsable: 'Diego Salas',
    estado: 'Procesando',
    tono: 'info',
    progreso: 'Lavado',
  },
];

const PASOS = ['Recibido', 'Lavado', 'Esterilización', 'Control aprobado'];

export function Reprocesamiento(): ReactElement {
  const [tab, setTab] = useState('Pendientes');
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const alternar = (lote: string): void => {
    setSeleccionados((actual) =>
      actual.includes(lote) ? actual.filter((valor) => valor !== lote) : [...actual, lote],
    );
  };
  return (
    <div className="pagina">
      <EncabezadoPagina
        sobrelinea="Central de esterilización"
        titulo="Reprocesamiento"
        descripcion="Controla los lotes desde la recepción hasta su liberación y destino final."
        acciones={<Boton icono="mas">Recibir lote</Boton>}
      />
      <section className="metricas metricas--tres">
        <article className="metrica metrica--horizontal">
          <span className="metrica__icono metrica__icono--aviso">
            <Icono nombre="reloj" />
          </span>
          <span>
            <small>Pendientes</small>
            <strong>3</strong>
          </span>
          <span className="metrica__detalle">55 piezas</span>
        </article>
        <article className="metrica metrica--horizontal">
          <span className="metrica__icono metrica__icono--info">
            <Icono nombre="reprocesar" />
          </span>
          <span>
            <small>En proceso</small>
            <strong>2</strong>
          </span>
          <span className="metrica__detalle">34 piezas</span>
        </article>
        <article className="metrica metrica--horizontal">
          <span className="metrica__icono metrica__icono--exito">
            <Icono nombre="check" />
          </span>
          <span>
            <small>Listos</small>
            <strong>1</strong>
          </span>
          <span className="metrica__detalle">24 por liberar</span>
        </article>
      </section>

      <section className="panel tabla-panel reproceso-panel">
        <div className="tabs-bar">
          <div className="tabs">
            {['Pendientes', 'Historial'].map((opcion) => (
              <button
                type="button"
                key={opcion}
                className={tab === opcion ? 'activo' : ''}
                onClick={() => {
                  setTab(opcion);
                }}
              >
                {opcion}
                {opcion === 'Pendientes' && <span>6</span>}
              </button>
            ))}
          </div>
          <div className="tabs-bar__acciones">
            <button className="control-filtro" type="button">
              <Icono nombre="filtros" />
              <span>Estado</span>
            </button>
            <button className="control-filtro" type="button">
              <Icono nombre="buscar" />
              <span>Buscar lote</span>
            </button>
          </div>
        </div>
        {seleccionados.length > 0 && (
          <div className="seleccion-multiple">
            <span>
              <strong>{seleccionados.length}</strong>{' '}
              {seleccionados.length === 1 ? 'lote seleccionado' : 'lotes seleccionados'}
            </span>
            <div>
              <button type="button">Asignar responsable</button>
              <button type="button">Actualizar estado</button>
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
        <div className="reproceso-lista">
          {LOTES.map((lote) => {
            const pasoActual = PASOS.indexOf(lote.progreso);
            const marcado = seleccionados.includes(lote.lote);
            return (
              <article className={`lote${marcado ? ' lote--seleccionado' : ''}`} key={lote.lote}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => {
                      alternar(lote.lote);
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
                    <code>{lote.lote}</code>
                    <strong>{lote.origen}</strong>
                    <small>
                      {lote.piezas} piezas · {lote.ingreso}
                    </small>
                  </span>
                </div>
                <div className="lote__progreso">
                  <div className="pasos-mini">
                    {PASOS.map((paso, indice) => (
                      <span key={paso} className={indice <= pasoActual ? 'completo' : ''}>
                        <i />
                        {paso}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="lote__responsable">
                  <small>Responsable</small>
                  <strong>{lote.responsable}</strong>
                </div>
                <Estado tono={lote.tono}>{lote.estado}</Estado>
                <button type="button" className="boton-icono">
                  <Icono nombre="chevron" tamano={16} />
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
