import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Maleta } from '@crearcos/core';
import {
  generarTokenFreelance,
  listarTokensFreelance,
  listarUsuariosBasico,
  revocarTokenFreelance,
  type FilaTokenFreelance,
  type UsuarioBasico,
} from '@crearcos/data';
import { useApp } from '../datos/contexto.js';
import { formatearFecha, mensajeExcepcion } from '../datos/presentacion.js';
import { Icono } from './Icono.js';
import { Boton, CargandoPanel, Estado, MensajeEstado, Vacio } from './UI.js';

export function GestorFreelance({
  maleta,
  alCerrar,
}: {
  readonly maleta: Maleta;
  readonly alCerrar: () => void;
}): ReactElement {
  const { db, sesion, ahora, administracionCentral } = useApp();
  const [tokens, setTokens] = useState<readonly FilaTokenFreelance[]>([]);
  const [usuarios, setUsuarios] = useState<readonly UsuarioBasico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{
    tipo: 'exito' | 'error' | 'info';
    titulo: string;
    texto?: string;
  } | null>(null);

  const urlDe = useCallback(
    (token: string): string => `${globalThis.location.origin}/acceso-freelance/${token}`,
    [],
  );

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true);
    try {
      const [filas, personas] = await Promise.all([
        administracionCentral === null
          ? listarTokensFreelance(db, maleta.id)
          : administracionCentral.listarAccesosFreelance(maleta.id),
        listarUsuariosBasico(db, { incluirInactivos: true }),
      ]);
      setTokens([...filas].sort((a, b) => b.creadoEn - a.creadoEn));
      setUsuarios(personas);
    } catch (excepcion) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudieron cargar los enlaces',
        texto: mensajeExcepcion(excepcion),
      });
    } finally {
      setCargando(false);
    }
  }, [administracionCentral, db, maleta.id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const usuariosPorId = useMemo(
    () => new Map(usuarios.map((usuario) => [usuario.usuarioId, usuario.nombre])),
    [usuarios],
  );

  const generar = async (): Promise<void> => {
    if (sesion === null) return;
    setProcesando('nuevo');
    setMensaje(null);
    try {
      const resultado =
        administracionCentral === null
          ? await generarTokenFreelance(db, maleta.id, sesion, { ahora })
          : {
              ok: true as const,
              valor: await administracionCentral.crearAccesoFreelance(maleta.id),
            };
      if (!resultado.ok) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudo generar el enlace',
          texto: resultado.error.mensaje,
        });
        return;
      }
      setMensaje({
        tipo: 'exito',
        titulo: 'Enlace listo para compartir',
        texto: 'Permanecerá activo hasta el cierre o cancelación de la maleta.',
      });
      await cargar();
      await copiar(resultado.valor.token);
    } catch (excepcion) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo generar el enlace',
        texto: mensajeExcepcion(excepcion),
      });
    } finally {
      setProcesando(null);
    }
  };

  const copiar = async (token: string): Promise<void> => {
    try {
      await globalThis.navigator.clipboard.writeText(urlDe(token));
      setCopiado(token);
      globalThis.setTimeout(() => {
        setCopiado((actual) => (actual === token ? null : actual));
      }, 2_000);
    } catch (excepcion) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo copiar automáticamente',
        texto: `${mensajeExcepcion(excepcion)}. Selecciona la dirección para copiarla manualmente.`,
      });
    }
  };

  const revocar = async (token: string): Promise<void> => {
    if (sesion === null) return;
    setProcesando(token);
    setMensaje(null);
    try {
      if (administracionCentral === null) {
        const resultado = await revocarTokenFreelance(db, token, sesion);
        if (!resultado.ok) {
          setMensaje({
            tipo: 'error',
            titulo: 'No se pudo revocar el enlace',
            texto: resultado.error.mensaje,
          });
          return;
        }
      } else {
        await administracionCentral.revocarAccesoFreelance(token);
      }
      setMensaje({
        tipo: 'info',
        titulo: 'Enlace revocado',
        texto: 'Ya no podrá utilizarse para abrir una sesión.',
      });
      await cargar();
    } catch (excepcion) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo revocar el enlace',
        texto: mensajeExcepcion(excepcion),
      });
    } finally {
      setProcesando(null);
    }
  };

  return (
    <div
      className="drawer"
      role="dialog"
      aria-modal="true"
      aria-label={`Acceso freelance para ${maleta.id}`}
    >
      <button
        type="button"
        className="drawer__fondo"
        aria-label="Cerrar enlaces"
        onClick={alCerrar}
      />
      <aside className="drawer__panel drawer__panel--freelance">
        <header className="drawer__cabecera">
          <div>
            <p className="sobrelinea">Instrumentista externo</p>
            <h2>Acceso freelance</h2>
          </div>
          <button type="button" className="boton-icono" aria-label="Cerrar" onClick={alCerrar}>
            <Icono nombre="cerrar" />
          </button>
        </header>
        <div className="drawer__contenido gestor-freelance">
          <div className="freelance-maleta">
            <span>
              <Icono nombre="cirugia" tamano={21} />
            </span>
            <div>
              <small>Operación en cirugía</small>
              <code>{maleta.id}</code>
              <strong>{maleta.procedimiento ?? 'Procedimiento no especificado'}</strong>
            </div>
            <Estado tono="info">En cirugía</Estado>
          </div>
          <div className="aviso-inline aviso-inline--info">
            <Icono nombre="enlace" />
            <p>
              Cualquier persona con un enlace activo podrá registrar uso para esta maleta. El acceso
              termina cuando la operación se cierra o cancela.
            </p>
          </div>
          {mensaje !== null && <MensajeEstado {...mensaje} />}
          <div className="gestor-freelance__titulo">
            <div>
              <h3>Enlaces generados</h3>
              <p>
                {tokens.filter((token) => !token.revocado).length} activos{' '}
                {administracionCentral === null ? 'en este dispositivo' : 'en Supabase'}
              </p>
            </div>
            <Boton
              icono="enlace"
              disabled={procesando !== null}
              onClick={() => {
                void generar();
              }}
            >
              {procesando === 'nuevo' ? 'Generando…' : 'Generar enlace'}
            </Boton>
          </div>
          {cargando ? (
            <CargandoPanel filas={3} />
          ) : tokens.length === 0 ? (
            <Vacio
              icono="enlace"
              titulo="Todavía no hay enlaces"
              texto="Genera uno cuando el instrumentista externo esté listo para ingresar."
            />
          ) : (
            <div className="enlaces-freelance">
              {tokens.map((fila) => (
                <article
                  className={`enlace-freelance${fila.revocado ? ' enlace-freelance--revocado' : ''}`}
                  key={fila.token}
                >
                  <div className="enlace-freelance__cabecera">
                    <Estado tono={fila.revocado ? 'neutral' : 'exito'}>
                      {fila.revocado ? 'Revocado' : 'Activo'}
                    </Estado>
                    <time>Creado {formatearFecha(fila.creadoEn)}</time>
                  </div>
                  <div className="enlace-freelance__url">
                    <input
                      value={
                        fila.secretoDisponible === false
                          ? `Enlace ${fila.tokenPrefijo ?? ''}… (secreto no recuperable)`
                          : urlDe(fila.token)
                      }
                      readOnly
                      aria-label="Dirección del acceso freelance"
                    />
                    <button
                      type="button"
                      className="boton-icono"
                      aria-label="Copiar enlace"
                      disabled={fila.revocado || fila.secretoDisponible === false}
                      onClick={() => {
                        void copiar(fila.token);
                      }}
                    >
                      <Icono nombre={copiado === fila.token ? 'check' : 'copiar'} tamano={16} />
                    </button>
                  </div>
                  <footer>
                    <small title={fila.creadoPorId}>
                      Creado por {usuariosPorId.get(fila.creadoPorId) ?? fila.creadoPorId}
                    </small>
                    {!fila.revocado && (
                      <button
                        type="button"
                        className="accion-texto accion-texto--peligro"
                        disabled={procesando !== null}
                        onClick={() => {
                          void revocar(fila.token);
                        }}
                      >
                        {procesando === fila.token ? 'Revocando…' : 'Revocar acceso'}
                      </button>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          )}
        </div>
        <footer className="drawer__pie">
          <Boton variante="secundario" onClick={alCerrar}>
            Cerrar
          </Boton>
        </footer>
      </aside>
    </div>
  );
}
