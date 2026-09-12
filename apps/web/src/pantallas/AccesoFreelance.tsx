import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Boton, MensajeEstado } from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';
import { EtiquetaBandeja } from '../componentes/EtiquetaBandeja.js';
import { useApp } from '../datos/contexto.js';
import { mensajeExcepcion } from '../datos/presentacion.js';

type EstadoEnlace =
  | { readonly tipo: 'validando' }
  | { readonly tipo: 'valido'; readonly maletaId: string }
  | { readonly tipo: 'invalido'; readonly mensaje: string };

export function AccesoFreelance(): ReactElement {
  const { token = '' } = useParams();
  const { entrarFreelance, validarFreelance, persistente } = useApp();
  const [estado, setEstado] = useState<EstadoEnlace>({ tipo: 'validando' });
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [completado, setCompletado] = useState(false);

  useEffect(() => {
    let vigente = true;
    const cancelado = (): boolean => !vigente;
    void (async () => {
      try {
        const resultado = await validarFreelance(token);
        if (cancelado()) return;
        setEstado(
          resultado.ok
            ? { tipo: 'valido', maletaId: resultado.valor.maletaId }
            : { tipo: 'invalido', mensaje: resultado.error.mensaje },
        );
      } catch (excepcion) {
        if (!cancelado()) setEstado({ tipo: 'invalido', mensaje: mensajeExcepcion(excepcion) });
      }
    })();
    return () => {
      vigente = false;
    };
  }, [token, validarFreelance]);

  if (completado) return <Navigate to="/cirugia" replace />;

  const entrar = async (): Promise<void> => {
    setEnviando(true);
    setError(null);
    try {
      const resultado = await entrarFreelance(token, nombre);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      setCompletado(true);
    } catch (excepcion) {
      setError(mensajeExcepcion(excepcion));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="ingreso acceso-freelance">
      <section className="ingreso__panel acceso-freelance__contexto">
        <EtiquetaBandeja
          className="ingreso__marca"
          identificador="ACCESO QUIRÚRGICO"
          campos={[
            { nombre: 'Organización', valor: 'Crearcos' },
            { nombre: 'Modalidad', valor: 'Instrumentista freelance' },
            {
              nombre: 'Dispositivo',
              valor: persistente ? 'listo sin conexión' : 'sesión temporal',
            },
          ]}
        />
        <div className="acceso-freelance__mensaje">
          <span>
            <Icono nombre="cirugia" tamano={24} />
          </span>
          <p className="sobrelinea">Invitación segura</p>
          <h1>Acceso a cirugía</h1>
          <p>
            Registra los instrumentos utilizados con una vista enfocada y sin información
            secundaria.
          </p>
        </div>
      </section>

      <section className="ingreso__formulario acceso-freelance__formulario">
        {estado.tipo === 'validando' ? (
          <div className="acceso-freelance__estado" role="status">
            <span className="spinner-compacto" />
            <h2>Validando invitación</h2>
            <p>Estamos comprobando el acceso en este dispositivo.</p>
          </div>
        ) : estado.tipo === 'invalido' ? (
          <div className="acceso-freelance__estado acceso-freelance__estado--error">
            <span>
              <Icono nombre="enlace" tamano={24} />
            </span>
            <p className="sobrelinea">Acceso no disponible</p>
            <h2>Este enlace ya no es válido</h2>
            <p>{estado.mensaje}</p>
            <small>Solicita a Contabilidad un enlace nuevo para continuar.</small>
          </div>
        ) : (
          <form
            className="formulario-ingreso formulario-ingreso--freelance"
            onSubmit={(evento) => {
              evento.preventDefault();
              void entrar();
            }}
          >
            <div className="acceso-freelance__maleta">
              <span>
                <Icono nombre="maleta" />
              </span>
              <div>
                <small>Operación asignada</small>
                <strong>{estado.maletaId}</strong>
              </div>
              <span className="estado estado--exito">
                <i className="estado__punto" /> En curso
              </span>
            </div>
            <div>
              <p className="sobrelinea">Identificación rápida</p>
              <h2>¿Quién registra los instrumentos?</h2>
              <p className="texto-ayuda">
                Escribe tu nombre tal como debe aparecer durante esta sesión.
              </p>
            </div>
            {error !== null && (
              <MensajeEstado tipo="error" titulo="No se pudo ingresar" texto={error} />
            )}
            <label className="campo-ui">
              <span>Nombre completo</span>
              <input
                value={nombre}
                onChange={(evento) => {
                  setNombre(evento.target.value);
                }}
                placeholder="Ej. Daniela Torres"
                autoComplete="name"
                autoFocus
              />
            </label>
            <Boton type="submit" icono="flechaDerecha" disabled={enviando || nombre.trim() === ''}>
              {enviando ? 'Ingresando…' : 'Continuar a cirugía'}
            </Boton>
            <p className="acceso-freelance__privacidad">
              <Icono nombre="check" tamano={14} /> Acceso limitado a esta operación
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
