import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { Resultado } from '@crearcos/core';
import {
  cerrarSesion,
  iniciarSesion,
  sesionActual,
  type BaseLocal,
  type ErrorAuth,
  type SesionActiva,
} from '@crearcos/data';
import { prepararDispositivo } from './arranque.js';

interface ValorApp {
  readonly db: BaseLocal;
  readonly persistente: boolean;
  readonly sesion: SesionActiva | null;
  /** Escaneos que todavia no salieron del dispositivo. */
  readonly pendientes: number;
  readonly entrar: (
    usuario: string,
    contrasena: string,
  ) => Promise<Resultado<SesionActiva, ErrorAuth>>;
  readonly salir: () => Promise<void>;
}

const Contexto = createContext<ValorApp | null>(null);

const ahora = (): number => Date.now();

export function ProveedorApp({ children }: { children: ReactNode }): ReactElement {
  const [db, setDb] = useState<BaseLocal | null>(null);
  const [persistente, setPersistente] = useState(false);
  const [sesion, setSesion] = useState<SesionActiva | null>(null);
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    // Se consulta a traves de una funcion: el analisis de flujo no puede
    // asumir que el valor sigue siendo el mismo despues de cada await.
    let vigente = true;
    const cancelado = (): boolean => !vigente;
    void (async () => {
      const arranque = await prepararDispositivo(ahora);
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

  // La cuenta de pendientes se refresca sola: es el dato que le dice al auxiliar
  // si puede cerrar la app sin perder trabajo.
  useEffect(() => {
    if (db === null) return undefined;
    const leer = (): void => {
      void db.outbox.count().then(setPendientes);
    };
    leer();
    const temporizador = globalThis.setInterval(leer, 3_000);
    return () => {
      globalThis.clearInterval(temporizador);
    };
  }, [db]);

  const entrar = useCallback(
    async (usuario: string, contrasena: string) => {
      if (db === null) throw new Error('El dispositivo todavia no esta listo');
      const resultado = await iniciarSesion(db, usuario, contrasena, { ahora });
      if (resultado.ok) setSesion(resultado.valor);
      return resultado;
    },
    [db],
  );

  const salir = useCallback(async () => {
    if (db === null) return;
    await cerrarSesion(db);
    setSesion(null);
  }, [db]);

  const valor = useMemo<ValorApp | null>(
    () => (db === null ? null : { db, persistente, sesion, pendientes, entrar, salir }),
    [db, persistente, sesion, pendientes, entrar, salir],
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
