import { useState } from 'react';
import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { AREAS, areaInicial } from '@crearcos/core';
import { useApp } from '../datos/contexto.js';
import { EtiquetaBandeja } from '../componentes/EtiquetaBandeja.js';

export function Ingreso(): ReactElement {
  const { entrar, sesion, persistente, centralConfigurado, modoDemoLocal } = useApp();
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
            { nombre: 'Version', valor: '0.1' },
            { nombre: 'Datos', valor: centralConfigurado ? 'Supabase + replica local' : 'local' },
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
            {centralConfigurado
              ? 'Usa el correo y la clave que te dio el Administrador. Una sesion ya validada puede continuar sin conexion.'
              : 'Usa la cuenta local habilitada para desarrollo.'}
          </p>

          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              void enviar();
            }}
          >
            <label className="campo">
              <span className="campo__etiqueta">{centralConfigurado ? 'Correo' : 'Usuario'}</span>
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

          {!centralConfigurado && (
            <div className="aviso aviso--neutro">
              <p>
                {modoDemoLocal
                  ? 'Modo demo local habilitado expresamente para desarrollo.'
                  : 'Falta configurar la conexion central de Supabase.'}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
