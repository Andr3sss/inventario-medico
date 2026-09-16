# Crearcos Inventario Quirúrgico

Aplicación web offline-first para controlar instrumental médico, maletas,
cirugías, reprocesamiento, precios, facturación, hospitales, usuarios y
sincronización entre dispositivos. El navegador conserva una réplica operativa
en IndexedDB/Dexie y Supabase/PostgreSQL mantiene la fuente central autoritativa.

Este repositorio contiene el frontend, el dominio, la persistencia local, todas
las migraciones, las Edge Functions, los datos ficticios reproducibles, las
pruebas y los runbooks. No se necesita ningún archivo fuera del repositorio para
compilarlo. Para entrar al entorno compartido sí hace falta una credencial de
prueba, que el propietario debe entregar fuera de GitHub.

## Ruta rápida para evaluadores

Esta es la forma recomendada de probar el sistema usando el proyecto Supabase
compartido ya desplegado. No requiere Docker ni acceso administrativo a
Supabase.

### 1. Requisitos

- Git 2.40 o posterior.
- Node.js 22 LTS o posterior, con npm.
- Chrome, Edge o Firefox actualizado.
- Una cuenta invitada como colaborador del repositorio si este es privado.
- Correo y contraseña de un usuario UAT, compartidos por el propietario por un
  canal seguro. Las contraseñas nunca se guardan en Git.

Comprobar las herramientas:

```powershell
git --version
node --version
npm --version
```

`node --version` debe comenzar por `v22` o una versión superior.

### 2. Clonar y preparar en Windows PowerShell

```powershell
git clone https://github.com/Andr3sss/inventario-medico.git
Set-Location inventario-medico
git switch main
Copy-Item .env.example .env.local
npm ci
npm run verificar
npm run build
```

La plantilla ya contiene la URL y la clave **publicable** del entorno de
pruebas. La clave publicable está diseñada para ejecutarse en el navegador; no
es la clave `service_role`. Nunca se debe agregar `SUPABASE_SERVICE_ROLE_KEY`,
una contraseña o un token personal a un archivo versionado.

### 3. Clonar y preparar en macOS o Linux

```bash
git clone https://github.com/Andr3sss/inventario-medico.git
cd inventario-medico
git switch main
cp .env.example .env.local
npm ci
npm run verificar
npm run build
```

### 4. Ejecutar

```powershell
npm run dev
```

Abrir <http://localhost:5173>. Para detener el servidor, volver a la terminal y
presionar `Ctrl+C`.

Iniciar sesión con la credencial UAT entregada por el propietario. El rol del
usuario determina las pantallas y operaciones disponibles. Si el navegador
conservaba una versión anterior, cerrar sesión, presionar `Ctrl+Shift+R` y
volver a entrar.

## Prueba funcional recomendada

Usar datos ficticios y un perfil de navegador separado. Antes de desconectar la
red, cada usuario que deba trabajar offline tiene que iniciar sesión una vez en
línea y configurar su PIN offline en ese dispositivo.

### Administrador

1. Entrar en línea como Administrador.
2. En **Usuarios y accesos**, crear un usuario, editar correo/nombre/rol,
   cambiar su contraseña mediante el PIN único del Administrador, desactivarlo
   y eliminar una cuenta de prueba que no sea el último administrador.
3. En **Hospitales**, crear un hospital, modificar sus datos y eliminarlo.
4. En **Inventario > Gestionar catálogo**, crear, editar y eliminar un producto
   sin piezas asociadas.
5. Registrar una pieza física, editar su SKU o kit padre mientras permanezca en
   bodega central y eliminarla. El código físico y el SKU del producto son
   identificadores inmutables.
6. Comprobar que no sea posible eliminar un producto con piezas activas, una
   pieza que esté en circulación ni un kit que todavía tenga componentes.

### Flujo operativo

1. Como Auxiliar, preparar una maleta y escanear las piezas durante el armado.
2. Confirmar su salida y asignación.
3. Registrar el uso en cirugía y cerrar la maleta con un hospital.
4. Como responsable de reprocesamiento, completar el ciclo de esterilización.
5. Como Contable, revisar el borrador y la matriz de precios.
6. Como Administrador, resolver una excepción de precio si existe.
7. Emitir la factura cuando no queden bloqueos.

### Prueba offline y sincronización

1. En línea, esperar a que el indicador muestre cero operaciones pendientes.
2. Abrir DevTools con `F12`, pestaña **Network**, y seleccionar **Offline**.
3. Crear o editar datos permitidos para el rol: por ejemplo un hospital, un
   producto o una pieza con una sesión Administrador habilitada offline.
4. Recargar la página y confirmar que la operación local sigue visible.
5. Volver a **No throttling** y pulsar sincronizar.
6. Esperar cero pendientes y verificar el cambio desde otro navegador o
   computador.
