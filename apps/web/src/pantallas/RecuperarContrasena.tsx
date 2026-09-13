import { useState } from 'react';
import type { ReactElement } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useApp } from '../datos/contexto.js';
import { mensajeExcepcion } from '../datos/presentacion.js';

export function RecuperarContrasena({
  actualizar = false,
}: {
  actualizar?: boolean;
}): ReactElement {
  const { actualizarContrasena, centralConfigurado, solicitarRecuperacion } = useApp();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!centralConfigurado) return <Navigate to="/ingreso" replace />;

  const enviar = async (): Promise<void> => {
    setProcesando(true);
    setError(null);
    setMensaje(null);
    try {
      if (actualizar) {
        if (contrasena !== confirmacion) throw new Error('Las contraseñas no coinciden.');
        await actualizarContrasena(contrasena);
        setMensaje(
          'Contraseña actualizada. Todas las sesiones fueron cerradas; ya puedes ingresar.',
        );
      } else {
        await solicitarRecuperacion(correo);
        setMensaje(
          'Si existe una cuenta con ese correo, recibirá un enlace temporal para recuperar el acceso.',
        );
      }
    } catch (causa) {
      setError(mensajeExcepcion(causa));
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="ingreso">
      <section className="ingreso__panel">
        <p className="sobrelinea">Crearcos · Supabase Auth</p>
        <h1>{actualizar ? 'Define una contraseña nueva' : 'Recupera tu acceso'}</h1>
        <p className="ingreso__proposito">
          {actualizar
            ? 'El enlace es temporal. Al guardar, cerraremos las demás sesiones de la cuenta.'
            : 'Nunca pediremos al administrador que conozca o escriba tu contraseña.'}
        </p>
      </section>
      <section className="ingreso__formulario">
        <div className="ingreso__caja">
          <h2 className="ingreso__titulo">{actualizar ? 'Nueva contraseña' : 'Enviar enlace'}</h2>
          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              void enviar();
            }}
          >
            {actualizar ? (
              <>
                <label className="campo">
                  <span className="campo__etiqueta">Nueva contraseña</span>
                  <input
                    className="campo__control"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                    value={contrasena}
                    onChange={(evento) => {
                      setContrasena(evento.target.value);
                    }}
                  />
                </label>
                <label className="campo">
                  <span className="campo__etiqueta">Confirmar contraseña</span>
                  <input
                    className="campo__control"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                    value={confirmacion}
                    onChange={(evento) => {
                      setConfirmacion(evento.target.value);
                    }}
                  />
                </label>
                <p className="ingreso__ayuda">
                  Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo.
                </p>
              </>
            ) : (
              <label className="campo">
                <span className="campo__etiqueta">Correo</span>
                <input
                  className="campo__control"
                  type="email"
                  autoComplete="email"
                  required
                  value={correo}
                  onChange={(evento) => {
                    setCorreo(evento.target.value);
                  }}
                />
              </label>
            )}
            <button className="boton" type="submit" disabled={procesando}>
              {procesando
                ? 'Procesando…'
                : actualizar
                  ? 'Guardar y cerrar sesiones'
                  : 'Enviar enlace'}
            </button>
          </form>
          {mensaje !== null && <p className="aviso aviso--neutro">{mensaje}</p>}
          {error !== null && (
            <p className="aviso" role="alert">
              {error}
            </p>
          )}
          <p className="ingreso__ayuda">
            <Link to="/ingreso">Volver al ingreso</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
