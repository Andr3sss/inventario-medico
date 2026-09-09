import type { ReactElement, ReactNode } from 'react';
import { Icono, type NombreIcono } from './Icono.js';

export type TonoEstado = 'exito' | 'info' | 'aviso' | 'peligro' | 'neutral' | 'violeta';

export function Estado({
  tono,
  children,
  punto = true,
}: {
  readonly tono: TonoEstado;
  readonly children: ReactNode;
  readonly punto?: boolean;
}): ReactElement {
  return (
    <span className={`estado estado--${tono}`}>
      {punto && <span className="estado__punto" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function EncabezadoPagina({
  sobrelinea,
  titulo,
  descripcion,
  acciones,
}: {
  readonly sobrelinea?: string;
  readonly titulo: string;
  readonly descripcion: string;
  readonly acciones?: ReactNode;
}): ReactElement {
  return (
    <header className="encabezado-pagina">
      <div>
        {sobrelinea !== undefined && <p className="sobrelinea">{sobrelinea}</p>}
        <h1>{titulo}</h1>
        <p className="encabezado-pagina__descripcion">{descripcion}</p>
      </div>
      {acciones !== undefined && <div className="encabezado-pagina__acciones">{acciones}</div>}
    </header>
  );
}

export function Boton({
  children,
  icono,
  variante = 'primario',
  className = '',
  ...propiedades
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly icono?: NombreIcono;
  readonly variante?: 'primario' | 'secundario' | 'fantasma' | 'peligro';
}): ReactElement {
  return (
    <button className={`boton boton--${variante} ${className}`.trim()} {...propiedades}>
      {icono !== undefined && <Icono nombre={icono} />}
      <span>{children}</span>
    </button>
  );
}

export function Avatar({
  nombre,
  pequeno = false,
}: {
  readonly nombre: string;
  readonly pequeno?: boolean;
}): ReactElement {
  const iniciales = nombre
    .split(' ')
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('');
  return <span className={`avatar${pequeno ? ' avatar--pequeno' : ''}`}>{iniciales}</span>;
}

export function Vacio({
  icono,
  titulo,
  texto,
}: {
  readonly icono: NombreIcono;
  readonly titulo: string;
  readonly texto: string;
}): ReactElement {
  return (
    <div className="vacio">
      <span className="vacio__icono">
        <Icono nombre={icono} tamano={22} />
      </span>
      <h3>{titulo}</h3>
      <p>{texto}</p>
    </div>
  );
}

export function BarraBusqueda({
  valor,
  alCambiar,
  placeholder,
}: {
  readonly valor: string;
  readonly alCambiar: (valor: string) => void;
  readonly placeholder: string;
}): ReactElement {
  return (
    <label className="busqueda">
      <Icono nombre="buscar" />
      <span className="solo-lector">Buscar</span>
      <input
        value={valor}
        onChange={(evento) => {
          alCambiar(evento.target.value);
        }}
        placeholder={placeholder}
      />
      <kbd>⌘ K</kbd>
    </label>
  );
}