7. Si existe un conflicto, revisarlo con Coordinadora y confirmar que ambos
   dispositivos converjan después de resolverlo.

El diagnóstico descargable de sincronización no contiene contraseñas. Si una
prueba falla, adjuntarlo junto con la hora aproximada y la acción ejecutada.

## Comandos habituales

| Comando                          | Resultado                                                 |
| -------------------------------- | --------------------------------------------------------- |
| `npm ci`                         | Instala exactamente las versiones de `package-lock.json`. |
| `npm run dev`                    | Inicia Vite en `http://localhost:5173`.                   |
| `npm run build`                  | Genera el frontend de producción en `apps/web/dist`.      |
| `npm run verificar`              | Ejecuta secretos, ESLint, tipos y pruebas automáticas.    |
| `npm run test`                   | Ejecuta las pruebas TypeScript y de scripts.              |
| `npm run typecheck`              | Comprueba TypeScript estricto.                            |
| `npm run lint`                   | Ejecuta ESLint.                                           |
| `npm run security:secrets`       | Busca secretos privilegiados versionados.                 |
| `npm run format`                 | Aplica Prettier al repositorio.                           |
| `npm run supabase:bootstrap:uat` | Carga identidades y maestros UAT explícitos.              |

Para previsualizar exactamente el resultado compilado:

```powershell
npm run build
npm run preview --workspace @crearcos/web
```

Abrir la URL que Vite muestre en la terminal.

## Variables de entorno

Vite lee el archivo `.env.local` de la **raíz** del repositorio. Este archivo
está ignorado por Git. Para el entorno compartido basta con:

```dotenv
VITE_SUPABASE_URL=https://agcexgfniwrfmozwuuxw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_5fuW7WApJgTzcW0PGEEOdQ_4nhmNajx
VITE_ENABLE_LOCAL_DEMO=false
VITE_LOCAL_DEMO_PASSWORD=
```

Reglas importantes:

- La URL debe ser la base `https://PROJECT_REF.supabase.co`, sin `/rest/v1`.
- Sólo la clave publicable puede comenzar por `VITE_`.
- `SUPABASE_SERVICE_ROLE_KEY` es un secreto de operador y jamás llega al
  frontend.
- Reiniciar `npm run dev` después de cambiar `.env.local`.
- El modo demo local es aislado y permanece desactivado al usar Supabase.

## Crear un Supabase independiente

Esta sección sólo corresponde al propietario técnico que quiera reproducir el
backend completo en otro proyecto. Los evaluadores normales deben usar la ruta
rápida anterior.

### Proyecto alojado

1. Crear un proyecto vacío en Supabase y copiar su `PROJECT_REF`.
2. Autenticar y enlazar la CLI:

```powershell
npx supabase login
npx supabase link --project-ref PROJECT_REF
npx supabase migration list --linked
npx supabase db push --dry-run --linked
npx supabase db push --linked
```

3. Desplegar las funciones. La autenticación real se valida dentro de cada
   handler mediante `auth.getUser()`; `--no-verify-jwt` evita que el gateway
   legado rechace las claves publicables modernas antes de llegar al handler.

```powershell
npx supabase functions deploy sync --project-ref PROJECT_REF --use-api --no-verify-jwt
npx supabase functions deploy administration --project-ref PROJECT_REF --use-api --no-verify-jwt
npx supabase functions deploy prepare-production --project-ref PROJECT_REF --use-api --no-verify-jwt
npx supabase functions deploy freelance-access --project-ref PROJECT_REF --use-api --no-verify-jwt
npx supabase secrets set ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173" --project-ref PROJECT_REF
```

