import type { ReactElement } from 'react';
export interface Campo {
  readonly nombre: string;
  readonly valor: string;
}

/**
 * Motivo estructural de la app: la etiqueta que acompana a una bandeja
 * esterilizada. Identificador arriba, pares campo y valor debajo.
 * Se usa para identificar algo con precision, no para decorar.
 */
export function EtiquetaBandeja({
  identificador,
  campos,
  className,
}: {
  identificador: string;
  campos: readonly Campo[];
  className?: string;
}): ReactElement {
  return (
    <div className={className === undefined ? 'etiqueta' : `etiqueta ${className}`}>
      <p className="etiqueta__nombre">{identificador}</p>
      {campos.length > 0 && (
        <dl className="etiqueta__campos">
          {campos.map((campo) => (
            <div key={campo.nombre} style={{ display: 'contents' }}>
              <dt className="etiqueta__campo">{campo.nombre}</dt>
              <dd className="etiqueta__valor">{campo.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
