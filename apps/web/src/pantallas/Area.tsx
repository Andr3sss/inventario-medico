import type { ReactElement } from 'react';
import type { Area as NombreArea } from '@crearcos/core';
import { Tablero } from './Tablero.js';
import { Inventario } from './Inventario.js';
import { Maletas } from './Maletas.js';
import { Cirugia } from './Cirugia.js';
import { Reprocesamiento } from './Reprocesamiento.js';
import { Conflictos } from './Conflictos.js';
import { Facturacion } from './Facturacion.js';
import { Usuarios } from './Usuarios.js';

export function Area({ area }: { area: NombreArea }): ReactElement {
  switch (area) {
    case 'tablero':
      return <Tablero />;
    case 'inventario':
      return <Inventario />;
    case 'maletas':
      return <Maletas />;
    case 'cirugia':
      return <Cirugia />;
    case 'reprocesamiento':
      return <Reprocesamiento />;
    case 'conflictos':
      return <Conflictos />;
    case 'facturacion':
      return <Facturacion />;
    case 'usuarios':
      return <Usuarios />;
  }
}