4. Copiar `.env.example` a `.env.local` y reemplazar únicamente:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=CLAVE_PUBLICABLE_DEL_PROYECTO
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=CLAVE_SERVICE_ROLE_SOLO_PARA_EL_OPERADOR
```

5. Para un entorno ficticio nuevo, completar también una contraseña fuerte y
   ejecutar el bootstrap una sola vez:

```dotenv
DEMO_ADMIN_EMAIL=admin@example.invalid
DEMO_ADMIN_NAME=Administrador Demo
DEMO_ADMIN_PASSWORD=CAMBIAR_POR_UNA_CLAVE_FUERTE
```

```powershell
npm run supabase:bootstrap:demo
```

6. Para cargar el conjunto UAT después del demo:

```dotenv
UAT_USER_PASSWORD=UNA_CLAVE_UAT_FUERTE_COMPARTIDA_FUERA_DE_GIT
```

```powershell
npm run supabase:bootstrap:uat
```

La carga UAT es idempotente para sus datos identificables. La `service_role` y
las contraseñas deben retirarse del computador del evaluador al finalizar.

### Stack Supabase completamente local

Este recorrido requiere Docker Desktop iniciado. No ejecuta nada contra el
proyecto remoto.

```powershell
npm ci
npx supabase start
npx supabase db reset --local
npx supabase test db --local
npx supabase status
```

Copiar la `API URL` y la `anon key` mostradas por `supabase status` a
`.env.local` como `VITE_SUPABASE_URL` y
`VITE_SUPABASE_PUBLISHABLE_KEY`. Luego:

```powershell
npm run verificar
$env:CREARCOS_E2E_SUPABASE_LOCAL="true"
npm run test:e2e:sync
npm run dev
```

Detener los contenedores cuando termine la prueba:

```powershell
npx supabase stop
```

## Acceso de colaboradores en GitHub

Para un repositorio privado, invitar a los jefes como colaboradores es más
práctico que duplicar el proyecto: todos descargan el mismo historial, commit y
documentación, y el propietario conserva el control de acceso.

El propietario debe abrir el repositorio en GitHub y seguir:

1. **Settings**.
2. **Collaborators and teams** o **Collaborators**.
3. **Add people**.
4. Introducir el usuario o correo GitHub de cada evaluador.
5. Conceder permiso **Read** si sólo probarán; usar **Write** únicamente si
   deben subir correcciones.
6. Cada persona debe aceptar la invitación antes de ejecutar `git clone`.

Si Git solicita autenticación al clonar, usar Git Credential Manager o:

```powershell
gh auth login
gh repo clone Andr3sss/inventario-medico
Set-Location inventario-medico
```

No se deben compartir tokens personales de GitHub entre evaluadores.

## Arquitectura del repositorio

```text
apps/web/             React, rutas, pantallas, PWA y estilos
packages/core/        dominio puro, estados, roles, precios y contratos
packages/data/        IndexedDB, servicios, autenticación y sincronización
seeds/                generador determinista de datos ficticios
supabase/migrations/  esquema y cambios PostgreSQL reproducibles
supabase/functions/   Edge Functions protegidas
supabase/tests/       pruebas pgTAP de esquema, RLS y privilegios
scripts/              seguridad, despliegue, smoke y bootstrap
docs/                 arquitectura, protocolos y runbooks operativos
```

Documentación principal:

- [Configuración de Supabase](docs/SUPABASE_SETUP.md)
- [Arquitectura de base de datos](docs/DATABASE_ARCHITECTURE.md)
- [Protocolo de sincronización](docs/SYNC_PROTOCOL.md)
- [Datos de demostración](docs/DEMO_DATA.md)
- [Seguridad de autenticación](docs/AUTH_SECURITY_RUNBOOK.md)
- [Acta de pruebas UAT](docs/RELEASE_UAT.md)
- [Despliegue y rollback](docs/DEPLOYMENT_RUNBOOK.md)
- [Handoff irreversible a producción](docs/PRODUCTION_HANDOFF.md)

## Seguridad y límites de la entrega

- No existe recuperación de contraseña por enlace. Sólo un Administrador puede
  asignar manualmente contraseñas, confirmando con su PIN administrativo.
- MFA está deshabilitado por alcance del proyecto.
- Las bajas de hospitales, productos y piezas son lógicas en PostgreSQL para
  preservar auditoría, facturas e historial; desaparecen de las réplicas
  operativas.
- RLS está habilitado y forzado. El navegador no puede ejecutar directamente
  comandos administrativos ni usar `service_role`.
- El trabajo offline exige enrolamiento previo del dispositivo y caduca según
  la política local. Al reconectar, la identidad y los permisos se revalidan.
- Antes de usar datos reales todavía deben validarse en campo la lectura de los
  QR y la resistencia del marcado al autoclave. Son validaciones operativas, no
  defectos funcionales del software.

## Solución rápida de problemas

### `401 Unauthorized`

Cerrar sesión, recargar con `Ctrl+Shift+R` e iniciar sesión nuevamente. Revisar
que la URL no termine en `/rest/v1` y que se use la clave publicable correcta.

### `ERR_INTERNET_DISCONNECTED`

Es esperado mientras DevTools está en **Offline**. La operación debe permanecer
en la cola local y enviarse al volver a **No throttling**.

### El puerto 5173 está ocupado

Cerrar el proceso anterior con `Ctrl+C`. Vite también puede ofrecer el siguiente
puerto; usar exactamente la URL que muestre la terminal.

### Falló `npm ci`

Confirmar Node 22+, borrar sólo `node_modules` y repetir:

```powershell
Remove-Item -LiteralPath node_modules -Recurse -Force
npm ci
```

No borrar `package-lock.json`: garantiza que todos prueben las mismas versiones.

### Docker no está instalado

Docker sólo es obligatorio para Supabase local y las pruebas PostgreSQL/E2E. La
ruta rápida contra el entorno compartido funciona sin Docker.
