/** Convierte texto a un ArrayBuffer propio aceptado por WebCrypto. */
function textoAOctetos(texto: string): ArrayBuffer {
  const datos = new TextEncoder().encode(texto);
  const destino = new ArrayBuffer(datos.byteLength);
  new Uint8Array(destino).set(datos);
  return destino;
}

const aHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** Deriva un secreto con PBKDF2-SHA256; el secreto original nunca se persiste. */
export async function derivarSecreto(
  secreto: string,
  sal: string,
  iteraciones: number,
): Promise<string> {
  const clave = await globalThis.crypto.subtle.importKey(
    'raw',
    textoAOctetos(secreto),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: textoAOctetos(sal), iterations: iteraciones },
    clave,
    256,
  );
  return aHex(bits);
}

/** Comparación de tiempo constante para derivados de igual longitud. */
export function derivadosIguales(izquierdo: string, derecho: string): boolean {
  if (izquierdo.length !== derecho.length) return false;
  let diferencia = 0;
  for (let indice = 0; indice < izquierdo.length; indice += 1) {
    diferencia |= izquierdo.charCodeAt(indice) ^ derecho.charCodeAt(indice);
  }
  return diferencia === 0;
}

export function generarSal(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
