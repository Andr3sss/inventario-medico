import type { ReactElement, ReactNode } from 'react';
import { Avatar, Boton, EncabezadoPagina, Estado, type TonoEstado } from '../componentes/UI.js';
import { Icono, type NombreIcono } from '../componentes/Icono.js';

const METRICAS: readonly {
  etiqueta: string;
  valor: string;
  cambio: string;
  tono: TonoEstado;
  icono: NombreIcono;
}[] = [
  {
    etiqueta: 'Instrumentos disponibles',
    valor: '164',
    cambio: '74% del inventario',
    tono: 'exito',
    icono: 'inventario',
  },
  {
    etiqueta: 'Fuera de bodega',
    valor: '31',
    cambio: 'En 6 operaciones',
    tono: 'info',
    icono: 'maleta',
  },
  {
    etiqueta: 'En reprocesamiento',
    valor: '18',
    cambio: '5 listos para liberar',
    tono: 'violeta',
    icono: 'reprocesar',
  },
  {
    etiqueta: 'Requieren atención',
    valor: '3',
    cambio: '2 conflictos · 1 demora',
    tono: 'aviso',
    icono: 'alerta',
  },
];

const OPERACIONES = [
  {
    codigo: 'MQ-2048',
    procedimiento: 'Osteosíntesis de radio',
    hospital: 'Hospital Metropolitano',
    responsable: 'Marcia Loor',
    piezas: '24 / 28',
    estado: 'En cirugía',
    tono: 'info' as const,
    hora: '08:30',
  },
  {
    codigo: 'MQ-2051',
    procedimiento: 'Laparotomía exploratoria',
    hospital: 'Clínica Millenium',
    responsable: 'Diego Salas',
    piezas: '32 / 32',
    estado: 'Lista',
    tono: 'exito' as const,
    hora: '11:00',
  },
  {
    codigo: 'MQ-2053',
    procedimiento: 'Trauma menor',
    hospital: 'Hospital San Juan',
    responsable: 'Marcia Loor',
    piezas: '18 / 24',
    estado: 'Preparando',
    tono: 'aviso' as const,
    hora: '14:30',
  },
];

function Metrica({ metrica }: { readonly metrica: (typeof METRICAS)[number] }): ReactElement {
  return (
    <article className="metrica">
      <div className="metrica__cabecera">
        <span>{metrica.etiqueta}</span>
        <span className={`metrica__icono metrica__icono--${metrica.tono}`}>
          <Icono nombre={metrica.icono} />
        </span>
      </div>
      <strong className="metrica__valor">{metrica.valor}</strong>
      <span className="metrica__detalle">
        <span className={`punto punto--${metrica.tono}`} />
        {metrica.cambio}
      </span>
    </article>
  );
}

function Panel({
  titulo,
  accion,
  children,
  className = '',
}: {
  readonly titulo: string;
  readonly accion?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel__cabecera">
        <h2>{titulo}</h2>
        {accion}
      </header>
      {children}
    </section>
  );
}

