# Entorno de trabajo y publicacion en GitHub

Guia paso a paso para dejar el proyecto corriendo en VS Code y subirlo a un
repositorio, sin errores de compilacion. Esta escrita para Windows, que es donde
aparecen la mayoria de los problemas, y cada vez que macOS o Linux hacen algo
distinto se indica.

Antes de empezar conviene entender una cosa, porque casi todos los errores del
final de esta guia vienen de no tenerla clara.

Este proyecto es un **monorepo**: un solo repositorio con varios paquetes
adentro (`packages/core`, `packages/data`, `apps/web`, `seeds`) que se referencian
entre si. Las dependencias se instalan una sola vez en la raiz y npm crea enlaces
internos para que `apps/web` pueda importar `@crearcos/core`. TypeScript, por su
parte, usa referencias de proyecto declaradas en el `tsconfig.json` de la raiz.

De ahi salen las dos reglas que no se pueden romper:

1. `npm install` se corre **siempre en la carpeta raiz**, nunca dentro de
   `packages/core` ni de `apps/web`.
2. VS Code se abre **en la carpeta raiz**, nunca en una subcarpeta.

---

## 1. Instalar las herramientas

### 1.1 Node.js

Necesitas Node 20 o superior. El proyecto se construyo y probo con Node 22.

En Windows, la forma recomendada es con **nvm-windows**, porque te deja cambiar
de version sin reinstalar nada:

1. Descarga `nvm-setup.exe` desde https://github.com/coreybutler/nvm-windows/releases
2. Instalalo y **cierra todas las terminales** que tengas abiertas.
3. Abre PowerShell **como administrador** y corre:

```powershell
nvm install 22
nvm use 22
```

Si prefieres no usar nvm, baja el instalador LTS desde https://nodejs.org y listo.

En macOS o Linux, con nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22
nvm use 22
```

Comprueba que quedo bien. Los dos comandos tienen que responder:

```bash
node -v    # v22.x.x o superior
npm -v     # 10.x.x o superior
```

Si `node -v` no responde nada, la terminal no tomo el PATH nuevo. Cierrala y abre
otra. Si sigue sin responder, reinicia la maquina.

### 1.2 Git

Windows: descarga Git desde https://git-scm.com/download/win e instalalo. En el
instalador, cuando pregunte por el editor por defecto puedes elegir VS Code, y
cuando pregunte por los finales de linea deja la opcion recomendada.

macOS: `xcode-select --install` o `brew install git`.

Comprueba:

```bash
git --version
```

### 1.3 VS Code

Descargalo de https://code.visualstudio.com e instalalo. En Windows, durante la
instalacion marca la casilla **"Agregar a PATH"** y **"Abrir con Code"** en el
menu contextual. Te va a ahorrar tiempo despues.

---

## 2. Colocar el proyecto en el disco

Descomprime `crearcos-inventario.zip`. Donde lo pongas importa mas de lo que
parece.

**Ruta buena (Windows):**

```
C:\dev\crearcos-inventario
```

**Rutas malas, y por que:**

- Cualquier carpeta dentro de **OneDrive**, Dropbox o Google Drive. Estos
  programas sincronizan archivo por archivo, y `node_modules` tiene decenas de
  miles de archivos pequenos. El resultado es lentitud extrema, archivos
  bloqueados a mitad de un `npm install` y errores de compilacion aleatorios que
  no vas a poder explicar. Esto incluye `C:\Users\TuNombre\Documentos` si tienes
  la sincronizacion de OneDrive activada, que en Windows viene activa por
  defecto.
- Rutas con **tildes, enes o espacios**: `C:\Users\Andrés\Mi Proyecto\`. Algunas
  herramientas de la cadena de compilacion todavia tropiezan con eso.
- Rutas **muy largas**. Windows tiene un limite historico de 260 caracteres y
  `node_modules` anida bastante. Mientras mas corta la ruta, mejor.

En macOS o Linux basta con `~/dev/crearcos-inventario`.

Crea la carpeta y descomprime ahi:

```powershell
mkdir C:\dev
```

Al terminar, dentro de `C:\dev\crearcos-inventario` tienes que ver `package.json`,
`tsconfig.json`, y las carpetas `packages`, `apps`, `seeds`, `docs`. Si en cambio
ves otra carpeta llamada `crearcos-inventario` adentro, el zip se descomprimio con
un nivel de mas. Mueve el contenido un nivel arriba antes de seguir.

---

## 3. Abrir el proyecto en VS Code

Esto tiene una sola forma correcta.

Abre VS Code, ve a **Archivo, Abrir carpeta**, y selecciona
`C:\dev\crearcos-inventario`, la carpeta que contiene el `package.json` de la
raiz.

O desde la terminal:

```bash
cd C:\dev\crearcos-inventario
code .
```

**Lo que no debes hacer:** abrir `apps/web` o `packages/core` como carpeta. Si lo
haces, TypeScript pierde las referencias de proyecto, ESLint no encuentra su
configuracion y el editor se llena de errores rojos que no existen realmente.

Cuando abras la carpeta, VS Code va a mostrar dos avisos:

1. **"Este espacio de trabajo tiene recomendaciones de extensiones"**. Dale a
   Instalar. Son las seis que necesitas y ya vienen listadas en
   `.vscode/extensions.json`.
2. Mas adelante, al abrir un archivo `.ts`, puede preguntarte si quieres usar la
   version de TypeScript del espacio de trabajo. **Di que si.** Si no aparece, en
   el paso 5 esta como forzarlo.

---

## 4. Instalar dependencias y verificar

Abre la terminal integrada con `Ctrl` + `` ` `` (la tecla del acento grave, arriba
del tabulador). Confirma que la ruta que muestra es la raiz del proyecto.

