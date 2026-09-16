import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Rol } from '@crearcos/core';
import {
  cambiarEstadoUsuario,
  crearUsuario,
  listarUsuarios,
  resetearContrasena,
  type DispositivoCentral,
  type UsuarioResumen,
} from '@crearcos/data';
import {
  Avatar,
  BarraBusqueda,
  Boton,
  CargandoPanel,
  EncabezadoPagina,
  Estado,
  MensajeEstado,
  Vacio,
} from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';
import { useApp } from '../datos/contexto.js';
import { formatearFecha, mensajeExcepcion } from '../datos/presentacion.js';

const ETIQUETA_ROL: Readonly<Record<Rol, string>> = {
  SISTEMA: 'Sistema',
  ADMINISTRADOR: 'Administrador',
  AUXILIAR: 'Auxiliar / Instrumentista',
  COORDINADORA: 'Coordinadora',
  CONTABLE: 'Contable',
  SUPERVISOR: 'Supervisor',
  FREELANCE: 'Instrumentista externo',
};

function contrasenaFuerte(valor: string): boolean {
  return (
    valor.length >= 12 &&
    valor.length <= 72 &&
    /[a-z]/.test(valor) &&
    /[A-Z]/.test(valor) &&
    /[0-9]/.test(valor) &&
    /[^A-Za-z0-9]/.test(valor)
  );
}

