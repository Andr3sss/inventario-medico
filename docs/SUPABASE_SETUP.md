# Configuración de Supabase

## Requisitos

- Node.js 20 o superior.
- Docker para el stack local de Supabase.
- Acceso al proyecto para enlazar CLI o MCP.
- Secretos en el gestor del entorno, nunca en Git.

Las versiones están fijadas: Supabase CLI `2.117.0` y `supabase-js 2.116.0`.

## Desarrollo local

```bash
npm install
npx supabase start
npx supabase db reset
npx supabase test db
npm run verificar
npm run build
```

El seed automático está desactivado. Para cargar demo se usa el script de
operador descrito en `DEMO_DATA.md`.

### Escenario E2E multidispositivo

La prueba destructiva solo acepta la URL local exacta de Supabase en el puerto
`54321`; rechaza una URL remota aunque se configuren credenciales válidas. Con
el stack local iniciado, exportar las claves que entrega la CLI y ejecutar:

```bash
eval "$(npx supabase status -o env)"
export SUPABASE_URL="$API_URL"
export SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export CREARCOS_E2E_SUPABASE_LOCAL=true
npm run test:e2e:sync
```

El escenario crea identidades y maestros únicos dentro de esa instancia
desechable. No presupone una base limpia entre casos, pero CI siempre la
construye desde las migraciones del clon, ejecuta `supabase test db` y luego
prueba los dos órdenes de reconexión. `npm test` conserva la prueba E2E como
omitida para no tocar infraestructura por accidente.

## Proyecto remoto

```bash
npx supabase login
npx supabase link --project-ref PROJECT_REF
npx supabase migration list --linked
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy sync --use-api
npx supabase functions deploy administration --use-api
npx supabase functions deploy prepare-production --use-api
npx supabase functions deploy freelance-access --use-api
```

Revisar la ayuda de la versión instalada antes de automatizar comandos. Las
funciones `sync`, `administration` y `prepare-production` mantienen la
verificación JWT de plataforma habilitada. `freelance-access` es la excepción
intencional declarada en `supabase/config.toml`: recibe un token opaco o una
sesión freelance y los valida dentro del handler antes de invocar RPC que solo
puede ejecutar `service_role`. Desactivar `verify_jwt` en cualquier otra
función requiere diseñar y documentar primero una autenticación equivalente.

Configurar el secreto Edge `ALLOWED_ORIGINS` con una lista separada por comas
de orígenes exactos. `SUPABASE_URL`, `SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_ROLE_KEY` son secretos suministrados por la plataforma al
runtime; service role nunca se transforma en una variable `VITE_*`.

Copiar `apps/web/.env.example` a `apps/web/.env.local` y completar únicamente:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
VITE_ENABLE_LOCAL_DEMO=false
```

## Bootstrap

- DEMO: variables `DEMO_ADMIN_*` + `npm run supabase:bootstrap:demo`.
- Producción: solo después de quedar `LISTO_BOOTSTRAP`, variables
  `PRODUCTION_*` + `npm run supabase:bootstrap:production`.

No hay contraseña maestra hardcodeada. El primer administrador productivo se
crea por invitación de Supabase Auth.

### Desbloqueo offline

No requiere tabla ni secreto remoto adicional. Después de un ingreso central,
la PWA deriva y guarda un PIN únicamente en IndexedDB, ligado al usuario y al
UUID del dispositivo. Al reconectar usa `auth.getUser()` y una lectura RLS de
`perfiles` para renovar siete días o revocar. El registro existente en
`dispositivo_usuarios` continúa siendo el control central y se renueva mediante
la Edge Function `sync`; nunca se almacena el PIN en PostgreSQL ni en metadatos
de Auth.

En staging deben comprobarse al menos: sesión central vencida seguida de acceso
offline, cinco intentos fallidos, expiración a siete días, perfil desactivado,
token Auth de otra identidad y caída de red durante la revalidación. Los dos
últimos casos no son equivalentes: identidad distinta cierra la sesión; caída
de red conserva la ventana local sin renovarla.

## Matriz de pruebas

Se probaron en transacciones con rollback:

- seed explícito y commit inicial;
- apertura/asignación/salida y reintento idempotente;
- operación multi-evento inválida sin efectos parciales;
- asignaciones offline concurrentes y dos candidatos de conflicto;
- pull de commits completos y cursor;
- RLS de Auxiliar (lectura operativa, sin precios ni DML);
- aprobación que reconstruye borrador y emisión atómica;
- preservación temporal de `maleta_items` al facturar;
- altas centrales de hospital, producto y pieza con rollback completo;
- validación, canje y pull restringido de una sesión freelance;
- dry-run, purge, eliminación Auth, bootstrap y activación irreversible;
- rechazo de seed después de producción.
- dos IndexedDB offline asignando la misma pieza en ambos órdenes de
  reconexión, con respuesta perdida, reinicio, replay idempotente, dos
  candidatos, resolución por Coordinadora, factura emitida y convergencia de
  historial.

Las pruebas pgTAP revierten sus datos; la prueba E2E destruye el stack local
completo al terminar. El estado remoto debe comprobarse antes de cada entrega:

```sql
select ciclo_vida from public.configuracion_sistema where singleton;
select count(*) from auth.users;
select count(*) from public.perfiles;
select count(*) from public.piezas;
```

## Advisors y tipos

Ejecutar advisors de seguridad y rendimiento después de toda migración. Los
índices recién creados aparecerán como “unused” en una base vacía; no deben
eliminarse hasta observar carga real. Regenerar
`packages/data/src/supabase/database.types.ts` después de cualquier cambio de
esquema y revisar el diff antes de commit.

Antes de producción, habilitar también **Leaked Password Protection** en la
configuración de Supabase Auth y volver a ejecutar el advisor hasta eliminar
esa advertencia. Es un ajuste administrado por la plataforma, no una migración
SQL. La longitud mínima local está fijada en ocho caracteres y las altas
administrativas aplican el mismo mínimo.