```bash
npm install
```

Se demora entre uno y tres minutos la primera vez. Al terminar tienes que ver algo
como `added 300 packages`. Si ves errores en rojo, salta al catalogo del punto 9.

Ahora la verificacion completa:

```bash
npm run verificar
```

Esto corre tres cosas seguidas: ESLint, la compilacion de tipos y las pruebas. El
resultado esperado es que ESLint no imprima nada, que la compilacion no imprima
nada, y que las pruebas terminen con:

```
Test Files  9 passed (9)
     Tests  73 passed (73)
```

Si eso sale limpio, tu entorno esta bien. Todo lo que falle de aqui en adelante
sera codigo tuyo, no configuracion.

Finalmente levanta la aplicacion:

```bash
npm run dev
```

Abre http://localhost:5173 en el navegador. Con Supabase configurado, inicia
sesión con una cuenta central. Para una demostración aislada sin servidor,
establece `VITE_ENABLE_LOCAL_DEMO=true` y una contraseña temporal de al menos
ocho caracteres en `VITE_LOCAL_DEMO_PASSWORD`; no la confirmes en Git.

Para detenerla, `Ctrl` + `C` en la terminal.

---

## 5. Ajustes de VS Code que evitan errores fantasma

El repositorio ya trae `.vscode/settings.json` configurado, asi que casi todo
queda listo solo. Vale la pena que sepas que hace cada cosa, porque cuando algo
falle vas a saber donde mirar.

**Version de TypeScript del espacio de trabajo.** Es el ajuste mas importante.
VS Code trae su propio TypeScript, que casi nunca coincide con el del proyecto.
Cuando no coinciden, el editor te marca errores que la terminal no ve, o al reves.

Para forzarlo a mano: abre cualquier archivo `.ts`, presiona
`Ctrl` + `Shift` + `P`, escribe `TypeScript: Select TypeScript Version` y elige
**Use Workspace Version**. Abajo a la derecha, en la barra de estado, debe decir
la version seguida de un simbolo de visto.

**Formato al guardar.** Prettier formatea cada archivo cuando lo guardas y ESLint
arregla lo que puede arreglar solo. Asi el codigo que subes ya viene formateado y
no generas diferencias ruidosas en Git.

**Finales de linea.** Estan forzados a LF. Windows usa CRLF por defecto, y si no
se normaliza, cada archivo que toques aparece como modificado entero aunque solo
hayas cambiado una linea. El `.gitattributes` del repositorio se encarga del resto.

Un comando que vas a usar cuando el editor se comporte raro:
`Ctrl` + `Shift` + `P`, y luego `TypeScript: Restart TS Server`. Reinicia el
analizador sin cerrar VS Code y resuelve la mayoria de los errores rojos que
aparecen despues de un `npm install`.

---

## 6. Subir el proyecto a GitHub

### 6.1 Configurar tu identidad en Git

Solo se hace una vez por computadora:

```bash
git config --global user.name "Andres Quisilema"
git config --global user.email "diquisilemagu@uide.edu.ec"
git config --global init.defaultBranch main
```

El correo debe ser el mismo que tengas registrado en tu cuenta de GitHub para que
los commits aparezcan a tu nombre.

### 6.2 Iniciar el repositorio local

Desde la raiz del proyecto:

```bash
git init
git add .
git status
```

`git status` te va a listar lo que se subira. Revisalo antes de continuar. Deben
aparecer unos 73 archivos y **no debe aparecer `node_modules` por ningun lado**.
Si aparece, el `.gitignore` no se copio; verifica que el archivo `.gitignore`
exista en la raiz y vuelve a correr `git add .`.

