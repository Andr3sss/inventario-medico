import { useState } from 'react';
import type { ReactElement } from 'react';
import { useApp } from '../datos/contexto.js';
import { Icono } from './Icono.js';
import { Boton } from './UI.js';

export function ConfigurarAccesoOffline(): ReactElement | null {
  const { configurarPinOffline, persistente, requiereConfigurarAccesoOffline, salir, sesion } =
    useApp();
  const [pin, setPin] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  if (!requiereConfigurarAccesoOffline || sesion === null) return null;

  const guardar = async (): Promise<void> => {
    setError(null);
    if (pin !== confirmacion) {
      setError('Los dos PIN no coinciden');
      return;
    }
    setGuardando(true);
    const resultado = await configurarPinOffline(pin);
    if (!resultado.ok) setError(resultado.error.mensaje);
    setGuardando(false);
  };

  return (
    <div
      className="bloqueo-offline"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-configurar-pin"
    >
      <div className="bloqueo-offline__fondo" />
      <section className="bloqueo-offline__panel">
        <span className="bloqueo-offline__icono">
          <Icono nombre="usuarios" tamano={24} />
        </span>
        <p className="sobrelinea">Protección del dispositivo</p>
        <h2 id="titulo-configurar-pin">Crea tu PIN offline</h2>
        <p>
          Este PIN es distinto de tu contraseña de Supabase y solo funcionará para {sesion.nombre}{' '}
          en este dispositivo. Su autorización dura siete días y se renueva al sincronizar.
        </p>

        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            void guardar();
          }}
        >
          <label className="campo">
            <span className="campo__etiqueta">PIN de 8 dígitos</span>
            <input
              className="campo__control"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{8}"
              maxLength={8}
              value={pin}
              onChange={(evento) => {
                setPin(evento.target.value.replace(/\D/g, '').slice(0, 8));
              }}
              autoFocus
            />
          </label>
          <label className="campo">
            <span className="campo__etiqueta">Confirma el PIN</span>
            <input
              className="campo__control"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{8}"
              maxLength={8}
              value={confirmacion}
              onChange={(evento) => {
                setConfirmacion(evento.target.value.replace(/\D/g, '').slice(0, 8));
              }}
            />
          </label>

          {error !== null && (
            <p className="aviso" role="alert">
              {error}
            </p>
          )}
          {!persistente && (
            <p className="aviso aviso--neutro">
              El navegador no garantizó almacenamiento persistente. El acceso puede perderse si
              borra los datos de este sitio.
            </p>
          )}

          <div className="bloqueo-offline__acciones">
            <Boton
              type="button"
              variante="fantasma"
              disabled={guardando}
              onClick={() => {
                void salir();
              }}
            >
              Cerrar sesión
            </Boton>
            <Boton type="submit" icono="check" disabled={guardando || pin.length !== 8}>
              {guardando ? 'Protegiendo…' : 'Guardar PIN'}
            </Boton>
          </div>
        </form>
      </section>
    </div>
  );
}
