import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  corsHeaders,
  leerOrigenesPermitidos,
  origenPermitido,
  responderPreflight,
} from './http.js';

describe('CORS estricto para Edge Functions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('acepta origenes HTTPS exactos y elimina duplicados', () => {
    expect(
      leerOrigenesPermitidos('https://app.crearcos.example, https://app.crearcos.example'),
    ).toEqual(['https://app.crearcos.example']);
  });

  it.each([
    '*',
    'http://app.crearcos.example',
    'https://usuario:clave@app.crearcos.example',
    'https://app.crearcos.example/ruta',
    'https://app.crearcos.example?x=1',
  ])('rechaza una configuracion no exacta o insegura: %s', (origen) => {
    expect(() => leerOrigenesPermitidos(origen)).toThrow('ALLOWED_ORIGINS_INVALIDO');
  });

  it('permite HTTP solo para loopback durante desarrollo local', () => {
    expect(leerOrigenesPermitidos('http://127.0.0.1:5173')).toEqual(['http://127.0.0.1:5173']);
  });

  it('nunca refleja ni sustituye un origen denegado', async () => {
    const req = new Request('https://funcion.example', {
      method: 'OPTIONS',
      headers: { Origin: 'https://atacante.example' },
    });
    expect(origenPermitido(req, 'https://app.crearcos.example')).toBe(false);
    expect(corsHeaders(req, 'https://app.crearcos.example')).not.toHaveProperty(
      'Access-Control-Allow-Origin',
    );
    const respuesta = responderPreflight(req, 'https://app.crearcos.example');
    expect(respuesta.status).toBe(403);
    expect(respuesta.headers.get('access-control-allow-origin')).toBeNull();
    expect(await respuesta.text()).toBe('');
  });

  it('responde 204 y refleja un origen permitido exacto', () => {
    const req = new Request('https://funcion.example', {
      method: 'OPTIONS',
      headers: { Origin: 'https://app.crearcos.example' },
    });
    const respuesta = responderPreflight(req, 'https://app.crearcos.example');
    expect(respuesta.status).toBe(204);
    expect(respuesta.headers.get('access-control-allow-origin')).toBe(
      'https://app.crearcos.example',
    );
  });

  it('lee ALLOWED_ORIGINS del runtime Deno cuando no se inyecta un argumento', () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (nombre: string) =>
          nombre === 'ALLOWED_ORIGINS' ? 'https://staging.crearcos.example' : undefined,
      },
    });
    const req = new Request('https://funcion.example', {
      method: 'OPTIONS',
      headers: { Origin: 'https://staging.crearcos.example' },
    });
    const respuesta = responderPreflight(req);
    expect(respuesta.status).toBe(204);
    expect(respuesta.headers.get('access-control-allow-origin')).toBe(
      'https://staging.crearcos.example',
    );
  });
});
