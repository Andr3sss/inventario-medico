/**
 * UUIDv7 generado en el dispositivo.
 *
 * Los identificadores no pueden venir del servidor: un auxiliar arma una maleta
 * completa sin internet y esos ids tienen que seguir siendo validos al
 * sincronizar horas despues. La v7 lleva el tiempo en los primeros bytes, asi
 * que ademas ordena de forma natural en los indices de IndexedDB.
 */
const HEX = '0123456789abcdef';

function aHex(valor: number, digitos: number): string {
  let salida = '';
  for (let i = digitos - 1; i >= 0; i -= 1) {
    salida += HEX[(valor >>> (i * 4)) & 0xf] ?? '0';
  }
  return salida;
}

export interface FuenteAzar {
  readonly enteroAleatorio: (maximo: number) => number;
}

export const AZAR_CRIPTOGRAFICO: FuenteAzar = {
  enteroAleatorio: (maximo: number): number => {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return (buffer[0] ?? 0) % maximo;
  },
};

export function uuidV7(milis: number, azar: FuenteAzar = AZAR_CRIPTOGRAFICO): string {
  const altos = Math.floor(milis / 0x100000000);
  const bajos = milis >>> 0;
  const tiempo = `${aHex(altos, 4)}${aHex(bajos, 8)}`;

  const bloqueA = aHex(0x7000 | azar.enteroAleatorio(0x1000), 4);
  const bloqueB = aHex(0x8000 | azar.enteroAleatorio(0x4000), 4);
  const cola = `${aHex(azar.enteroAleatorio(0x100000000), 8)}${aHex(azar.enteroAleatorio(0x10000), 4)}`;

  return `${tiempo.slice(0, 8)}-${tiempo.slice(8, 12)}-${bloqueA}-${bloqueB}-${cola}`;
}

/**
 * Codigo corto legible para entidades creadas en tiempo de uso (maleta,
 * factura), a partir de un UUIDv7 ya generado.
 *
 * No es un slice de 8 caracteres: se probaron dos versiones que si lo eran y
 * las dos colisionaron en pruebas con creaciones seguidas.
 *  - Los primeros 8 caracteres son el timestamp de grano grueso, que casi no
 *    cambia entre dos creaciones separadas por segundos.
 *  - Los ultimos 8 (la cola aleatoria) tampoco alcanzan cuando la fuente de
 *    azar es un generador simple (como el de las pruebas, un LCG): sus bits
 *    bajos estan correlacionados entre llamadas consecutivas, una debilidad
 *    conocida de los LCG, y eso volvio a colisionar.
 *
 * Por eso se pliegan con XOR los cuatro bloques de 32 bits del UUID completo
 * (128 bits: tiempo + version/variante + aleatorio). El resultado usa todo el
 * UUID en vez de una porcion, asi que no depende de que una parte especifica
 * tenga buena entropia.
 */
export function codigoCortoDesde(uuid: string): string {
  const hex = uuid.replace(/-/g, '');
  let acumulado = 0;
  for (let i = 0; i < hex.length; i += 8) {
    const trozo = Number.parseInt(hex.slice(i, i + 8), 16);
    acumulado = (acumulado ^ trozo) >>> 0;
  }
  return acumulado.toString(16).padStart(8, '0').toUpperCase();
}