Lo que queda fuera a proposito: `node_modules`, `dist`, `dist-tipos`,
`seeds/salida` y los `.tsbuildinfo`. Todo eso se regenera con `npm install` y
`npm run build`, y subirlo solo ensucia el repositorio.

Lo que si se sube y a veces la gente ignora por error: `package-lock.json`. Ese
archivo es el que garantiza que tu maquina, la de un companero y el servidor de
GitHub instalen exactamente las mismas versiones. Sin el, el proyecto compila en
tu computadora y falla en otra.

Ahora el primer commit:

```bash
git commit -m "Fases 0 a 3: nucleo del dominio, capa offline-first e ingreso por rol"
```

### 6.3 Crear el repositorio en GitHub

Hay dos caminos. El primero es mas simple si nunca has usado la linea de comandos
de GitHub.

**Camino A, desde la web.**

1. Entra a https://github.com/new
2. Nombre del repositorio: `crearcos-inventario`
3. Elige **Private** mientras sea trabajo para un cliente.
4. **No marques** ninguna de las casillas de "Add a README", "Add .gitignore" ni
   "Choose a license". El proyecto ya trae lo suyo, y si GitHub crea un commit
   inicial vas a tener que resolver un conflicto en tu primer push.
5. Crea el repositorio y copia la direccion que te muestra.

Luego, en tu terminal:

```bash
git remote add origin https://github.com/Andr3sss/crearcos-inventario.git
git branch -M main
git push -u origin main
```

La primera vez, Git te va a pedir credenciales. **Tu contrasena de GitHub no
sirve** para esto desde hace anos. Necesitas un token:

1. Ve a https://github.com/settings/tokens
2. **Generate new token**, tipo classic.
3. Marca el permiso `repo`.
4. Copialo y guardalo en algun lado seguro, porque GitHub no te lo vuelve a
   mostrar.
5. Cuando la terminal te pida la contrasena, pega el token.

En Windows, el Git Credential Manager lo guarda y no te lo vuelve a pedir.

**Camino B, con GitHub CLI.** Mas comodo si vas a crear varios repositorios.

Instala `gh` desde https://cli.github.com y luego:

```bash
gh auth login
gh repo create crearcos-inventario --private --source=. --push
```

Eso crea el repositorio, configura el remoto y sube todo en un solo paso.

### 6.4 Confirmar que quedo bien

Abre tu repositorio en el navegador y revisa tres cosas:

- La carpeta `node_modules` **no** esta.
- El archivo `package-lock.json` **si** esta.
- En la pestana **Actions** aparece un flujo llamado "Verificar" corriendo o ya
  terminado en verde.

Ese ultimo punto es el que te avisa si algo se rompio. El repositorio incluye
`.github/workflows/verificar.yml`, que en cada push instala las dependencias y
corre lint, tipos, pruebas y compilacion en una maquina limpia de GitHub. Si
pasa ahi, es que el proyecto compila de verdad y no solo en tu computadora.

---

## 7. Flujo de trabajo diario

Cuando empieces la siguiente rebanada, trabaja en una rama y no directamente
sobre `main`:

```bash
git checkout -b rebanada-2-catalogo
```

Mientras programas:

```bash
npm run test:watch     # las pruebas corren solas al guardar
npm run dev            # la app, en otra terminal
```

Antes de cada commit, siempre:

```bash
npm run verificar
```

Si eso pasa, commit y push:

```bash
git add .
git commit -m "Alta de piezas por lote en el catalogo"
git push -u origin rebanada-2-catalogo
```

En GitHub te va a aparecer un boton para abrir un Pull Request. Abrirlo aunque
trabajes solo tiene una ventaja concreta: el flujo de Actions corre sobre esa
rama y te dice si rompiste algo antes de mezclarlo con `main`.

Sobre los mensajes de commit, la regla practica es que digan **que cambio para el
usuario**, no que archivos tocaste. "Alta de piezas por lote en el catalogo" sirve.
"cambios" o "update" no le sirven a nadie, incluido tu dentro de dos meses.

---

## 8. Como esta organizado el proyecto

Para que sepas donde tocar cada cosa:

