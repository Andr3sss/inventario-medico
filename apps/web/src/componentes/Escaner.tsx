import { useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Icono } from './Icono.js';

type TipoResultado = 'correcto' | 'duplicado' | 'conflicto' | 'no-encontrado';

const RESULTADOS: Readonly<
  Record<TipoResultado, { readonly titulo: string; readonly texto: string }>
> = {
  correcto: { titulo: 'Instrumento agregado', texto: 'INS-002416 · Separador Farabeuf par' },
  duplicado: {
    titulo: 'Este instrumento ya está registrado',
    texto: 'INS-002294 · No se realizaron cambios',
  },
  conflicto: {
    titulo: 'Instrumento asignado a otra operación',
    texto: 'INS-002381 · Maleta MQ-2046',
  },
  'no-encontrado': {
    titulo: 'Código no registrado',
    texto: 'Verifica la etiqueta o registra la pieza',
  },
};

export function Escaner({
  titulo = 'Escanear instrumento',
  ayuda = 'El lector está listo. Escanea la etiqueta para continuar.',
  compacto = false,
}: {
  readonly titulo?: string;
  readonly ayuda?: string;
  readonly compacto?: boolean;
}): ReactElement {
  const [codigo, setCodigo] = useState('');
  const [resultado, setResultado] = useState<TipoResultado | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const enviar = (evento: FormEvent): void => {
    evento.preventDefault();
    const normalizado = codigo.trim().toLocaleUpperCase();
    if (normalizado === '') return;
    if (normalizado.endsWith('381')) setResultado('conflicto');
    else if (normalizado.endsWith('294')) setResultado('duplicado');
    else if (normalizado.startsWith('X')) setResultado('no-encontrado');
    else setResultado('correcto');
    setCodigo('');
    entrada.current?.focus();
  };

  return (
    <section
      className={`escaner${compacto ? ' escaner--compacto' : ''}${resultado === null ? '' : ` escaner--${resultado}`}`}
      onClick={() => entrada.current?.focus()}
    >
      <form onSubmit={enviar}>
        <span className="escaner__icono">
          <Icono nombre="scanner" tamano={compacto ? 25 : 31} />
        </span>
        <div className="escaner__texto">
          <p className="sobrelinea">Lector activo</p>
          <h2>{titulo}</h2>
          <p>{ayuda}</p>
        </div>
        <label className="escaner__entrada">
          <span className="solo-lector">Código del instrumento</span>
          <input
            ref={entrada}
            autoFocus
            value={codigo}
            onChange={(evento) => {
              setCodigo(evento.target.value);
            }}
            placeholder="Esperando código…"
          />
          <span className="escaner__pulso" />
        </label>
      </form>
      {resultado !== null && (
        <div className="resultado-escaneo" role="status">
          <span className="resultado-escaneo__icono">
            <Icono
              nombre={
                resultado === 'correcto'
                  ? 'check'
                  : resultado === 'no-encontrado'
                    ? 'cerrar'
                    : 'alerta'
              }
            />
          </span>
          <span>
            <strong>{RESULTADOS[resultado].titulo}</strong>
            <small>{RESULTADOS[resultado].texto}</small>
          </span>
          <button
            type="button"
            className="boton-icono boton-icono--sutil"
            aria-label="Cerrar aviso"
            onClick={(evento) => {
              evento.stopPropagation();
              setResultado(null);
            }}
          >
            <Icono nombre="cerrar" tamano={16} />
          </button>
        </div>
      )}
    </section>
  );
}
