import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, MouseEvent, ReactElement } from 'react';
import type { CodigoResultadoEscaneo } from '@crearcos/data';
import { Icono } from './Icono.js';
import { DiagnosticoLector } from './DiagnosticoLector.js';
import { normalizarCodigoLector, sufijoDeTecla } from './lector-hid.js';

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
  const [diagnosticoAbierto, setDiagnosticoAbierto] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const enviando = useRef(false);
  const clase = resultado === null ? '' : ` escaner--${claseResultado(resultado.codigo)}`;

  useEffect(() => {
    if (!procesando && !diagnosticoAbierto) entrada.current?.focus();
  }, [procesando, diagnosticoAbierto]);

  useEffect(() => {
    const recuperarFoco = (): void => {
      if (document.visibilityState === 'visible' && !procesando && !diagnosticoAbierto) {
        entrada.current?.focus();
      }
    };
    globalThis.addEventListener('focus', recuperarFoco);
    document.addEventListener('visibilitychange', recuperarFoco);
    return () => {
      globalThis.removeEventListener('focus', recuperarFoco);
      document.removeEventListener('visibilitychange', recuperarFoco);
    };
  }, [procesando, diagnosticoAbierto]);

  const enviarCodigo = async (): Promise<void> => {
    const normalizado = normalizarCodigoLector(codigo);
    if (normalizado === '' || procesando || enviando.current) return;
    enviando.current = true;
    try {
      await onEscanear(normalizado);
      setCodigo('');
    } finally {
      enviando.current = false;
    }
  };

  const enviar = (evento: FormEvent): void => {
    evento.preventDefault();
    void enviarCodigo();
  };

  const confirmarSufijo = (evento: KeyboardEvent<HTMLInputElement>): void => {
    if (sufijoDeTecla(evento.key) === null || evento.repeat) return;
    evento.preventDefault();
    void enviarCodigo();
  };

  const enfocarDesdePanel = (evento: MouseEvent<HTMLElement>): void => {
    const objetivo = evento.target;
    if (!(objetivo instanceof Element)) return;
    if (objetivo.closest('button,input,select,textarea,[role="dialog"]') === null) {
      entrada.current?.focus();
    }
  };

  return (
    <>
      <section
        className={`escaner${compacto ? ' escaner--compacto' : ''}${clase}${procesando ? ' escaner--procesando' : ''}`}
        onClick={enfocarDesdePanel}
      >
        <form onSubmit={enviar}>
          <span className="escaner__icono">
            <Icono nombre="scanner" tamano={compacto ? 25 : 31} />
          </span>
          <div className="escaner__texto">
            <p className="sobrelinea">
              {procesando ? 'Guardando en este dispositivo' : 'Lector activo'}
            </p>
            <h2>{titulo}</h2>
            <p>{ayuda}</p>
            <button
              className="escaner__diagnostico"
              type="button"
              onClick={() => {
                setDiagnosticoAbierto(true);
              }}
            >
              Probar lector sin registrar
            </button>
          </div>
          <label className="escaner__entrada">
            <span className="solo-lector">Código del instrumento</span>
            <input
              ref={entrada}
              autoFocus
              disabled={procesando}
              value={codigo}
              autoComplete="off"
              autoCapitalize="characters"
              enterKeyHint="done"
              spellCheck={false}
              onKeyDown={confirmarSufijo}
              onChange={(evento) => {
                setCodigo(evento.target.value);
              }}
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
      {diagnosticoAbierto && (
        <DiagnosticoLector
          onCerrar={() => {
            setDiagnosticoAbierto(false);
          }}
        />
      )}
    </>
  );
}
