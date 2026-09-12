# Coordinación Claude Code ↔ Codex

Resumen de qué está listo, qué se integró y qué continúa abierto. El contrato
detallado vive en [`frontend-backend-contract.md`](./frontend-backend-contract.md).

**Regla de fondo**: esto no es una API HTTP. El frontend importa funciones de
`@crearcos/data` directamente y funciona contra IndexedDB en el dispositivo.

## Integración central (2026-09-11)

- Supabase/PostgreSQL es la fuente autoritativa y Dexie continúa como réplica
  offline con outbox e inbox durables.
- `sync`, `administration`, `freelance-access` y `prepare-production` son las
  fronteras Edge desplegadas. Ningún componente React construye SQL.
- Supabase Auth y `perfiles` reemplazan las credenciales locales cuando existe
  configuración central. El demo local requiere activación y contraseña de
  entorno explícitas.
- Altas administrativas, precios y accesos freelance se ejecutan mediante
  comandos centrales transaccionales y auditables.
- Las secciones fechadas de rondas anteriores se conservan como historial; si
  contradicen esta sección, prevalecen esta actualización y el código.

## Backend Ready (2026-09-09)

Listo y probado (`npm run verificar`, 176 pruebas):

- Inventario: `listarPiezas`, `obtenerPieza`, `componentesDeKit`,
  `listarCatalogo`, `crearProducto`, `registrarPieza`.
- Maletas: `crearMaleta`, `escanearArmado`, `retirarDeArmado`, `escanearUso`,
  `confirmarSalidaMaleta`, `cancelarMaleta`, `obtenerMaleta`, `listarMaletas`.
- Facturación: `cerrarMaleta`, `emitirFactura`, `obtenerFactura`,
  `listarFacturas`.
- Reprocesamiento: `listarEnReprocesamiento`, `finReproceso`,
  `ingresoReproceso`.
- Conflictos: `listarConflictos`, `obtenerConflicto`, `resolverConflicto`.
- Trazabilidad: `historialDePieza`.
- Usuarios locales: `listarUsuarios`, `crearUsuario`, `cambiarEstadoUsuario`,
  `resetearContrasena`.
- Hospitales: `listarHospitales`, `obtenerHospital`, `guardarHospital`.
- Login/sesión, ruteo por rol e indicador de sincronización pendiente.

## Backend Ready (2026-09-09, ronda Fase 9/10/11)

Nuevo, con pruebas pasando (`npm run verificar`, 170 pruebas). Los tres puntos
que estaban abiertos en el brief (§11.3, §11.4, §11.5) ya tienen backend:

- Excepciones de precio (`excepciones.ts`): `proponerExcepcionPrecio`,
  `aprobarExcepcionPrecio`, `rechazarExcepcionPrecio`,
  `listarExcepcionesPrecio`, `obtenerExcepcionPrecio`. Aprueba el
  Administrador (decisión 36) — Contable o Administrador proponen.
- Freelance (`freelance.ts`): `generarTokenFreelance`, `validarTokenFreelance`,
  `entrarConToken`, `listarTokensFreelance`, `revocarTokenFreelance`. El
  enlace vive atado a la maleta, no a un plazo fijo (decisión 37) — lo genera
  Contable, no Coordinadora (así lo dice el brief §4, textual).
- Notificaciones (`notificaciones.ts`): `obtenerNotificaciones` — conflictos
  abiertos, maletas demoradas (+8h fuera de bodega por defecto), facturas
  bloqueadas por aprobación pendiente (decisión 38).

Contrato completo en `frontend-backend-contract.md`, secciones 16, 17 y 18.
Las tres capacidades ya tienen interfaz integrada y verificada.

## Backend Ready (2026-09-09, ronda de pulido)

Nuevo, con pruebas pasando (`npm run verificar`, 176 pruebas). Dos funciones
de lectura para cerrar detalles menores que quedaron anotados en rondas
anteriores — ningún cambio de contrato existente, ninguna firma se movió:

- `listarUsuariosBasico(db, filtro?)` (usuarios.ts): la única lectura de este
  módulo sin gating de rol — `{ usuarioId, nombre, rol }`, nunca datos
  administrativos. Resuelve dos cosas a la vez: selectores de instrumentistas
  y nombres legibles para referencias históricas.
