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
  configuracionSupabaseValida,
  crearAdministracionCentral,
  crearClienteSupabase,
  crearTransporteFreelance,
  crearTransporteSupabase,
  entrarConTokenCentral,
  entrarConToken,
  diagnosticarSincronizacion,
  iniciarSesion,
  iniciarSesionCentral,
  sesionActual,
  sincronizar,
  validarTokenFreelance,
  validarTokenFreelanceCentral,
  type AdministracionCentral,
  type BaseLocal,
  type ErrorAuth,
  type ErrorFreelance,
  type DiagnosticoSincronizacion,
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
  readonly centralConfigurado: boolean;
  readonly modoDemoLocal: boolean;
  readonly administracionCentral: AdministracionCentral | null;
  readonly entrar: (
    usuario: string,
    contrasena: string,
  ) => Promise<Resultado<SesionActiva, ErrorAuth>>;
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
    })();
    return () => {
      vigente = false;
    };
  }, []);

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
    const transporte =
      sesion.sesionFreelanceId === undefined
        ? transporteCentral
        : crearTransporteFreelance(clienteCentral, sesion.sesionFreelanceId);
    if (transporte === null) return;
    if (sincronizacionEnCurso.current) return;
    sincronizacionEnCurso.current = true;
    setSincronizando(true);
    try {
      await sincronizar(db, transporte, {
        dispositivoId: sesion.dispositivoId,
        ahora,
        nombreDispositivo: globalThis.navigator.userAgent.slice(0, 120),
        plataforma: 'web',
        versionApp: '0.1.0',
      });
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
    if (db === null || sesion === null || clienteCentral === null) return undefined;
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
      if (resultado.ok) setSesion(resultado.valor);
      return resultado;
    },
    [db],
  );

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
    if (clienteCentral === null) await cerrarSesion(db);
    else await cerrarSesionCentral(db, clienteCentral);
    setSesion(null);
  }, [db]);

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
            centralConfigurado,
            modoDemoLocal,
            administracionCentral,
            entrar,
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
      administracionCentral,
      entrar,
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
