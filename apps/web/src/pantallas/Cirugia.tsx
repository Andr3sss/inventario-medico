import type { ReactElement } from 'react';
import { Boton, Estado } from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';
import { Escaner } from '../componentes/Escaner.js';

const UTILIZADOS = [
  { codigo: 'CNS-001582', nombre: 'Sutura Vicryl 3-0', hora: '09:32', cantidad: '2 un.' },
  { codigo: 'INS-002381', nombre: 'Pinza Kelly curva 14 cm', hora: '09:28', cantidad: '1 un.' },
  { codigo: 'CNS-001610', nombre: 'Tornillo cortical 3.5 mm', hora: '09:21', cantidad: '4 un.' },
  { codigo: 'INS-002416', nombre: 'Separador Farabeuf par', hora: '09:18', cantidad: '1 un.' },
];

export function Cirugia(): ReactElement {
  return (
    <div className="cirugia-foco">
      <header className="cirugia-foco__cabecera">
        <div className="cirugia-foco__identidad">
          <span className="cirugia-foco__cruz">
            <Icono nombre="cirugia" tamano={22} />
          </span>
          <span>
            <p className="sobrelinea">Cirugía en curso</p>
            <h1>Osteosíntesis de radio</h1>
            <p>
              <Icono nombre="hospital" tamano={15} />
              Hospital Metropolitano · Quirófano 3
            </p>
          </span>
        </div>
        <div className="cirugia-foco__estado">
          <Estado tono="info">En cirugía</Estado>
          <code>MQ-2048</code>
          <span>Inició 08:42</span>
        </div>
      </header>

      <div className="cirugia-foco__metricas">
        <div>
          <span>Utilizados</span>
          <strong>12</strong>
          <small>instrumentos</small>
        </div>
        <div>
          <span>En la maleta</span>
          <strong>28</strong>
          <small>piezas totales</small>
        </div>
        <div>
          <span>Tiempo transcurrido</span>
          <strong>01:18</strong>
          <small>hh:mm</small>
        </div>
      </div>

      <Escaner
        titulo="Registrar instrumento utilizado"
        ayuda="Escanea únicamente lo que fue utilizado durante el procedimiento."
      />

      <section className="panel utilizados-panel">
        <header className="panel__cabecera">
          <div>
            <p className="sobrelinea">Registro de uso</p>
            <h2>Instrumentos utilizados</h2>
          </div>
          <span className="panel__nota">12 registros · guardados en este dispositivo</span>
        </header>
        <div className="utilizados-lista">
          {UTILIZADOS.map((pieza, indice) => (
            <div className="utilizado" key={pieza.codigo}>
              <span className="utilizado__check">
                <Icono nombre="check" tamano={14} />
              </span>
              <span className="utilizado__orden">{String(12 - indice).padStart(2, '0')}</span>
              <span className="utilizado__pieza">
                <code>{pieza.codigo}</code>
                <strong>{pieza.nombre}</strong>
              </span>
              <span className="utilizado__cantidad">{pieza.cantidad}</span>
              <time>{pieza.hora}</time>
              <button
                type="button"
                className="boton-icono boton-icono--sutil"
                aria-label={`Editar ${pieza.nombre}`}
              >
                <Icono nombre="editar" tamano={15} />
              </button>
            </div>
          ))}
        </div>
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
          <Boton variante="secundario" icono="pausa">
            Pausar
          </Boton>
          <Boton icono="check">Finalizar cirugía</Boton>
        </div>
      </footer>
    </div>
  );
}