- `contarPiezasPorEstado(db)` (inventario.ts): los 10 conteos en una sola
  llamada, en vez de las 5 páginas de `listarPiezas` que hoy pide
  `Inventario.tsx`/`Tablero.tsx` solo para leer `.total`.

Contrato en las secciones 3 y 10. Ambas funciones ya están conectadas al
frontend.

## Frontend Integrated (2026-09-09)

- Las pantallas operativas consumen exclusivamente funciones públicas de
  `@crearcos/data`; no quedan arrays demostrativos ni consultas directas a
  Dexie desde los componentes.
- `Escaner.tsx` es controlado y presenta la respuesta real de
  `escanearArmado` o `escanearUso`.
- Inventario incluye alta administrativa de productos y piezas. El costo se
  captura en USD, se convierte a centavos enteros antes de llamar al contrato
  y se presenta mediante `formatearUSD`.
- La nueva pantalla de Hospitales lista, crea y edita instituciones, usando el
  área y permisos definidos por el dominio.
- Facturación y Hospitales comparten las etiquetas visuales de
  `NivelFacturable`.
- La aplicación ya es instalable como PWA. El service worker precarga el app
  shell, bundles, iconos y fuentes; la navegación se verificó con la red del
  navegador deshabilitada y cargó correctamente desde Cache Storage.
- Facturación permite proponer y consultar precios negociados; el Tablero del
  Administrador incorpora la bandeja para aprobarlos o rechazarlos.
- Contable y Administrador gestionan enlaces freelance desde operaciones
  `EN_CIRUGIA` del Tablero. La ruta pública `/acceso-freelance/:token` valida
  el enlace, solicita el nombre y abre la sesión limitada de Cirugía.
- La campana del Supervisor muestra el total y el detalle de conflictos,
  maletas demoradas y facturas bloqueadas.
- Reprocesamiento y Conflictos ofrecen auxiliares activos mediante selectores;
  Maletas, Tablero y enlaces freelance resuelven responsables a nombres.
- Inventario y Tablero usan un único conteo global por estado. La distribución
  del Tablero toma tanto el segmento de conflictos como el residual de esa
  misma fuente.
- Las maletas cerradas muestran el nombre del hospital y su detalle es de solo
  lectura; el Escáner se monta únicamente durante `EN_ARMADO`.

## Contract Changes acumulados

- Entidades `Maleta` y `Factura`; la factura fluye `BORRADOR → EMITIDA`.
- `Hospital` y `ExcepcionPrecio` persistidos y sembrados con ciudad base.
- `Pagina<T>` como forma única de listas paginadas.
- Área `hospitales`, visible solo para `ADMINISTRADOR`.
- Alta administrativa de catálogo/piezas mediante `crearProducto` y
  `registrarPieza`.
- Nuevo: tabla `tokensFreelance` (versión 4 del esquema de Dexie) y campo
  `motivoRechazo` en `FilaExcepcionPrecio`. Ningún cambio rompe firmas
  existentes.

## Backend fixes (2026-09-09)

`prepararDispositivo` ahora protege el sembrado de hospitales/ciudad base con
una guarda independiente de la de usuarios. Esto evita dejar sin hospitales a
un dispositivo que abrió una versión anterior de la aplicación.

## Known Issues

- `FilaConflicto.detalle` sigue siendo `unknown`; la pantalla lo presenta como
  depuración y no asume una comparación A/B.
- El formato USD sigue resuelto por presentación en el frontend. Conviene
  exportar un formateador común si se define una política única de locale.
- Falta validar en campo el QR de fábrica y la resistencia del marcado físico
  al autoclave. La sincronización central ya está implementada.

## Prompt integrado (Fase 9, 10 y 11)

Referencia histórica de la ronda ya implementada en frontend.

---

Hola Codex. Otra ronda de backend lista y probada (`npm run verificar`:
170/170). Son los tres puntos que el brief dejaba abiertos — ahora ya
tienen una decisión y una implementación, solo falta la pantalla. Se pueden
hacer en cualquier orden.

**1. Aprobación de precio aleatorio (`excepciones.ts`)**

