import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generarSemilla, verificarSemilla } from './generar.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const destino = resolve(aqui, '../salida/semilla.json');

const argumento = process.argv[2];
const semilla = argumento === undefined ? undefined : Number.parseInt(argumento, 10);
const conjunto = generarSemilla(Number.isNaN(semilla) ? undefined : semilla);

const problemas = verificarSemilla(conjunto);
if (problemas.length > 0) {
  console.error('La semilla generada no cumple sus invariantes:');
  for (const problema of problemas) console.error(`  - ${problema}`);
  process.exit(1);
}

mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, `${JSON.stringify(conjunto, null, 2)}\n`, 'utf8');

const porEstado = new Map<string, number>();
for (const pieza of conjunto.piezas) {
  porEstado.set(pieza.estado, (porEstado.get(pieza.estado) ?? 0) + 1);
}

console.log(`Semilla ${conjunto.generadoCon.toString()} generada en ${destino}`);
console.log(`  usuarios:   ${conjunto.usuarios.length.toString()}`);
console.log(`  hospitales: ${conjunto.hospitales.length.toString()}`);
console.log(`  catalogo:   ${conjunto.catalogo.length.toString()} SKUs`);
console.log(`  piezas:     ${conjunto.piezas.length.toString()}`);
for (const [estado, cantidad] of [...porEstado].sort()) {
  console.log(`     ${estado.padEnd(28)} ${cantidad.toString()}`);
}
