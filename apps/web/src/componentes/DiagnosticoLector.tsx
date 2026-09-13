import { useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { Icono } from './Icono.js';
import {
  evaluarMuestraLector,
  resumirMuestrasLector,
  serializarMuestrasLectorCsv,
  sufijoDeTecla,
  type MuestraLector,
  type SufijoLector,
} from './lector-hid.js';

export function DiagnosticoLector({ onCerrar }: { readonly onCerrar: () => void }): ReactElement {
  const [esperado, setEsperado] = useState('');
  const [captura, setCaptura] = useState('');
  const [muestras, setMuestras] = useState<readonly MuestraLector[]>([]);
  const entradaCaptura = useRef<HTMLInputElement>(null);
  const instantes = useRef<number[]>([]);
  const capturando = useRef(false);
  const resumen = resumirMuestrasLector(muestras);

  const prepararCaptura = (): void => {
    instantes.current = [];
    capturando.current = false;
    entradaCaptura.current?.focus();
  };

  const finalizar = (sufijo: SufijoLector): void => {
    const recibido = entradaCaptura.current?.value ?? captura;
    if (esperado.trim() === '' || recibido.trim() === '') return;
    const muestra = evaluarMuestraLector({
      esperado,
      recibido,
      sufijo,
      instantes: instantes.current,
    });
    setMuestras((actuales) => [...actuales, muestra]);
    setCaptura('');
    instantes.current = [];
    capturando.current = false;
    globalThis.requestAnimationFrame(() => entradaCaptura.current?.focus());
  };

  const registrarTecla = (evento: KeyboardEvent<HTMLInputElement>): void => {
    const sufijo = sufijoDeTecla(evento.key);
    if (sufijo !== null) {
      evento.preventDefault();
      finalizar(sufijo);
      return;
    }
    if (evento.key.length === 1 && !evento.ctrlKey && !evento.altKey && !evento.metaKey) {
      if (!capturando.current) {
        instantes.current = [];
        capturando.current = true;
      }
      instantes.current.push(globalThis.performance.now());
    }
  };

  const exportar = (): void => {
    const csv = serializarMuestrasLectorCsv(muestras, {
      navegador: globalThis.navigator.userAgent,
      pantalla: `${String(globalThis.innerWidth)}x${String(globalThis.innerHeight)}`,
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'crearcos-diagnostico-lector.csv';
    enlace.click();
    globalThis.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  };

  return (
    <div
      className="drawer diagnostico-lector"
      role="dialog"
      aria-modal="true"
      aria-label="Diagnóstico del lector"
    >
      <button
        className="drawer__fondo"
        type="button"
        aria-label="Cerrar diagnóstico"
        onClick={onCerrar}
      />
      <aside
        className="drawer__panel drawer__panel--formulario diagnostico-lector__panel"
        onClick={(evento) => {
          evento.stopPropagation();
        }}
      >
        <header className="drawer__cabecera">
          <div>
            <p className="sobrelinea">Prueba sin movimientos de inventario</p>
            <h2>Diagnóstico del lector HID</h2>
          </div>
          <button className="boton-icono" type="button" aria-label="Cerrar" onClick={onCerrar}>
            <Icono nombre="cerrar" />
          </button>
        </header>

        <div className="drawer__contenido diagnostico-lector__contenido">
          <div className="aviso-inline aviso-inline--info">
            <Icono nombre="alerta" />
            <p>
              Estas lecturas solo generan evidencia local temporal; nunca llaman al flujo de
              escaneo.
            </p>
          </div>
          <label className="campo-ui">
            <span>Código impreso esperado</span>
            <input
              autoFocus
              value={esperado}
              autoComplete="off"
              spellCheck={false}
              placeholder="Ej. INS-4471"
              onChange={(evento) => {
                setEsperado(evento.target.value);
              }}
            />
          </label>
          <label className="campo-ui">
            <span>Captura cruda del lector</span>
            <input
              ref={entradaCaptura}
              value={captura}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={
                esperado.trim() === '' ? 'Primero escribe el valor esperado' : 'Escanea ahora'
              }
              disabled={esperado.trim() === ''}
              onFocus={prepararCaptura}
              onKeyDown={registrarTecla}
              onChange={(evento) => {
                setCaptura(evento.target.value);
              }}
            />
          </label>
          <div className="diagnostico-lector__acciones">
            <button
              className="boton boton--secundario"
              type="button"
              disabled={esperado.trim() === '' || captura.trim() === ''}
              onClick={() => {
                finalizar('NINGUNO');
              }}
            >
              Evaluar sin sufijo
            </button>
            <small>Enter y Tab se detectan automáticamente y no cambian el foco.</small>
          </div>

          <section className="diagnostico-lector__resumen" aria-label="Resumen de muestras">
            <span>
              <small>Muestras</small>
              <strong>{resumen.total}</strong>
            </span>
            <span>
              <small>Exactas</small>
              <strong>{resumen.coincidenciasExactas}</strong>
            </span>
            <span>
              <small>Con sufijo</small>
              <strong>{resumen.conSufijo}</strong>
            </span>
            <span>
              <small>En ráfaga</small>
              <strong>{resumen.rafagasCompatibles}</strong>
            </span>
          </section>

          {muestras.length > 0 && (
            <div className="diagnostico-lector__muestras">
              {[...muestras].reverse().map((muestra, indice) => (
                <div
                  className={
                    muestra.coincideExacto
                      ? 'muestra-lector muestra-lector--correcta'
                      : muestra.coincideNormalizado
                        ? 'muestra-lector muestra-lector--normalizada'
                        : 'muestra-lector muestra-lector--error'
                  }
                  key={`${String(muestras.length - indice)}-${muestra.recibido}`}
                >
                  <span>
                    <code>{muestra.recibido || 'VACÍO'}</code>
                    <small>Esperado: {muestra.esperado}</small>
                  </span>
                  <span>
                    <strong>
                      {muestra.coincideExacto
                        ? 'Exacta'
                        : muestra.coincideNormalizado
                          ? 'Solo normalizada'
                          : 'Diferente'}
                    </strong>
                    <small>
                      {muestra.sufijo} ·{' '}
                      {muestra.duracionMs === null
                        ? 'sin cadencia'
                        : `${muestra.duracionMs.toFixed(1)} ms`}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="drawer__pie">
          <button
            className="boton boton--secundario"
            type="button"
            disabled={muestras.length === 0}
            onClick={() => {
              setMuestras([]);
            }}
          >
            Limpiar
          </button>
          <button
            className="boton"
            type="button"
            disabled={muestras.length === 0}
            onClick={exportar}
          >
            Exportar evidencia CSV
          </button>
        </footer>
      </aside>
    </div>
  );
}