```ts
proponerExcepcionPrecio(db, { sku, hospitalId, valor, vigenteDesde, vigenteHasta? }, sesion, opciones) → Resultado<FilaExcepcionPrecio, ErrorExcepcion>
aprobarExcepcionPrecio(db, id, sesion) → Resultado<FilaExcepcionPrecio, ErrorExcepcion>
rechazarExcepcionPrecio(db, id, motivo, sesion) → Resultado<FilaExcepcionPrecio, ErrorExcepcion>
listarExcepcionesPrecio(db, filtro?) / obtenerExcepcionPrecio(db, id)
```

- Decisión tomada: **aprueba el Administrador** (no existe rol "Gerencia").
  Contable o Administrador pueden proponer una excepción; solo Administrador
  aprueba/rechaza.
- Sugerencia de UI: una sección dentro de Facturación (donde Contable ya
  está) para proponer/ver excepciones de un sku+hospital, y una bandeja
  dentro del área de Administrador (o un badge en el menú) para las que
  están `PENDIENTE`. `valor` va en centavos — mismo patrón de conversión
  USD↔centavos que ya usaste en el alta de Inventario.
- Cuando hay una excepción `APROBADO` vigente, `cerrarMaleta` ya la aplica
  sola al armar la factura — no hace falta que la UI haga nada especial ahí,
  solo mostrar `precio.tipo === 'ALEATORIO'` como ya hace Facturacion.tsx.

**2. Enlace de instrumentista freelance (`freelance.ts`)**

```ts
generarTokenFreelance(db, maletaId, sesion, opciones) → Resultado<{token, maletaId}, ErrorFreelance>
validarTokenFreelance(db, token) → Resultado<{maletaId}, ErrorFreelance>
entrarConToken(db, token, nombre, opciones) → Resultado<SesionActiva, ErrorFreelance>
listarTokensFreelance(db, maletaId) / revocarTokenFreelance(db, token, sesion)
```

- Decisión tomada: el enlace **lo genera Contable** (así lo dice el brief
  literalmente, no la Coordinadora) y **expira cuando la maleta se cierra o
  cancela**, no a una hora fija.
- Esto necesita una ruta nueva que viva _fuera_ del guardia de sesión normal
  -algo como `/acceso-freelance/:token`, montada en `App.tsx` junto a
  `Ingreso.tsx` pero sin pasar por `Protegida`-, porque quien la abre todavía
  no tiene sesión. El flujo: la ruta llama `validarTokenFreelance` al montar
  (mostrar "enlace vencido" si falla), y si es válido pide solo un campo de
  nombre; al enviar llama `entrarConToken` y, si sale bien, redirige a
  `/cirugia` igual que hace `Ingreso.tsx` después de un login normal.
- En Maletas.tsx (o donde Contable vea el detalle de una maleta `EN_CIRUGIA`),
  un botón "Generar enlace para freelance" que llama `generarTokenFreelance`
  y muestra la URL completa para copiar (`${origin}/acceso-freelance/${token}`)
  — Contable decide cómo se comparte (no es parte del contrato).
- `usuarioId` de la sesión resultante es efímero (`freelance-<token>`); no
  aparece en `listarUsuarios`. Es esperado, no un bug.

**3. Notificaciones del Supervisor (`notificaciones.ts`)**

```ts
obtenerNotificaciones(db, { ahora, umbralMaletaDemoradaMs? }) → Promise<Notificaciones>
// { conflictosAbiertos, maletasDemoradas, facturasBloqueadas, total }
```

- Decisión tomada: esas tres señales, nada más por ahora. El umbral de
  maleta demorada por defecto es 8 horas (`UMBRAL_MALETA_DEMORADA_MS_DEFECTO`,
  exportado si quieres mostrarlo en la UI).
- Sugerencia de UI: el Supervisor solo tiene Tablero hoy — se puede ampliar
  esa pantalla con una sección de alertas, o poner un badge con `total` en la
  campana que ya existe en `Marco.tsx` (`topbar__acciones`, el botón con
  `Icono nombre="campana"` que hoy no hace nada). Vos decidís el layout; los
  tres arrays ya vienen con todo lo necesario para renderizar cada tipo de
  alerta (reusa `ETIQUETA_ESTADO_MALETA`/`ETIQUETA_ESTADO_FACTURA` de
  `presentacion.ts` donde aplique).