export function Usuarios(): ReactElement {
  const { db, sesion, ahora, administracionCentral, confirmarPinAdmin } = useApp();
  const [usuarios, setUsuarios] = useState<readonly UsuarioResumen[]>([]);
  const [dispositivos, setDispositivos] = useState<readonly DispositivoCentral[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [editando, setEditando] = useState<UsuarioResumen | null>(null);
  const [nuevoId, setNuevoId] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoRol, setNuevoRol] = useState<Exclude<Rol, 'SISTEMA' | 'FREELANCE'>>('AUXILIAR');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [confirmacionNuevaContrasena, setConfirmacionNuevaContrasena] = useState('');
  const [pinAdminCreacion, setPinAdminCreacion] = useState('');
  const [contrasenaReset, setContrasenaReset] = useState('');
  const [confirmacionContrasenaReset, setConfirmacionContrasenaReset] = useState('');
  const [pinAdminReset, setPinAdminReset] = useState('');
  const [edicionCorreo, setEdicionCorreo] = useState('');
  const [edicionNombre, setEdicionNombre] = useState('');
  const [edicionRol, setEdicionRol] = useState<Exclude<Rol, 'SISTEMA' | 'FREELANCE'>>('AUXILIAR');
  const [confirmacionEliminacion, setConfirmacionEliminacion] = useState('');
  const [mensaje, setMensaje] = useState<{
    tipo: 'exito' | 'error' | 'info';
    titulo: string;
    texto?: string;
  } | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    if (sesion === null) return;
    setCargando(true);
    try {
      const respuesta =
        administracionCentral === null
          ? await listarUsuarios(db, sesion)
          : { ok: true as const, valor: await administracionCentral.listarUsuarios() };
      if (!respuesta.ok) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudieron cargar los usuarios',
          texto: respuesta.error.mensaje,
        });
        return;
      }
      setUsuarios(respuesta.valor);
      if (administracionCentral !== null) {
        setDispositivos(await administracionCentral.listarDispositivos());
      }
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudieron cargar los usuarios',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setCargando(false);
    }
  }, [administracionCentral, db, sesion]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase();
    return usuarios.filter((usuario) =>
      `${usuario.usuarioId} ${usuario.correo ?? ''} ${usuario.nombre} ${ETIQUETA_ROL[usuario.rol]}`
        .toLocaleLowerCase()
        .includes(texto),
    );
  }, [busqueda, usuarios]);

  const abrirGestion = (usuario: UsuarioResumen): void => {
    setEditando(usuario);
    setEdicionCorreo(usuario.correo ?? '');
    setEdicionNombre(usuario.nombre);
    setEdicionRol(usuario.rol as Exclude<Rol, 'SISTEMA' | 'FREELANCE'>);
    setConfirmacionEliminacion('');
    setContrasenaReset('');
    setConfirmacionContrasenaReset('');
    setPinAdminReset('');
  };

  const crear = async (): Promise<void> => {
    if (sesion === null) return;
    if (
      nuevoId.trim() === '' ||
      nuevoNombre.trim() === '' ||
      nuevaContrasena === '' ||
      confirmacionNuevaContrasena === '' ||
      (administracionCentral !== null && pinAdminCreacion.length !== 8)
    ) {
      setMensaje({ tipo: 'error', titulo: 'Completa todos los campos' });
      return;
    }
    if (nuevaContrasena !== confirmacionNuevaContrasena) {
      setMensaje({ tipo: 'error', titulo: 'Las contraseñas no coinciden' });
      return;
    }
    if (!contrasenaFuerte(nuevaContrasena)) {
      setMensaje({
        tipo: 'error',
        titulo: 'La contraseña no cumple la política',
        texto: 'Usa entre 12 y 72 caracteres con mayúscula, minúscula, número y símbolo.',
      });
      return;
    }
    setProcesando(true);
    setMensaje(null);
    try {
      if (administracionCentral !== null) {
        const pinConfirmado = await confirmarPinAdmin(pinAdminCreacion);
        if (!pinConfirmado.ok) {
          setMensaje({
            tipo: 'error',
            titulo: 'PIN de Administrador rechazado',
            texto: pinConfirmado.error.mensaje,
          });
          return;
        }
      }
      const respuesta =
        administracionCentral === null
          ? await crearUsuario(
              db,
              {
                usuarioId: nuevoId.trim(),
                nombre: nuevoNombre.trim(),
                rol: nuevoRol,
                contrasena: nuevaContrasena,
              },
              sesion,
              { ahora },
            )
          : {
              ok: true as const,
              valor: await administracionCentral.crearUsuario({
                correo: nuevoId.trim(),
                nombre: nuevoNombre.trim(),
                rol: nuevoRol,
                contrasena: nuevaContrasena,
                pinAdministrador: pinAdminCreacion,
              }),
            };
      if (!respuesta.ok) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudo crear el usuario',
          texto: respuesta.error.mensaje,
        });
        return;
      }
      setCrearAbierto(false);
      setNuevoId('');
      setNuevoNombre('');
      setNuevaContrasena('');
      setConfirmacionNuevaContrasena('');
      setPinAdminCreacion('');
      setMensaje({
        tipo: 'exito',
        titulo:
          administracionCentral === null
            ? 'Usuario creado en este dispositivo'
            : 'Usuario central creado',
        texto:
          administracionCentral === null
            ? `${respuesta.valor.nombre} ya puede iniciar sesión localmente.`
            : `${respuesta.valor.nombre} ya puede iniciar sesión con la contraseña asignada por el Administrador.`,
      });
      await cargar();
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo crear el usuario',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const cambiarEstado = async (usuario: UsuarioResumen): Promise<void> => {
    if (sesion === null) return;
    setProcesando(true);
    setMensaje(null);
    try {
      const respuesta =
        administracionCentral === null
          ? await cambiarEstadoUsuario(db, usuario.usuarioId, !usuario.activo, sesion)
          : {
              ok: true as const,
              valor: await administracionCentral.cambiarEstadoUsuario(usuario, !usuario.activo),
            };
      if (!respuesta.ok) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudo cambiar el estado',
          texto: respuesta.error.mensaje,
        });
        return;
      }
      setEditando(respuesta.valor);
      setMensaje({
        tipo: 'exito',
        titulo: respuesta.valor.activo ? 'Usuario activado' : 'Usuario desactivado',
        texto: `${respuesta.valor.nombre} fue actualizado ${administracionCentral === null ? 'en este dispositivo' : 'en Supabase'}.`,
      });
      await cargar();
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo cambiar el estado',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const guardarEdicion = async (): Promise<void> => {
    if (
      administracionCentral === null ||
      editando === null ||
      edicionCorreo.trim() === '' ||
      edicionNombre.trim() === ''
    ) {
      setMensaje({ tipo: 'error', titulo: 'Completa el correo y el nombre' });
      return;
    }
    setProcesando(true);
    setMensaje(null);
    try {
      const actualizado = await administracionCentral.editarUsuario(editando, {
        correo: edicionCorreo.trim(),
        nombre: edicionNombre.trim(),
        rol: edicionRol,
      });
      setEditando(actualizado);
      setEdicionCorreo(actualizado.correo ?? '');
      setEdicionNombre(actualizado.nombre);
      setEdicionRol(actualizado.rol as Exclude<Rol, 'SISTEMA' | 'FREELANCE'>);
      setMensaje({
        tipo: 'exito',
        titulo: 'Usuario actualizado',
        texto: 'El nombre, correo y rol quedaron guardados en la cuenta central.',
      });
      await cargar();
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo actualizar el usuario',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const eliminarDefinitivamente = async (): Promise<void> => {
    if (
      administracionCentral === null ||
      editando === null ||
      confirmacionEliminacion !== 'ELIMINAR'
    )
      return;
    if (
      !globalThis.confirm(
        `¿Eliminar definitivamente la cuenta de ${editando.nombre}? Esta acción no se puede deshacer.`,
      )
    )
      return;
    setProcesando(true);
    setMensaje(null);
    try {
      const nombre = editando.nombre;
      await administracionCentral.eliminarUsuario(editando);
      setEditando(null);
      setConfirmacionEliminacion('');
      setMensaje({
        tipo: 'exito',
        titulo: 'Cuenta eliminada definitivamente',
        texto: `${nombre} ya no puede iniciar sesión. El historial operativo quedó anonimizado.`,
      });
      await cargar();
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo eliminar la cuenta',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const resetear = async (): Promise<void> => {
    if (
      sesion === null ||
      editando === null ||
      contrasenaReset === '' ||
      confirmacionContrasenaReset === '' ||
      (administracionCentral !== null && pinAdminReset.length !== 8)
    )
      return;
    if (contrasenaReset !== confirmacionContrasenaReset) {
      setMensaje({ tipo: 'error', titulo: 'Las contraseñas no coinciden' });
      return;
    }
    if (!contrasenaFuerte(contrasenaReset)) {
      setMensaje({
        tipo: 'error',
        titulo: 'La contraseña no cumple la política',
        texto: 'Usa entre 12 y 72 caracteres con mayúscula, minúscula, número y símbolo.',
      });
      return;
    }
    setProcesando(true);
    setMensaje(null);
    try {
      if (administracionCentral !== null) {
        const pinConfirmado = await confirmarPinAdmin(pinAdminReset);
        if (!pinConfirmado.ok) {
          setMensaje({
            tipo: 'error',
            titulo: 'PIN de Administrador rechazado',
            texto: pinConfirmado.error.mensaje,
          });
          return;
        }
      }
      const respuesta =
        administracionCentral === null
          ? await resetearContrasena(db, editando.usuarioId, contrasenaReset, sesion, { ahora })
          : {
              ok: true as const,
              valor: await administracionCentral.cambiarContrasena(
                editando,
                contrasenaReset,
                pinAdminReset,
              ),
            };
      if (!respuesta.ok) {
        setMensaje({
          tipo: 'error',
          titulo: 'No se pudo restablecer la contraseña',
          texto: respuesta.error.mensaje,
        });
        return;
      }
      setContrasenaReset('');
      setConfirmacionContrasenaReset('');
      setPinAdminReset('');
      setEditando(respuesta.valor);
      setMensaje({
        tipo: 'exito',
        titulo: 'Contraseña cambiada por el Administrador',
        texto:
          administracionCentral === null
            ? `El bloqueo de ${respuesta.valor.nombre} también fue limpiado.`
            : `${respuesta.valor.nombre} ya puede ingresar con la nueva contraseña. Sus concesiones offline anteriores fueron revocadas.`,
      });
      await cargar();
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo restablecer la contraseña',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  const revocarDispositivo = async (dispositivo: DispositivoCentral): Promise<void> => {
    if (
      administracionCentral === null ||
      !globalThis.confirm(
        `¿Retirar ${dispositivo.nombre}? Dejará de sincronizar y todas sus concesiones serán revocadas.`,
      )
    )
      return;
    setProcesando(true);
    setMensaje(null);
    try {
      await administracionCentral.revocarDispositivo(
        dispositivo.id,
        'Dispositivo reportado como perdido o retirado desde la aplicación',
      );
      setMensaje({
        tipo: 'exito',
        titulo: 'Dispositivo retirado',
        texto: `${dispositivo.nombre} ya no puede sincronizar.`,
      });
      await cargar();
    } catch (error) {
      setMensaje({
        tipo: 'error',
        titulo: 'No se pudo retirar el dispositivo',
        texto: mensajeExcepcion(error),
      });
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="pagina">
      <EncabezadoPagina
        sobrelinea={
          administracionCentral === null ? 'Administración local' : 'Administración central'
        }
        titulo="Usuarios y accesos"
        descripcion={
          administracionCentral === null
            ? 'Gestiona las cuentas disponibles únicamente en este dispositivo.'
            : 'Gestiona las identidades y roles autorizados en todos los dispositivos.'
        }
        acciones={
          <Boton
            icono="mas"
            onClick={() => {
              setCrearAbierto(true);
            }}
          >
            Nuevo usuario
          </Boton>
        }
      />
      <div className="aviso-dispositivo">
        <Icono nombre="nube" />
        <span>
          <strong>
            {administracionCentral === null
              ? 'Lista local del dispositivo'
              : 'Identidades de Supabase Auth'}
          </strong>
          <p>
            {administracionCentral === null
              ? 'Los usuarios creados aquí no se replican a otros equipos.'
              : 'Los cambios de acceso se validan en el servidor y se distribuyen mediante sincronización.'}
          </p>
        </span>
      </div>
      {mensaje !== null && <MensajeEstado {...mensaje} />}
      <section className="panel tabla-panel">
        <div className="herramientas-tabla">
          <BarraBusqueda
            valor={busqueda}
            alCambiar={setBusqueda}
            placeholder="Buscar por nombre, identificador o rol…"
          />
          <span className="panel__nota">
            {usuarios.length} cuentas {administracionCentral === null ? 'locales' : 'centrales'}
          </span>
        </div>
        {cargando ? (
          <CargandoPanel filas={6} />
        ) : visibles.length === 0 ? (
          <Vacio
            icono="usuarios"
            titulo="No se encontraron usuarios"
            texto="Prueba otro nombre, identificador o rol."
          />
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla tabla--usuarios">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Identificador</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Bloqueo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((usuario) => (
                    <tr
                      key={usuario.usuarioId}
                      onClick={() => {
                        abrirGestion(usuario);
                      }}
                    >
                      <td>
                        <span className="usuario-celda">
                          <Avatar nombre={usuario.nombre} />
                          <span>
                            <strong>{usuario.nombre}</strong>
                            <small>
                              {administracionCentral === null ? 'Cuenta local' : 'Cuenta central'}
                            </small>
                          </span>
                        </span>
                      </td>
                      <td>
                        {administracionCentral === null ? (
                          <code>{usuario.usuarioId}</code>
                        ) : (
                          <span className="usuario-celda">
                            <span>
                              <strong>{usuario.correo ?? 'Sin correo de acceso'}</strong>
                              <small>
                                <code>{usuario.usuarioId}</code>
                              </small>
                            </span>
                          </span>
                        )}
                      </td>
                      <td>{ETIQUETA_ROL[usuario.rol]}</td>
                      <td>
                        <Estado tono={usuario.activo ? 'exito' : 'neutral'}>
                          {usuario.activo ? 'Activo' : 'Inactivo'}
                        </Estado>
                      </td>
                      <td>
                        {usuario.bloqueadoHasta === null ? (
                          <span className="actividad-celda">
                            <i className="en-linea" />
                            Sin bloqueo
                          </span>
                        ) : (
                          <Estado tono="peligro">
                            Hasta {formatearFecha(usuario.bloqueadoHasta)}
                          </Estado>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="boton-icono boton-icono--sutil"
                          aria-label={`Gestionar ${usuario.nombre}`}
                        >
                          <Icono nombre="menu" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lista-movil">
              {visibles.map((usuario) => (
                <button
                  type="button"
                  className="fila-movil"
                  key={usuario.usuarioId}
                  onClick={() => {
                    abrirGestion(usuario);
                  }}
                >
                  <span className="usuario-celda">
                    <Avatar nombre={usuario.nombre} />
                    <span>
                      <strong>{usuario.nombre}</strong>
                      <small>
                        {usuario.correo ?? usuario.usuarioId} · {ETIQUETA_ROL[usuario.rol]}
                      </small>
                    </span>
                  </span>
                  <Estado tono={usuario.activo ? 'exito' : 'neutral'}>
                    {usuario.activo ? 'Activo' : 'Inactivo'}
                  </Estado>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {administracionCentral !== null && (
        <section className="panel tabla-panel">
          <div className="herramientas-tabla">
            <div>
              <p className="sobrelinea">Revocación remota</p>
              <h2>Dispositivos registrados</h2>
            </div>
            <span className="panel__nota">{dispositivos.length} dispositivos</span>
          </div>
          {dispositivos.length === 0 ? (
            <Vacio
              icono="nube"
              titulo="No hay dispositivos registrados"
              texto="Aparecerán después de su primera sincronización."
            />
          ) : (
            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Dispositivo</th>
                    <th>Plataforma</th>
                    <th>Última sincronización</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {dispositivos.map((dispositivo) => (
                    <tr key={dispositivo.id}>
                      <td>
                        <strong>{dispositivo.nombre}</strong>
                        <br />
                        <code>{dispositivo.id}</code>
                      </td>
                      <td>{dispositivo.plataforma ?? 'Sin identificar'}</td>
                      <td>{formatearFecha(dispositivo.ultimoSyncEn)}</td>
                      <td>
                        <Estado tono={dispositivo.activo ? 'exito' : 'neutral'}>
                          {dispositivo.activo ? 'Activo' : 'Retirado'}
                        </Estado>
                      </td>
                      <td>
                        {dispositivo.activo && (
                          <Boton
                            variante="peligro"
                            disabled={procesando}
                            onClick={() => void revocarDispositivo(dispositivo)}
                          >
                            Retirar
                          </Boton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {crearAbierto && (
        <div className="drawer" role="dialog" aria-modal="true" aria-label="Nuevo usuario">
          <button
            type="button"
            className="drawer__fondo"
            aria-label="Cerrar"
            onClick={() => {
              setCrearAbierto(false);
            }}
          />
          <aside className="drawer__panel drawer__panel--formulario">
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">
                  {administracionCentral === null ? 'Administración local' : 'Supabase Auth'}
                </p>
                <h2>Nuevo usuario</h2>
              </div>
              <button
                type="button"
                className="boton-icono"
                onClick={() => {
                  setCrearAbierto(false);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <div className="drawer__contenido formulario-drawer">
              <label className="campo-ui">
                <span>
                  {administracionCentral === null
                    ? 'Identificador de usuario'
                    : 'Correo electrónico'}
                </span>
                <input
                  value={nuevoId}
                  onChange={(evento) => {
                    setNuevoId(evento.target.value);
                  }}
                  placeholder={
                    administracionCentral === null ? 'Ej. u-aux-4' : 'persona@empresa.com'
                  }
                  autoCapitalize="none"
                />
              </label>
              <label className="campo-ui">
                <span>Nombre completo</span>
                <input
                  value={nuevoNombre}
                  onChange={(evento) => {
                    setNuevoNombre(evento.target.value);
                  }}
                  placeholder="Ej. Ana Pérez"
                />
              </label>
              <label className="campo-ui">
                <span>Rol</span>
                <select
                  value={nuevoRol}
                  onChange={(evento) => {
                    setNuevoRol(evento.target.value as Exclude<Rol, 'SISTEMA' | 'FREELANCE'>);
                  }}
                >
                  <option value="ADMINISTRADOR">Administrador</option>
                  <option value="AUXILIAR">Auxiliar / Instrumentista</option>
                  <option value="COORDINADORA">Coordinadora</option>
                  <option value="CONTABLE">Contable</option>
                  <option value="SUPERVISOR">Supervisor</option>
                </select>
              </label>
              <label className="campo-ui">
                <span>Contraseña inicial</span>
                <input
                  type="password"
                  minLength={12}
                  maxLength={72}
                  value={nuevaContrasena}
                  onChange={(evento) => {
                    setNuevaContrasena(evento.target.value);
                  }}
                  autoComplete="new-password"
                />
              </label>
              <label className="campo-ui">
                <span>Confirmar contraseña inicial</span>
                <input
                  type="password"
                  minLength={12}
                  maxLength={72}
                  value={confirmacionNuevaContrasena}
                  onChange={(evento) => {
                    setConfirmacionNuevaContrasena(evento.target.value);
                  }}
                  autoComplete="new-password"
                />
              </label>
              {administracionCentral !== null && (
                <label className="campo-ui">
                  <span>PIN del Administrador</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{8}"
                    maxLength={8}
                    value={pinAdminCreacion}
                    onChange={(evento) => {
                      setPinAdminCreacion(evento.target.value.replace(/\D/g, '').slice(0, 8));
                    }}
                    autoComplete="off"
                  />
                </label>
              )}
              <div className="aviso-inline aviso-inline--info">
                <Icono nombre="alerta" />
                <p>
                  {administracionCentral === null
                    ? 'Esta credencial se guardará en el dispositivo para permitir ingreso sin conexión.'
                    : 'El Administrador asigna la contraseña inicial. No se enviará ninguna invitación ni correo de recuperación.'}
                </p>
              </div>
            </div>
            <footer className="drawer__pie">
              <Boton
                variante="secundario"
                onClick={() => {
                  setCrearAbierto(false);
                }}
              >
                Cancelar
              </Boton>
              <Boton
                icono="check"
                disabled={procesando}
                onClick={() => {
                  void crear();
                }}
              >
                {procesando ? 'Creando…' : 'Crear usuario'}
              </Boton>
            </footer>
          </aside>
        </div>
      )}

      {editando !== null && (
        <div
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label={`Gestionar ${editando.nombre}`}
        >
          <button
            type="button"
            className="drawer__fondo"
            aria-label="Cerrar"
            onClick={() => {
              setEditando(null);
            }}
          />
          <aside className="drawer__panel drawer__panel--formulario">
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">Gestión de acceso</p>
                <h2>{editando.nombre}</h2>
              </div>
              <button
                type="button"
                className="boton-icono"
                onClick={() => {
                  setEditando(null);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <div className="drawer__contenido formulario-drawer">
              <div className="usuario-detalle-real">
                <Avatar nombre={editando.nombre} />
                <span>
                  <code>{editando.correo ?? editando.usuarioId}</code>
                  <strong>{ETIQUETA_ROL[editando.rol]}</strong>
                </span>
                <Estado tono={editando.activo ? 'exito' : 'neutral'}>
                  {editando.activo ? 'Activo' : 'Inactivo'}
                </Estado>
              </div>
              {editando.bloqueadoHasta !== null && (
                <div className="aviso-inline aviso-inline--peligro">
                  <Icono nombre="alerta" />
                  <p>
                    Acceso bloqueado hasta {formatearFecha(editando.bloqueadoHasta)}. Restablecer la
                    contraseña limpia el bloqueo.
                  </p>
                </div>
              )}
              {administracionCentral !== null && (
                <section className="seccion-formulario">
                  <h3>Datos de la cuenta</h3>
                  <p>Actualiza la identidad y los permisos utilizados en todos los dispositivos.</p>
                  <label className="campo-ui">
                    <span>Correo electrónico</span>
                    <input
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      required
                      value={edicionCorreo}
                      onChange={(evento) => {
                        setEdicionCorreo(evento.target.value);
                      }}
                    />
                  </label>
                  <label className="campo-ui">
                    <span>Nombre completo</span>
                    <input
                      maxLength={160}
                      required
                      value={edicionNombre}
                      onChange={(evento) => {
                        setEdicionNombre(evento.target.value);
                      }}
                    />
                  </label>
                  <label className="campo-ui">
                    <span>Rol</span>
                    <select
                      value={edicionRol}
                      disabled={editando.usuarioId === sesion?.usuarioId}
                      onChange={(evento) => {
                        setEdicionRol(evento.target.value as Exclude<Rol, 'SISTEMA' | 'FREELANCE'>);
                      }}
                    >
                      <option value="ADMINISTRADOR">Administrador</option>
                      <option value="AUXILIAR">Auxiliar / Instrumentista</option>
                      <option value="COORDINADORA">Coordinadora</option>
                      <option value="CONTABLE">Contable</option>
                      <option value="SUPERVISOR">Supervisor</option>
                    </select>
                  </label>
                  {editando.usuarioId === sesion?.usuarioId && (
                    <p className="panel__nota">
                      Puedes cambiar tu nombre o correo, pero no tu propio rol.
                    </p>
                  )}
                  <Boton
                    icono="check"
                    disabled={
                      procesando || edicionCorreo.trim() === '' || edicionNombre.trim() === ''
                    }
                    onClick={() => {
                      void guardarEdicion();
                    }}
                  >
                    Guardar cambios
                  </Boton>
                </section>
              )}
              <section className="seccion-formulario">
                <h3>Cambiar contraseña manualmente</h3>
                <p>
                  {administracionCentral === null
                    ? 'Define una nueva contraseña para esta cuenta local.'
                    : 'Solo un Administrador puede asignar la nueva contraseña. La operación exige su PIN y queda auditada.'}
                </p>
                <label className="campo-ui">
                  <span>Nueva contraseña</span>
                  <input
                    type="password"
                    minLength={12}
                    maxLength={72}
                    value={contrasenaReset}
                    onChange={(evento) => {
                      setContrasenaReset(evento.target.value);
                    }}
                    autoComplete="new-password"
                  />
                </label>
                <label className="campo-ui">
                  <span>Confirmar nueva contraseña</span>
                  <input
                    type="password"
                    minLength={12}
                    maxLength={72}
                    value={confirmacionContrasenaReset}
                    onChange={(evento) => {
                      setConfirmacionContrasenaReset(evento.target.value);
                    }}
                    autoComplete="new-password"
                  />
                </label>
                {administracionCentral !== null && (
                  <label className="campo-ui">
                    <span>PIN del Administrador</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{8}"
                      maxLength={8}
                      value={pinAdminReset}
                      onChange={(evento) => {
                        setPinAdminReset(evento.target.value.replace(/\D/g, '').slice(0, 8));
                      }}
                      autoComplete="off"
                    />
                  </label>
                )}
                <Boton
                  variante="secundario"
                  disabled={
                    procesando ||
                    contrasenaReset === '' ||
                    confirmacionContrasenaReset === '' ||
                    (administracionCentral !== null && pinAdminReset.length !== 8)
                  }
                  onClick={() => {
                    void resetear();
                  }}
                >
                  Cambiar contraseña
                </Boton>
              </section>
              <section className="seccion-formulario">
                <h3>Estado de la cuenta</h3>
                <p>
                  {editando.activo
                    ? 'Desactivar impide que el usuario vuelva a iniciar sesión.'
                    : 'Activar permite que el usuario vuelva a iniciar sesión.'}
                </p>
                <Boton
                  variante={editando.activo ? 'peligro' : 'secundario'}
                  disabled={procesando || editando.usuarioId === sesion?.usuarioId}
                  onClick={() => {
                    void cambiarEstado(editando);
                  }}
                >
                  {editando.activo ? 'Desactivar usuario' : 'Activar usuario'}
                </Boton>
                {editando.usuarioId === sesion?.usuarioId && (
                  <p className="panel__nota">
                    No puedes desactivar la sesión que estás utilizando.
                  </p>
                )}
              </section>
              {administracionCentral !== null && (
                <section className="seccion-formulario">
                  <h3>Eliminar definitivamente</h3>
                  <p>
                    Elimina el correo, las sesiones y el acceso de Supabase Auth. La trazabilidad
                    histórica se conserva con el nombre “Usuario eliminado”.
                  </p>
                  <label className="campo-ui">
                    <span>Escribe ELIMINAR para confirmar</span>
                    <input
                      value={confirmacionEliminacion}
                      disabled={editando.usuarioId === sesion?.usuarioId}
                      onChange={(evento) => {
                        setConfirmacionEliminacion(evento.target.value);
                      }}
                      autoComplete="off"
                    />
                  </label>
                  <Boton
                    variante="peligro"
                    disabled={
                      procesando ||
                      editando.usuarioId === sesion?.usuarioId ||
                      confirmacionEliminacion !== 'ELIMINAR'
                    }
                    onClick={() => {
                      void eliminarDefinitivamente();
                    }}
                  >
                    Eliminar cuenta definitivamente
                  </Boton>
                </section>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
