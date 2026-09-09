import {
  BODEGA_CENTRAL,
  bodegaDe,
  codigoPieza,
  hospitalId,
  sku as crearSku,
  usuarioId,
  type EstadoPieza,
  type Hospital,
  type Pieza,
  type Rol,
} from '@crearcos/core';
import { CATALOGO, COMPOSICION_KITS, type FilaCatalogo } from './catalogo.js';
import { crearAleatorio, elegir, enteroEntre } from './aleatorio.js';

export const SEMILLA_POR_DEFECTO = 20260907;
export const CIUDAD_BASE = 'Quito';

export interface Usuario {
  readonly id: string;
  readonly nombre: string;
  readonly rol: Rol;
  readonly activo: boolean;
}

export interface ConjuntoSemilla {
  readonly generadoCon: number;
  readonly ciudadBase: string;
  readonly usuarios: readonly Usuario[];
  readonly hospitales: readonly Hospital[];
  readonly catalogo: readonly FilaCatalogo[];
  readonly composicionKits: Readonly<Record<string, readonly string[]>>;
  readonly piezas: readonly Pieza[];
}

const USUARIOS: readonly Usuario[] = [
  { id: 'u-admin', nombre: 'Andres Quisilema', rol: 'ADMINISTRADOR', activo: true },
  { id: 'u-aux-1', nombre: 'Marcia Loor', rol: 'AUXILIAR', activo: true },
  { id: 'u-aux-2', nombre: 'Diego Salas', rol: 'AUXILIAR', activo: true },
  { id: 'u-coord', nombre: 'Priscila Castro', rol: 'COORDINADORA', activo: true },
  { id: 'u-contable', nombre: 'Veronica Andrade', rol: 'CONTABLE', activo: true },
  { id: 'u-supervisor', nombre: 'Luis Teran', rol: 'SUPERVISOR', activo: true },
  { id: 'u-free-1', nombre: 'Rodrigo Lema', rol: 'FREELANCE', activo: true },
  { id: 'u-aux-3', nombre: 'Karina Villa', rol: 'AUXILIAR', activo: false },
];

const HOSPITALES: readonly Hospital[] = [
  {
    id: hospitalId('HOSP-METRO'),
    nombre: 'Hospital Metropolitano',
    ciudad: 'Quito',
    nivelPorDefecto: 'HABITUAL',
  },
  {
    id: hospitalId('HOSP-MILLENIUM'),
    nombre: 'Clinica Millenium',
    ciudad: 'Ambato',
    nivelPorDefecto: 'HABITUAL',
  },
  {
    id: hospitalId('HOSP-SANJUAN'),
    nombre: 'Hospital San Juan',
    ciudad: 'Quito',
    nivelPorDefecto: 'NOTA_CREDITO',
  },
];

/** Instrumentistas de la empresa que tienen maleta bodega propia. */
const CON_BODEGA_PROPIA = ['u-aux-1', 'u-aux-2'] as const;

const ESTADOS_INICIALES: readonly EstadoPieza[] = [
  'EN_BODEGA_CENTRAL',
  'EN_BODEGA_CENTRAL',
  'EN_BODEGA_CENTRAL',
  'EN_BODEGA_INSTRUMENTISTA',
  'EN_REPROCESAMIENTO',
];

function nuevaPieza(
  codigo: string,
  fila: FilaCatalogo,
  estado: EstadoPieza,
  duenoBodega: string | null,
  parent: string | null,
): Pieza {
  const ubicacion = duenoBodega === null ? BODEGA_CENTRAL : bodegaDe(usuarioId(duenoBodega));
  return {
    codigo: codigoPieza(codigo),
    sku: crearSku(fila.sku),
    tipo: fila.tipo,
    estado,
    ubicacion,
    maletaId: null,
    parentCodigo: parent === null ? null : codigoPieza(parent),
    version: 1,
    hlc: '000000000000000:00000:SEMILLA',
  };
}

/**
 * Genera el inventario de arranque: piezas sueltas mas cajas con sus hijas.
 * Todas quedan en estado de reposo. Ningun dato semilla nace a mitad de un flujo,
 * para que las pruebas partan siempre del mismo punto conocido.
 */
