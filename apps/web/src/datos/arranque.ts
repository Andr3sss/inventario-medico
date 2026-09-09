import { BaseLocal, asegurarPersistencia, registrarUsuario } from '@crearcos/data';
import { generarSemilla } from '@crearcos/seeds';

/**
 * Clave unica de los usuarios de demostracion.
 *
 * Existe solo mientras el prototipo no tiene servidor. Cuando entre la
 * autenticacion real, esta constante y el sembrado de usuarios desaparecen.
 */
export const CLAVE_DEMO = 'crearcos-2026';

export interface Arranque {
  readonly db: BaseLocal;
  /** El navegador concedio almacenamiento persistente. Si es falso hay que avisarlo. */
  readonly persistente: boolean;
  readonly sembrado: boolean;
}

/**
 * Deja el dispositivo listo para trabajar.
 *
 * Se siembra una sola vez, cuando la base esta vacia. Reabrir la app nunca pisa
 * lo que el auxiliar ya escaneo.
 */
export async function prepararDispositivo(ahora: () => number): Promise<Arranque> {
  const db = new BaseLocal();
  await db.open();
  const persistente = await asegurarPersistencia();

  if ((await db.usuarios.count()) > 0) {
    return { db, persistente, sembrado: false };
  }

  const semilla = generarSemilla();
  await db.catalogo.bulkPut([...semilla.catalogo]);
  await db.piezas.bulkPut([...semilla.piezas]);

  for (const usuario of semilla.usuarios) {
    await registrarUsuario(
      db,
      {
        usuarioId: usuario.id,
        nombre: usuario.nombre,
        rol: usuario.rol,
        contrasena: CLAVE_DEMO,
      },
      { ahora },
    );
    if (!usuario.activo) {
      await db.usuarios.update(usuario.id, { activo: false });
    }
  }

  return { db, persistente, sembrado: true };
}
