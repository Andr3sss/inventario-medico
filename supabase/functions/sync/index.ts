import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { corsHeaders, origenPermitido, responderPreflight } from '../_shared/http.ts';
import { validarPerfilActivoServidor } from '../_shared/auth.ts';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MASTER_TYPES = [
  'ELIMINAR_HOSPITAL',
  'CREAR_PRODUCTO',
  'ACTUALIZAR_PRODUCTO',
  'ELIMINAR_PRODUCTO',
  'REGISTRAR_PIEZA',
  'ACTUALIZAR_PIEZA',
  'ELIMINAR_PIEZA',
] as const;

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

function legacyOperations(events: unknown[]): unknown[] {
  return events.map((raw) => {
    const event = raw as { sobre?: { eventoId?: unknown; hlc?: unknown } };
    const eventId = String(event.sobre?.eventoId ?? '');
    const hlc = String(event.sobre?.hlc ?? '');
    const parts = hlc.split(':');
    const sequence =
      parts.length >= 2
        ? (BigInt(parts[0] ?? '0') * 100_000n + BigInt(parts[1] ?? '0')).toString()
        : '0';
    return { operacionId: eventId, secuenciaCliente: sequence, eventos: [raw] };
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return responderPreflight(req);
  if (!origenPermitido(req)) return json(req, 403, { error: 'ORIGEN_NO_PERMITIDO' });
  if (req.method !== 'POST') return json(req, 405, { error: 'METODO_NO_PERMITIDO' });

  const length = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return json(req, 413, { error: 'LOTE_DEMASIADO_GRANDE' });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('authorization');
  if (!url || !anonKey || !serviceKey || !authorization) {
    return json(req, 401, { error: 'AUTENTICACION_REQUERIDA' });
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json(req, 401, { error: 'SESION_INVALIDA' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: 'JSON_INVALIDO' });
  }

  const deviceId = String(body.dispositivoId ?? body.deviceId ?? '');
  if (!UUID.test(deviceId)) return json(req, 400, { error: 'DISPOSITIVO_INVALIDO' });
  const cursorRaw = body.cursorServidor ?? body.cursor ?? '0';
  const cursor = cursorRaw === null ? '0' : String(cursorRaw);
  if (!/^\d+$/.test(cursor)) return json(req, 400, { error: 'CURSOR_INVALIDO' });

  let operations: unknown[];
  if (Array.isArray(body.operaciones)) {
    operations = body.operaciones;
  } else if (Array.isArray(body.eventos)) {
    try {
      operations = legacyOperations(body.eventos);
    } catch {
      return json(req, 400, { error: 'HLC_INVALIDO' });
    }
  } else {
    operations = [];
  }
  if (operations.length > 500) return json(req, 413, { error: 'LOTE_SUPERA_500_OPERACIONES' });

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const perfilError = await validarPerfilActivoServidor(service, authData.user.id);
  if (perfilError !== null) return json(req, 403, { error: perfilError });
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error: deviceError } = await service.rpc('registrar_dispositivo', {
    p_actor_id: authData.user.id,
    p_dispositivo_id: deviceId,
    p_nombre: String(body.nombreDispositivo ?? 'Dispositivo sin nombre').slice(0, 120),
    p_plataforma: body.plataforma === undefined ? null : String(body.plataforma).slice(0, 80),
    p_clave_publica: body.clavePublica === undefined ? null : String(body.clavePublica),
    p_valido_hasta: validUntil,
    p_metadata: { versionApp: body.versionApp ?? null },
  });
  if (deviceError)
    return json(req, 403, { error: 'DISPOSITIVO_NO_HABILITADO', detalle: deviceError.message });

  const ordinary = operations.filter(
    (operation) =>
      !['EMITIR_FACTURA', 'GUARDAR_HOSPITAL', ...MASTER_TYPES].includes(
        String(record(operation)?.tipo ?? ''),
      ),
  );
  const invoiceEmissions = operations.filter(
    (operation) => record(operation)?.tipo === 'EMITIR_FACTURA',
  );
  const hospitalSaves = operations.filter(
    (operation) => record(operation)?.tipo === 'GUARDAR_HOSPITAL',
  );
  const masterCommands = operations.filter((operation) =>
    MASTER_TYPES.includes(String(record(operation)?.tipo ?? '') as (typeof MASTER_TYPES)[number]),
  );
  let accepted: unknown[] = [];
  let rejected: unknown[] = [];
  let conflicts: unknown[] = [];
  let operationResults: unknown[] = [];

  for (const rawOperation of masterCommands) {
    const operation = record(rawOperation);
    const operationId = String(operation?.operacionId ?? '');
    const clientSequence = String(operation?.secuenciaCliente ?? '');
    const type = String(operation?.tipo ?? '');
    const payload = record(operation?.maestro);
    if (
      !UUID.test(operationId) ||
      !/^\d+$/.test(clientSequence) ||
      !MASTER_TYPES.includes(type as (typeof MASTER_TYPES)[number]) ||
      payload === null
    ) {
      return json(req, 400, { error: 'COMANDO_MAESTRO_INVALIDO' });
    }
    const { data: result, error: commandError } = await service.rpc(
      'aplicar_comando_maestro_offline',
      {
        p_actor_id: authData.user.id,
        p_dispositivo_id: deviceId,
        p_operacion_id: operationId,
        p_secuencia_cliente: clientSequence,
        p_tipo: type,
        p_payload: payload,
      },
    );
    if (commandError) {
      operationResults.push({
        operacionId: operationId,
        estado: 'RECHAZADA',
        codigo: commandError.code ?? 'COMANDO_MAESTRO_RECHAZADO',
        idempotente: false,
      });
      rejected.push({
        operacionId: operationId,
        codigo: commandError.code ?? 'COMANDO_MAESTRO_RECHAZADO',
        motivo: commandError.message,
      });
      continue;
    }
    const resultData = record(result);
    operationResults.push(
      resultData ?? {
        operacionId: operationId,
        estado: 'RECHAZADA',
        codigo: 'RESPUESTA_COMANDO_MAESTRO_INVALIDA',
        idempotente: false,
      },
    );
    if (resultData?.estado === 'RECHAZADA') {
      rejected.push({
        operacionId: operationId,
        codigo: String(resultData.codigo ?? 'COMANDO_MAESTRO_RECHAZADO'),
        motivo: String(resultData.motivo ?? 'El servidor rechazó el comando maestro'),
      });
    }
  }

  for (const rawOperation of hospitalSaves) {
    const operation = record(rawOperation);
    const hospital = record(operation?.hospital);
    const operationId = String(operation?.operacionId ?? '');
    const clientSequence = String(operation?.secuenciaCliente ?? '');
    const hospitalId = String(hospital?.id ?? '');
    const code = String(hospital?.codigo ?? '').trim();
    const name = String(hospital?.nombre ?? '').trim();
    const city = String(hospital?.ciudad ?? '').trim();
    const priceLevel = String(hospital?.nivelPrecio ?? '');
    const expectedVersion = hospital?.versionEsperada;
    if (
      !UUID.test(operationId) ||
      !/^\d+$/.test(clientSequence) ||
      !UUID.test(hospitalId) ||
      code.length === 0 ||
      name.length === 0 ||
      city.length === 0 ||
      !['HABITUAL', 'PROVINCIA', 'NOTA_CREDITO'].includes(priceLevel) ||
      !(expectedVersion === null || typeof expectedVersion === 'number')
    ) {
      return json(req, 400, { error: 'HOSPITAL_OFFLINE_INVALIDO' });
    }
    const { data: result, error: saveError } = await service.rpc('guardar_hospital_offline', {
      p_actor_id: authData.user.id,
      p_dispositivo_id: deviceId,
      p_operacion_id: operationId,
      p_secuencia_cliente: clientSequence,
      p_hospital_id: hospitalId,
      p_codigo: code,
      p_nombre: name,
      p_ciudad: city,
      p_nivel_precio: priceLevel,
      p_version_esperada: expectedVersion,
    });
    if (saveError) {
      operationResults.push({
        operacionId: operationId,
        estado: 'RECHAZADA',
        codigo: saveError.code ?? 'HOSPITAL_RECHAZADO',
        idempotente: false,
      });
      rejected.push({
        operacionId: operationId,
        codigo: saveError.code ?? 'HOSPITAL_RECHAZADO',
        motivo: saveError.message,
      });
      continue;
    }
    const resultData = record(result);
    operationResults.push(
      resultData ?? {
        operacionId: operationId,
        estado: 'RECHAZADA',
        codigo: 'RESPUESTA_HOSPITAL_INVALIDA',
        idempotente: false,
      },
    );
    if (resultData?.estado === 'RECHAZADA') {
      rejected.push({
        operacionId: operationId,
        codigo: String(resultData.codigo ?? 'HOSPITAL_RECHAZADO'),
        motivo: String(resultData.motivo ?? 'El servidor rechazó el cambio de hospital'),
      });
    }
  }

  // Los maestros se aplican antes que las operaciones que pueden referenciarlos
  // (por ejemplo, el cierre offline de una maleta en un hospital recién creado).
  if (ordinary.length > 0) {
    const { data: push, error: pushError } = await service.rpc('procesar_lote_sync', {
      p_actor_id: authData.user.id,
      p_dispositivo_id: deviceId,
      p_operaciones: ordinary,
    });
    if (pushError) return json(req, 409, { error: 'PUSH_RECHAZADO', detalle: pushError.message });
    const pushData = push as {
      aceptados?: unknown[];
      rechazados?: unknown[];
      conflictos?: unknown[];
      operaciones?: unknown[];
    };
    accepted = pushData.aceptados ?? [];
    rejected.push(...(pushData.rechazados ?? []));
    conflicts = pushData.conflictos ?? [];
    operationResults.push(...(pushData.operaciones ?? []));
  }

  // La emisión modifica factura, líneas y piezas en un solo commit. No puede
  // degradarse a varios eventos de pieza independientes.
  for (const rawOperation of invoiceEmissions) {
    const operation = record(rawOperation);
    const operationId = String(operation?.operacionId ?? '');
    const events = Array.isArray(operation?.eventos) ? operation.eventos : [];
    const invoiceId = String(operation?.facturaId ?? '');
    const invoiceNumber = String(operation?.numeroFactura ?? '');
    const clientSequence = String(operation?.secuenciaCliente ?? '');
    if (
      !UUID.test(operationId) ||
      !UUID.test(invoiceId) ||
      !/^\d+$/.test(clientSequence) ||
      invoiceNumber.length === 0 ||
      events.length === 0
    ) {
      return json(req, 400, { error: 'EMISION_FACTURA_INVALIDA' });
    }
    const { data: emission, error: emissionError } = await service.rpc('emitir_factura_central', {
      p_actor_id: authData.user.id,
      p_dispositivo_id: deviceId,
      p_operacion_id: operationId,
      p_secuencia_cliente: clientSequence,
      p_factura_id: invoiceId,
      p_numero: invoiceNumber,
      p_eventos: events,
    });
    if (emissionError) {
      operationResults.push({
        operacionId: operationId,
        estado: 'RECHAZADA',
        codigo: emissionError.code ?? 'EMISION_RECHAZADA',
        idempotente: false,
      });
      rejected.push(
        ...events.map((event) => ({
          eventoId: String(record(record(event)?.sobre)?.eventoId ?? ''),
          operacionId: operationId,
          codigo: emissionError.code ?? 'EMISION_RECHAZADA',
          motivo: emissionError.message,
        })),
      );
      continue;
    }
    accepted.push(...events.map((event) => String(record(record(event)?.sobre)?.eventoId ?? '')));
    const emissionData = record(emission);
    operationResults.push({
      operacionId: operationId,
      estado: 'APLICADA',
      secuenciaServidor: emissionData?.secuenciaServidor ?? null,
      idempotente: emissionData?.idempotente === true,
    });
  }

  const { data: pull, error: pullError } = await service.rpc('obtener_cambios_sync', {
    p_actor_id: authData.user.id,
    p_dispositivo_id: deviceId,
    p_cursor: cursor,
    p_max_commits: 100,
  });
  if (pullError) return json(req, 409, { error: 'PULL_RECHAZADO', detalle: pullError.message });

  const pullData = pull as {
    cursorServidor?: unknown;
    commits?: Array<{ cambios?: Array<{ entidadTipo?: string; payload?: unknown }> }>;
    hayMas?: boolean;
  };
  const pieces = (pullData.commits ?? [])
    .flatMap((commit) => commit.cambios ?? [])
    .filter((change) => change.entidadTipo === 'PIEZA')
    .map((change) => change.payload);

  return json(req, 200, {
    aceptados: accepted,
    rechazados: rejected,
    conflictos: conflicts,
    operaciones: operationResults,
    piezas: pieces,
    commits: pullData.commits ?? [],
    cursorServidor: String(pullData.cursorServidor ?? cursor),
    hayMas: pullData.hayMas ?? false,
  });
});
