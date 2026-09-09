import { useState } from 'react';
import type { ReactElement } from 'react';
import { Avatar, BarraBusqueda, Boton, EncabezadoPagina, Estado } from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';

const USUARIOS = [
  {
    nombre: 'Andrés Quisilema',
    correo: 'andres@crearcos.ec',
    rol: 'Administrador',
    estado: 'Activo',
    actividad: 'Ahora',
    dispositivo: 'PC-ADMIN-01',
  },
  {
    nombre: 'Marcia Loor',
    correo: 'marcia@crearcos.ec',
    rol: 'Auxiliar / Instrumentista',
    estado: 'Activo',
    actividad: 'Hace 4 min',
    dispositivo: 'Móvil · AX-12',
  },
  {
    nombre: 'Priscila Castro',
    correo: 'priscila@crearcos.ec',
    rol: 'Coordinadora',
    estado: 'Activo',
    actividad: 'Hace 18 min',
    dispositivo: 'PC-COORD-01',
  },
  {
    nombre: 'Verónica Andrade',
    correo: 'veronica@crearcos.ec',
    rol: 'Contable',
    estado: 'Activo',
    actividad: 'Ayer, 17:42',
    dispositivo: 'PC-CONT-02',
  },
  {
    nombre: 'Karina Villa',
    correo: 'karina@crearcos.ec',
    rol: 'Auxiliar / Instrumentista',
    estado: 'Inactivo',
    actividad: '24 ago 2026',
    dispositivo: 'Sin dispositivo',
  },
];

const INSTITUCIONES = [
  {
    nombre: 'Hospital Metropolitano',
    ciudad: 'Quito',
    ruc: '1790012345001',
    nivel: 'Habitual · +10%',
    operaciones: 42,
  },
  {
    nombre: 'Clínica Millenium',
    ciudad: 'Ambato',
    ruc: '1890123456001',
    nivel: 'Provincia · +20%',
    operaciones: 18,
  },
  {
    nombre: 'Hospital San Juan',
    ciudad: 'Quito',
    ruc: '1791234567001',
    nivel: 'Nota de crédito · +30%',
    operaciones: 11,
  },
];