**Nota general**: como siempre, si algo de esto no calza con lo que ya
armaste visualmente, avisame antes de que el contrato quede desalineado.

## Prompt integrado (ronda de pulido)

Referencia histórica de la ronda ya implementada en frontend.

Copiar tal cual como mensaje a Codex.

---

Hola Codex. Esta ronda no es funcionalidad nueva — son los detalles menores
que fuimos anotando en Known Issues de rondas anteriores. Dos funciones
nuevas, chiquitas, probadas (`npm run verificar`: 176/176), y tres ajustes
que son solo tuyos (no tocan datos, solo la pantalla). Se pueden hacer en
cualquier orden.

**1. `listarUsuariosBasico(db, filtro?)` — reemplazar el `usuarioId` a mano**

```ts
listarUsuariosBasico(db, { rol?, incluirInactivos? }) → Promise<readonly { usuarioId, nombre, rol }[]>
```

Lectura abierta (sin `sesion`). En **Reprocesamiento.tsx** y **Conflictos.tsx**,
donde hoy hay un `<input>` de texto libre para escribir el `usuarioId` del
instrumentista destino (`FIN_REPROCESO`/`RESOLUCION_MANUAL` hacia
`BODEGA_INSTRUMENTISTA`), cámbialo por un `<select>` poblado con
`listarUsuariosBasico(db, { rol: 'AUXILIAR' })` — ajusta el rol si el
instrumentista elegible es otro en tu criterio. También úsala donde haga
falta resolver un `usuarioId` crudo a un nombre (por ejemplo, el
`responsableId` de una maleta cerrada en Maletas.tsx, o el `creadoPorId` de
un enlace freelance en `GestorFreelance.tsx`).

**2. `contarPiezasPorEstado(db)` — un solo conteo en vez de 5 páginas**

```ts
contarPiezasPorEstado(db) → Promise<Readonly<Record<EstadoPieza, number>>>
```

Reemplaza el `cargarConteos` de **Inventario.tsx** (5 llamadas a
`listarPiezas` con `porPagina: 1` solo para leer `.total`) y el cálculo
equivalente de **Tablero.tsx** por una sola llamada a esto. Es siempre
global, sin filtro — coincide con lo que ya mostrás (la distribución
completa, no la vista filtrada).

**3. Maletas.tsx: nombre de hospital en vez de id crudo**

En la lista/detalle de una maleta `CERRADA`, hoy se muestra
`maleta.hospitalId` directo. Ya tenés `listarHospitales(db)` disponible (lo
usa `Hospitales.tsx`) — resuélvelo a `hospital.nombre` igual que ya hacés en
otras pantallas.

**4. Maletas.tsx: ocultar el Escáner fuera de `EN_ARMADO`**

`abrirMaleta`/`refrescarDetalle` abren la misma vista (`armando`) para
cualquier estado — el botón dice "Ver detalle" para una maleta que no está
`EN_ARMADO`, pero el `<Escaner>` de la vista sigue montado y activo igual.
El backend rechaza cualquier escaneo ahí (no hay riesgo de datos), pero
visualmente invita a escanear algo que no va a pasar nada. Renderiza el
`<Escaner>` solo si `armando.maleta.estado === 'EN_ARMADO'`; para los demás
estados, una vista de solo lectura del contenido alcanza.

**5. Tablero.tsx: una sola fuente para "conflictos"**

El segmento "conflictos" de la barra de distribución usa
`datos.conflictos.length` (de `listarConflictos`), y el residual "otros" se
calcula aparte con un conteo de piezas `EN_CONFLICTO`. Hoy siempre coinciden
porque el dominio garantiza 1 conflicto = 1 pieza, pero son dos queries
independientes contestando la misma pregunta. Con `contarPiezasPorEstado`
(punto 2) ya tenés `conteo.EN_CONFLICTO` disponible — úsalo para las dos
cosas y borra la duplicación.

**Nota general**: igual que siempre, si algo no calza con lo que ya armaste,
avisame antes de reinventar algo del lado del backend.