| Carpeta         | Que vive ahi                                                      | Cuando la tocas                                               |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/core` | Reglas de negocio puras: estados, precios, permisos, reloj logico | Cuando cambia una regla del negocio                           |
| `packages/data` | Base local, escaneo atomico, sincronizacion, credenciales         | Cuando cambia como se guarda o se envia algo                  |
| `apps/web`      | La aplicacion: pantallas, estilos, ruteo                          | Cuando cambia lo que el usuario ve                            |
| `seeds`         | Generador del inventario de prueba                                | Cuando necesitas otros datos de prueba                        |
| `docs`          | Decisiones de arquitectura y esta guia                            | Cuando tomas una decision que alguien va a cuestionar despues |

La regla de dependencias es que las flechas apuntan hacia adentro: `apps/web`
puede importar de `packages/data` y de `packages/core`, `packages/data` puede
importar de `packages/core`, y `packages/core` no importa de nadie. Si alguna vez
necesitas importar al reves, es senal de que la logica esta en el lugar
equivocado.

---

## 9. Catalogo de errores comunes

| Sintoma                                                                                     | Causa                                                             | Solucion                                                             |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `npm : No se puede cargar el archivo ... porque la ejecucion de scripts esta deshabilitada` | Politica de PowerShell en Windows                                 | Ver detalle abajo                                                    |
| `Cannot find module '@crearcos/core'`                                                       | Falta `npm install` en la raiz, o instalaste dentro de un paquete | Borra `node_modules` y corre `npm install` en la raiz                |
| El editor marca errores rojos que `npm run typecheck` no reporta                            | VS Code usa su propio TypeScript                                  | `TypeScript: Select TypeScript Version`, luego Use Workspace Version |
| Errores raros despues de un `npm install`                                                   | Cache de tipos vieja                                              | `TypeScript: Restart TS Server`                                      |
| `error TS6305` o quejas sobre `.d.ts` que no existen                                        | Compilacion incremental desincronizada                            | Ver detalle abajo                                                    |
| ESLint no marca nada en el editor                                                           | Abriste una subcarpeta en vez de la raiz                          | Cierra y abre la carpeta raiz                                        |
| Todos los archivos aparecen modificados en Git sin que hayas tocado nada                    | Finales de linea CRLF contra LF                                   | `git add --renormalize .` y commit                                   |
| `EPERM` o `EBUSY` durante `npm install` en Windows                                          | OneDrive o el antivirus bloqueando archivos                       | Mueve el proyecto fuera de OneDrive                                  |
| El puerto 5173 esta ocupado                                                                 | Otra instancia de Vite corriendo                                  | Cierra la otra terminal, o `npm run dev -- --port 5174`              |
| La app muestra datos viejos o rotos al abrir                                                | Base local de una version anterior del esquema                    | Ver detalle abajo                                                    |

### Politica de ejecucion de PowerShell

Windows bloquea los scripts por defecto y eso impide correr `npm`. Abre PowerShell
como administrador y corre:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Confirma con `S`. Es el ajuste estandar y solo habilita scripts locales. Si
prefieres no tocarlo, usa la terminal `cmd` de Windows en vez de PowerShell: en
VS Code, en el menu desplegable de la terminal, elige **Command Prompt**.

### Compilacion incremental desincronizada

TypeScript guarda archivos `.tsbuildinfo` para no recompilar todo cada vez. Si
mueves carpetas o cambias de rama, esa cache puede quedar apuntando a rutas que ya
no existen. La solucion es borrarla:

```bash
npm run typecheck -- --force
```

Si insiste, borra a mano todos los `dist`, `dist-tipos` y `*.tsbuildinfo` y vuelve
a correr `npm run verificar`.

### Base local de una version anterior

La app guarda todo en IndexedDB, dentro del navegador. Si cambia el esquema de la
base entre una version y otra, tu navegador puede quedarse con datos viejos.

Para empezar de cero: abre las herramientas de desarrollo con `F12`, ve a la
pestana **Application** (en Chrome) o **Almacenamiento** (en Firefox), busca
**IndexedDB**, y borra la base `crearcos-inventario`. Recarga la pagina y la app
la vuelve a sembrar.

Esto es normal durante el desarrollo. En produccion no puede pasar, y por eso cada
cambio de esquema sube el numero de version en `packages/data/src/db.ts` con su
migracion, en vez de modificar la version anterior.

---

## 10. Lista de comprobacion final

Cuando termines, estas siete cosas tienen que ser ciertas:

- [ ] `node -v` responde 20 o superior
- [ ] El proyecto vive en una ruta corta, sin tildes ni espacios, fuera de OneDrive
- [ ] VS Code esta abierto en la carpeta raiz y las extensiones recomendadas estan instaladas
- [ ] La barra de estado de VS Code muestra la version de TypeScript del espacio de trabajo
- [ ] `npm run verificar` termina con 73 pruebas en verde
- [ ] `npm run dev` levanta la app y puedes entrar con `u-aux-1`
- [ ] El repositorio en GitHub tiene el flujo "Verificar" en verde y no contiene `node_modules`

Con eso el entorno esta listo y cualquier error que aparezca de aqui en adelante
sera del codigo, que es exactamente donde quieres que esten los errores.