export function Usuarios(): ReactElement {
  const [tab, setTab] = useState<'usuarios' | 'instituciones'>('usuarios');
  const [busqueda, setBusqueda] = useState('');
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="pagina">
      <EncabezadoPagina
        sobrelinea="Administración"
        titulo={tab === 'usuarios' ? 'Usuarios y accesos' : 'Instituciones'}
        descripcion={
          tab === 'usuarios'
            ? 'Gestiona el equipo, sus roles y el estado de cada acceso.'
            : 'Configura hospitales, ubicación y nivel de precio predeterminado.'
        }
        acciones={
          <Boton
            icono="mas"
            onClick={() => {
              setDrawer(true);
            }}
          >
            {tab === 'usuarios' ? 'Nuevo usuario' : 'Nueva institución'}
          </Boton>
        }
      />
      <div className="tabs tabs--pagina">
        <button
          type="button"
          className={tab === 'usuarios' ? 'activo' : ''}
          onClick={() => {
            setTab('usuarios');
          }}
        >
          <Icono nombre="usuarios" />
          Usuarios <span>8</span>
        </button>
        <button
          type="button"
          className={tab === 'instituciones' ? 'activo' : ''}
          onClick={() => {
            setTab('instituciones');
          }}
        >
          <Icono nombre="hospital" />
          Instituciones <span>3</span>
        </button>
      </div>
      {tab === 'usuarios' ? (
        <section className="panel tabla-panel">
          <div className="herramientas-tabla">
            <BarraBusqueda
              valor={busqueda}
              alCambiar={setBusqueda}
              placeholder="Buscar por nombre, correo o rol…"
            />
            <button type="button" className="control-filtro">
              <Icono nombre="filtros" />
              Todos los roles
            </button>
          </div>
          <div className="tabla-contenedor">
            <table className="tabla tabla--usuarios">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Última actividad</th>
                  <th>Dispositivo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {USUARIOS.filter((usuario) =>
                  `${usuario.nombre} ${usuario.correo} ${usuario.rol}`
                    .toLocaleLowerCase()
                    .includes(busqueda.toLocaleLowerCase()),
                ).map((usuario) => (
                  <tr key={usuario.correo}>
                    <td>
                      <span className="usuario-celda">
                        <Avatar nombre={usuario.nombre} />
                        <span>
                          <strong>{usuario.nombre}</strong>
                          <small>{usuario.correo}</small>
                        </span>
                      </span>
                    </td>
                    <td>{usuario.rol}</td>
                    <td>
                      <Estado tono={usuario.estado === 'Activo' ? 'exito' : 'neutral'}>
                        {usuario.estado}
                      </Estado>
                    </td>
                    <td>
                      <span className="actividad-celda">
                        <i className={usuario.actividad === 'Ahora' ? 'en-linea' : ''} />
                        {usuario.actividad}
                      </span>
                    </td>
                    <td className="texto-suave">{usuario.dispositivo}</td>
                    <td>
                      <button
                        type="button"
                        className="boton-icono boton-icono--sutil"
                        onClick={() => {
                          setDrawer(true);
                        }}
                      >
                        <Icono nombre="menu" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lista-movil">
            {USUARIOS.map((usuario) => (
              <button
                type="button"
                className="fila-movil"
                key={usuario.correo}
                onClick={() => {
                  setDrawer(true);
                }}
              >
                <span className="usuario-celda">
                  <Avatar nombre={usuario.nombre} />
                  <span>
                    <strong>{usuario.nombre}</strong>
                    <small>
                      {usuario.rol} · {usuario.actividad}
                    </small>
                  </span>
                </span>
                <Estado tono={usuario.estado === 'Activo' ? 'exito' : 'neutral'}>
                  {usuario.estado}
                </Estado>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="instituciones-grid">
          {INSTITUCIONES.map((institucion) => (
            <article className="panel institucion-card" key={institucion.ruc}>
              <header>
                <span className="institucion-card__icono">
                  <Icono nombre="hospital" />
                </span>
                <button type="button" className="boton-icono boton-icono--sutil">
                  <Icono nombre="menu" />
                </button>
              </header>
              <h2>{institucion.nombre}</h2>
              <p>
                <Icono nombre="ubicacion" tamano={14} />
                {institucion.ciudad}
              </p>
              <dl>
                <div>
                  <dt>RUC</dt>
                  <dd>{institucion.ruc}</dd>
                </div>
                <div>
                  <dt>Nivel predeterminado</dt>
                  <dd>
                    <span className="nivel-precio">{institucion.nivel[0]}</span>
                    {institucion.nivel}
                  </dd>
                </div>
                <div>
                  <dt>Operaciones este año</dt>
                  <dd>{institucion.operaciones}</dd>
                </div>
              </dl>
              <button type="button" className="enlace-accion">
                Ver configuración <Icono nombre="flechaDerecha" tamano={15} />
              </button>
            </article>
          ))}
        </section>
      )}

      {drawer && (
        <div className="drawer" role="dialog" aria-modal="true">
          <button
            type="button"
            className="drawer__fondo"
            aria-label="Cerrar"
            onClick={() => {
              setDrawer(false);
            }}
          />
          <aside className="drawer__panel drawer__panel--formulario">
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">Administración</p>
                <h2>{tab === 'usuarios' ? 'Nuevo usuario' : 'Nueva institución'}</h2>
              </div>
              <button
                type="button"
                className="boton-icono"
                onClick={() => {
                  setDrawer(false);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <div className="drawer__contenido formulario-drawer">
              {tab === 'usuarios' ? (
                <>
                  <label className="campo-ui">
                    <span>Nombre completo</span>
                    <input placeholder="Ej. Ana Pérez" />
                  </label>
                  <label className="campo-ui">
                    <span>Correo electrónico</span>
                    <input type="email" placeholder="nombre@crearcos.ec" />
                  </label>
                  <label className="campo-ui">
                    <span>Rol</span>
                    <select defaultValue="">
                      <option value="" disabled>
                        Seleccionar rol
                      </option>
                      <option>Administrador</option>
                      <option>Auxiliar / Instrumentista</option>
                      <option>Coordinadora</option>
                      <option>Contable</option>
                      <option>Supervisor</option>
                    </select>
                  </label>
                  <div className="aviso-inline aviso-inline--info">
                    <Icono nombre="alerta" />
                    <p>Se generará una contraseña temporal para el primer ingreso.</p>
                  </div>
                </>
              ) : (
                <>
                  <label className="campo-ui">
                    <span>Nombre de la institución</span>
                    <input placeholder="Ej. Hospital Central" />
                  </label>
                  <label className="campo-ui">
                    <span>RUC</span>
                    <input placeholder="0000000000000" />
                  </label>
                  <label className="campo-ui">
                    <span>Ciudad</span>
                    <input placeholder="Quito" />
                  </label>
                  <label className="campo-ui">
                    <span>Nivel de precio</span>
                    <select>
                      <option>Precio habitual · +10%</option>
                      <option>Precio provincia · +20%</option>
                      <option>Nota de crédito · +30%</option>
                    </select>
                  </label>
                </>
              )}
            </div>
            <footer className="drawer__pie">
              <Boton
                variante="secundario"
                onClick={() => {
                  setDrawer(false);
                }}
              >
                Cancelar
              </Boton>
              <Boton icono="check">Guardar</Boton>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
