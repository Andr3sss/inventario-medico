import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { fallo, type Resultado } from '@crearcos/core';
import {
  cerrarSesion,
  cerrarSesionCentral,
  actualizarContrasenaCentral,
  completarMfaCentral,
  configurarAccesoOffline,
  consolidarRevalidacionCentral,
  configuracionSupabaseValida,
  crearAdministracionCentral,
  crearClienteSupabase,
  crearTransporteFreelance,
  crearTransporteSupabase,
  entrarConTokenCentral,
  entrarConToken,
  diagnosticarSincronizacion,
  hayAccesoOfflineVigente,
  iniciarSesionOffline,
  iniciarSesion,
  iniciarSesionCentral,
  prepararMfaCentral,
  renovarAccesoOffline,
  revalidarSesionCentral,
  revocarAccesoOffline,
  sesionActual,
  sincronizar,
  solicitarRecuperacionCentral,
  validarTokenFreelance,
  validarTokenFreelanceCentral,
  type AdministracionCentral,
  type BaseLocal,
  type ErrorAuth,
  type ErrorFreelance,
  type DiagnosticoSincronizacion,
  type DesafioMfaCentral,
  type SesionActiva,
} from '@crearcos/data';
import { prepararDispositivo } from './arranque.js';

interface ValorApp {
  readonly db: BaseLocal;
  readonly ahora: () => number;
  readonly persistente: boolean;
  readonly sesion: SesionActiva | null;
  /** Escaneos que todavia no salieron del dispositivo. */
  readonly pendientes: number;
  readonly diagnosticoSync: DiagnosticoSincronizacion | null;
  readonly enLinea: boolean;
  readonly sincronizando: boolean;
  readonly requiereConfigurarAccesoOffline: boolean;
  readonly revalidandoCentral: boolean;
  readonly centralConfigurado: boolean;
  readonly modoDemoLocal: boolean;
  readonly administracionCentral: AdministracionCentral | null;
  readonly mfaPendiente: DesafioMfaCentral | null;
  readonly solicitarRecuperacion: (correo: string) => Promise<void>;
  readonly actualizarContrasena: (contrasena: string) => Promise<void>;
  readonly verificarMfa: (codigo: string) => Promise<Resultado<SesionActiva, ErrorAuth>>;
  readonly cancelarMfa: () => Promise<void>;
  readonly entrar: (
    usuario: string,
    contrasena: string,
  ) => Promise<Resultado<SesionActiva, ErrorAuth>>;
  readonly entrarOffline: (
    usuario: string,
    pin: string,
  ) => Promise<Resultado<SesionActiva, ErrorAuth>>;
  readonly configurarPinOffline: (pin: string) => Promise<Resultado<true, ErrorAuth>>;
  readonly entrarFreelance: (
    token: string,
    nombre: string,
  ) => Promise<Resultado<SesionActiva, ErrorFreelance>>;
  readonly validarFreelance: (
    token: string,
  ) => Promise<Resultado<{ readonly maletaId: string }, ErrorFreelance>>;
  readonly salir: () => Promise<void>;
  readonly sincronizarAhora: () => Promise<void>;
  readonly refrescarDiagnosticoSync: () => Promise<void>;
}

const Contexto = createContext<ValorApp | null>(null);

const ahora = (): number => Date.now();
const modoDemoLocal = import.meta.env.VITE_ENABLE_LOCAL_DEMO === 'true';
const contrasenaDemoLocal = import.meta.env.VITE_LOCAL_DEMO_PASSWORD;
const configuracionCentral = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() ?? '',
  clavePublicable: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
};
const centralConfigurado = configuracionSupabaseValida(configuracionCentral);
const clienteCentral = centralConfigurado ? crearClienteSupabase(configuracionCentral) : null;
const transporteCentral = clienteCentral === null ? null : crearTransporteSupabase(clienteCentral);

