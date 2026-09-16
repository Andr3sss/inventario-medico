# Crearcos Inventario Quirúrgico

Sistema web offline-first para controlar instrumental médico, maletas quirúrgicas,
reprocesamiento, precios, facturación, hospitales, usuarios y sincronización entre
dispositivos. El navegador conserva una réplica local en IndexedDB y Supabase/PostgreSQL
mantiene la fuente central.

---

> [!CAUTION]
> **AVISO DE SEGURIDAD CRÍTICO — LEE ESTO ANTES DE CONTINUAR**
>
> Este repositorio contiene credenciales reales de servicios activos. Lee con atención:
>
> **1. Clave pública de Supabase (en `.env.example`)**
> La URL y la clave publicable del proyecto están en el repositorio por diseño — son
> públicas y solo permiten operaciones de usuario autenticado. Sin embargo, si el repo
> es público en GitHub cualquiera puede ver a qué proyecto apuntan.
>
> **2. Credenciales de acceso al panel de administración de Supabase (sección más abajo)**
> El README incluye el correo y contraseña del panel de Supabase. Esto da **acceso
> administrativo completo** a la base de datos, usuarios, migraciones y Edge Functions.
> Son credenciales de operador — no son para todos los evaluadores, solo para quien
> necesita configurar o administrar el backend.
>
> **Reglas obligatorias:**
> - ⛔ Nunca compartas estas credenciales fuera del equipo de confianza.
> - ⛔ Nunca subas a Git la `SUPABASE_SERVICE_ROLE_KEY` ni ninguna contraseña de usuario
>   al archivo `.env.local`.
> - ⛔ No uses estas contraseñas en ningún otro servicio.
> - ✅ Al terminar el proyecto, cambia todas las contraseñas desde el panel de Supabase.
> - ✅ Mantén este repositorio en **privado** si es posible.

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

### Windows (PowerShell)

```powershell
git clone https://github.com/Crearcos/inventario-medico.git
Set-Location inventario-medico
git switch main
```

### macOS / Linux (Terminal)

```bash
git clone https://github.com/Crearcos/inventario-medico.git
cd inventario-medico
git switch main
```

---

## Paso 2 — Configurar el entorno

La URL y la clave pública del proyecto Supabase compartido ya están en `.env.example`.
Solo hay que copiar el archivo:

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

Instala exactamente las versiones fijadas en `package-lock.json`.
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

Genera el frontend en `apps/web/dist/`. Debe terminar sin errores.

---

## Paso 6 — Ejecutar la aplicación

```powershell
npm run dev
```

Abre **http://localhost:5173** en el navegador.
Para detener el servidor presiona `Ctrl+C`.

---

## Acceso al panel de administración de Supabase

> [!CAUTION]
> **Estas credenciales dan acceso administrativo completo** al backend del proyecto
> (base de datos, usuarios, Edge Functions, migraciones). Úsalas solo si necesitas
> configurar o inspeccionar el backend directamente. No las compartas con evaluadores
> que solo necesitan probar la aplicación web.

| Campo | Valor |
|---|---|
| URL del panel | https://supabase.com/dashboard |
| Correo | `screarcos@proton.me` |
| Contraseña del panel | `Crearcos2026@` |
| Nombre del proyecto | `inventario-medico` |
| Contraseña de la base de datos | `crearcos2026` |

Una vez dentro del panel, busca el proyecto **inventario-medico** en el listado.
Desde ahí puedes ver tablas, usuarios, Edge Functions, migraciones y logs.

---

## Usuarios de prueba de la aplicación

> [!IMPORTANT]
> Estas credenciales son solo para el entorno de demostración. No las uses en otros
> servicios. Al terminar las pruebas notifica al propietario para que las rote.

**PIN offline (todos los usuarios):** `01060412`

El PIN se usa para desbloquear la app cuando el dispositivo no tiene conexión o la
sesión ha expirado. Solo funciona si el usuario inició sesión en línea al menos una
vez desde ese dispositivo.

### Tabla de cuentas

| Nombre | Correo | Rol | Contraseña |
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
| **Administrador** | Usuarios, hospitales, catálogo, precios, excepciones |
| **Auxiliar / Instrumentista** | Preparar maletas, escanear piezas, registrar uso, reprocesamiento |
| **Coordinadora** | Resolver conflictos de sincronización, supervisar maletas |
| **Contable** | Ver borradores de factura, matriz de precios, emitir facturas |
| **Supervisor** | Panel de alertas, maletas demoradas, conflictos sin resolver |

---

## Flujo operativo recomendado

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
3. Realiza operaciones — el sistema las guarda localmente.
4. Recarga la página — los datos deben seguir visibles.
5. Vuelve a **No throttling** y pulsa sincronizar.
6. Verifica que los cambios aparecen desde otro navegador o pestaña.

---

## Comandos de referencia rápida

| Comando | Qué hace |
|---|---|
| `npm ci` | Instala dependencias exactas |
| `npm run dev` | Inicia el servidor en `http://localhost:5173` |
| `npm run build` | Compila el frontend para producción |
| `npm run verificar` | Ejecuta secretos, lint, tipos y 263 pruebas |
| `npm run test` | Solo las pruebas |
| `npm run lint` | Solo ESLint |
| `npm run typecheck` | Solo TypeScript estricto |

---

## Solución de problemas frecuentes

### `node --version` no muestra `v22`

Descarga Node.js 22 LTS desde https://nodejs.org, instala y reabre la terminal.

### `npm ci` falla

```powershell
Remove-Item -LiteralPath node_modules -Recurse -Force
npm ci
```

No borres `package-lock.json`.

### `401 Unauthorized` al iniciar sesión

Cierra sesión, recarga con `Ctrl+Shift+R` e intenta de nuevo con el correo y
contraseña exactos de la tabla de arriba.

### El PIN offline no funciona

Primero inicia sesión con correo y contraseña mientras tienes conexión a internet.
El PIN solo funciona después de ese primer acceso en línea.

### Puerto 5173 ocupado

Cierra el proceso anterior con `Ctrl+C` y vuelve a ejecutar `npm run dev`.

---

## Estructura del proyecto

```
apps/web/             Interfaz React, rutas, pantallas y PWA
packages/core/        Dominio puro: estados, roles, precios y contratos
packages/data/        IndexedDB, servicios, autenticación y sincronización
supabase/migrations/  Esquema PostgreSQL reproducible (18 migraciones)
supabase/functions/   4 Edge Functions protegidas
seeds/                Generador de datos ficticios deterministas
scripts/              Scripts de bootstrap y validación de entorno
```
