import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AREAS, areaDeRuta, areasDe, type Area } from '@crearcos/core';
import { useApp } from '../datos/contexto.js';
import { EstadoSincronizacion } from './EstadoSincronizacion.js';
import { Icono, type NombreIcono } from './Icono.js';
import { Avatar } from './UI.js';

const ETIQUETA_ROL: Readonly<Record<string, string>> = {
  ADMINISTRADOR: 'Administrador',
  AUXILIAR: 'Auxiliar de bodega',
  COORDINADORA: 'Coordinadora',
  CONTABLE: 'Contabilidad',
  SUPERVISOR: 'Supervisor',
  FREELANCE: 'Instrumentista externo',
};

const ICONOS_AREA: Readonly<Record<Area, NombreIcono>> = {
  tablero: 'inicio',
  maletas: 'maleta',
  cirugia: 'cirugia',
  inventario: 'inventario',
  reprocesamiento: 'reprocesar',
  conflictos: 'conflicto',
  facturacion: 'factura',
  usuarios: 'usuarios',
};

function Logo(): ReactElement {
  return (
    <div className="marca">
      <span className="marca__simbolo" aria-hidden="true">
        <span />
        <span />
      </span>
      <span className="marca__texto">
        <strong>Crearcos</strong>
        <small>Inventario quirúrgico</small>
      </span>
    </div>
  );
}

function EnlaceArea({
  area,
  compacto = false,
}: {
  readonly area: Area;
  readonly compacto?: boolean;
}): ReactElement {
  return (
    <NavLink
      to={AREAS[area].ruta}
      className={compacto ? 'nav-movil__enlace' : 'navegacion__enlace'}
    >
      <Icono nombre={ICONOS_AREA[area]} tamano={compacto ? 20 : 18} />
      <span>{AREAS[area].titulo}</span>
    </NavLink>
  );
}

export function Marco({ children }: { children: ReactNode }): ReactElement {
  const { sesion, salir, persistente } = useApp();
  const [menuMovil, setMenuMovil] = useState(false);
  const ubicacion = useLocation();
  if (sesion === null) return <>{children}</>;

  const areas = areasDe(sesion.rol);
  const areaActual = areaDeRuta(ubicacion.pathname);
  const principalesMovil = areas.length <= 4 ? areas : areas.slice(0, 3);
  const restantesMovil = areas.length <= 4 ? [] : areas.slice(3);

  return (
    <div className="marco">
      <aside className="sidebar">
        <div className="sidebar__marca">
          <Logo />
        </div>
        <nav className="navegacion" aria-label="Áreas disponibles">
          <p className="navegacion__grupo">Espacio de trabajo</p>
          {areas.map((area) => (
            <EnlaceArea key={area} area={area} />
          ))}
        </nav>
        <div className="sidebar__pie">
          <EstadoSincronizacion />
          <div className="perfil-compacto">
            <Avatar nombre={sesion.nombre} />
            <span className="perfil-compacto__texto">
              <strong>{sesion.nombre}</strong>
              <small>{ETIQUETA_ROL[sesion.rol] ?? sesion.rol}</small>
            </span>
            <button
              type="button"
              className="boton-icono boton-icono--sutil"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              onClick={() => {
                void salir();
              }}
            >
              <Icono nombre="flechaDerecha" />
            </button>
          </div>
        </div>
      </aside>

      <div className="marco__principal">
        <header className="topbar">
          <div className="topbar__marca-movil">
            <Logo />
          </div>
          <div className="topbar__ruta">
            <span>Crearcos</span>
            <Icono nombre="chevron" tamano={14} />
            <strong>{areaActual === null ? 'Panel' : AREAS[areaActual].titulo}</strong>
          </div>
          <div className="topbar__acciones">
            <button type="button" className="busqueda-global" aria-label="Abrir búsqueda">
              <Icono nombre="buscar" />
              <span>Buscar en el sistema</span>
              <kbd>⌘ K</kbd>
            </button>
            <button type="button" className="boton-icono" aria-label="Notificaciones">
              <Icono nombre="campana" />
              <span className="boton-icono__aviso" />
            </button>
            <span className="topbar__avatar">
              <Avatar nombre={sesion.nombre} pequeno />
            </span>
          </div>
        </header>

        {!persistente && (
          <div className="aviso-persistencia" role="status">
            <Icono nombre="nube" />
            <span>Almacenamiento temporal · sincroniza antes de cerrar este dispositivo.</span>
          </div>
        )}
        <main className="marco__contenido">{children}</main>
      </div>

      <nav className="nav-movil" aria-label="Navegación principal">
        {principalesMovil.map((area) => (
          <EnlaceArea key={area} area={area} compacto />
        ))}
        {restantesMovil.length > 0 && (
          <button
            type="button"
            className={`nav-movil__enlace${menuMovil ? ' nav-movil__enlace--activo' : ''}`}
            onClick={() => {
              setMenuMovil((actual) => !actual);
            }}
          >
            <Icono nombre="menu" tamano={20} />
            <span>Más</span>
          </button>
        )}
      </nav>

      {menuMovil && restantesMovil.length > 0 && (
        <div className="menu-movil" role="dialog" aria-label="Más secciones">
          <button
            className="menu-movil__fondo"
            type="button"
            aria-label="Cerrar menú"
            onClick={() => {
              setMenuMovil(false);
            }}
          />
          <div className="menu-movil__hoja">
            <div className="menu-movil__cabecera">
              <div>
                <p className="sobrelinea">Navegación</p>
                <h2>Más secciones</h2>
              </div>
              <button
                className="boton-icono"
                type="button"
                aria-label="Cerrar"
                onClick={() => {
                  setMenuMovil(false);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </div>
            {restantesMovil.map((area) => (
              <div
                key={area}
                onClick={() => {
                  setMenuMovil(false);
                }}
              >
                <EnlaceArea area={area} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
