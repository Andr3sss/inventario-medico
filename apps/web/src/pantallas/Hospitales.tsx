import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { hospitalId as crearHospitalId, type Hospital, type NivelFacturable } from '@crearcos/core';
import {
  codigoCortoDesde,
  eliminarHospital,
  eliminarHospitalOffline,
  guardarHospital,
  guardarHospitalOffline,
  listarHospitales,
  obtenerHospital,
  uuidV7,
} from '@crearcos/data';
import {
  BarraBusqueda,
  Boton,
  CargandoPanel,
  EncabezadoPagina,
  Estado,
  MensajeEstado,
  type TonoEstado,
  Vacio,
} from '../componentes/UI.js';
import { Icono } from '../componentes/Icono.js';
import { useApp } from '../datos/contexto.js';
import { ETIQUETA_NIVEL_PRECIO, mensajeExcepcion } from '../datos/presentacion.js';

interface MensajeHospital {
  readonly tipo: 'exito' | 'error' | 'info';
  readonly titulo: string;
  readonly texto: string;
}

const TONO_NIVEL: Readonly<Record<NivelFacturable, TonoEstado>> = {
  HABITUAL: 'exito',
  PROVINCIA: 'info',
  NOTA_CREDITO: 'aviso',
};

function textoBusqueda(hospital: Hospital): string {
  return `${hospital.id} ${hospital.nombre} ${hospital.ciudad}`.toLocaleLowerCase();
}

