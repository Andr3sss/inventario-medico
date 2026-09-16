# Crearcos Inventario Quirúrgico

Sistema web offline-first para controlar instrumental médico, maletas quirúrgicas,
reprocesamiento, precios, facturación, hospitales, usuarios y sincronización entre
dispositivos. El navegador conserva una réplica local en IndexedDB y Supabase/PostgreSQL
mantiene la fuente central.

> [!CAUTION]
> **AVISO DE SEGURIDAD — LEE ESTO ANTES DE CONTINUAR**
>
> Este repositorio contiene en `.env.example` la URL pública y la clave **publicable**
> del proyecto Supabase de demostración:
>
> ```
> VITE_SUPABASE_URL=https://agcexgfniwrfmozwuuxw.supabase.co
> VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_5fuW7WApJgTzcW0PGEEOdQ_4nhmNajx
> ```
>
> La clave publicable **es pública por diseño** — es la misma que el navegador usa para
> conectarse y no da acceso administrativo. Sin embargo, si este repositorio es **público**
> en GitHub, cualquier persona puede ver a qué proyecto Supabase apunta y podría intentar
> ataques de fuerza bruta contra las cuentas de usuario.
>
> **Recomendaciones:**
> - Mantén el repositorio en **privado** si las credenciales de los usuarios de prueba
>   son compartidas o sensibles.
> - Nunca subas a Git la `SUPABASE_SERVICE_ROLE_KEY`, contraseñas de usuarios ni tokens.
>   Esas variables van únicamente en `.env.local`, que está ignorado por Git.
> - Al terminar las pruebas, considera cambiar las contraseñas de las cuentas UAT.

---

## Requisitos previos

Antes de empezar confirma que tienes instalado:

| Herramienta | Versión mínima | Verificar con |
|---|---|---|
| Git | 2.40 | `git --version` |
| Node.js | 22 LTS | `node --version` (debe empezar por `v22`) |
| npm | incluido con Node | `npm --version` |
| Chrome, Edge o Firefox | actualizado | — |

**Docker no es necesario** para la ruta de evaluación descrita en este documento.

---

## Paso 1 — Clonar el repositorio

### En Windows (PowerShell)

```powershell
git clone https://github.com/Andr3sss/inventario-medico.git
Set-Location inventario-medico
git switch main
```

### En macOS o Linux (Terminal)

```bash
git clone https://github.com/Andr3sss/inventario-medico.git
cd inventario-medico
git switch main
```

---

## Paso 2 — Configurar el entorno

La URL y la clave pública del proyecto Supabase compartido ya están en `.env.example`.
Solo hay que copiarlo:

### Windows

```powershell
Copy-Item .env.example .env.local
```

### macOS / Linux

```bash
cp .env.example .env.local
```

> [!NOTE]
> No edites `.env.local`. La URL y la clave que trae el archivo son suficientes para
> compilar, correr pruebas y conectarse al backend de demostración.

---

## Paso 3 — Instalar dependencias

```powershell
npm ci
```

Esto instala exactamente las versiones fijadas en `package-lock.json`.
Si falla, verifica que `node --version` comience por `v22`.

---

## Paso 4 — Verificar que todo pasa

```powershell
npm run verificar
```

Debe terminar así:

```
Revision de secretos aprobada (223 archivos versionados o listos para versionar).
Tests  263 passed | 2 skipped
```

Las 2 pruebas marcadas como `skipped` son escenarios E2E que requieren Docker y están
diseñadas para correr solo en CI. No son un error.

---

## Paso 5 — Compilar

```powershell
npm run build
```

Genera el frontend de producción en `apps/web/dist/`. Debe terminar sin errores.

---

## Paso 6 — Ejecutar la aplicación

```powershell
npm run dev
```

Abre **http://localhost:5173** en el navegador.

Para detener el servidor presiona `Ctrl+C` en la terminal.

---

## Usuarios de prueba

Inicia sesión con cualquiera de estas cuentas para explorar el sistema según el rol.

> [!IMPORTANT]
> Estas credenciales son para el entorno de **demostración**. No uses estas contraseñas
> en ningún otro servicio. Al terminar las pruebas notifica al propietario para que las
> rote.

### Contraseñas

| Cuenta | Contraseña |
|---|---|
| Administrador | `Administradorcrearcos1@` |
| Todos los demás roles | `CrearcosUAT#2026!` |

**PIN offline (todos los usuarios):** `01060412`
El PIN se usa para desbloquear la app después de que la sesión expira o cuando
el dispositivo no tiene conexión a internet.

### Cuentas disponibles

| Usuario | Correo | Rol | Contraseña |
|---|---|---|---|
| Test Admin | `admintest@crearcos.ec` | Administrador | `Administradorcrearcos1@` |
| Test Aux | `auxtest@crearcos.ec` | Auxiliar / Instrumentista | `CrearcosUAT#2026!` |
| Test Contable | `contabletest@crearcos.ec` | Contable | `CrearcosUAT#2026!` |
| Test Coord | `coordtest@crearcos.ec` | Coordinadora | `CrearcosUAT#2026!` |
| Test Supervisor | `supervisortest@crearcos.ec` | Supervisor | `CrearcosUAT#2026!` |

---

## Qué puede hacer cada rol

