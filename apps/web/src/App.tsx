import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AREAS, areaInicial, puedeAcceder, type Area as NombreArea } from '@crearcos/core';
import { useApp } from './datos/contexto.js';
import { Marco } from './componentes/Marco.js';
import { Ingreso } from './pantallas/Ingreso.js';
import { Area } from './pantallas/Area.js';
import { SinAcceso } from './pantallas/SinAcceso.js';

/**
 * Guardia de ruta.
 *
 * La misma matriz que decide el menu decide el acceso. Si se dibujara el menu
 * con una lista y se validara el acceso con otra, tarde o temprano una ruta
 * quedaria alcanzable escribiendo la direccion a mano.
 */
function Protegida({ area }: { area: NombreArea }): ReactElement {
  const { sesion } = useApp();
  if (sesion === null) return <Navigate to="/ingreso" replace />;
  if (!puedeAcceder(sesion.rol, area)) {
    return (
      <Marco>
        <SinAcceso />
      </Marco>
    );
  }
  return (
    <Marco>
      <Area area={area} />
    </Marco>
  );
}

function Aterrizaje(): ReactElement {
  const { sesion } = useApp();
  if (sesion === null) return <Navigate to="/ingreso" replace />;
  const destino = areaInicial(sesion.rol);
  if (destino === null) {
    return (
      <Marco>
        <SinAcceso />
      </Marco>
    );
  }
  return <Navigate to={AREAS[destino].ruta} replace />;
}

export function App(): ReactElement {
  return (
    <Routes>
      <Route path="/ingreso" element={<Ingreso />} />
      {(Object.keys(AREAS) as NombreArea[]).map((area) => (
        <Route key={area} path={AREAS[area].ruta} element={<Protegida area={area} />} />
      ))}
      <Route path="/" element={<Aterrizaje />} />
      <Route path="*" element={<Aterrizaje />} />
    </Routes>
  );
}
