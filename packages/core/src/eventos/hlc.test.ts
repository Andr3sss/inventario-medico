import { describe, expect, it } from 'vitest';
import { comparar, hlcInicial, marcar, recibir, serializar } from './hlc.js';
import { dispositivoId } from '../comun/marcas.js';

const CELULAR = dispositivoId('AND-7742');
const PC = dispositivoId('PC-BODEGA-01');

describe('reloj logico hibrido', () => {
  it('nunca retrocede aunque el reloj del sistema si lo haga', () => {
    let reloj = hlcInicial(CELULAR);
    reloj = marcar(reloj, 1_000);
    const anterior = reloj;
    reloj = marcar(reloj, 900); // el usuario cambio la hora del celular hacia atras

    expect(reloj.milis).toBe(1_000);
    expect(comparar(anterior, reloj)).toBeLessThan(0);
  });

  it('ordena escaneos consecutivos del mismo milisegundo', () => {
    let reloj = hlcInicial(PC);
    reloj = marcar(reloj, 5_000);
    const primero = reloj;
    reloj = marcar(reloj, 5_000);

    expect(comparar(primero, reloj)).toBeLessThan(0);
  });

  it('al fusionar con un evento remoto queda por delante de ambos', () => {
    const local = marcar(hlcInicial(PC), 1_000);
    const remoto = marcar(hlcInicial(CELULAR), 3_000);
    const fusionado = recibir(local, remoto, 1_200);

    expect(comparar(fusionado, local)).toBeGreaterThan(0);
    expect(comparar(fusionado, remoto)).toBeGreaterThan(0);
    expect(fusionado.dispositivo).toBe(PC);
  });

  it('rechaza un reloj remoto absurdamente adelantado', () => {
    const local = marcar(hlcInicial(PC), 1_000);
    const remoto = marcar(hlcInicial(CELULAR), 1_000 + 5 * 60 * 60 * 1000);
    expect(() => recibir(local, remoto, 1_000)).toThrow(/deriva/i);
  });

  it('la forma serializada ordena igual que la comparacion', () => {
    const a = marcar(hlcInicial(PC), 999);
    const b = marcar(hlcInicial(PC), 1_000);
    expect(serializar(a) < serializar(b)).toBe(true);
  });

  it('desempata por dispositivo para dar un orden total', () => {
    const a = { milis: 10, contador: 0, dispositivo: PC };
    const b = { milis: 10, contador: 0, dispositivo: CELULAR };
    expect(comparar(a, b)).not.toBe(0);
  });
});