export function Tablero(): ReactElement {
  return (
    <div className="pagina pagina--tablero">
      <EncabezadoPagina
        sobrelinea="Martes, 8 de septiembre"
        titulo="Centro de operaciones"
        descripcion="Visibilidad de las operaciones, el inventario y los eventos que requieren atención."
        acciones={<Boton icono="mas">Nueva operación</Boton>}
      />

      <section className="metricas" aria-label="Resumen operativo">
        {METRICAS.map((metrica) => (
          <Metrica key={metrica.etiqueta} metrica={metrica} />
        ))}
      </section>

      <div className="tablero-grid">
        <Panel
          titulo="Operaciones de hoy"
          accion={
            <button className="enlace-accion" type="button">
              Ver todas <Icono nombre="flechaDerecha" tamano={15} />
            </button>
          }
          className="panel--operaciones"
        >
          <div className="operaciones">
            {OPERACIONES.map((operacion) => (
              <button type="button" className="operacion" key={operacion.codigo}>
                <span className="operacion__hora">
                  <strong>{operacion.hora}</strong>
                  <small>Hoy</small>
                </span>
                <span className="operacion__centro">
                  <span className="operacion__linea">
                    <code>{operacion.codigo}</code>
                    <Estado tono={operacion.tono}>{operacion.estado}</Estado>
                  </span>
                  <strong>{operacion.procedimiento}</strong>
                  <small>
                    <Icono nombre="hospital" tamano={14} />
                    {operacion.hospital}
                  </small>
                </span>
                <span className="operacion__responsable">
                  <Avatar nombre={operacion.responsable} pequeno />
                  <span>
                    <small>Responsable</small>
                    <strong>{operacion.responsable}</strong>
                  </span>
                </span>
                <span className="operacion__piezas">
                  <small>Piezas</small>
                  <strong>{operacion.piezas}</strong>
                </span>
                <Icono nombre="chevron" tamano={16} />
              </button>
            ))}
          </div>
        </Panel>

        <Panel
          titulo="Atención requerida"
          accion={<span className="contador contador--aviso">3</span>}
        >
          <div className="alertas-lista">
            <button type="button" className="alerta-item">
              <span className="alerta-item__icono alerta-item__icono--peligro">
                <Icono nombre="conflicto" />
              </span>
              <span>
                <strong>Ubicación en conflicto</strong>
                <small>INS-002381 figura en dos maletas activas.</small>
                <time>Hace 12 min</time>
              </span>
              <Icono nombre="chevron" tamano={15} />
            </button>
            <button type="button" className="alerta-item">
              <span className="alerta-item__icono alerta-item__icono--aviso">
                <Icono nombre="reloj" />
              </span>
              <span>
                <strong>Reproceso demorado</strong>
                <small>5 piezas superan las 24 horas.</small>
                <time>Hace 35 min</time>
              </span>
              <Icono nombre="chevron" tamano={15} />
            </button>
            <button type="button" className="alerta-item">
              <span className="alerta-item__icono alerta-item__icono--info">
                <Icono nombre="factura" />
              </span>
              <span>
                <strong>Precio por aprobar</strong>
                <small>La prefactura FV-1083 tiene un ajuste.</small>
                <time>Hace 1 h</time>
              </span>
              <Icono nombre="chevron" tamano={15} />
            </button>
          </div>
        </Panel>

        <Panel
          titulo="Flujo del inventario"
          className="panel--flujo"
          accion={<span className="panel__nota">Últimas 24 horas</span>}
        >
          <div className="flujo-resumen">
            <div className="flujo-barra" aria-label="Distribución de inventario">
              <span style={{ width: '63%' }} />
              <span style={{ width: '14%' }} />
              <span style={{ width: '10%' }} />
              <span style={{ width: '8%' }} />
              <span style={{ width: '5%' }} />
            </div>
            <div className="flujo-leyenda">
              <span>
                <i className="leyenda leyenda--exito" />
                Disponible <strong>164</strong>
              </span>
              <span>
                <i className="leyenda leyenda--info" />
                En maleta <strong>37</strong>
              </span>
              <span>
                <i className="leyenda leyenda--azul" />
                En cirugía <strong>24</strong>
              </span>
              <span>
                <i className="leyenda leyenda--violeta" />
                Reproceso <strong>18</strong>
              </span>
              <span>
                <i className="leyenda leyenda--neutral" />
                Otros <strong>12</strong>
              </span>
            </div>
          </div>
        </Panel>

        <Panel titulo="Actividad reciente" className="panel--actividad">
          <div className="actividad">
            <div className="actividad__item">
              <span className="actividad__marca">
                <Icono nombre="check" tamano={14} />
              </span>
              <span>
                <strong>Maleta MQ-2046 cerrada</strong>
                <small>Diego Salas · 28 piezas verificadas</small>
              </span>
              <time>09:42</time>
            </div>
            <div className="actividad__item">
              <span className="actividad__marca actividad__marca--info">
                <Icono nombre="scanner" tamano={14} />
              </span>
              <span>
                <strong>12 instrumentos registrados</strong>
                <small>Cirugía MQ-2048 · Hospital Metropolitano</small>
              </span>
              <time>09:18</time>
            </div>
            <div className="actividad__item">
              <span className="actividad__marca actividad__marca--violeta">
                <Icono nombre="reprocesar" tamano={14} />
              </span>
              <span>
                <strong>Lote RP-083 liberado</strong>
                <small>5 instrumentos regresaron a bodega</small>
              </span>
              <time>08:56</time>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
