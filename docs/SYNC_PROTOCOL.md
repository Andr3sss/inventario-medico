# Protocolo de sincronización

## Modelo local

Dexie v5 conserva:

- `eventos` y `eventosMaleta`: logs locales con `operacionId` y ACK.
- `outbox`: compatibilidad y diagnóstico por evento de pieza.
- `operacionesSync`: unidad durable y atómica de PUSH.
- `inboxSync`: cambios centrales crudos, persistidos antes del cursor.
- `replicaCentral`: agregados sin tabla local especializada.
- tablas materializadas (`piezas`, `maletas`, `facturas`, etc.).

El ID de dispositivo es un UUID crudo estable. Instalaciones anteriores con
`disp-<uuid>` se migran conservando el UUID.

## PUSH

La petición a `functions/v1/sync` contiene `dispositivoId`, cursor y hasta 200
operaciones por ciclo local. Cada operación contiene:

```json
{
  "operacionId": "uuid",
  "secuenciaCliente": "entero decimal derivado del HLC",
  "eventos": []
}
```

Salida, cierre y cancelación agrupan todos sus eventos. PostgreSQL aplica cada
grupo en un subbloque transaccional: todos los eventos quedan aplicados o todos
se rechazan. `EMITIR_FACTURA` se desvía a `emitir_factura_central`, que cambia
piezas y factura en un único commit.

El servidor valida usuario, perfil, dispositivo, rol y HLC. Deduplica por
`operacionId + payload_hash`; un reintento idéntico devuelve resultado
idempotente. Reutilizar el UUID con otro contenido se rechaza.

## ACK y retry

Un evento/operación solo abandona la cola con respuesta terminal explícita:
`APLICADA`, `CONFLICTO` o `RECHAZADA`. Un error de red incrementa intentos y
programa backoff exponencial con jitter (2 s a 5 min). Los rechazos definitivos
se preservan en `fallidos`; nunca se descartan silenciosamente.

## PULL y cursor

`obtener_cambios_sync` pagina hasta 100 commits completos. Cada commit tiene
una `secuenciaServidor bigint` reservada bajo bloqueo de la cabeza global y una
lista ordenada de cambios. No se usa `updated_at > last_sync`.

Regla de durabilidad:

1. recibir respuesta;
2. guardar todos los cambios crudos en `inboxSync` y el cursor en una sola
   transacción Dexie;
3. confirmar/eliminar operaciones locales;
4. proyectar el inbox en las tablas locales;
5. mantener sin aplicar cualquier cambio bloqueado por una operación local.

Por ello el cursor puede avanzar aunque una proyección se posponga: el payload
ya está durablemente en IndexedDB. El siguiente ciclo intenta de nuevo el inbox.
Los HLC remotos se fusionan con el reloj local antes de emitir eventos nuevos.

## Sesiones freelance

El acceso público usa `freelance-access`, no una cuenta permanente en
`auth.users`. El token original se guarda únicamente como hash, expira, puede
revocarse y queda ligado a una maleta. Al canjearlo se crea una sesión opaca
limitada al mismo agregado y dispositivo.

El PUSH freelance solo acepta operaciones autorizadas sobre esa maleta y llama
`procesar_operacion_freelance`. El PULL usa `obtener_cambios_freelance`: conserva
el cursor monotónico global, pero filtra los payloads a la maleta, sus piezas,
factura y ciclos asociados. La Edge Function nunca devuelve el hash ni usa una
clave privilegiada en el navegador.

## Conflictos

Una asignación concurrente incompatible bloquea la fila de pieza, crea
`conflictos` y agrega evidencia en `conflicto_candidatos`. El cliente marca la
pieza `EN_CONFLICTO`; nuevos movimientos fallan hasta una resolución explícita
de Coordinadora. La resolución no borra candidatos ni eventos anteriores.

## Realtime

Realtime puede disparar un sync oportunista en el futuro, pero no forma parte
de la garantía. La recuperación completa siempre depende del pull por cursor,
por lo que un dispositivo desconectado durante horas no pierde notificaciones.
