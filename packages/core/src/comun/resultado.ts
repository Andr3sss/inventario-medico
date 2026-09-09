/**
 * Resultado explicito en lugar de excepciones.
 *
 * Motivo: en un flujo offline un `throw` no atrapado deja la transaccion de
 * IndexedDB a medias y el escaneo se pierde en silencio. Obligando a que toda
 * operacion del dominio devuelva ok/fallo, el compilador exige que quien llama
 * decida que hacer con el error antes de tocar la base local.
 */
export type Resultado<T, E> =
  { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly error: E };

export function ok<T>(valor: T): { readonly ok: true; readonly valor: T } {
  return { ok: true, valor };
}

export function fallo<E>(error: E): { readonly ok: false; readonly error: E } {
  return { ok: false, error };
}

/**
 * Guardia de exhaustividad. Si se agrega un estado o un evento nuevo y algun
 * switch se queda sin cubrirlo, esto rompe la compilacion en vez de fallar en
 * el quirofano.
 */
export function casoNoCubierto(valor: never, contexto: string): never {
  throw new Error(`Caso no cubierto en ${contexto}: ${JSON.stringify(valor)}`);
}
