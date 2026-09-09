import type { TipoPieza } from '@crearcos/core';

export interface FilaCatalogo {
  readonly sku: string;
  readonly nombre: string;
  readonly tipo: TipoPieza;
  /** Costo en centavos de dolar. */
  readonly costoBase: number;
}

/** Catalogo de arranque. Nombres y costos son de ejemplo, no son datos reales de Crearcos. */
export const CATALOGO: readonly FilaCatalogo[] = [
  {
    sku: 'TIJERA-MAYO-14',
    nombre: 'Tijera Mayo recta 14 cm',
    tipo: 'INSTRUMENTAL',
    costoBase: 4_200,
  },
  {
    sku: 'TIJERA-METZ-18',
    nombre: 'Tijera Metzenbaum 18 cm',
    tipo: 'INSTRUMENTAL',
    costoBase: 5_800,
  },
  {
    sku: 'PORTA-AGUJAS-16',
    nombre: 'Porta agujas Mayo-Hegar 16 cm',
    tipo: 'INSTRUMENTAL',
    costoBase: 6_100,
  },
  {
    sku: 'PINZA-KELLY-14',
    nombre: 'Pinza Kelly curva 14 cm',
    tipo: 'INSTRUMENTAL',
    costoBase: 3_400,
  },
  {
    sku: 'PINZA-KOCHER-16',
    nombre: 'Pinza Kocher recta 16 cm',
    tipo: 'INSTRUMENTAL',
    costoBase: 3_950,
  },
  {
    sku: 'SEPARADOR-FARABEUF',
    nombre: 'Separador Farabeuf par',
    tipo: 'INSTRUMENTAL',
    costoBase: 7_300,
  },
  {
    sku: 'SEPARADOR-RICHARDSON',
    nombre: 'Separador Richardson mediano',
    tipo: 'INSTRUMENTAL',
    costoBase: 8_900,
  },
  {
    sku: 'MANGO-BISTURI-4',
    nombre: 'Mango de bisturi numero 4',
    tipo: 'INSTRUMENTAL',
    costoBase: 1_850,
  },
  {
    sku: 'PINZA-DISECCION-ADSON',
    nombre: 'Pinza de diseccion Adson',
    tipo: 'INSTRUMENTAL',
    costoBase: 2_700,
  },
  {
    sku: 'CANULA-YANKAUER',
    nombre: 'Canula de succion Yankauer',
    tipo: 'INSTRUMENTAL',
    costoBase: 3_100,
  },
  { sku: 'CURETA-OSEA-5', nombre: 'Cureta osea numero 5', tipo: 'INSTRUMENTAL', costoBase: 6_400 },
  { sku: 'GUBIA-STILLE', nombre: 'Gubia Stille-Luer', tipo: 'INSTRUMENTAL', costoBase: 11_200 },

  { sku: 'HOJA-BISTURI-24', nombre: 'Hoja de bisturi numero 24', tipo: 'INSUMO', costoBase: 95 },
  { sku: 'GASA-10X10', nombre: 'Gasa esteril 10x10 cm', tipo: 'INSUMO', costoBase: 45 },
  { sku: 'SUTURA-VICRYL-30', nombre: 'Sutura Vicryl 3-0', tipo: 'INSUMO', costoBase: 780 },
  { sku: 'SUTURA-NYLON-40', nombre: 'Sutura Nylon 4-0', tipo: 'INSUMO', costoBase: 640 },
  {
    sku: 'TORNILLO-CORTICAL-35',
    nombre: 'Tornillo cortical 3.5 mm',
    tipo: 'INSUMO',
    costoBase: 2_350,
  },
  { sku: 'PLACA-LCP-6', nombre: 'Placa LCP 6 orificios', tipo: 'INSUMO', costoBase: 18_500 },
  { sku: 'GUANTE-QX-75', nombre: 'Guante quirurgico 7.5', tipo: 'INSUMO', costoBase: 130 },
  { sku: 'COMPRESA-45X45', nombre: 'Compresa quirurgica 45x45 cm', tipo: 'INSUMO', costoBase: 210 },

  { sku: 'KIT-BASICO-CX', nombre: 'Kit basico de cirugia', tipo: 'KIT', costoBase: 15_000 },
  { sku: 'KIT-TRAUMA-MENOR', nombre: 'Kit trauma menor', tipo: 'KIT', costoBase: 24_000 },
  { sku: 'KIT-OSTEOSINTESIS', nombre: 'Kit osteosintesis 3.5', tipo: 'KIT', costoBase: 41_000 },
  { sku: 'KIT-SUTURA', nombre: 'Kit de sutura', tipo: 'KIT', costoBase: 4_500 },
  { sku: 'KIT-LAPAROTOMIA', nombre: 'Kit de laparotomia', tipo: 'KIT', costoBase: 33_000 },
];

/** Composicion teorica de cada kit. La instancia fisica puede diferir, y por eso se compara. */
export const COMPOSICION_KITS: Readonly<Record<string, readonly string[]>> = {
  'KIT-BASICO-CX': ['MANGO-BISTURI-4', 'HOJA-BISTURI-24', 'PINZA-KELLY-14', 'GASA-10X10'],
  'KIT-TRAUMA-MENOR': ['TIJERA-MAYO-14', 'PINZA-KOCHER-16', 'SUTURA-NYLON-40', 'COMPRESA-45X45'],
  'KIT-OSTEOSINTESIS': ['PLACA-LCP-6', 'TORNILLO-CORTICAL-35', 'CURETA-OSEA-5', 'GUBIA-STILLE'],
  'KIT-SUTURA': ['PORTA-AGUJAS-16', 'SUTURA-VICRYL-30', 'PINZA-DISECCION-ADSON'],
  'KIT-LAPAROTOMIA': [
    'SEPARADOR-RICHARDSON',
    'SEPARADOR-FARABEUF',
    'CANULA-YANKAUER',
    'TIJERA-METZ-18',
  ],
};
