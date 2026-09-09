import { useState } from 'react';
import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { AREAS, areaInicial } from '@crearcos/core';
import { useApp } from '../datos/contexto.js';
import { CLAVE_DEMO } from '../datos/arranque.js';
import { EtiquetaBandeja } from '../componentes/EtiquetaBandeja.js';

export function Ingreso(): ReactElement {
  const { entrar, sesion, persistente } = useApp();
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (sesion !== null) {
    const destino = areaInicial(sesion.rol);
    return <Navigate to={destino === null ? '/sin-acceso' : AREAS[destino].ruta} replace />;
  }

  const enviar = async (): Promise<void> => {
    setEnviando(true);
    setError(null);
    const resultado = await entrar(usuario.trim(), contrasena);
    if (!resultado.ok) {
      const espera = resultado.error.esperaMs;
      setError(
        espera === null
          ? resultado.error.mensaje
          : `${resultado.error.mensaje} Vuelve a intentar en ${String(Math.ceil(espera / 60_000))} minutos.`,
      );
    }
    setEnviando(false);
  };

  return (
    <div className="ingreso">
      <section className="ingreso__panel">
        <EtiquetaBandeja
          className="ingreso__marca"
          identificador="INVENTARIO QX"
          campos={[
            { nombre: 'Cliente', valor: 'Crearcos' },
            { nombre: 'Version', valor: 'prototipo 0.1' },
            { nombre: 'Almacenamiento', valor: persistente ? 'garantizado' : 'sin garantia' },
          ]}
        />
        <p className="ingreso__proposito">
          Cada pieza tiene un estado. La app lo sigue desde la bodega hasta la factura, con o sin
          internet.
        </p>
      </section>

      <section className="ingreso__formulario">
        <div className="ingreso__caja">
          <h1 className="ingreso__titulo">Entrar</h1>
          <p className="ingreso__ayuda">
            Usa la cuenta que te dio el Administrador. Funciona sin conexion.
          </p>

          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              void enviar();
            }}
          >
            <label className="campo">
              <span className="campo__etiqueta">Usuario</span>
              <input
                className="campo__control"
                name="usuario"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={usuario}
                onChange={(evento) => {
                  setUsuario(evento.target.value);
                }}
              />
            </label>

            <label className="campo">
              <span className="campo__etiqueta">Contrasena</span>
              <input
                className="campo__control"
                name="contrasena"
                type="password"
                autoComplete="current-password"
                value={contrasena}
                onChange={(evento) => {
                  setContrasena(evento.target.value);
                }}
              />
            </label>

            <button className="boton" type="submit" disabled={enviando}>
              {enviando ? 'Verificando' : 'Entrar'}
            </button>
          </form>

          {error !== null && (
            <p className="aviso" role="alert">
              {error}
            </p>
          )}

          <div className="aviso aviso--neutro">
            <p>
              Prototipo sin servidor. Cuentas de prueba: u-admin, u-aux-1, u-coord, u-contable,
              u-supervisor, u-free-1. La clave de todas es {CLAVE_DEMO}.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
