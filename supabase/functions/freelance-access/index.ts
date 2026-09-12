import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin') ?? '';
  const configured = (
    Deno.env.get('ALLOWED_ORIGINS') ??
    'http://localhost:5173,http://127.0.0.1:5173,http://[::1]:5173'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    'Access-Control-Allow-Origin': configured.includes(origin) ? origin : (configured[0] ?? ''),
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-application-name',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'METODO_NO_PERMITIDO' });
  const length = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return json(req, 413, { error: 'SOLICITUD_DEMASIADO_GRANDE' });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json(req, 503, { error: 'SERVICIO_NO_CONFIGURADO' });
  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    body = record(await req.json()) ?? {};
  } catch {
    return json(req, 400, { error: 'JSON_INVALIDO' });
  }
  const action = text(body.accion);
  const fail = (error: { message: string; code?: string } | null): Response =>
    json(req, error?.code === '42501' ? 401 : 409, {
      error: error?.code ?? 'OPERACION_RECHAZADA',
      detalle: error?.message ?? 'Operación rechazada',
    });

  if (action === 'VALIDAR') {
    const { data, error } = await service.rpc('validar_acceso_freelance', {
      p_token: text(body.token),
    });
    return error ? fail(error) : json(req, 200, data);
  }

  if (action === 'REDIMIR') {
    const deviceId = text(body.dispositivoId);
    if (!UUID.test(deviceId)) return json(req, 400, { error: 'DISPOSITIVO_INVALIDO' });
    const { data, error } = await service.rpc('redimir_acceso_freelance', {
      p_token: text(body.token),
      p_dispositivo_id: deviceId,
      p_nombre_dispositivo: text(body.nombreDispositivo) || 'Navegador web',
      p_plataforma: text(body.plataforma) || 'web',
      p_nombre_freelance: text(body.nombre),
    });
    return error ? fail(error) : json(req, 200, data);
  }

  if (action === 'SINCRONIZAR') {
    const sessionId = text(body.sesionId);
    const deviceId = text(body.dispositivoId);
    const cursor = body.cursorServidor === null ? '0' : text(body.cursorServidor) || '0';
    const operations = Array.isArray(body.operaciones) ? body.operaciones : [];
    if (!UUID.test(sessionId) || !UUID.test(deviceId) || !/^\d+$/.test(cursor)) {
      return json(req, 400, { error: 'SESION_O_CURSOR_INVALIDO' });
    }
    if (operations.length > 200) return json(req, 413, { error: 'LOTE_SUPERA_200_OPERACIONES' });

    const accepted: string[] = [];
    const rejected: unknown[] = [];
    const operationResults: unknown[] = [];
    for (const raw of operations) {
      const operation = record(raw);
      const operationId = text(operation?.operacionId);
      if (!UUID.test(operationId)) return json(req, 400, { error: 'OPERACION_INVALIDA' });
      const { data, error } = await service.rpc('procesar_operacion_freelance', {
        p_sesion_id: sessionId,
        p_dispositivo_id: deviceId,
        p_operacion: operation,
      });
      if (error) {
        const events = Array.isArray(operation?.eventos) ? operation.eventos : [];
        rejected.push(
          ...events.map((event) => ({
            eventoId: text(record(record(event)?.sobre)?.eventoId),
            operacionId: operationId,
            codigo: error.code ?? 'OPERACION_RECHAZADA',
            motivo: error.message,
          })),
        );
        operationResults.push({
          operacionId: operationId,
          estado: 'RECHAZADA',
          codigo: error.code ?? 'OPERACION_RECHAZADA',
          idempotente: false,
        });
      } else {
        const result = record(data);
        const ids = Array.isArray(result?.aceptados)
          ? result.aceptados.map((value) => String(value))
          : [];
        accepted.push(...ids);
        operationResults.push({
          operacionId: operationId,
          estado: 'APLICADA',
          secuenciaServidor: result?.secuenciaServidor ?? null,
          idempotente: result?.idempotente === true,
        });
      }
    }

    const { data: pull, error: pullError } = await service.rpc('obtener_cambios_freelance', {
      p_sesion_id: sessionId,
      p_dispositivo_id: deviceId,
      p_cursor: cursor,
      p_max_commits: 100,
    });
    if (pullError) return fail(pullError);
    const pullResult = record(pull);
    const commits = Array.isArray(pullResult?.commits) ? pullResult.commits : [];
    const pieces = commits
      .flatMap((commit) => {
        const changes = record(commit)?.cambios;
        return Array.isArray(changes) ? changes : [];
      })
      .filter((change) => record(change)?.entidadTipo === 'PIEZA')
      .map((change) => record(change)?.payload);
    return json(req, 200, {
      aceptados: accepted,
      rechazados: rejected,
      conflictos: [],
      operaciones: operationResults,
      piezas: pieces,
      commits,
      cursorServidor: String(pullResult?.cursorServidor ?? cursor),
      hayMas: pullResult?.hayMas === true,
    });
  }

  return json(req, 400, { error: 'ACCION_DESCONOCIDA' });
});
