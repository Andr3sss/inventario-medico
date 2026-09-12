import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Rol } from '@crearcos/core';
import {
  cambiarEstadoUsuario,
  crearUsuario,
  listarUsuarios,
  resetearContrasena,
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

export function Usuarios(): ReactElement {
  const { db, sesion, ahora, administracionCentral } = useApp();
  const [usuarios, setUsuarios] = useState<readonly UsuarioResumen[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [editando, setEditando] = useState<UsuarioResumen | null>(null);
  const [nuevoId, setNuevoId] = useState('');
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoRol, setNuevoRol] = useState<Exclude<Rol, 'SISTEMA' | 'FREELANCE'>>('AUXILIAR');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [contrasenaReset, setContrasenaReset] = useState('');
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
      `${usuario.usuarioId} ${usuario.nombre} ${ETIQUETA_ROL[usuario.rol]}`
        .toLocaleLowerCase()
        .includes(texto),
    );
  }, [busqueda, usuarios]);

  const crear = async (): Promise<void> => {
    if (sesion === null) return;
    if (nuevoId.trim() === '' || nuevoNombre.trim() === '' || nuevaContrasena === '') {
      setMensaje({ tipo: 'error', titulo: 'Completa todos los campos' });
      return;
    }
    setProcesando(true);
    setMensaje(null);
    try {
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
      setMensaje({
        tipo: 'exito',
        titulo:
          administracionCentral === null
            ? 'Usuario creado en este dispositivo'
            : 'Usuario central creado',
        texto:
          administracionCentral === null
            ? `${respuesta.valor.nombre} ya puede iniciar sesión localmente.`
            : `${respuesta.valor.nombre} ya puede iniciar sesión desde los dispositivos autorizados.`,
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

  const resetear = async (): Promise<void> => {
    if (sesion === null || editando === null || contrasenaReset === '') return;
    setProcesando(true);
    setMensaje(null);
    try {
      const respuesta =
        administracionCentral === null
          ? await resetearContrasena(db, editando.usuarioId, contrasenaReset, sesion, { ahora })
          : {
              ok: true as const,
              valor: await administracionCentral.resetearContrasena(editando, contrasenaReset),
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
      setEditando(respuesta.valor);
      setMensaje({
        tipo: 'exito',
        titulo: 'Contraseña restablecida',
        texto: `El bloqueo de ${respuesta.valor.nombre} también fue limpiado.`,
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
                        setEditando(usuario);
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
                        <code>{usuario.usuarioId}</code>
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
                    setEditando(usuario);
                  }}
                >
                  <span className="usuario-celda">
                    <Avatar nombre={usuario.nombre} />
                    <span>
                      <strong>{usuario.nombre}</strong>
                      <small>
                        {usuario.usuarioId} · {ETIQUETA_ROL[usuario.rol]}
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
                  value={nuevaContrasena}
                  onChange={(evento) => {
                    setNuevaContrasena(evento.target.value);
                  }}
                  autoComplete="new-password"
                />
              </label>
              <div className="aviso-inline aviso-inline--info">
                <Icono nombre="alerta" />
                <p>
                  {administracionCentral === null
                    ? 'Esta credencial se guardará en el dispositivo para permitir ingreso sin conexión.'
                    : 'La contraseña se almacena exclusivamente en Supabase Auth y nunca en IndexedDB.'}
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
                  <code>{editando.usuarioId}</code>
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
              <section className="seccion-formulario">
                <h3>Restablecer contraseña</h3>
                <p>
                  Define una nueva contraseña para esta cuenta{' '}
                  {administracionCentral === null ? 'local' : 'central'}.
                </p>
                <label className="campo-ui">
                  <span>Nueva contraseña</span>
                  <input
                    type="password"
                    value={contrasenaReset}
                    onChange={(evento) => {
                      setContrasenaReset(evento.target.value);
                    }}
                    autoComplete="new-password"
                  />
                </label>
                <Boton
                  variante="secundario"
                  disabled={procesando || contrasenaReset === ''}
                  onClick={() => {
                    void resetear();
                  }}
                >
                  Restablecer contraseña
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
                  disabled={procesando}
                  onClick={() => {
                    void cambiarEstado(editando);
                  }}
                >
                  {editando.activo ? 'Desactivar usuario' : 'Activar usuario'}
                </Boton>
              </section>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
