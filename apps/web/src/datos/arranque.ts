import {
  BaseLocal,
  asegurarPersistencia,
  definirCiudadBase,
  registrarUsuario,
} from '@crearcos/data';
import { generarSemilla } from '@crearcos/seeds';

export interface Arranque {
  readonly db: BaseLocal;
  /** El navegador concedio almacenamiento persistente. Si es falso hay que avisarlo. */
  readonly persistente: boolean;
  readonly sembrado: boolean;
}

export interface OpcionesArranque {
  /** Escape de desarrollo. En produccion debe permanecer false. */
  readonly habilitarDemoLocal?: boolean;
  /** Credencial efimera suministrada por entorno; nunca se compila por defecto. */
  readonly contrasenaDemoLocal?: string;
}

/**
 * Deja el dispositivo listo para trabajar.
 *
 * El sembrado de usuarios/catalogo/piezas ocurre una sola vez, cuando la base
 * esta vacia: reabrir la app nunca pisa lo que el auxiliar ya escaneo.
 *
 * El sembrado de hospitales (y la ciudad base para el motor de precios) tiene
 * su propia guarda, independiente de la de usuarios. Un dispositivo que ya
 * corria una version anterior de la app -sin `hospitales`, sin `Maleta`- ya
 * tiene usuarios sembrados y se saltaria el bloque de arriba; sin esta guarda
 * separada llegaria a la pantalla de cierre de maleta con la lista de
 * hospitales vacia, sin forma de elegir institucion.
 */
export async function prepararDispositivo(
  ahora: () => number,
  opciones: OpcionesArranque = {},
): Promise<Arranque> {
  const db = new BaseLocal();
  await db.open();
  const persistente = await asegurarPersistencia();
  if (opciones.habilitarDemoLocal !== true) {
    return { db, persistente, sembrado: false };
  }

  const contrasenaDemo = opciones.contrasenaDemoLocal?.trim();
  if (contrasenaDemo === undefined || contrasenaDemo.length < 8) {
    throw new Error('VITE_LOCAL_DEMO_PASSWORD debe tener al menos 8 caracteres');
  }

  const semilla = generarSemilla();
  const sinUsuarios = (await db.usuarios.count()) === 0;
  if (sinUsuarios) {
    await db.catalogo.bulkPut([...semilla.catalogo]);
    await db.piezas.bulkPut([...semilla.piezas]);

    for (const usuario of semilla.usuarios) {
      await registrarUsuario(
        db,
        {
          usuarioId: usuario.id,
          nombre: usuario.nombre,
          rol: usuario.rol,
          contrasena: contrasenaDemo,
        },
        { ahora },
      );
      if (!usuario.activo) {
        await db.usuarios.update(usuario.id, { activo: false });
      }
    }
  }

  if ((await db.hospitales.count()) === 0) {
    await db.hospitales.bulkPut([...semilla.hospitales]);
    await definirCiudadBase(db, semilla.ciudadBase);
  }

  return { db, persistente, sembrado: sinUsuarios };
}
