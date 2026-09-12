import { useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { CodigoResultadoEscaneo } from '@crearcos/data';
import { Icono } from './Icono.js';

export interface ResultadoVisualEscaneo {
  readonly codigo: CodigoResultadoEscaneo | 'FALLO' | 'KIT';
  readonly titulo: string;
  readonly detalle: string;
}

function claseResultado(codigo: ResultadoVisualEscaneo['codigo']): string {
  if (codigo === 'EXITO') return 'correcto';
  if (codigo === 'KIT') return 'kit';
  if (codigo === 'REBOTE_IGNORADO') return 'duplicado';
  if (codigo === 'PIEZA_NO_ENCONTRADA') return 'no-encontrado';
  return 'conflicto';
}

export function Escaner({
  titulo = 'Escanear instrumento',
  ayuda = 'El lector está listo. Escanea la etiqueta para continuar.',
  compacto = false,
  resultado,
  procesando,
  onEscanear,
  onLimpiarResultado,
}: {
  readonly titulo?: string;
  readonly ayuda?: string;
  readonly compacto?: boolean;
  readonly resultado: ResultadoVisualEscaneo | null;
  readonly procesando: boolean;
  readonly onEscanear: (codigo: string) => Promise<void>;
  readonly onLimpiarResultado: () => void;
}): ReactElement {
  const [codigo, setCodigo] = useState('');
  const entrada = useRef<HTMLInputElement>(null);
  const clase = resultado === null ? '' : ` escaner--${claseResultado(resultado.codigo)}`;

  const enviar = async (evento: FormEvent): Promise<void> => {
    evento.preventDefault();
    const normalizado = codigo.trim().toLocaleUpperCase();
    if (normalizado === '' || procesando) return;
    await onEscanear(normalizado);
    setCodigo('');
    entrada.current?.focus();
  };

  return (
    <section
      className={`escaner${compacto ? ' escaner--compacto' : ''}${clase}${procesando ? ' escaner--procesando' : ''}`}
      onClick={() => entrada.current?.focus()}
    >
      <form
        onSubmit={(evento) => {
          void enviar(evento);
        }}
      >
        <span className="escaner__icono">
          <Icono nombre="scanner" tamano={compacto ? 25 : 31} />
        </span>
        <div className="escaner__texto">
          <p className="sobrelinea">
            {procesando ? 'Guardando en este dispositivo' : 'Lector activo'}
          </p>
          <h2>{titulo}</h2>
          <p>{ayuda}</p>
        </div>
        <label className="escaner__entrada">
          <span className="solo-lector">Código del instrumento</span>
          <input
            ref={entrada}
            autoFocus
            disabled={procesando}
            value={codigo}
            onChange={(evento) => { setCodigo(evento.target.value); }}
            placeholder={procesando ? 'Confirmando…' : 'Esperando código…'}
          />
          <span className="escaner__pulso" />
        </label>
      </form>
      {resultado !== null && (
        <div className="resultado-escaneo" role="status">
          <span className="resultado-escaneo__icono">
            <Icono
              nombre={
                resultado.codigo === 'EXITO'
                  ? 'check'
                  : resultado.codigo === 'KIT'
                    ? 'caja'
                    : resultado.codigo === 'PIEZA_NO_ENCONTRADA'
                      ? 'cerrar'
                      : 'alerta'
              }
            />
          </span>
          <span>
            <strong>{resultado.titulo}</strong>
            <small>{resultado.detalle}</small>
          </span>
          <button
            type="button"
            className="boton-icono boton-icono--sutil"
            aria-label="Cerrar aviso"
            onClick={(evento) => {
              evento.stopPropagation();
              onLimpiarResultado();
            }}
          >
            <Icono nombre="cerrar" tamano={16} />
          </button>
        </div>
      )}
    </section>
  );
}