export function Hospitales(): ReactElement {
  const { db, sesion, ahora, administracionCentral, centralConfigurado } = useApp();
  const [hospitales, setHospitales] = useState<readonly Hospital[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [cargandoEdicion, setCargandoEdicion] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<MensajeHospital | null>(null);
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [hospitalId, setHospitalId] = useState('');
  const [nombre, setNombre] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [nivel, setNivel] = useState<NivelFacturable>('HABITUAL');
  const [mensajeFormulario, setMensajeFormulario] = useState<MensajeHospital | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setCargando(true);
    setError(null);
    try {
      const resultado = await listarHospitales(db);
      setHospitales([...resultado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (excepcion) {
      setError(mensajeExcepcion(excepcion));
    } finally {
      setCargando(false);
    }
  }, [db]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrirNuevo = (): void => {
    setEditando(false);
    setHospitalId(`HOS-${codigoCortoDesde(uuidV7(ahora()))}`);
    setNombre('');
    setCiudad('');
    setNivel('HABITUAL');
    setMensajeFormulario(null);
    setFormularioAbierto(true);
  };

  const abrirEdicion = async (id: string): Promise<void> => {
    setCargandoEdicion(true);
    setError(null);
    try {
      const hospital = await obtenerHospital(db, id);
      if (hospital === undefined) {
        setError('La institución seleccionada ya no existe en este dispositivo.');
        await cargar();
        return;
      }
      setEditando(true);
      setHospitalId(hospital.id);
      setNombre(hospital.nombre);
      setCiudad(hospital.ciudad);
      setNivel(hospital.nivelPorDefecto);
      setMensajeFormulario(null);
      setFormularioAbierto(true);
    } catch (excepcion) {
      setError(mensajeExcepcion(excepcion));
    } finally {
      setCargandoEdicion(false);
    }
  };

  const guardar = async (): Promise<void> => {
    if (sesion === null || nombre.trim() === '' || ciudad.trim() === '') return;
    setProcesando(true);
    setMensajeFormulario(null);
    try {
      const datos = {
        id: crearHospitalId(hospitalId),
        nombre: nombre.trim(),
        ciudad: ciudad.trim(),
        nivelPorDefecto: nivel,
      };
      const guardarEnCola = centralConfigurado && administracionCentral === null;
      const respuesta = guardarEnCola
        ? await guardarHospitalOffline(db, datos, hospitalId, sesion, { ahora })
        : administracionCentral === null
          ? await guardarHospital(db, datos, sesion)
          : {
              ok: true as const,
              valor: await administracionCentral.guardarHospital(datos, hospitalId),
            };
      if (!respuesta.ok) {
        setMensajeFormulario({
          tipo: 'error',
          titulo:
            respuesta.error.codigo === 'NO_AUTORIZADO'
              ? 'Acción no autorizada'
              : 'Hospital no encontrado',
          texto: respuesta.error.mensaje,
        });
        return;
      }
      setFormularioAbierto(false);
      setMensaje({
        tipo: 'exito',
        titulo: guardarEnCola
          ? 'Institución guardada sin conexión'
          : editando
            ? 'Institución actualizada'
            : 'Institución creada',
        texto: guardarEnCola
          ? `${respuesta.valor.nombre} ya está disponible en este dispositivo y se sincronizará al recuperar una sesión central.`
          : `${respuesta.valor.nombre} quedó disponible para el cierre y facturación de maletas.`,
      });
      await cargar();
    } catch (excepcion) {
      setMensajeFormulario({
        tipo: 'error',
        titulo: 'No se pudo guardar la institución',
        texto: mensajeExcepcion(excepcion),
      });
    } finally {
      setProcesando(false);
    }
  };

  const eliminarActual = async (): Promise<void> => {
    if (sesion === null || !editando) return;
    const hospital = hospitales.find((fila) => fila.id === hospitalId);
    if (hospital === undefined) return;
    if (
      !globalThis.confirm(
        `¿Eliminar ${hospital.nombre} del catálogo de hospitales? Los documentos históricos se conservarán.`,
      )
    )
      return;
    setProcesando(true);
    setMensajeFormulario(null);
    try {
      const guardarEnCola = centralConfigurado && administracionCentral === null;
      const respuesta = guardarEnCola
        ? await eliminarHospitalOffline(db, hospital, sesion, { ahora })
        : administracionCentral === null
          ? await eliminarHospital(db, hospital, sesion)
          : (await administracionCentral.eliminarHospital(hospital),
            { ok: true as const, valor: true });
      if (!respuesta.ok) {
        setMensajeFormulario({
          tipo: 'error',
          titulo: 'No se pudo eliminar el hospital',
          texto: respuesta.error.mensaje,
        });
        return;
      }
      setFormularioAbierto(false);
      setMensaje({
        tipo: 'exito',
        titulo: guardarEnCola ? 'Eliminación pendiente de sincronización' : 'Hospital eliminado',
        texto: `${hospital.nombre} ya no aparecerá en nuevas operaciones.`,
      });
      await cargar();
    } catch (excepcion) {
      setMensajeFormulario({
        tipo: 'error',
        titulo: 'No se pudo eliminar el hospital',
        texto: mensajeExcepcion(excepcion),
      });
    } finally {
      setProcesando(false);
    }
  };

  const hospitalesVisibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase();
    if (termino === '') return hospitales;
    return hospitales.filter((hospital) => textoBusqueda(hospital).includes(termino));
  }, [busqueda, hospitales]);

  const ciudades = useMemo(
    () => new Set(hospitales.map((hospital) => hospital.ciudad)).size,
    [hospitales],
  );

  return (
    <div className="pagina pagina--hospitales">
      <EncabezadoPagina
        sobrelinea="Administración"
        titulo="Hospitales"
        descripcion="Gestiona las instituciones disponibles y el nivel de precio que aplican por defecto."
        acciones={
          <Boton icono="mas" onClick={abrirNuevo}>
            Nuevo hospital
          </Boton>
        }
      />

      {mensaje !== null && <MensajeEstado {...mensaje} />}
      {error !== null && (
        <MensajeEstado tipo="error" titulo="No se pudieron cargar los hospitales" texto={error} />
      )}

      <section
        className="resumen-lineal resumen-lineal--hospitales"
        aria-label="Resumen de hospitales"
      >
        <div className="resumen-lineal__item activo">
          <span>Total de instituciones</span>
          <strong>{hospitales.length}</strong>
        </div>
        <div className="resumen-lineal__item">
          <span>Ciudades cubiertas</span>
          <strong>{ciudades}</strong>
        </div>
        <div className="resumen-lineal__item">
          <span>Precio habitual</span>
          <strong>
            {hospitales.filter((hospital) => hospital.nivelPorDefecto === 'HABITUAL').length}
          </strong>
        </div>
        <div className="resumen-lineal__item">
          <span>Tarifa provincia</span>
          <strong>
            {hospitales.filter((hospital) => hospital.nivelPorDefecto === 'PROVINCIA').length}
          </strong>
        </div>
      </section>

      <section className="panel tabla-panel">
        <div className="herramientas-tabla">
          <BarraBusqueda
            valor={busqueda}
            alCambiar={setBusqueda}
            placeholder="Buscar hospital, ciudad o código…"
          />
          <span className="panel__nota">
            {hospitalesVisibles.length} de {hospitales.length} instituciones
          </span>
        </div>

        {cargando ? (
          <CargandoPanel filas={6} />
        ) : hospitalesVisibles.length === 0 ? (
          <Vacio
            icono="hospital"
            titulo={hospitales.length === 0 ? 'No hay hospitales registrados' : 'Sin coincidencias'}
            texto={
              hospitales.length === 0
                ? 'Crea la primera institución para habilitarla en el cierre de cirugía.'
                : 'Prueba con otro nombre, ciudad o código de institución.'
            }
          />
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla tabla--hospitales">
                <thead>
                  <tr>
                    <th>Institución</th>
                    <th>Código</th>
                    <th>Ciudad</th>
                    <th>Nivel por defecto</th>
                    <th>
                      <span className="solo-lector">Acción</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {hospitalesVisibles.map((hospital) => (
                    <tr
                      key={hospital.id}
                      onClick={() => {
                        void abrirEdicion(hospital.id);
                      }}
                    >
                      <td>
                        <span className="hospital-celda">
                          <i>
                            <Icono nombre="hospital" tamano={18} />
                          </i>
                          <strong>{hospital.nombre}</strong>
                        </span>
                      </td>
                      <td>
                        <code className="codigo">{hospital.id}</code>
                      </td>
                      <td>
                        <span className="ubicacion-celda">
                          <Icono nombre="ubicacion" tamano={15} />
                          {hospital.ciudad}
                        </span>
                      </td>
                      <td>
                        <Estado tono={TONO_NIVEL[hospital.nivelPorDefecto]}>
                          {ETIQUETA_NIVEL_PRECIO[hospital.nivelPorDefecto]}
                        </Estado>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="boton-icono boton-icono--sutil"
                          aria-label={`Editar ${hospital.nombre}`}
                          disabled={cargandoEdicion}
                        >
                          <Icono nombre="editar" tamano={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lista-movil">
              {hospitalesVisibles.map((hospital) => (
                <button
                  type="button"
                  className="fila-movil"
                  key={hospital.id}
                  onClick={() => {
                    void abrirEdicion(hospital.id);
                  }}
                >
                  <span className="fila-movil__principal">
                    <code>{hospital.id}</code>
                    <strong>{hospital.nombre}</strong>
                    <small>
                      <Icono nombre="ubicacion" tamano={14} />
                      {hospital.ciudad}
                    </small>
                  </span>
                  <span className="fila-movil__lateral">
                    <Estado tono={TONO_NIVEL[hospital.nivelPorDefecto]}>
                      {ETIQUETA_NIVEL_PRECIO[hospital.nivelPorDefecto]}
                    </Estado>
                    <Icono nombre="chevron" tamano={16} />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {formularioAbierto && (
        <div
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label={editando ? `Editar ${nombre}` : 'Nuevo hospital'}
        >
          <button
            type="button"
            className="drawer__fondo"
            aria-label="Cerrar formulario"
            onClick={() => {
              setFormularioAbierto(false);
            }}
          />
          <form
            className="drawer__panel drawer__panel--formulario"
            onSubmit={(evento) => {
              evento.preventDefault();
              void guardar();
            }}
          >
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">Catálogo de instituciones</p>
                <h2>{editando ? 'Editar hospital' : 'Nuevo hospital'}</h2>
              </div>
              <button
                type="button"
                className="boton-icono"
                aria-label="Cerrar"
                onClick={() => {
                  setFormularioAbierto(false);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>
            <div className="drawer__contenido formulario-drawer">
              {mensajeFormulario !== null && <MensajeEstado {...mensajeFormulario} />}
              <div className="institucion-identidad">
                <span>
                  <Icono nombre="hospital" tamano={22} />
                </span>
                <div>
                  <small>Identificador local</small>
                  <code>{hospitalId}</code>
                </div>
              </div>
              <label className="campo-ui">
                <span>Nombre de la institución</span>
                <input
                  value={nombre}
                  onChange={(evento) => {
                    setNombre(evento.target.value);
                  }}
                  placeholder="Ej. Hospital Metropolitano"
                  autoFocus
                />
              </label>
              <label className="campo-ui">
                <span>Ciudad</span>
                <input
                  value={ciudad}
                  onChange={(evento) => {
                    setCiudad(evento.target.value);
                  }}
                  placeholder="Ej. Quito"
                />
              </label>
              <fieldset className="selector-nivel">
                <legend>Nivel de precio por defecto</legend>
                {(['HABITUAL', 'PROVINCIA', 'NOTA_CREDITO'] as const).map((opcion) => (
                  <label key={opcion} className={nivel === opcion ? 'activo' : ''}>
                    <input
                      type="radio"
                      name="nivel-precio"
                      value={opcion}
                      checked={nivel === opcion}
                      onChange={() => {
                        setNivel(opcion);
                      }}
                    />
                    <span>
                      <i />
                      <strong>{ETIQUETA_NIVEL_PRECIO[opcion]}</strong>
                      <small>
                        {opcion === 'HABITUAL'
                          ? 'Tarifa comercial estándar.'
                          : opcion === 'PROVINCIA'
                            ? 'Tarifa definida para instituciones fuera de la ciudad base.'
                            : 'Tarifa especial asociada a nota de crédito.'}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="aviso-inline aviso-inline--info">
                <Icono nombre="alerta" />
                <p>
                  Este nivel se aplica cuando no existe una excepción de precio negociada para la
                  institución.
                </p>
              </div>
            </div>
            <footer className="drawer__pie drawer__pie--distribuido">
              {editando ? (
                <Boton
                  type="button"
                  variante="peligro"
                  disabled={procesando}
                  onClick={() => {
                    void eliminarActual();
                  }}
                >
                  Eliminar hospital
                </Boton>
              ) : (
                <span />
              )}
              <div>
                <Boton
                  type="button"
                  variante="secundario"
                  onClick={() => {
                    setFormularioAbierto(false);
                  }}
                >
                  Cancelar
                </Boton>
                <Boton
                  type="submit"
                  icono="check"
                  disabled={procesando || nombre.trim() === '' || ciudad.trim() === ''}
                >
                  {procesando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear hospital'}
                </Boton>
              </div>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
