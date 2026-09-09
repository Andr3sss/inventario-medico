import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { AREAS, areaInicial } from '@crearcos/core';
import { useApp } from '../datos/contexto.js';

/**
 * No se muestra un 403 seco. Se dice que paso y a donde si puede ir la persona,
 * que es lo unico que le sirve en ese momento.
 */
export function SinAcceso(): ReactElement {
  const { sesion } = useApp();
  const destino = sesion === null ? null : areaInicial(sesion.rol);

  return (
    <div>
      <h1 className="area__titulo">Esa pantalla no es de tu rol</h1>
      <p className="area__nota">
        Tu cuenta no tiene esta area asignada. Si necesitas entrar, el Administrador puede cambiar
        tu rol.
      </p>
      {destino !== null && (
        <p className="area__nota">
          <Link to={AREAS[destino].ruta}>Volver a {AREAS[destino].titulo}</Link>
        </p>
      )}
    </div>
  );
}
