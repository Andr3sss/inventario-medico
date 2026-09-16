import { useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { AREAS, puedeAcceder, type Area } from '@crearcos/core';
import { clasificarSaludSincronizacion } from '@crearcos/data';
import type { DiagnosticoSincronizacion, FilaFallido } from '@crearcos/data';
import { useApp } from '../datos/contexto.js';
import { formatearFecha } from '../datos/presentacion.js';
import { Icono } from './Icono.js';
import { Boton, Estado } from './UI.js';

interface PresentacionSync {
  readonly titulo: string;
  readonly detalle: string;
  readonly icono: 'wifi' | 'nube' | 'alerta' | 'reloj' | 'reprocesar';
  readonly tono: 'correcto' | 'pendiente' | 'error' | 'offline';
}

export function EstadoSincronizacion({
  compacto = false,
}: {
  readonly compacto?: boolean;
}): ReactElement {
  const {
    ahora,
    centralConfigurado,
    diagnosticoSync,
    enLinea,
    refrescarDiagnosticoSync,
    sesion,
    sincronizando,
    sincronizarAhora,
  } = useApp();
  const [abierto, setAbierto] = useState(false);
  const navegar = useNavigate();
  const presentacion = presentarEstado({
    centralConfigurado,
    diagnostico: diagnosticoSync,
    enLinea,
    sincronizando,
  });

  const abrir = (): void => {
    setAbierto(true);
    void refrescarDiagnosticoSync();
  };

  const revisarFallido = (fallido: FilaFallido): void => {
    if (sesion === null) return;
    const area = areaCorreccion(fallido);
    if (!puedeAcceder(sesion.rol, area)) return;
    setAbierto(false);
    void navegar(AREAS[area].ruta);
  };

  const exportar = (): void => {
    if (diagnosticoSync === null || sesion === null) return;
    const generadoEn = ahora();
    const contenido = JSON.stringify(
      {
        generadoEn: new Date(generadoEn).toISOString(),
        dispositivoId: sesion.dispositivoId,
        conexionNavegador: enLinea ? 'EN_LINEA' : 'SIN_CONEXION',
        diagnostico: diagnosticoSync,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `crearcos-diagnostico-sync-${generadoEn.toString()}.json`;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    globalThis.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  };

  return (
    <>
      <button
        type="button"
        className={`sincronizacion sincronizacion--${presentacion.tono}${compacto ? ' sincronizacion--compacta' : ''}`}
        aria-label={`${presentacion.titulo}. Abrir diagnóstico de sincronización`}
        title={presentacion.titulo}
        onClick={abrir}
      >
        <span className="sincronizacion__icono">
          <Icono nombre={presentacion.icono} tamano={15} />
        </span>
        <span>
          <strong>{presentacion.titulo}</strong>
          <small>{presentacion.detalle}</small>
        </span>
        <Icono nombre="chevron" tamano={13} />
      </button>

      {abierto && (
        <div
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Diagnóstico de sincronización"
        >
          <button
            type="button"
            className="drawer__fondo"
            aria-label="Cerrar diagnóstico"
            onClick={() => {
              setAbierto(false);
            }}
          />
          <aside className="drawer__panel drawer__panel--sync">
            <header className="drawer__cabecera">
              <div>
                <p className="sobrelinea">Estado del dispositivo</p>
                <h2>Sincronización</h2>
              </div>
              <button
                type="button"
                className="boton-icono"
                aria-label="Cerrar"
                onClick={() => {
                  setAbierto(false);
                }}
              >
                <Icono nombre="cerrar" />
              </button>
            </header>

            <div className="drawer__contenido diagnostico-sync">
              <section
                className={`diagnostico-sync__estado diagnostico-sync__estado--${presentacion.tono}`}
              >
                <span>
                  <Icono nombre={presentacion.icono} tamano={21} />
                </span>
                <div>
                  <strong>{presentacion.titulo}</strong>
                  <p>{presentacion.detalle}</p>
                </div>
              </section>

              {diagnosticoSync !== null && (
                <>
                  <section className="diagnostico-sync__metricas" aria-label="Resumen técnico">
                    <DatoSync etiqueta="Conexión" valor={enLinea ? 'En línea' : 'Sin conexión'} />
                    <DatoSync etiqueta="Pendientes" valor={diagnosticoSync.pendientes.toString()} />
                    <DatoSync
                      etiqueta="Cuarentena"
                      valor={diagnosticoSync.fallidasTotal.toString()}
                      peligro={diagnosticoSync.fallidasTotal > 0}
                    />
                    <DatoSync
                      etiqueta="Inbox sin aplicar"
                      valor={diagnosticoSync.entradasNoAplicadas.toString()}
                      peligro={diagnosticoSync.erroresProyeccion > 0}
                    />
                    <DatoSync
                      etiqueta="Cursor"
                      valor={diagnosticoSync.cursor ?? 'Sin cursor'}
                      codigo
                    />
                    <DatoSync
                      etiqueta="Último PULL correcto"
                      valor={formatearFecha(diagnosticoSync.ultimaDescargaExitosaEn)}
                    />
                    <DatoSync
                      etiqueta="Último PUSH con respuesta"
                      valor={formatearFecha(diagnosticoSync.ultimoEnvioExitosoEn)}
                    />
                    <DatoSync
                      etiqueta="Último intento"
                      valor={formatearFecha(diagnosticoSync.ultimoIntentoEn)}
                    />
                  </section>

                  {diagnosticoSync.ultimoError !== null && (
                    <section className="diagnostico-sync__alerta" role="alert">
                      <Icono nombre="alerta" />
                      <div>
                        <strong>Último error registrado</strong>
                        <p>{diagnosticoSync.ultimoError.mensaje}</p>
                        <time>{formatearFecha(diagnosticoSync.ultimoError.ocurridoEn)}</time>
                      </div>
                    </section>
                  )}

                  {diagnosticoSync.colaEstancada && (
                    <section className="diagnostico-sync__alerta diagnostico-sync__alerta--aviso">
                      <Icono nombre="reloj" />
                      <div>
                        <strong>Cola estancada</strong>
                        <p>Hay operaciones con tres intentos o más de quince minutos pendientes.</p>
                      </div>
                    </section>
                  )}

                  {diagnosticoSync.descargaAtrasada && (
                    <section className="diagnostico-sync__alerta diagnostico-sync__alerta--aviso">
                      <Icono nombre="nube" />
                      <div>
                        <strong>Descarga atrasada</strong>
                        <p>Han pasado más de cinco minutos desde el último PULL correcto.</p>
                      </div>
                    </section>
                  )}

                  <SeccionFallidos
                    filas={diagnosticoSync.fallidas}
                    total={diagnosticoSync.fallidasTotal}
                    puedeRevisar={(fila) =>
                      sesion !== null && puedeAcceder(sesion.rol, areaCorreccion(fila))
                    }
                    alRevisar={revisarFallido}
                  />

                  {diagnosticoSync.erroresProyeccion > 0 && (
                    <section className="diagnostico-sync__seccion">
                      <header>
                        <div>
                          <p className="sobrelinea">Recepción central</p>
                          <h3>Errores de aplicación</h3>
                        </div>
                        <Estado tono="peligro">{diagnosticoSync.erroresProyeccion}</Estado>
                      </header>
                      <div className="diagnostico-sync__lista">
                        {diagnosticoSync.entradasConError.map((fila) => (
                          <article className="incidencia-sync" key={fila.id}>
                            <span className="incidencia-sync__icono">
                              <Icono nombre="alerta" tamano={16} />
                            </span>
                            <div>
                              <strong>{fila.error}</strong>
                              <small>
                                {fila.entidadTipo} · {fila.entidadId}
                              </small>
                              <code>
                                Commit {fila.secuenciaServidor} · cambio {fila.ordinal}
                              </code>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  {diagnosticoSync.fallidasTotal === 0 &&
                    diagnosticoSync.erroresProyeccion === 0 && (
                      <section className="diagnostico-sync__vacio">
                        <Icono nombre="check" />
                        <div>
                          <strong>Sin incidencias archivadas</strong>
                          <p>No hay rechazos ni errores de proyección ocultos.</p>
                        </div>
                      </section>
                    )}
                </>
              )}
            </div>

            <footer className="drawer__pie drawer__pie--sync">
              <Boton variante="secundario" icono="descargar" onClick={exportar}>
                Exportar diagnóstico
              </Boton>
              <Boton
                icono="reprocesar"
                disabled={!centralConfigurado || !enLinea || sincronizando}
                onClick={() => {
                  void sincronizarAhora();
                }}
              >
                {sincronizando ? 'Sincronizando…' : 'Reintentar ahora'}
              </Boton>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}

function DatoSync({
  etiqueta,
  valor,
  codigo = false,
  peligro = false,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly codigo?: boolean;
  readonly peligro?: boolean;
}): ReactElement {
  return (
    <div className={peligro ? 'dato-sync dato-sync--peligro' : 'dato-sync'}>
      <span>{etiqueta}</span>
      {codigo ? <code>{valor}</code> : <strong>{valor}</strong>}
    </div>
  );
}

function SeccionFallidos({
  filas,
  total,
  puedeRevisar,
  alRevisar,
}: {
  readonly filas: readonly FilaFallido[];
  readonly total: number;
  readonly puedeRevisar: (fila: FilaFallido) => boolean;
  readonly alRevisar: (fila: FilaFallido) => void;
}): ReactElement | null {
  if (filas.length === 0) return null;
  return (
    <section className="diagnostico-sync__seccion">
      <header>
        <div>
          <p className="sobrelinea">Salida del dispositivo</p>
          <h3>Operaciones rechazadas</h3>
        </div>
        <Estado tono="peligro">{total}</Estado>
      </header>
      <p className="diagnostico-sync__ayuda">
        Un rechazo terminal no se reenvía automáticamente: repetir el mismo UUID devolvería el mismo
        resultado. Revise la entidad y exporte la evidencia para corregirla con seguridad.
      </p>
      <div className="diagnostico-sync__lista">
        {filas.map((fila) => (
          <article className="incidencia-sync" key={fila.eventoId}>
            <span className="incidencia-sync__icono">
              <Icono nombre="alerta" tamano={16} />
            </span>
            <div>
              <strong>{fila.motivo}</strong>
              <small>
                {fila.evento.cuerpo.tipo} · {fila.codigo}
              </small>
              <code>{fila.codigoError ?? fila.eventoId}</code>
              <time>{formatearFecha(fila.registradoEn)}</time>
            </div>
            {puedeRevisar(fila) && (
              <button
                type="button"
                className="boton-incidencia"
                onClick={() => {
                  alRevisar(fila);
                }}
              >
                Revisar
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function areaCorreccion(fila: FilaFallido): Area {
  const tipo = fila.evento.cuerpo.tipo;
  if (tipo === 'GUARDAR_HOSPITAL') return 'hospitales';
  if (tipo.startsWith('MALETA_')) return 'maletas';
  if (tipo === 'CONFIRMAR_FACTURA') return 'facturacion';
  if (tipo === 'INGRESO_REPROCESO' || tipo === 'FIN_REPROCESO') return 'reprocesamiento';
  if (tipo === 'ESCANEO_USO' || tipo === 'CIERRE_MALETA_SIN_USO') return 'cirugia';
  return 'inventario';
}

function presentarEstado({
  centralConfigurado,
  diagnostico,
  enLinea,
  sincronizando,
}: {
  readonly centralConfigurado: boolean;
  readonly diagnostico: DiagnosticoSincronizacion | null;
  readonly enLinea: boolean;
  readonly sincronizando: boolean;
}): PresentacionSync {
  if (sincronizando) {
    return {
      titulo: 'Sincronizando',
      detalle: 'Enviando y descargando cambios',
      icono: 'reprocesar',
      tono: 'pendiente',
    };
  }
  const salud = clasificarSaludSincronizacion(diagnostico, { centralConfigurado, enLinea });
  if (salud === 'SIN_SERVIDOR') {
    return {
      titulo: 'Modo local',
      detalle: 'Servidor central no configurado',
      icono: 'nube',
      tono: 'offline',
    };
  }
  if (salud === 'COMPROBANDO') {
    return {
      titulo: 'Comprobando estado',
      detalle: 'Leyendo el diagnóstico local',
      icono: 'reloj',
      tono: 'pendiente',
    };
  }
  if (diagnostico === null) throw new Error('DIAGNOSTICO_SYNC_AUSENTE');
  const incidencias = diagnostico.fallidasTotal + diagnostico.erroresProyeccion;
  if (salud === 'CON_INCIDENCIAS') {
    return {
      titulo: 'Requiere atención',
      detalle:
        incidencias > 0
          ? `${incidencias.toString()} incidencia(s) · abrir diagnóstico`
          : 'El último intento falló · abrir diagnóstico',
      icono: 'alerta',
      tono: 'error',
    };
  }
  if (salud === 'SIN_CONEXION') {
    return {
      titulo: 'Sin conexión',
      detalle:
        diagnostico.pendientes > 0
          ? `${diagnostico.pendientes.toString()} cambio(s) esperan conexión`
          : 'Operación local disponible',
      icono: 'nube',
      tono: 'offline',
    };
  }
  if (salud === 'ATRASADA') {
    return {
      titulo: 'Sincronización atrasada',
      detalle: 'La última confirmación excedió el umbral',
      icono: 'reloj',
      tono: 'error',
    };
  }
  if (salud === 'PENDIENTE') {
    return {
      titulo: `${diagnostico.pendientes.toString()} cambio(s) pendientes`,
      detalle:
        diagnostico.entradasNoAplicadas > 0
          ? `${diagnostico.entradasNoAplicadas.toString()} entrada(s) por aplicar`
          : 'Esperando confirmación central',
      icono: 'nube',
      tono: 'pendiente',
    };
  }
  if (salud === 'SIN_VERIFICAR') {
    return {
      titulo: 'Sin verificar',
      detalle: 'Todavía no hay una descarga confirmada',
      icono: 'reloj',
      tono: 'pendiente',
    };
  }
  return {
    titulo: 'Todo sincronizado',
    detalle: `PULL ${formatearFecha(diagnostico.ultimaDescargaExitosaEn)}`,
    icono: 'wifi',
    tono: 'correcto',
  };
}
