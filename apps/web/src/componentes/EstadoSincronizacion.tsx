import type { ReactElement } from 'react';
import { useApp } from '../datos/contexto.js';
import { Icono } from './Icono.js';

export function EstadoSincronizacion(): ReactElement {
  const { pendientes } = useApp();
  const hayPendientes = pendientes > 0;
  return (
    <div className={`sincronizacion${hayPendientes ? ' sincronizacion--pendiente' : ''}`}>
      <span className="sincronizacion__icono">
        <Icono nombre={hayPendientes ? 'nube' : 'wifi'} tamano={15} />
      </span>
      <span>
        <strong>
          {hayPendientes ? `${String(pendientes)} cambios pendientes` : 'Todo sincronizado'}
        </strong>
        <small>{hayPendientes ? 'Se enviarán al conectarte' : 'Actualizado hace un momento'}</small>
      </span>
    </div>
  );
}
