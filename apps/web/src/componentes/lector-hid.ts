export type SufijoLector = 'ENTER' | 'TAB' | 'NINGUNO';

export interface DatosMuestraLector {
  readonly esperado: string;
  readonly recibido: string;
  readonly sufijo: SufijoLector;
  /** Marcas monotónicas de cada tecla imprimible, normalmente performance.now(). */
  readonly instantes: readonly number[];
}

export interface MuestraLector {
  readonly esperado: string;
  readonly recibido: string;
  readonly esperadoNormalizado: string;
  readonly recibidoNormalizado: string;
  readonly coincideExacto: boolean;
  readonly coincideNormalizado: boolean;
  readonly sufijo: SufijoLector;
  readonly caracteres: number;
  readonly duracionMs: number | null;
  readonly intervaloMaximoMs: number | null;
  /** Es una señal de ráfaga HID, no una identificación criptográfica del hardware. */
  readonly cadencia: 'RAFAGA_COMPATIBLE' | 'MANUAL_O_DESCONOCIDA';
}

export interface ResumenMuestrasLector {
  readonly total: number;
  readonly coincidenciasExactas: number;
  readonly conSufijo: number;
  readonly rafagasCompatibles: number;
}

const INTERVALO_RAFAGA_MAXIMO_MS = 50;

export function normalizarCodigoLector(valor: string): string {
  return valor.trim().toLocaleUpperCase('en-US');
}

export function sufijoDeTecla(tecla: string): SufijoLector | null {
  if (tecla === 'Enter') return 'ENTER';
  if (tecla === 'Tab') return 'TAB';
  return null;
}

export function evaluarMuestraLector(datos: DatosMuestraLector): MuestraLector {
  const esperado = datos.esperado.trim();
  const esperadoNormalizado = normalizarCodigoLector(esperado);
  const recibidoNormalizado = normalizarCodigoLector(datos.recibido);
  const intervalos = datos.instantes.slice(1).map((instante, indice) => {
    const anterior = datos.instantes[indice];
    return anterior === undefined ? 0 : Math.max(0, instante - anterior);
  });
  const duracionMs =
    datos.instantes.length < 2
      ? null
      : Math.max(0, (datos.instantes.at(-1) ?? 0) - (datos.instantes[0] ?? 0));
  const intervaloMaximoMs = intervalos.length === 0 ? null : Math.max(...intervalos);
  return {
    esperado,
    recibido: datos.recibido,
    esperadoNormalizado,
    recibidoNormalizado,
    coincideExacto: esperado !== '' && datos.recibido === esperado,
    coincideNormalizado: esperadoNormalizado !== '' && recibidoNormalizado === esperadoNormalizado,
    sufijo: datos.sufijo,
    caracteres: datos.recibido.length,
    duracionMs,
    intervaloMaximoMs,
    cadencia:
      datos.instantes.length === datos.recibido.length &&
      datos.recibido.length >= 3 &&
      intervaloMaximoMs !== null &&
      intervaloMaximoMs <= INTERVALO_RAFAGA_MAXIMO_MS
        ? 'RAFAGA_COMPATIBLE'
        : 'MANUAL_O_DESCONOCIDA',
  };
}

export function resumirMuestrasLector(muestras: readonly MuestraLector[]): ResumenMuestrasLector {
  return {
    total: muestras.length,
    coincidenciasExactas: muestras.filter((muestra) => muestra.coincideExacto).length,
    conSufijo: muestras.filter((muestra) => muestra.sufijo !== 'NINGUNO').length,
    rafagasCompatibles: muestras.filter((muestra) => muestra.cadencia === 'RAFAGA_COMPATIBLE')
      .length,
  };
}

export function serializarMuestrasLectorCsv(
  muestras: readonly MuestraLector[],
  contexto: { readonly navegador: string; readonly pantalla: string },
): string {
  const cabecera = [
    'muestra',
    'esperado',
    'esperado_normalizado',
    'recibido_crudo',
    'recibido_normalizado',
    'coincide_exacto',
    'coincide_normalizado',
    'sufijo',
    'caracteres',
    'duracion_ms',
    'intervalo_maximo_ms',
    'cadencia',
    'navegador',
    'pantalla',
  ];
  const filas = muestras.map((muestra, indice) => [
    indice + 1,
    muestra.esperado,
    muestra.esperadoNormalizado,
    muestra.recibido,
    muestra.recibidoNormalizado,
    muestra.coincideExacto ? 'SI' : 'NO',
    muestra.coincideNormalizado ? 'SI' : 'NO',
    muestra.sufijo,
    muestra.caracteres,
    muestra.duracionMs ?? '',
    muestra.intervaloMaximoMs ?? '',
    muestra.cadencia,
    contexto.navegador,
    contexto.pantalla,
  ]);
  return [cabecera, ...filas].map((fila) => fila.map(celdaCsv).join(',')).join('\r\n');
}

function celdaCsv(valor: string | number): string {
  const textoOriginal = String(valor);
  // Un QR externo puede empezar con una fórmula. El apóstrofo evita que una
  // hoja de cálculo la ejecute al abrir la evidencia exportada.
  const texto = /^[=+\-@]/.test(textoOriginal.trimStart()) ? `'${textoOriginal}` : textoOriginal;
  return `"${texto.replaceAll('"', '""')}"`;
}