export function generarSemilla(semilla: number = SEMILLA_POR_DEFECTO): ConjuntoSemilla {
  const azar = crearAleatorio(semilla);
  const piezas: Pieza[] = [];
  const usados = new Set<string>();

  const registrar = (pieza: Pieza): void => {
    if (usados.has(pieza.codigo)) {
      throw new Error(`Codigo duplicado en la semilla: ${pieza.codigo}`);
    }
    usados.add(pieza.codigo);
    piezas.push(pieza);
  };

  const sueltas = CATALOGO.filter((f) => f.tipo !== 'KIT');
  let consecutivo = 1;

  // 170 piezas sueltas
  for (let i = 0; i < 170; i += 1) {
    const fila = elegir(azar, sueltas);
    const estado = elegir(azar, ESTADOS_INICIALES);
    const dueno = estado === 'EN_BODEGA_INSTRUMENTISTA' ? elegir(azar, CON_BODEGA_PROPIA) : null;
    const prefijo = fila.tipo === 'INSTRUMENTAL' ? 'INS' : 'CNS';
    registrar(
      nuevaPieza(`${prefijo}-${(1000 + consecutivo).toString()}`, fila, estado, dueno, null),
    );
    consecutivo += 1;
  }

  // 10 cajas/kits con sus componentes hijos
  const kits = CATALOGO.filter((f) => f.tipo === 'KIT');
  for (let k = 0; k < 10; k += 1) {
    const filaKit = elegir(azar, kits);
    const codigoKit = `KIT-${(100 + k).toString()}`;
    const estadoKit = elegir(azar, ESTADOS_INICIALES);
    const duenoKit =
      estadoKit === 'EN_BODEGA_INSTRUMENTISTA' ? elegir(azar, CON_BODEGA_PROPIA) : null;
    registrar(nuevaPieza(codigoKit, filaKit, estadoKit, duenoKit, null));

    const componentes = COMPOSICION_KITS[filaKit.sku] ?? [];
    for (const skuHijo of componentes) {
      const filaHijo = CATALOGO.find((f) => f.sku === skuHijo);
      if (filaHijo === undefined) {
        throw new Error(`El kit ${filaKit.sku} referencia un SKU inexistente: ${skuHijo}`);
      }
      const prefijo = filaHijo.tipo === 'INSTRUMENTAL' ? 'INS' : 'CNS';
      registrar(
        nuevaPieza(
          `${prefijo}-${(1000 + consecutivo).toString()}`,
          filaHijo,
          estadoKit,
          duenoKit,
          codigoKit,
        ),
      );
      consecutivo += 1;
    }
  }

  // Ruido controlado: algunas piezas extraviadas historicas
  for (let i = 0; i < enteroEntre(azar, 2, 4); i += 1) {
    const fila = elegir(azar, sueltas);
    registrar(nuevaPieza(`INS-${(1000 + consecutivo).toString()}`, fila, 'EXTRAVIADA', null, null));
    consecutivo += 1;
  }

  return {
    generadoCon: semilla,
    ciudadBase: CIUDAD_BASE,
    usuarios: USUARIOS,
    hospitales: HOSPITALES,
    catalogo: CATALOGO,
    composicionKits: COMPOSICION_KITS,
    piezas,
  };
}

/** Invariantes que el conjunto debe cumplir siempre. Se verifican al generar. */
export function verificarSemilla(conjunto: ConjuntoSemilla): readonly string[] {
  const problemas: string[] = [];
  const codigos: Set<string> = new Set(conjunto.piezas.map((p) => p.codigo));
  const skus = new Set(conjunto.catalogo.map((f) => f.sku));

  if (codigos.size !== conjunto.piezas.length) {
    problemas.push('Hay codigos de pieza repetidos');
  }

  for (const pieza of conjunto.piezas) {
    if (!skus.has(pieza.sku)) {
      problemas.push(`La pieza ${pieza.codigo} apunta a un SKU inexistente`);
    }
    if (pieza.parentCodigo !== null && !codigos.has(pieza.parentCodigo)) {
      problemas.push(`La pieza ${pieza.codigo} apunta a un padre inexistente`);
    }
    if (pieza.maletaId !== null) {
      problemas.push(`La pieza ${pieza.codigo} nace asignada a una maleta`);
    }
    if (
      pieza.estado === 'EN_BODEGA_INSTRUMENTISTA' &&
      pieza.ubicacion.clase !== 'BODEGA_INSTRUMENTISTA'
    ) {
      problemas.push(`La pieza ${pieza.codigo} tiene estado y ubicacion incoherentes`);
    }
  }

  for (const fila of conjunto.catalogo) {
    if (fila.costoBase <= 0) problemas.push(`El SKU ${fila.sku} no tiene costo`);
    if (!Number.isInteger(fila.costoBase)) {
      problemas.push(`El costo de ${fila.sku} no esta en centavos enteros`);
    }
  }

  for (const rol of ['ADMINISTRADOR', 'AUXILIAR', 'COORDINADORA', 'CONTABLE', 'SUPERVISOR']) {
    if (!conjunto.usuarios.some((u) => u.rol === rol && u.activo)) {
      problemas.push(`No hay usuario activo con rol ${rol}`);
    }
  }

  return problemas;
}
