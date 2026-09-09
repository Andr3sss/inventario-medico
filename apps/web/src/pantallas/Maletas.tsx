import { useState } from 'react';
import type { ReactElement } from 'react';
import { Avatar, Boton, EncabezadoPagina, Estado, type TonoEstado } from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';
import { Escaner } from '../componentes/Escaner.js';

const MALETAS: readonly {
  codigo: string;
  procedimiento: string;
  hospital: string;
  responsable: string;
  piezas: string;
  fecha: string;
  estado: string;
  tono: TonoEstado;
  progreso: number;
}[] = [
  {
    codigo: 'MQ-2053',
    procedimiento: 'Trauma menor',
    hospital: 'Hospital San Juan',
    responsable: 'Marcia Loor',
    piezas: '18 / 24',
    fecha: 'Hoy · 14:30',
    estado: 'Preparando',
    tono: 'aviso',
    progreso: 75,
  },
  {
    codigo: 'MQ-2051',
    procedimiento: 'Laparotomía exploratoria',
    hospital: 'Clínica Millenium',
    responsable: 'Diego Salas',
    piezas: '32 / 32',
    fecha: 'Hoy · 11:00',
    estado: 'Lista',
    tono: 'exito',
    progreso: 100,
  },
  {
    codigo: 'MQ-2048',
    procedimiento: 'Osteosíntesis de radio',
    hospital: 'Hospital Metropolitano',
    responsable: 'Marcia Loor',
    piezas: '28 / 28',
    fecha: 'Hoy · 08:30',
    estado: 'En cirugía',
    tono: 'info',
    progreso: 100,
  },
  {
    codigo: 'MQ-2046',
    procedimiento: 'Artroscopia de rodilla',
    hospital: 'Hospital Metropolitano',
    responsable: 'Diego Salas',
    piezas: '21 / 21',
    fecha: 'Ayer · 16:00',
    estado: 'Regresando',
    tono: 'violeta',
    progreso: 100,
  },
];

const PIEZAS_MALETA = [
  { codigo: 'KIT-000104', nombre: 'Kit trauma menor', categoria: 'Kit · 14 piezas', hora: '09:26' },
  {
    codigo: 'INS-002416',
    nombre: 'Separador Farabeuf par',
    categoria: 'Instrumental',
    hora: '09:24',
  },
  {
    codigo: 'INS-002294',
    nombre: 'Porta agujas Mayo-Hegar',
    categoria: 'Instrumental',
    hora: '09:22',
  },
  {
    codigo: 'CNS-001582',
    nombre: 'Sutura Vicryl 3-0',
    categoria: 'Consumible · 4 un.',
    hora: '09:18',
  },
];