| Rol | Acceso principal |
|---|---|
| **Administrador** | Usuarios, hospitales, catálogo completo, precios, excepciones, bootstrap |
| **Auxiliar / Instrumentista** | Preparar maletas, escanear piezas, registrar uso en cirugía, reprocesamiento |
| **Coordinadora** | Resolver conflictos de sincronización, supervisar maletas |
| **Contable** | Ver borradores de factura, matriz de precios, emitir facturas |
| **Supervisor** | Panel de alertas, maletas demoradas, conflictos sin resolver |

---

## Flujo operativo recomendado para la prueba

Usa perfiles de navegador separados si quieres simular dos usuarios al mismo tiempo.

1. Entra como **Administrador** y crea un hospital de prueba.
2. Entra como **Auxiliar** y prepara una maleta con las piezas disponibles.
3. Confirma la salida de la maleta y asígnala al hospital.
4. Registra el uso en cirugía y cierra la maleta.
5. Entra como **Contable** y revisa el borrador de factura.
6. Entra como **Administrador** y emite la factura.
7. Entra como **Supervisor** y verifica el panel de alertas.

---

## Prueba offline

1. Entra en línea y espera a que el indicador de sincronización muestre cero pendientes.
2. Abre DevTools (`F12`) → pestaña **Network** → selecciona **Offline**.
3. Realiza operaciones (el sistema las guarda localmente).
4. Recarga la página — los datos deben seguir visibles.
5. Vuelve a **No throttling** y pulsa sincronizar.
6. Verifica que los cambios aparecen en otro navegador o pestaña.

Para usar el sistema offline después de que la sesión expira, la app pedirá el
**PIN offline** (`01060412`). El PIN solo funciona si el usuario inició sesión al menos
una vez en ese dispositivo mientras tenía conexión.

---

## Comandos de referencia rápida

| Comando | Qué hace |
|---|---|
| `npm ci` | Instala dependencias exactas |
| `npm run dev` | Inicia el servidor de desarrollo en `http://localhost:5173` |
| `npm run build` | Compila el frontend para producción |
| `npm run verificar` | Ejecuta secretos, lint, tipos y 263 pruebas automáticas |
| `npm run test` | Solo las pruebas (sin lint ni typecheck) |
| `npm run lint` | Solo ESLint |
| `npm run typecheck` | Solo TypeScript estricto |

---

## Solución de problemas frecuentes

### La app no carga o muestra error de red

Verifica que el servidor esté corriendo con `npm run dev` y que el puerto `5173` no
esté ocupado por otro proceso. Si está ocupado, ciérralo con `Ctrl+C` y vuelve a
ejecutar.

### `node --version` no muestra `v22`

Descarga Node.js 22 LTS desde https://nodejs.org y reinstala. Después cierra y vuelve
a abrir la terminal.

### `npm ci` falla

```powershell
Remove-Item -LiteralPath node_modules -Recurse -Force
npm ci
```

No borres `package-lock.json`: garantiza que todos instalen las mismas versiones.

### `401 Unauthorized` al iniciar sesión

Cierra sesión, recarga con `Ctrl+Shift+R` e intenta de nuevo. Verifica que el correo
y la contraseña coincidan exactamente con la tabla de usuarios de arriba.

### El PIN offline no funciona

El PIN offline solo funciona si previamente iniciaste sesión en línea en ese dispositivo.
Si es la primera vez que usas ese navegador o computador, primero inicia sesión con
correo y contraseña mientras tienes conexión.

### Puerto 5173 ocupado

Vite ofrece automáticamente el siguiente puerto disponible. Usa la URL exacta que
muestre la terminal.

---

## Arquitectura del repositorio

```
apps/web/             Interfaz React, rutas, pantallas y PWA
packages/core/        Dominio puro: estados, roles, precios y contratos
packages/data/        IndexedDB, servicios, autenticación y sincronización
supabase/migrations/  Esquema PostgreSQL reproducible (18 migraciones)
supabase/functions/   4 Edge Functions protegidas
supabase/tests/       Pruebas pgTAP de esquema y RLS
seeds/                Generador de datos ficticios deterministas
scripts/              Seguridad, despliegue, smoke y bootstrap
docs/                 Arquitectura, protocolos y runbooks operativos
```

Documentación técnica adicional en `docs/`:

- [Configuración de Supabase](docs/SUPABASE_SETUP.md)
- [Arquitectura de base de datos](docs/DATABASE_ARCHITECTURE.md)
- [Protocolo de sincronización](docs/SYNC_PROTOCOL.md)
- [Seguridad de autenticación](docs/AUTH_SECURITY_RUNBOOK.md)
- [Despliegue y rollback](docs/DEPLOYMENT_RUNBOOK.md)
- [Estado actual y pendientes](docs/INFORME_PENDIENTES.md)

---

## Notas de seguridad importantes

- No existe recuperación de contraseña por enlace. Solo el Administrador puede
  asignar contraseñas, confirmando con su PIN administrativo.
- RLS está habilitado en todas las tablas. El navegador no puede ejecutar comandos
  administrativos ni usar la clave `service_role`.
- El trabajo offline caduca a los 7 días sin conexión. Al reconectar, la identidad
  se revalida con el servidor central.
- Este entorno está en modo `DEMO`. No debe usarse con datos reales de pacientes
  ni información clínica confidencial.
