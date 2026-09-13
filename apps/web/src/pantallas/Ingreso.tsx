import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AREAS, areaInicial } from '@crearcos/core';
import { listarAccesosOffline, type ResumenAccesoOffline } from '@crearcos/data';
import { useApp } from '../datos/contexto.js';
import { EtiquetaBandeja } from '../componentes/EtiquetaBandeja.js';
import { formatearFecha } from '../datos/presentacion.js';

export function Ingreso(): ReactElement {
  const {
    ahora,
    centralConfigurado,
    db,
    enLinea,
    entrar,
    entrarOffline,
    modoDemoLocal,
    mfaPendiente,
    persistente,
    sesion,
    verificarMfa,
    cancelarMfa,
  } = useApp();
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [usarPin, setUsarPin] = useState(centralConfigurado && !enLinea);
  const [codigoMfa, setCodigoMfa] = useState('');
  const [accesosOffline, setAccesosOffline] = useState<readonly ResumenAccesoOffline[]>([]);
  const hayAccesoDisponible = accesosOffline.some((acceso) => acceso.estado === 'DISPONIBLE');

  useEffect(() => {
    if (!centralConfigurado) return undefined;
    let vigente = true;
    void listarAccesosOffline(db, ahora()).then((accesos) => {
      if (!vigente) return;
      setAccesosOffline(accesos);
      const primero = accesos.find((acceso) => acceso.estado === 'DISPONIBLE');
      if (primero !== undefined) setUsuario(primero.identificador);
    });
    return () => {
      vigente = false;
    };
  }, [ahora, centralConfigurado, db]);

  useEffect(() => {
    if (centralConfigurado && !enLinea) setUsarPin(true);
  }, [centralConfigurado, enLinea]);

  if (sesion !== null) {
    const destino = areaInicial(sesion.rol);
    return <Navigate to={destino === null ? '/sin-acceso' : AREAS[destino].ruta} replace />;
  }

  if (mfaPendiente !== null) {
    const comprobarMfa = async (): Promise<void> => {
      setEnviando(true);
      setError(null);
      const resultado = await verificarMfa(codigoMfa);
      if (!resultado.ok) setError(resultado.error.mensaje);
      setEnviando(false);
    };
    return (
      <div className="ingreso">
        <section className="ingreso__panel">
          <p className="sobrelinea">Crearcos · segundo factor</p>
          <h1>Protege tu cuenta</h1>
          <p className="ingreso__proposito">
            {mfaPendiente.modo === 'INSCRIBIR'
              ? 'Los administradores deben usar una aplicación autenticadora.'
              : 'Confirma el código temporal de tu aplicación autenticadora.'}
          </p>
        </section>
        <section className="ingreso__formulario">
          <div className="ingreso__caja">
            <h2 className="ingreso__titulo">
              {mfaPendiente.modo === 'INSCRIBIR' ? 'Configurar MFA' : 'Verificar MFA'}
            </h2>
            {mfaPendiente.qr !== null && (
              <>
                <img
                  src={mfaPendiente.qr}
                  alt="Código QR para configurar MFA"
                  width="220"
                  height="220"
                />
                <p className="ingreso__ayuda">
                  Escanea el QR. Si no puedes, usa esta clave: <code>{mfaPendiente.secreto}</code>
                </p>
              </>
            )}
            <form
              onSubmit={(evento) => {
                evento.preventDefault();
                void comprobarMfa();
              }}
            >
              <label className="campo">
                <span className="campo__etiqueta">Código de seis dígitos</span>
                <input
                  className="campo__control"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={codigoMfa}
                  onChange={(evento) => {
                    setCodigoMfa(evento.target.value);
                  }}
                />
              </label>
              <button className="boton" type="submit" disabled={enviando}>
                {enviando ? 'Verificando…' : 'Confirmar'}
              </button>
              <button
                className="boton"
                type="button"
                disabled={enviando}
                onClick={() => void cancelarMfa()}
              >
                Cancelar
              </button>
            </form>
            {error !== null && (
              <p className="aviso" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
      </div>
    );
  }

  const enviar = async (): Promise<void> => {
    setEnviando(true);
    setError(null);
    const resultado = usarPin
      ? await entrarOffline(usuario.trim(), contrasena)
      : await entrar(usuario.trim(), contrasena);
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
          {centralConfigurado && (
            <div className="ingreso__metodos" role="group" aria-label="Método de acceso">
              <button
                type="button"
                className={!usarPin ? 'activo' : ''}
                disabled={!enLinea}
                onClick={() => {
                  setUsarPin(false);
                  setUsuario('');
                  setContrasena('');
                  setError(null);
                }}
              >
                Cuenta central
              </button>
              <button
                type="button"
                className={usarPin ? 'activo' : ''}
                onClick={() => {
                  setUsarPin(true);
                  setUsuario(
                    accesosOffline.find((acceso) => acceso.estado === 'DISPONIBLE')
                      ?.identificador ?? '',
                  );
                  setContrasena('');
                  setError(null);
                }}
              >
                PIN del dispositivo
              </button>
            </div>
          )}
          <p className="ingreso__ayuda">
            {centralConfigurado
              ? usarPin
                ? 'Desbloqueo local para personal enrolado previamente. No necesita internet.'
                : 'Usa el correo y la contraseña que te dio el Administrador.'
              : 'Usa la cuenta local habilitada para desarrollo.'}
          </p>

          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              void enviar();
            }}
          >
            <label className="campo">
              <span className="campo__etiqueta">
                {centralConfigurado && !usarPin ? 'Correo' : 'Usuario'}
              </span>
              {usarPin && accesosOffline.length > 0 ? (
                <select
                  className="campo__control"
                  name="usuario"
                  required
                  value={usuario}
                  onChange={(evento) => {
                    setUsuario(evento.target.value);
                  }}
                >
                  {accesosOffline.map((acceso) => (
                    <option
                      key={acceso.usuarioId}
                      value={acceso.identificador}
                      disabled={acceso.estado !== 'DISPONIBLE'}
                    >
                      {acceso.nombre} · {etiquetaEstado(acceso)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="campo__control"
                  name="usuario"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={usuario}
                  onChange={(evento) => {
                    setUsuario(evento.target.value);
                  }}
                />
              )}
            </label>

            <label className="campo">
              <span className="campo__etiqueta">{usarPin ? 'PIN offline' : 'Contraseña'}</span>
              <input
                className="campo__control"
                name="contrasena"
                type="password"
                autoComplete={usarPin ? 'off' : 'current-password'}
                inputMode={usarPin ? 'numeric' : undefined}
                pattern={usarPin ? '[0-9]{8}' : undefined}
                maxLength={usarPin ? 8 : undefined}
                required
                value={contrasena}
                onChange={(evento) => {
                  setContrasena(evento.target.value);
                }}
              />
            </label>

            <button
              className="boton"
              type="submit"
              disabled={enviando || (usarPin && !hayAccesoDisponible)}
            >
              {enviando ? 'Verificando' : usarPin ? 'Desbloquear' : 'Entrar'}
            </button>
          </form>

          {centralConfigurado && !usarPin && (
            <p className="ingreso__ayuda">
              <Link to="/recuperar-contrasena">Olvidé mi contraseña</Link>
            </p>
          )}

          {centralConfigurado && usarPin && !hayAccesoDisponible && (
            <div className="aviso aviso--neutro">
              <p>
                {accesosOffline.length === 0
                  ? 'Este equipo todavía no tiene un PIN offline. Conéctalo e ingresa una vez con la cuenta central para enrolarlo.'
                  : 'Los accesos offline de este equipo están vencidos, bloqueados o revocados. Conéctalo e ingresa con la cuenta central.'}
              </p>
            </div>
          )}

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

function etiquetaEstado(acceso: ResumenAccesoOffline): string {
  if (acceso.estado === 'DISPONIBLE') return `vigente hasta ${formatearFecha(acceso.validaHasta)}`;
  if (acceso.estado === 'BLOQUEADO') return 'bloqueado temporalmente';
  if (acceso.estado === 'EXPIRADO') return 'vencido';
  return 'revocado';
}