export function ProveedorApp({ children }: { children: ReactNode }): ReactElement {
  const [db, setDb] = useState<BaseLocal | null>(null);
  const [persistente, setPersistente] = useState(false);
  const [sesion, setSesion] = useState<SesionActiva | null>(null);
  const [diagnosticoSync, setDiagnosticoSync] = useState<DiagnosticoSincronizacion | null>(null);
  const [enLinea, setEnLinea] = useState(globalThis.navigator.onLine);
  const [sincronizando, setSincronizando] = useState(false);
  const [requiereConfigurarAccesoOffline, setRequiereConfigurarAccesoOffline] = useState(false);
  const [revalidandoCentral, setRevalidandoCentral] = useState(false);
  const [mfaPendiente, setMfaPendiente] = useState<{
    readonly desafio: DesafioMfaCentral;
    readonly identificador: string;
  } | null>(null);
  const sincronizacionEnCurso = useRef(false);
  const administracionCentral = useMemo(
    () =>
      db === null || clienteCentral === null
        ? null
        : crearAdministracionCentral(db, clienteCentral, ahora),
    [db],
  );

  useEffect(() => {
    // Se consulta a traves de una funcion: el analisis de flujo no puede
    // asumir que el valor sigue siendo el mismo despues de cada await.
    let vigente = true;
    const cancelado = (): boolean => !vigente;
    void (async () => {
      const arranque = await prepararDispositivo(ahora, {
        habilitarDemoLocal: modoDemoLocal,
        ...(contrasenaDemoLocal === undefined ? {} : { contrasenaDemoLocal }),
      });
      if (cancelado()) return;
      const recuperada = await sesionActual(arranque.db, { ahora });
      if (cancelado()) return;
      setDb(arranque.db);
      setPersistente(arranque.persistente);
      setSesion(recuperada.ok ? recuperada.valor : null);
      if (
        recuperada.ok &&
        recuperada.valor.origen === 'CENTRAL' &&
        recuperada.valor.rol !== 'FREELANCE'
      ) {
        const configurado = await hayAccesoOfflineVigente(arranque.db, recuperada.valor, ahora());
        if (!cancelado()) setRequiereConfigurarAccesoOffline(!configurado);
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  // La sesión visible también caduca mientras la PWA permanece abierta.
  useEffect(() => {
    if (db === null || sesion === null) return undefined;
    const restante = Math.max(0, sesion.expiraEn - ahora());
    const temporizador = globalThis.setTimeout(() => {
      void sesionActual(db, { ahora }).then((resultado) => {
        if (!resultado.ok) {
          setSesion(null);
          setRequiereConfigurarAccesoOffline(false);
        }
      });
    }, restante);
    return () => {
      globalThis.clearTimeout(temporizador);
    };
  }, [db, sesion]);

  const refrescarDiagnosticoSync = useCallback(async (): Promise<void> => {
    if (db === null) return;
    setDiagnosticoSync(await diagnosticarSincronizacion(db, ahora()));
  }, [db]);

  // El diagnostico combina pendientes, cuarentena, inbox y marcas durables.
  useEffect(() => {
    if (db === null) return undefined;
    const leer = (): void => {
      void refrescarDiagnosticoSync();
    };
    leer();
    const temporizador = globalThis.setInterval(leer, 3_000);
    return () => {
      globalThis.clearInterval(temporizador);
    };
  }, [db, refrescarDiagnosticoSync]);

  useEffect(() => {
    const conectado = (): void => {
      setEnLinea(true);
    };
    const desconectado = (): void => {
      setEnLinea(false);
    };
    globalThis.addEventListener('online', conectado);
    globalThis.addEventListener('offline', desconectado);
    return () => {
      globalThis.removeEventListener('online', conectado);
      globalThis.removeEventListener('offline', desconectado);
    };
  }, []);

  const sincronizarAhora = useCallback(async (): Promise<void> => {
    if (db === null || sesion === null || clienteCentral === null) {
      await refrescarDiagnosticoSync();
      return;
    }
    // No se usa una sesión Auth posiblemente ajena mientras el PIN local no
    // haya sido revalidado expresamente contra la identidad central.
    if (sesion.origen === 'OFFLINE') {
      await refrescarDiagnosticoSync();
      return;
    }
    const transporte =
      sesion.sesionFreelanceId === undefined
        ? transporteCentral
        : crearTransporteFreelance(clienteCentral, sesion.sesionFreelanceId);
    if (transporte === null) return;
    if (sincronizacionEnCurso.current) return;
    sincronizacionEnCurso.current = true;
    setSincronizando(true);
    try {
      const resumen = await sincronizar(db, transporte, {
        dispositivoId: sesion.dispositivoId,
        ahora,
        nombreDispositivo: globalThis.navigator.userAgent.slice(0, 120),
        plataforma: 'web',
        versionApp: '0.1.0',
      });
      if (
        resumen.estado === 'COMPLETADO' &&
        sesion.origen === 'CENTRAL' &&
        sesion.rol !== 'FREELANCE'
      ) {
        await renovarAccesoOffline(db, sesion, ahora());
      }
      const vigente = await sesionActual(db, { ahora });
      if (!vigente.ok) setSesion(null);
    } catch {
      // El motor persiste el diagnostico antes de propagar un error inesperado.
    } finally {
      try {
        await refrescarDiagnosticoSync();
      } finally {
        sincronizacionEnCurso.current = false;
        setSincronizando(false);
      }
    }
  }, [db, sesion, refrescarDiagnosticoSync]);

  // Reintento oportunista: IndexedDB sigue siendo operativa si no hay red.
  useEffect(() => {
    if (db === null || sesion === null || sesion.origen === 'OFFLINE' || clienteCentral === null) {
      return undefined;
    }
    let vigente = true;
    const ejecutar = (): void => {
      if (!vigente) return;
      void sincronizarAhora();
    };
    ejecutar();
    const temporizador = globalThis.setInterval(ejecutar, 15_000);
    globalThis.addEventListener('online', ejecutar);
    return () => {
      vigente = false;
      globalThis.clearInterval(temporizador);
      globalThis.removeEventListener('online', ejecutar);
    };
  }, [db, sesion, sincronizarAhora]);

  const entrar = useCallback(
    async (usuario: string, contrasena: string) => {
      if (db === null) throw new Error('El dispositivo todavia no esta listo');
      const resultado =
        clienteCentral !== null
          ? await iniciarSesionCentral(db, clienteCentral, usuario, contrasena, { ahora })
          : modoDemoLocal
            ? await iniciarSesion(db, usuario, contrasena, { ahora })
            : fallo<ErrorAuth>({
                codigo: 'SERVIDOR_NO_CONFIGURADO',
                mensaje: 'Supabase no esta configurado en este entorno',
                esperaMs: null,
              });
      if (resultado.ok) {
        setMfaPendiente(null);
        setSesion(resultado.valor);
        if (clienteCentral !== null && resultado.valor.rol !== 'FREELANCE') {
          const configurado = await renovarAccesoOffline(db, resultado.valor, ahora(), true);
          setRequiereConfigurarAccesoOffline(!configurado);
        } else {
          setRequiereConfigurarAccesoOffline(false);
        }
      } else if (
        clienteCentral !== null &&
        ['MFA_REQUERIDA', 'MFA_INSCRIPCION_REQUERIDA'].includes(resultado.error.codigo)
      ) {
        try {
          const desafio = await prepararMfaCentral(
            clienteCentral,
            resultado.error.codigo === 'MFA_INSCRIPCION_REQUERIDA',
          );
          setMfaPendiente({ desafio, identificador: usuario.trim() });
        } catch {
          await clienteCentral.auth.signOut({ scope: 'local' });
        }
      }
      return resultado;
    },
    [db],
  );

  const entrarOffline = useCallback(
    async (usuario: string, pin: string) => {
      if (db === null) throw new Error('El dispositivo todavía no está listo');
      const resultado = await iniciarSesionOffline(db, usuario, pin, { ahora });
      if (resultado.ok) {
        setSesion(resultado.valor);
        setRequiereConfigurarAccesoOffline(false);
      }
      return resultado;
    },
    [db],
  );

  const configurarPinOffline = useCallback(
    async (pin: string): Promise<Resultado<true, ErrorAuth>> => {
      if (db === null || sesion === null) {
        return fallo<ErrorAuth>({
          codigo: 'SIN_SESION',
          mensaje: 'No hay una sesión central para habilitar el PIN',
          esperaMs: null,
        });
      }
      const resultado = await configurarAccesoOffline(db, sesion, pin, { ahora });
      if (!resultado.ok) return resultado;
      setRequiereConfigurarAccesoOffline(false);
      return { ok: true, valor: true };
    },
    [db, sesion],
  );

  // Una sesión abierta con PIN debe volver a probar su identidad al recuperar red.
  useEffect(() => {
    if (
      db === null ||
      sesion === null ||
      sesion.origen !== 'OFFLINE' ||
      clienteCentral === null ||
      !enLinea
    ) {
      return undefined;
    }
    let vigente = true;
    const cancelado = () => !vigente;
    let temporizador: number | null = null;
    const revalidar = (): void => {
      let reintentar = false;
      setRevalidandoCentral(true);
      void revalidarSesionCentral(clienteCentral, sesion)
        .then(async (resultado) => {
          if (cancelado()) return;
          if (resultado.estado === 'NO_DISPONIBLE') {
            reintentar = true;
            return;
          }
          if (resultado.estado === 'VALIDA') {
            const actualizada = await consolidarRevalidacionCentral(
              db,
              sesion,
              resultado.perfil,
              ahora(),
            );
            if (!cancelado()) setSesion(actualizada);
            return;
          }
          if (resultado.codigo === 'PERFIL_INACTIVO') {
            await revocarAccesoOffline(db, sesion.usuarioId, ahora(), resultado.motivo);
          }
          try {
            await cerrarSesionCentral(db, clienteCentral);
          } finally {
            if (!cancelado()) setSesion(null);
          }
        })
        .catch(() => {
          // Un fallo transitorio al persistir/revalidar no concede ni revoca acceso.
          reintentar = true;
        })
        .finally(() => {
          if (cancelado()) return;
          setRevalidandoCentral(false);
          if (reintentar) temporizador = globalThis.setTimeout(revalidar, 15_000);
        });
    };
    revalidar();
    return () => {
      vigente = false;
      if (temporizador !== null) globalThis.clearTimeout(temporizador);
    };
  }, [db, enLinea, sesion]);

  const entrarFreelance = useCallback(
    async (token: string, nombre: string) => {
      if (db === null) throw new Error('El dispositivo todavia no esta listo');
      const resultado =
        clienteCentral === null
          ? await entrarConToken(db, token, nombre, { ahora })
          : await entrarConTokenCentral(db, clienteCentral, token, nombre);
      if (resultado.ok) setSesion(resultado.valor);
      return resultado;
    },
    [db],
  );

  const validarFreelance = useCallback(
    async (token: string) => {
      if (db === null) throw new Error('El dispositivo todavia no esta listo');
      return clienteCentral === null
        ? validarTokenFreelance(db, token)
        : validarTokenFreelanceCentral(clienteCentral, token);
    },
    [db],
  );

  const salir = useCallback(async () => {
    if (db === null) return;
    try {
      if (clienteCentral === null) await cerrarSesion(db);
      else await cerrarSesionCentral(db, clienteCentral);
    } finally {
      // La salida local no debe quedar visualmente abierta si Supabase falla.
      setSesion(null);
      setRequiereConfigurarAccesoOffline(false);
    }
  }, [db]);

  const solicitarRecuperacion = useCallback(async (correo: string): Promise<void> => {
    if (clienteCentral === null) throw new Error('Supabase no está configurado');
    await solicitarRecuperacionCentral(
      clienteCentral,
      correo,
      `${globalThis.location.origin}/actualizar-contrasena`,
    );
  }, []);

  const actualizarContrasena = useCallback(async (contrasena: string): Promise<void> => {
    if (clienteCentral === null) throw new Error('Supabase no está configurado');
    await actualizarContrasenaCentral(clienteCentral, contrasena);
  }, []);

  const verificarMfa = useCallback(
    async (codigo: string): Promise<Resultado<SesionActiva, ErrorAuth>> => {
      if (db === null || clienteCentral === null || mfaPendiente === null) {
        return fallo<ErrorAuth>({
          codigo: 'MFA_REQUERIDA',
          mensaje: 'El desafío MFA ya no está disponible',
          esperaMs: null,
        });
      }
      const resultado = await completarMfaCentral(
        db,
        clienteCentral,
        mfaPendiente.desafio,
        codigo,
        mfaPendiente.identificador,
        { ahora },
      );
      if (resultado.ok) {
        setMfaPendiente(null);
        setSesion(resultado.valor);
        const configurado = await renovarAccesoOffline(db, resultado.valor, ahora(), true);
        setRequiereConfigurarAccesoOffline(!configurado);
      }
      return resultado;
    },
    [db, mfaPendiente],
  );

  const cancelarMfa = useCallback(async (): Promise<void> => {
    try {
      if (clienteCentral !== null) await clienteCentral.auth.signOut({ scope: 'local' });
    } finally {
      setMfaPendiente(null);
    }
  }, []);

  const valor = useMemo<ValorApp | null>(
    () =>
      db === null
        ? null
        : {
            db,
            ahora,
            persistente,
            sesion,
            pendientes: diagnosticoSync?.pendientes ?? 0,
            diagnosticoSync,
            enLinea,
            sincronizando,
            requiereConfigurarAccesoOffline,
            revalidandoCentral,
            centralConfigurado,
            modoDemoLocal,
            administracionCentral,
            mfaPendiente: mfaPendiente?.desafio ?? null,
            solicitarRecuperacion,
            actualizarContrasena,
            verificarMfa,
            cancelarMfa,
            entrar,
            entrarOffline,
            configurarPinOffline,
            entrarFreelance,
            validarFreelance,
            salir,
            sincronizarAhora,
            refrescarDiagnosticoSync,
          },
    [
      db,
      persistente,
      sesion,
      diagnosticoSync,
      enLinea,
      sincronizando,
      requiereConfigurarAccesoOffline,
      revalidandoCentral,
      administracionCentral,
      mfaPendiente,
      solicitarRecuperacion,
      actualizarContrasena,
      verificarMfa,
      cancelarMfa,
      entrar,
      entrarOffline,
      configurarPinOffline,
      entrarFreelance,
      validarFreelance,
      salir,
      sincronizarAhora,
      refrescarDiagnosticoSync,
    ],
  );

  if (valor === null) {
    return (
      <div className="cargando">
        <p>Preparando el dispositivo. Solo ocurre la primera vez.</p>
      </div>
    );
  }

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useApp(): ValorApp {
  const valor = useContext(Contexto);
  if (valor === null) throw new Error('useApp se uso fuera del ProveedorApp');
  return valor;
}