export function Maletas(): ReactElement {
  const [armando, setArmando] = useState(false);
  const [filtro, setFiltro] = useState('Activas');

  if (armando) {
    return (
      <div className="pagina pagina--armado">
        <button
          type="button"
          className="volver"
          onClick={() => {
            setArmando(false);
          }}
        >
          <Icono nombre="flecha" />
          Volver a maletas
        </button>
        <header className="cabecera-operacion">
          <div>
            <span className="cabecera-operacion__codigo">
              <Icono nombre="maleta" />
              <code>MQ-2053</code>
              <Estado tono="aviso">Preparando</Estado>
            </span>
            <h1>Trauma menor</h1>
            <p>
              <Icono nombre="hospital" tamano={15} />
              Hospital San Juan · Hoy, 14:30
            </p>
          </div>
          <div className="progreso-piezas">
            <span>
              <small>Contenido</small>
              <strong>
                18 <em>/ 24</em>
              </strong>
            </span>
            <div>
              <i style={{ width: '75%' }} />
            </div>
            <small>Faltan 6 piezas</small>
          </div>
        </header>

        <div className="armado-grid">
          <div className="armado-grid__principal">
            <Escaner />
            <section className="panel ultimo-escaneo">
              <header className="panel__cabecera">
                <div>
                  <p className="sobrelinea">Último escaneo · 09:26</p>
                  <h2>Elemento agregado</h2>
                </div>
                <Estado tono="exito">
                  <Icono nombre="check" tamano={13} /> Verificado
                </Estado>
              </header>
              <div className="ultimo-escaneo__pieza">
                <span className="detalle-identidad__icono">
                  <Icono nombre="caja" />
                </span>
                <span>
                  <code>KIT-000104</code>
                  <strong>Kit trauma menor</strong>
                  <small>14 componentes registrados</small>
                </span>
              </div>
            </section>
          </div>

          <aside className="panel contenido-maleta">
            <header className="panel__cabecera">
              <div>
                <p className="sobrelinea">Contenido</p>
                <h2>18 piezas agregadas</h2>
              </div>
              <button className="boton-icono" type="button" aria-label="Filtrar">
                <Icono nombre="filtros" />
              </button>
            </header>
            <div className="contenido-maleta__lista">
              {PIEZAS_MALETA.map((pieza, indice) => (
                <div className="pieza-agregada" key={pieza.codigo}>
                  <span className="pieza-agregada__orden">
                    {String(indice + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <code>{pieza.codigo}</code>
                    <strong>{pieza.nombre}</strong>
                    <small>
                      {pieza.categoria} · {pieza.hora}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="boton-icono boton-icono--sutil"
                    aria-label={`Retirar ${pieza.nombre}`}
                  >
                    <Icono nombre="cerrar" tamano={15} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="enlace-accion contenido-maleta__ver">
              Ver las 18 piezas <Icono nombre="flechaDerecha" tamano={15} />
            </button>
          </aside>
        </div>
        <footer className="barra-accion">
          <span>
            <Avatar nombre="Marcia Loor" pequeno />
            <span>
              <small>Responsable</small>
              <strong>Marcia Loor</strong>
            </span>
          </span>
          <div>
            <Boton variante="secundario">Guardar y salir</Boton>
            <Boton icono="check">Finalizar armado</Boton>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="pagina">
      <EncabezadoPagina
        sobrelinea="Operaciones quirúrgicas"
        titulo="Maletas"
        descripcion="Prepara, verifica y acompaña cada maleta durante todo su recorrido."
        acciones={<Boton icono="mas">Nueva maleta</Boton>}
      />
      <section className="metricas metricas--tres">
        <article className="metrica metrica--horizontal">
          <span className="metrica__icono metrica__icono--aviso">
            <Icono nombre="maleta" />
          </span>
          <span>
            <small>En preparación</small>
            <strong>3</strong>
          </span>
          <span className="metrica__detalle">1 requiere atención</span>
        </article>
        <article className="metrica metrica--horizontal">
          <span className="metrica__icono metrica__icono--info">
            <Icono nombre="cirugia" />
          </span>
          <span>
            <small>Fuera de bodega</small>
            <strong>4</strong>
          </span>
          <span className="metrica__detalle">2 en cirugía</span>
        </article>
        <article className="metrica metrica--horizontal">
          <span className="metrica__icono metrica__icono--exito">
            <Icono nombre="check" />
          </span>
          <span>
            <small>Cerradas hoy</small>
            <strong>7</strong>
          </span>
          <span className="metrica__detalle">196 piezas controladas</span>
        </article>
      </section>

      <section className="panel maletas-panel">
        <div className="tabs-bar">
          <div className="tabs">
            {['Activas', 'Programadas', 'Cerradas'].map((opcion) => (
              <button
                type="button"
                key={opcion}
                className={filtro === opcion ? 'activo' : ''}
                onClick={() => {
                  setFiltro(opcion);
                }}
              >
                {opcion}
                {opcion === 'Activas' && <span>4</span>}
              </button>
            ))}
          </div>
          <div className="tabs-bar__acciones">
            <button className="control-filtro" type="button">
              <Icono nombre="buscar" />
              <span>Buscar</span>
            </button>
            <button className="control-filtro" type="button">
              <Icono nombre="filtros" />
              <span>Filtrar</span>
            </button>
          </div>
        </div>
        <div className="maletas-lista">
          {MALETAS.map((maleta) => (
            <article className="maleta-fila" key={maleta.codigo}>
              <div className="maleta-fila__identidad">
                <span className={`maleta-fila__icono maleta-fila__icono--${maleta.tono}`}>
                  <Icono nombre="maleta" />
                </span>
                <span>
                  <code>{maleta.codigo}</code>
                  <strong>{maleta.procedimiento}</strong>
                  <small>
                    <Icono nombre="hospital" tamano={14} />
                    {maleta.hospital}
                  </small>
                </span>
              </div>
              <div className="maleta-fila__dato">
                <small>Responsable</small>
                <span>
                  <Avatar nombre={maleta.responsable} pequeno />
                  {maleta.responsable}
                </span>
              </div>
              <div className="maleta-fila__dato">
                <small>Programada</small>
                <strong>{maleta.fecha}</strong>
              </div>
              <div className="maleta-fila__contenido">
                <span>
                  <small>Contenido</small>
                  <strong>{maleta.piezas}</strong>
                </span>
                <div>
                  <i style={{ width: `${String(maleta.progreso)}%` }} />
                </div>
              </div>
              <Estado tono={maleta.tono}>{maleta.estado}</Estado>
              {maleta.estado === 'Preparando' ? (
                <Boton
                  variante="secundario"
                  onClick={() => {
                    setArmando(true);
                  }}
                >
                  Continuar armado
                </Boton>
              ) : (
                <button type="button" className="boton-icono">
                  <Icono nombre="chevron" />
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
