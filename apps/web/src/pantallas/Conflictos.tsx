import { useState } from 'react';
import type { ReactElement } from 'react';
import { Avatar, Boton, EncabezadoPagina, Estado } from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';

const CASOS = [
  {
    id: 'CF-0028',
    pieza: 'INS-002381',
    nombre: 'Pinza Kelly curva 14 cm',
    tiempo: 'Hace 12 min',
    activo: true,
  },
  {
    id: 'CF-0027',
    pieza: 'INS-002118',
    nombre: 'Tijera Metzenbaum 18 cm',
    tiempo: 'Ayer, 15:44',
    activo: false,
  },
];

export function Conflictos(): ReactElement {
  const [resuelto, setResuelto] = useState(false);
  return (
    <div className="pagina">
      <EncabezadoPagina
        sobrelinea="Control de trazabilidad"
        titulo="Conflictos"
        descripcion="Compara las dos versiones, identifica el movimiento válido y documenta la resolución."
      />
      <div className="conflictos-layout">
        <aside className="panel conflictos-bandeja">
          <header className="panel__cabecera">
            <h2>Pendientes</h2>
            <span className="contador contador--peligro">2</span>
          </header>
          <div>
            {CASOS.map((caso) => (
              <button
                type="button"
                className={`caso-conflicto${caso.activo ? ' activo' : ''}`}
                key={caso.id}
              >
                <span>
                  <code>{caso.id}</code>
                  <time>{caso.tiempo}</time>
                </span>
                <strong>{caso.nombre}</strong>
                <small>{caso.pieza}</small>
                <Estado tono="peligro">Ubicación duplicada</Estado>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel conflicto-detalle">
          <header className="conflicto-detalle__cabecera">
            <div>
              <span className="conflicto-detalle__alerta">
                <Icono nombre="conflicto" />
              </span>
              <span>
                <p className="sobrelinea">CF-0028 · Detectado hace 12 min</p>
                <h2>Una pieza aparece en dos operaciones</h2>
                <p>El instrumento permanece bloqueado hasta resolver cuál movimiento es válido.</p>
              </span>
            </div>
            <Estado tono="peligro">Pendiente</Estado>
          </header>

          <div className="pieza-conflicto">
            <span className="detalle-identidad__icono">
              <Icono nombre="inventario" />
            </span>
            <span>
              <code>INS-002381</code>
              <strong>Pinza Kelly curva 14 cm</strong>
              <small>Instrumental · SKU PINZA-KELLY-14</small>
            </span>
          </div>

          <div className="comparacion">
            <article className="version-conflicto version-conflicto--seleccionada">
              <header>
                <span>Versión A</span>
                <label className="radio">
                  <input type="radio" name="version" defaultChecked />
                  <i />
                </label>
              </header>
              <div className="version-conflicto__maleta">
                <span className="maleta-fila__icono maleta-fila__icono--info">
                  <Icono nombre="maleta" />
                </span>
                <span>
                  <code>MQ-2048</code>
                  <strong>Osteosíntesis de radio</strong>
                  <small>Hospital Metropolitano</small>
                </span>
              </div>
              <dl>
                <div>
                  <dt>Movimiento</dt>
                  <dd>Salida a cirugía</dd>
                </div>
                <div>
                  <dt>Registrado</dt>
                  <dd>Hoy, 07:51</dd>
                </div>
                <div>
                  <dt>Dispositivo</dt>
                  <dd>Bodega · PC-02</dd>
                </div>
              </dl>
              <div className="version-conflicto__persona">
                <Avatar nombre="Marcia Loor" pequeno />
                <span>
                  <small>Responsable</small>
                  <strong>Marcia Loor</strong>
                </span>
              </div>
            </article>

            <span className="versus">VS</span>

            <article className="version-conflicto">
              <header>
                <span>Versión B</span>
                <label className="radio">
                  <input type="radio" name="version" />
                  <i />
                </label>
              </header>
              <div className="version-conflicto__maleta">
                <span className="maleta-fila__icono maleta-fila__icono--aviso">
                  <Icono nombre="maleta" />
                </span>
                <span>
                  <code>MQ-2046</code>
                  <strong>Artroscopia de rodilla</strong>
                  <small>Hospital Metropolitano</small>
                </span>
              </div>
              <dl>
                <div>
                  <dt>Movimiento</dt>
                  <dd>Regreso a bodega</dd>
                </div>
                <div>
                  <dt>Registrado</dt>
                  <dd>Hoy, 07:46</dd>
                </div>
                <div>
                  <dt>Dispositivo</dt>
                  <dd>Móvil · AX-14</dd>
                </div>
              </dl>
              <div className="version-conflicto__persona">
                <Avatar nombre="Diego Salas" pequeno />
                <span>
                  <small>Responsable</small>
                  <strong>Diego Salas</strong>
                </span>
              </div>
            </article>
          </div>

          <div className="resolucion">
            <label>
              <span>
                Motivo de resolución <em>Obligatorio</em>
              </span>
              <textarea placeholder="Describe brevemente por qué esta es la ubicación correcta…" />
            </label>
            <div>
              <p>
                <Icono nombre="alerta" tamano={15} />
                La versión descartada quedará registrada en la auditoría.
              </p>
              <Boton variante="secundario">Guardar para después</Boton>
              <Boton
                icono="check"
                onClick={() => {
                  setResuelto(true);
                }}
              >
                Resolver conflicto
              </Boton>
            </div>
          </div>
          {resuelto && (
            <div className="toast toast--exito" role="status">
              <span>
                <Icono nombre="check" />
              </span>
              <div>
                <strong>Conflicto resuelto</strong>
                <p>INS-002381 fue asignado a la maleta MQ-2048.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResuelto(false);
                }}
              >
                <Icono nombre="cerrar" tamano={15} />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
