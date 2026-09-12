import { fallo, ok, usuarioId as crearUsuarioId, type Resultado, type Rol } from '@crearcos/core';
import { CLAVE_SESION, type BaseLocal } from '../db.js';
import {
  VIGENCIA_SESION_MS,
  idDispositivo,
  type ErrorAuth,
  type OpcionesAuth,
  type SesionActiva,
} from '../autenticacion.js';
import type { ClienteSupabase } from './cliente.js';

const ROLES: readonly Rol[] = [
  'SISTEMA',
  'ADMINISTRADOR',
  'AUXILIAR',
  'COORDINADORA',
  'CONTABLE',
  'SUPERVISOR',
  'FREELANCE',
];

function esRol(valor: string): valor is Rol {
  return ROLES.includes(valor as Rol);
}

/** Supabase Auth es la autoridad; IndexedDB solo conserva el perfil habilitado. */
export async function iniciarSesionCentral(
  db: BaseLocal,
  cliente: ClienteSupabase,
  correo: string,
  contrasena: string,
  opciones: OpcionesAuth,
): Promise<Resultado<SesionActiva, ErrorAuth>> {
  const { data: auth, error: errorAuth } = await cliente.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  });
  if (errorAuth) {
    return fallo({
      codigo: 'CREDENCIALES_INVALIDAS',
      mensaje: 'Correo o contrasena incorrectos',
      esperaMs: null,
    });
  }

  const { data: perfiles, error: errorPerfil } = await cliente
    .from('perfiles')
    .select('id,nombre,rol,activo')
    .order('nombre');
  const perfil = perfiles?.find((fila) => fila.id === auth.user.id) ?? null;
  if (errorPerfil || perfil === null || !esRol(perfil.rol)) {
    await cliente.auth.signOut({ scope: 'local' });
    return fallo({
      codigo: 'PERFIL_NO_DISPONIBLE',
      mensaje: 'La cuenta no tiene un perfil de negocio habilitado',
      esperaMs: null,
    });
  }
  if (!perfil.activo) {
    await cliente.auth.signOut({ scope: 'local' });
    return fallo({
      codigo: 'USUARIO_INACTIVO',
      mensaje: 'La cuenta esta desactivada, habla con el Administrador',
      esperaMs: null,
    });
  }
  if (perfil.rol === 'SISTEMA') {
    await cliente.auth.signOut({ scope: 'local' });
    return fallo({
      codigo: 'ROL_NO_INICIA_SESION',
      mensaje: 'SISTEMA no es una cuenta interactiva',
      esperaMs: null,
    });
  }

  const ahora = opciones.ahora();
  const sesion: SesionActiva = {
    usuarioId: crearUsuarioId(perfil.id),
    nombre: perfil.nombre,
    rol: perfil.rol,
    dispositivoId: await idDispositivo(db),
    expiraEn: ahora + VIGENCIA_SESION_MS,
  };
  await db.transaction('rw', [db.perfilesCentrales, db.meta], async () => {
    const centrales = perfiles.flatMap((fila) =>
      esRol(fila.rol)
        ? [
            {
              usuarioId: fila.id,
              nombre: fila.nombre,
              rol: fila.rol,
              activo: fila.activo,
              validoHasta: sesion.expiraEn,
            },
          ]
        : [],
    );
    await db.perfilesCentrales.bulkPut(centrales);
    await db.meta.put({ clave: CLAVE_SESION, valor: sesion });
  });
  return ok(sesion);
}

export async function cerrarSesionCentral(db: BaseLocal, cliente: ClienteSupabase): Promise<void> {
  // scope local invalida la copia del navegador sin cerrar otros dispositivos.
  try {
    await cliente.auth.signOut({ scope: 'local' });
  } finally {
    await db.meta.delete(CLAVE_SESION);
  }
}
