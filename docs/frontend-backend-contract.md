# Contrato Backend ↔ Frontend

Este documento es el contrato entre **Claude Code** (dominio, datos, reglas de
negocio — `packages/core` y `packages/data`) y **Codex** (interfaz — `apps/web`).
Se actualiza cada vez que un cambio afecta lo que Codex consume. Si algo de
aquí no coincide con el código, el código manda y este archivo esta atrasado —
avisar para corregirlo.

## 0. Como se consume esto (leer primero)

Esta app **no depende de un backend HTTP para ejecutar el trabajo local**. Es offline-first: el
dominio (`@crearcos/core`) y la capa de datos (`@crearcos/data`) corren **en el
dispositivo**, contra IndexedDB (Dexie), y `apps/web` los importa como
paquetes de TypeScript, no como una API que se llama por `fetch`.

```
Codex escribe:                              en vez de:
  import { escanearArmado } from '@crearcos/data';   fetch('/api/scans', { method: 'POST', ... })
  const r = await escanearArmado(db, codigo, maletaId, sesion, opciones);
```

Por que: el punto 9 del brief exige que la app funcione sin internet en todo
momento. Si "agregar una pieza a la maleta" dependiera de una llamada HTTP, la
app se rompe sin señal. Todo lo que el auxiliar hace en el quirófano tiene que
ejecutarse localmente y confirmarse en disco antes de que la pantalla lo
muestre (decision 15 de `decisiones.md`).

Lo que también existe contra Supabase:

| Que                                          | Donde vive hoy                                  | Estado                                 |
| -------------------------------------------- | ----------------------------------------------- | -------------------------------------- |
| Sincronización de eventos entre dispositivos | `sync.ts` + Edge `sync`                         | Integrado con PUSH/ACK/PULL/cursor     |
| Alta/baja de usuarios entre dispositivos     | `AdministracionCentral` + Edge `administration` | Central mediante Supabase Auth         |
| Link temporal de instrumentista freelance    | `freelance.ts` + Edge `freelance-access`        | Central, hash, expiración y revocación |
| Aprobación de precio aleatorio               | `excepciones.ts` + comandos centrales           | Central y auditable                    |

Todo lo demas (armar maleta, escanear, facturar, reprocesar, resolver
conflictos, ver inventario, ver trazabilidad) se llama **directo** desde
`apps/web`, siempre pasando `db` (el `BaseLocal` que expone `useApp().db`) y
`sesion` (el objeto que expone `useApp().sesion`, forma `Sesion` mas abajo).

### Como obtener `db` y `sesion` en un componente

```tsx
const { db, sesion } = useApp(); // apps/web/src/datos/contexto.tsx, ya existe
```

`db` es del tipo `BaseLocal`. `sesion` es `SesionActiva | null` (null antes de
iniciar sesion; las rutas ya estan protegidas por rol, ver `Marco.tsx`).

### Como pasar el reloj (`opciones.ahora`)

Toda funcion que escribe algo pide `opciones: { ahora: () => number }`. En la
app real, pasar siempre `{ ahora: () => Date.now() }`. Nunca hay que construir
el HLC, el reloj logico ni el `dispositivoId` a mano: todo eso lo maneja la
capa de datos internamente.

## 1. Formas comunes (no cambian entre funciones)

### `Resultado<T, E>`

```ts
type Resultado<T, E> = { ok: true; valor: T } | { ok: false; error: E };
```

Todas las funciones de escritura devuelven esto. **Nunca lanzan** una
excepcion por un error de negocio (permiso denegado, transicion ilegal, etc.).
Codex siempre revisa `r.ok` antes de leer `r.valor` o `r.error`.

### Dos niveles de error — importante

Hay una distincion deliberada entre dos tipos de resultado "no exitoso":

1. **`fallo(...)`** — la operacion en si no tenia sentido (la maleta no
   existe, el rol no puede hacer esto, el conflicto ya estaba resuelto). Codex
   lo trata como una excepcion de UI: mensaje de error, no un estado normal
   del flujo.
2. **`ok({ codigo: 'REBOTE_IGNORADO' | 'PIEZA_NO_ENCONTRADA' | ... })`** — la
   operacion se ejecuto pero el resultado es un estado esperable del dia a dia
   (el lector rebota, un codigo no existe en este dispositivo, alguien sin
   permiso intento escanear). Esto viene de las funciones de escaneo
   (`escanearArmado`, `retirarDeArmado`, `escanearUso`) y trae siempre
   `{ codigo, mensaje, pieza }` — ver seccion 5.

### `Pagina<T>`

```ts
interface Pagina<T> {
  items: readonly T[];
  total: number;
  pagina: number;
  porPagina: number;
}
```

Toda lista que puede crecer (`listarPiezas`, `listarEnReprocesamiento`) la
devuelve asi. `pagina` es 1-indexado. Pedir la pagina 2 con
`{ pagina: 2, porPagina: 20 }`.

### `Sesion`

```ts
interface Sesion {
  usuarioId: UsuarioId;
  rol: Rol;
  dispositivoId: DispositivoId;
}
```

`SesionActiva` (lo que da `useApp().sesion`) le agrega `nombre` y `expiraEn`.

## 2. Enums estables — no van a cambiar de nombre sin aviso

### `Rol`

`SISTEMA | ADMINISTRADOR | AUXILIAR | COORDINADORA | CONTABLE | SUPERVISOR | FREELANCE`

`SISTEMA` no inicia sesion, es el autor de eventos automaticos (conflictos de
sincronizacion). No aparece en ningun selector de usuario.

### `EstadoPieza`

| Valor                        | Significado                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `EN_BODEGA_CENTRAL`          | En reposo, bodega de la empresa                                                |
| `EN_BODEGA_INSTRUMENTISTA`   | En reposo, bodega personal de un instrumentista                                |
| `ASIGNADA_A_MALETA`          | Escaneada hacia una maleta que todavia no salio de bodega                      |
| `EN_MALETA_ACTIVA`           | La maleta ya salio; la pieza esta en camino/en cirugia sin definir uso todavia |
| `USADA_PENDIENTE_VALORACION` | Se uso en cirugia, esperando que se le asigne hospital/precio                  |
| `FACTURADA`                  | Instrumental ya facturado (vuelve a reprocesamiento despues, no desaparece)    |
| `CONSUMIDA`                  | Insumo facturado — terminal, sale del inventario                               |
| `EN_REPROCESAMIENTO`         | Reesterilizandose, sin limite de ciclos                                        |
| `EN_CONFLICTO`               | Congelada por conflicto de sincronizacion, solo la Coordinadora la libera      |
| `EXTRAVIADA`                 | Terminal                                                                       |

### `TipoPieza`

`INSTRUMENTAL | INSUMO | KIT`

### `EstadoMaleta`

`EN_ARMADO | EN_CIRUGIA | CERRADA | CANCELADA`

### `EstadoFactura`

`BORRADOR | EMITIDA`

### `NivelPrecio` / `TipoPrecioAplicado`

`BASE | HABITUAL | PROVINCIA | NOTA_CREDITO` (+ `ALEATORIO` solo como
resultado aplicado, nunca como nivel configurable de un hospital).

### `Area` (rutas)

`tablero | maletas | cirugia | inventario | reprocesamiento | conflictos | facturacion | usuarios | hospitales`

`hospitales` es visible solo para `ADMINISTRADOR`, junto a `usuarios`. El
switch de `Area.tsx` la enruta y `Hospitales.tsx` ya integra lista, alta y
edicion contra `listarHospitales`, `obtenerHospital` y `guardarHospital`.

## 3. Inventario (`inventario.ts`)

### `listarPiezas(db, filtro?, paginacion?) → Promise<Pagina<PiezaConProducto>>`

```ts
interface PiezaConProducto {
  pieza: Pieza;
  producto: FilaCatalogo | undefined;
}
interface FiltroInventario {
  estado?: EstadoPieza;
  tipo?: TipoPieza;
  texto?: string;
  sku?: string;
}
```

`texto` busca por coincidencia parcial en el codigo de la pieza o en el
nombre del producto, sin distinguir mayusculas/acentos exactos (acentos: ver
nota de precios, aqui no se normaliza NFD, solo `toLocaleLowerCase`).

### `obtenerPieza(db, codigo) → Promise<PiezaConProducto | undefined>`

`undefined` si el codigo no existe en este dispositivo — importante para el
409-como-fallback del escaneo manual.

### `componentesDeKit(db, codigoKit) → Promise<readonly PiezaConProducto[]>`

Punto 5.3 del brief: al escanear una caja, mostrar esto para que el auxiliar
elija que hijos se usaron realmente. Vacio si el codigo no es un kit o no
tiene hijos.

### `crearProducto(db, datos, sesion) → Resultado<FilaCatalogo, ErrorInventario>`

Alta de un producto en el catalogo. Solo `ADMINISTRADOR` (brief §4: "Gestiona
usuarios y **catalogo de inventario**"). `datos: { sku, nombre, tipo, costoBase }`
— `costoBase` en centavos enteros (decision 6), no dolares.

No crea ninguna pieza fisica: un sku puede existir en catalogo antes de que
llegue mercaderia con ese codigo. Errores: `NO_AUTORIZADO`,
`PRODUCTO_YA_EXISTE`, `COSTO_INVALIDO` (no entero o negativo).

### `registrarPieza(db, datos, sesion) → Resultado<Pieza, ErrorInventario>`

Alta de una pieza fisica nueva, en reposo. Solo `ADMINISTRADOR`.
`datos: { codigo, sku, parentCodigo?, ubicacion? }` — el `codigo` es el que ya
trae la etiqueta fisica (decision 2: los ids no se generan en el backend),
`ubicacion` por defecto `BODEGA_CENTRAL`. Tipo y costo se toman del producto de
catalogo al que pertenece, no se repiten aqui.

No pasa por `aplicarEvento` (decision 34): es la primera fila para ese codigo,
no hay estado previo que transicionar. El primer evento real (`ESCANEO_ARMADO`,
etc.) si pasa por la maquina de estados como cualquier otro.

Errores: `NO_AUTORIZADO`, `PRODUCTO_NO_ENCONTRADO` (el sku no esta en
catalogo), `PIEZA_YA_EXISTE`, `PADRE_NO_ENCONTRADO` (si se pasa `parentCodigo`
y ese kit no existe en este dispositivo).

### `listarCatalogo(db) → Promise<readonly FilaCatalogo[]>`

`FilaCatalogo = { sku, nombre, tipo, costoBase }`. Util para selects/tipeahead
cuando se necesite el catalogo completo (por ejemplo, para dar de alta una
excepcion de precio).

### `contarPiezasPorEstado(db) → Promise<Readonly<Record<EstadoPieza, number>>>`

Los 10 conteos en una sola llamada (una sola pasada sobre la tabla), en vez de
pedir 5 paginas de `listarPiezas` solo para leer `.total` de cada una.
Siempre global — no acepta filtro, porque los resumenes que lo consumen
(tarjetas de Inventario, distribucion del Tablero) muestran la composicion
completa del inventario, no una vista filtrada por busqueda.

**Integrado en UI**: Inventario y Tablero consumen esta única llamada para sus
resúmenes. El conteo `EN_CONFLICTO` alimenta tanto el segmento de la barra como
el cálculo residual de "otros".

## 4. Maletas (`maletas.ts`)

Una maleta es su propia entidad (tabla `maletas`), no se infiere solo de las
piezas. El id se genera en el dispositivo, formato `MAL-XXXXXXXX`.

### `crearMaleta(db, { responsableId, procedimiento }, sesion, opciones) → Resultado<Maleta, ErrorMaleta>`

Abre una maleta vacia en `EN_ARMADO`. Roles: `AUXILIAR`, `COORDINADORA`,
`ADMINISTRADOR`.

### `escanearArmado(db, codigo, maletaId, sesion, opciones) → Resultado<RespuestaEscaneo, ErrorMaleta>`

El escaneo principal de armado. Ver seccion 5 para `RespuestaEscaneo`.

`fallo(ErrorMaleta)` solo si la maleta no existe o no esta `EN_ARMADO` — todo
lo relacionado con la pieza (no encontrada, rebote, transicion invalida,
permiso) viene como `ok(RespuestaEscaneo)`.

### `retirarDeArmado(db, codigo, sesion, opciones) → Resultado<RespuestaEscaneo, ErrorMaleta>`

Arrepentimiento antes de la salida (`ESCANEO_ARMADO_REVERSO`).

### `escanearUso(db, codigo, maletaId, sesion, opciones) → Resultado<RespuestaEscaneo, ErrorMaleta>`

Durante la cirugia. Roles permitidos en el evento subyacente: `AUXILIAR`,
`COORDINADORA`, `FREELANCE`.

### `confirmarSalidaMaleta(db, maletaId, sesion, opciones) → Resultado<ResumenConfirmarSalida, ErrorMaleta>`

"La maleta sale de bodega" (punto 8.1 del brief: sin precio ni hospital
todavia). Pasa todas las piezas `ASIGNADA_A_MALETA` de esa maleta a
`EN_MALETA_ACTIVA` y la maleta a `EN_CIRUGIA`, en una sola transaccion.

```ts
interface ResumenConfirmarSalida {
  maleta: Maleta;
  piezasConfirmadas: number;
}
```

**Idempotente**: si la maleta ya esta `EN_CIRUGIA`, devuelve
`ok({ maleta, piezasConfirmadas: 0 })` sin volver a emitir eventos — un doble
tap del boton no duplica nada.

Errores: `MALETA_NO_ENCONTRADA`, `ESTADO_INVALIDO` (ya cerrada/cancelada),
`MALETA_VACIA` (no hay piezas armadas todavia).

### `cancelarMaleta(db, maletaId, motivo, sesion, opciones) → Resultado<Maleta, ErrorMaleta>`

Solo si sigue `EN_ARMADO`. Devuelve cualquier pieza ya armada a su bodega
antes de cancelar.

### `obtenerMaleta(db, maletaId) → Promise<DetalleMaleta | undefined>`

```ts
interface DetalleMaleta {
  maleta: Maleta;
  piezas: readonly Pieza[];
}
```

### `listarMaletas(db, filtro?) → Promise<readonly Maleta[]>`

`filtro: { estado?: EstadoMaleta; responsableId?: string }`. Mas nueva
primero. Sin paginacion todavia (volumen esperado por dispositivo: decenas).

### `ErrorMaleta` — un solo tipo para todo el modulo

```ts
type CodigoErrorMaleta =
  | 'MALETA_NO_ENCONTRADA'
  | 'ESTADO_INVALIDO'
  | 'MALETA_VACIA'
  | 'PIEZA_DESCONOCIDA'
  | 'REBOTE_DE_LECTOR'
  | 'TRANSICION_RECHAZADA'
  | 'ROL_NO_AUTORIZADO'
  | 'PRECIO_NO_RESUELTO';
```

## 5. Escaneo — el codigo que ve Codex en pantalla

`escanearArmado`, `retirarDeArmado` y `escanearUso` devuelven, dentro de
`ok(...)`, siempre esta forma:

```ts
interface RespuestaEscaneo {
  codigo: 'EXITO' | 'REBOTE_IGNORADO' | 'PIEZA_NO_ENCONTRADA' | 'ESTADO_INVALIDO' | 'NO_AUTORIZADO';
  mensaje: string; // texto de respaldo, no es obligatorio mostrarlo tal cual
  pieza: Pieza | null;
}
```

| Codigo                | Que paso                                                                                | Sugerencia de feedback (Codex decide el look)   |
| --------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `EXITO`               | Se registro el evento                                                                   | Confirmacion positiva                           |
| `REBOTE_IGNORADO`     | El lector disparo dos veces el mismo codigo en <400ms                                   | Neutro o silencioso, no es un error del usuario |
| `PIEZA_NO_ENCONTRADA` | El codigo no existe en el inventario de este dispositivo                                | Alerta: pedir revisar la etiqueta               |
| `ESTADO_INVALIDO`     | La pieza no puede hacer esta transicion ahora (ya esta en otra maleta, ya se uso, etc.) | Alerta                                          |
| `NO_AUTORIZADO`       | El rol de la sesion no puede emitir este evento                                         | Alerta de permisos                              |

El lector fisico es un teclado HID: un `<input>` enfocado que recibe texto y
un Enter. No hace falta integrar camara ni una libreria de escaneo.

## 6. Cirugia y reprocesamiento (`reprocesamiento.ts`)

### `listarEnReprocesamiento(db, { pagina?, porPagina? }) → Promise<Pagina<Pieza>>`

### `finReproceso(db, codigo, destino, sesion, opciones) → Resultado<RegistroAplicado, ErrorRegistro>`

`destino: Ubicacion = { clase: 'BODEGA_CENTRAL' } | { clase: 'BODEGA_INSTRUMENTISTA', usuarioId }`.
Rol: `COORDINADORA`.

### `ingresoReproceso(db, codigo, sesion, opciones) → Resultado<RegistroAplicado, ErrorRegistro>`

Para el caso manual (una pieza que vuelve suelta, fuera del cierre normal de
una maleta). Roles: `COORDINADORA`, `AUXILIAR`.

`RegistroAplicado = { pieza: Pieza; evento: Evento }`. `ErrorRegistro.codigo`:
`PIEZA_DESCONOCIDA | REBOTE_DE_LECTOR | TRANSICION_RECHAZADA`.

## 7. Facturación (`facturacion.ts`)

Implementa el punto 8 del brief completo: nada se factura hasta que la
maleta regresa y se le asigna hospital.

### `cerrarMaleta(db, maletaId, hospitalId, sesion, opciones) → Resultado<ResumenCierreMaleta, ErrorFacturacion>`

En una sola transaccion:

1. Todo lo que quedo `EN_MALETA_ACTIVA` (no se uso) pasa a `EN_REPROCESAMIENTO`.
2. La maleta se cierra y **aqui** se le asigna el hospital.
3. Si algo se uso, se genera el `Factura` en `BORRADOR` con el precio ya
   resuelto por linea (motor de precios de `core`, Codex nunca calcula esto).

```ts
interface ResumenCierreMaleta {
  maleta: Maleta;
  factura: Factura | null;
  piezasReprocesadas: number;
}
```

`factura: null` es un resultado **valido**, no un error: una maleta puede
volver sin que se haya usado nada.

```ts
interface Factura {
  id: string;
  maletaId: string;
  hospitalId: string;
  estado: 'BORRADOR' | 'EMITIDA';
  lineas: readonly LineaFactura[];
  total: number; // centavos
  creadaEn: string;
  emitidaEn: string | null;
}
interface LineaFactura {
  codigoPieza: string;
  sku: string;
  nombre: string;
  precio: {
    valor: number;
    tipo: NivelPrecio | 'ALEATORIO';
    requiereAprobacion: boolean;
    explicacion: string;
  };
}
```

`precio.valor` esta en **centavos enteros**. Para mostrar dolares:
`(valor / 100).toFixed(2)`, o mejor, reusar `formatearUSD` si se expone a
`apps/web` (hoy es interno a `core`; avisar si Codex lo necesita y se exporta).

`precio.requiereAprobacion: true` = precio aleatorio pendiente de aprobacion
del Administrador. Codex deberia marcar esa linea como bloqueada visualmente: la
factura no se puede emitir mientras exista una asi (ver `emitirFactura`).

Errores: `MALETA_NO_ENCONTRADA`, `ESTADO_INVALIDO` (la maleta no esta
`EN_CIRUGIA`), `HOSPITAL_NO_ENCONTRADO`, `COSTO_NO_DEFINIDO` (problema de
catalogo, no de la maleta).

### `emitirFactura(db, facturaId, sesion, opciones) → Resultado<Factura, ErrorFacturacion>`

Solo rol `CONTABLE`. Aplica el evento de facturacion a cada pieza de la
factura (instrumental → `FACTURADA`, insumo → `CONSUMIDA`) y marca la factura
`EMITIDA`.

**Idempotente**: una factura ya `EMITIDA` se devuelve tal cual, sin tocar
piezas otra vez.

**Bloqueo por aprobacion pendiente**: si alguna linea tiene
`requiereAprobacion: true`, esto devuelve `fallo({ codigo:
'LINEA_BLOQUEADA_POR_APROBACION', codigosBloqueados: [...] })` y **no
modifica ninguna pieza**. Codex deberia mostrar exactamente que codigos estan
bloqueados y por que (traer la excepcion de precio para explicarlo, si hace
falta una pantalla de detalle).

### `obtenerFactura`, `listarFacturas(db, { estado?, hospitalId? })`

### Ciudad base (para el piso de "provincia")

`leerCiudadBase(db) → Promise<string>` / `definirCiudadBase(db, ciudad)`.
Hoy se siembra con el valor de la semilla (`Quito`). Es la ciudad sede de la
empresa: un hospital en otra ciudad paga como minimo el nivel `PROVINCIA`.

## 8. Conflictos (`conflictos.ts`)

### `listarConflictos(db, { estado?: 'ABIERTO' | 'RESUELTO' }) → Promise<readonly ConflictoConPieza[]>`

```ts
interface ConflictoConPieza {
  conflicto: FilaConflicto;
  pieza: Pieza | undefined;
}
interface FilaConflicto {
  conflictoId: string;
  codigo: string;
  detectadoEn: number;
  detalle: unknown;
  estado: 'ABIERTO' | 'RESUELTO';
}
```

`detalle` viene del motor central de sincronización
(`ConflictoReportado.detalle` en `sync.ts`). Continúa siendo `unknown` en la
frontera local para poder evolucionar la evidencia sin romper clientes; la UI
debe presentarlo como diagnóstico y usar los campos tipados de primer nivel.

### `resolverConflicto(db, conflictoId, datos, sesion, opciones) → Resultado<Pieza, ErrorConflicto>`

Solo rol `COORDINADORA`.

```ts
interface DatosResolucionConflicto {
  estadoAdjudicado: EstadoPieza; // uno de: EN_BODEGA_CENTRAL, EN_BODEGA_INSTRUMENTISTA, EN_MALETA_ACTIVA, USADA_PENDIENTE_VALORACION, EN_REPROCESAMIENTO, EXTRAVIADA
  ubicacion: Ubicacion;
  maletaId: string | null;
  motivo: string; // texto libre — Codex puede ofrecer opciones predefinidas
}
```

Decision 9 de `decisiones.md`: ofrecer explicitamente un motivo del tipo
"etiqueta fisica duplicada" en las opciones, porque en la practica es la causa
mas comun, no la desincronizacion en si.

Errores: `CONFLICTO_NO_ENCONTRADO`, `CONFLICTO_YA_RESUELTO`,
`PIEZA_NO_ENCONTRADA`, `TRANSICION_RECHAZADA` (incluye rol no autorizado).

## 9. Trazabilidad (`trazabilidad.ts`)

### `historialDePieza(db, codigo) → Promise<readonly Evento[]>`

Timeline completo de una pieza, **mas antiguo primero**, ordenado por HLC
(nunca por reloj de pared — un celular con la hora mal no puede desordenar el
historial). Vacio si el codigo no existe o no tiene eventos.

```ts
interface Evento {
  sobre: { eventoId, hlc, dispositivoId, usuarioId, rol, registradoEn }; // registradoEn = ISO, informativo
  cuerpo: { tipo: TipoEvento; ...campos segun el tipo };
}
```

`TipoEvento` (11 valores): `ESCANEO_ARMADO | ESCANEO_ARMADO_REVERSO |
CONFIRMAR_SALIDA | ESCANEO_USO | CIERRE_MALETA_SIN_USO | CONFIRMAR_FACTURA |
INGRESO_REPROCESO | FIN_REPROCESO | CONFLICTO_SYNC | RESOLUCION_MANUAL |
MARCAR_EXTRAVIADA`. Codex define la etiqueta visible de cada uno (esto es
vocabulario del dominio, no diseño, pero el texto final para el usuario si es
decision de Codex).

## 10. Usuarios (`usuarios.ts`) — autoservicio del Administrador

Todas requieren `sesion.rol === 'ADMINISTRADOR'`, devuelven
`fallo({ codigo: 'NO_AUTORIZADO' })` si no — **excepto `listarUsuariosBasico`**,
ver mas abajo.

| Funcion                                                                | Que hace                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `listarUsuarios(db, sesion)`                                           | Lista sanitizada (nunca hash/sal/iteraciones)         |
| `crearUsuario(db, datos, sesion, opciones)`                            | Alta. `datos: { usuarioId, nombre, rol, contrasena }` |
| `cambiarEstadoUsuario(db, usuarioId, activo, sesion)`                  | Activar/desactivar                                    |
| `resetearContrasena(db, usuarioId, nuevaContrasena, sesion, opciones)` | Resetea y limpia el bloqueo por intentos fallidos     |

```ts
interface UsuarioResumen {
  usuarioId: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  bloqueadoHasta: number | null;
}
```

Con Supabase configurado, la administración usa `AdministracionCentral` y las
identidades globales de Supabase Auth. La implementación local se conserva
únicamente para el modo demo aislado.

### `listarUsuariosBasico(db, filtro?) → Promise<readonly UsuarioBasico[]>`

**Lectura abierta, sin `sesion` ni gating de rol** — la unica excepcion de
este modulo (decision 39). `UsuarioBasico = { usuarioId, nombre, rol }`, nunca
`activo`/`bloqueadoHasta`/hash/sal. `filtro: { rol?, incluirInactivos? }` —
por defecto excluye inactivos. Pensada para dos casos: resolver un
`usuarioId` a un nombre legible en cualquier pantalla, y ofrecer un selector
de instrumentistas.

**Integrado en UI**: Reprocesamiento y Conflictos usan
`{ rol: 'AUXILIAR' }` para elegir destinos activos. Maletas, Tablero y el
gestor de enlaces freelance incluyen inactivos al resolver referencias
históricas, conservando el ID como respaldo si la cuenta no existe localmente.

## 11. Hospitales (`hospitales.ts`)

`listarHospitales(db)`, `obtenerHospital(db, id)`,
`guardarHospital(db, hospital, sesion)` (solo `ADMINISTRADOR`).

```ts
interface Hospital {
  id: string;
  nombre: string;
  ciudad: string;
  nivelPorDefecto: 'HABITUAL' | 'PROVINCIA' | 'NOTA_CREDITO';
}
```

**Integrado (decision 35)**: el `Area` es `hospitales`, visible solo para
`ADMINISTRADOR`, junto a `usuarios`. `Hospitales.tsx` presenta la lista real y
el formulario de alta/edicion sin agregar campos fuera del contrato.

## 12. Autenticacion y sesion (`autenticacion.ts`) — ya integrado, sin cambios

Sin cambios de contrato en esta ronda. Documentado aqui solo para que quede
completo: `iniciarSesion(db, usuario, contrasena, opciones)`,
`sesionActual(db, opciones)`, `cerrarSesion(db)`. Errores:
`CREDENCIALES_INVALIDAS | USUARIO_INACTIVO | USUARIO_BLOQUEADO |
ROL_NO_INICIA_SESION | SESION_EXPIRADA | SIN_SESION`. `esperaMs` viene con
`USUARIO_BLOQUEADO` (milisegundos restantes de bloqueo).

## 13. Estado de sincronizacion — ya integrado, sin cambios

`useApp().pendientes` (número de operaciones sin ACK central) está disponible
y se refresca solo. `ProveedorApp` selecciona el transporte Supabase normal o
el transporte restringido de la sesión freelance; sin red conserva la outbox.

## 16. Excepciones de precio (`excepciones.ts`) — aprobacion de precio aleatorio

Resuelve el punto abierto §11.3 del brief (decision 36: aprueba el
Administrador, dentro de la app).

### `proponerExcepcionPrecio(db, datos, sesion, opciones) → Resultado<FilaExcepcionPrecio, ErrorExcepcion>`

Registra una negociacion puntual. Roles: `CONTABLE`, `ADMINISTRADOR`.
`datos: { sku, hospitalId, valor, vigenteDesde, vigenteHasta? }` —
`valor` en centavos enteros. Nace **siempre** `PENDIENTE`, sin importar quien
la cree.

### `aprobarExcepcionPrecio(db, id, sesion) → Resultado<FilaExcepcionPrecio, ErrorExcepcion>`

Solo `ADMINISTRADOR`. Falla con `ESTADO_INVALIDO` si la excepcion ya no esta
`PENDIENTE`.

### `rechazarExcepcionPrecio(db, id, motivo, sesion) → Resultado<FilaExcepcionPrecio, ErrorExcepcion>`

Igual, pero guarda `motivo` en `motivoRechazo` (texto libre, solo para
trazabilidad administrativa — no es un evento de dominio).

### `listarExcepcionesPrecio(db, filtro?)`, `obtenerExcepcionPrecio(db, id)`

`filtro: { estado?: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO', hospitalId? }`.
Lectura abierta, sin gating de rol (igual criterio que `listarHospitales`).

```ts
interface FilaExcepcionPrecio {
  id: string;
  sku: string;
  hospitalId: string;
  valor: number; // centavos
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  vigenteDesde: string;
  vigenteHasta: string | null;
  motivoRechazo: string | null;
}
```

Una excepcion `APROBADO` es la que `cerrarMaleta` ya recoge automaticamente
via el motor de precios (`resolverPrecio`) — no hace falta ninguna llamada
adicional al facturar, esto solo administra el ciclo de vida de la excepcion
en si. **Integrado en UI**: Facturacion incluye propuesta, filtros e historial;
el Tablero del Administrador incluye la cola de aprobación con acciones de
aprobar y rechazar.

## 17. Freelance (`freelance.ts`) — enlace temporal de acceso

Resuelve el punto abierto §11.4 del brief (decision 37: token atado a la
maleta, lo genera Contable).

### `generarTokenFreelance(db, maletaId, sesion, opciones) → Resultado<{ token, maletaId }, ErrorFreelance>`

Roles: `CONTABLE`, `ADMINISTRADOR`. Falla si la maleta no existe o ya llego a
un estado terminal (`MALETA_EN_ESTADO_TERMINAL`). El `token` es un secreto de
alta entropia — **nunca** se deriva del `maletaId` visible en pantalla.

### `validarTokenFreelance(db, token) → Resultado<{ maletaId }, ErrorFreelance>`

Lectura, sin efectos. Para que la pantalla de acceso decida que mostrar
(formulario de nombre vs. "enlace vencido") antes de pedir nada. Codigos:
`TOKEN_INVALIDO`, `TOKEN_REVOCADO`, `MALETA_EN_ESTADO_TERMINAL`.

### `entrarConToken(db, token, nombre, opciones) → Resultado<SesionActiva, ErrorFreelance>`

Redime el enlace y abre sesion `FREELANCE` **sin usuario ni contrasena**.
`nombre` lo escribe la persona al entrar — no hay cuenta previa. Vuelve a
validar todo lo de arriba antes de abrir sesion. `NOMBRE_REQUERIDO` si viene
vacio.

Esta es la unica forma de entrar sin credenciales: no reemplaza
`iniciarSesion`, es una puerta paralela solo para `FREELANCE`. Una vez
adentro, la sesion se comporta exactamente igual que cualquier otra
(`useApp().sesion`, mismo `expiraEn`, mismas rutas permitidas — solo
`cirugia`, sin cambios ahi).

### `listarTokensFreelance(db, maletaId)`, `revocarTokenFreelance(db, token, sesion)`

Para que Contable/Administrador vean y corten un enlace antes de tiempo
(compartido por error, etc.). Revocar no toca la maleta ni ninguna pieza.

**Integrado en UI**: `/acceso-freelance/:token` vive fuera del guardia normal,
valida el enlace, pide solo el nombre y redirige a Cirugia. Contable y
Administrador generan, copian y revocan enlaces desde las operaciones
`EN_CIRUGIA` visibles en Tablero, sin ampliar permisos de áreas.

## 18. Notificaciones (`notificaciones.ts`) — lectura para el Supervisor

Resuelve el punto abierto §11.5 del brief (decision 38).

### `obtenerNotificaciones(db, opciones) → Promise<Notificaciones>`

`opciones: { ahora, umbralMaletaDemoradaMs? }` (default 8h, exportado como
`UMBRAL_MALETA_DEMORADA_MS_DEFECTO`).

```ts
interface Notificaciones {
  conflictosAbiertos: readonly ConflictoConPieza[]; // igual forma que conflictos.ts
  maletasDemoradas: readonly Maleta[];
  facturasBloqueadas: readonly Factura[]; // BORRADOR con alguna linea requiereAprobacion
  total: number;
}
```

Es una sola llamada, sin paginacion (volumen esperado bajo: son alertas, no un
listado operativo). No hay tabla propia ni push — se recalcula en cada
llamada sobre datos que ya existen. **Integrado en UI**: la campana del
Supervisor muestra el contador, un resumen por tipo y el detalle completo de
las tres señales, con actualización manual.

## 19. Errores — catalogo completo por modulo

| Modulo                                              | Codigos                                                                                                                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventario (`inventario.ts`, alta)                  | `NO_AUTORIZADO`, `PRODUCTO_YA_EXISTE`, `PRODUCTO_NO_ENCONTRADO`, `PIEZA_YA_EXISTE`, `PADRE_NO_ENCONTRADO`, `COSTO_INVALIDO`                                                 |
| Escaneo suelto (`escaneo.ts`, `reprocesamiento.ts`) | `PIEZA_DESCONOCIDA`, `REBOTE_DE_LECTOR`, `TRANSICION_RECHAZADA`                                                                                                             |
| Maletas (`maletas.ts`)                              | `MALETA_NO_ENCONTRADA`, `ESTADO_INVALIDO`, `MALETA_VACIA`, `PIEZA_DESCONOCIDA`, `REBOTE_DE_LECTOR`, `TRANSICION_RECHAZADA`, `ROL_NO_AUTORIZADO`, `PRECIO_NO_RESUELTO`       |
| Facturacion (`facturacion.ts`)                      | `MALETA_NO_ENCONTRADA`, `ESTADO_INVALIDO`, `HOSPITAL_NO_ENCONTRADO`, `COSTO_NO_DEFINIDO`, `FACTURA_NO_ENCONTRADA`, `LINEA_BLOQUEADA_POR_APROBACION`, `TRANSICION_RECHAZADA` |
| Conflictos (`conflictos.ts`)                        | `CONFLICTO_NO_ENCONTRADO`, `CONFLICTO_YA_RESUELTO`, `PIEZA_NO_ENCONTRADA`, `TRANSICION_RECHAZADA`                                                                           |
| Usuarios (`usuarios.ts`)                            | `NO_AUTORIZADO`, `USUARIO_NO_ENCONTRADO`, `USUARIO_YA_EXISTE`                                                                                                               |
| Hospitales (`hospitales.ts`)                        | `NO_AUTORIZADO`, `HOSPITAL_NO_ENCONTRADO`                                                                                                                                   |
| Autenticacion (`autenticacion.ts`)                  | `CREDENCIALES_INVALIDAS`, `USUARIO_INACTIVO`, `USUARIO_BLOQUEADO`, `ROL_NO_INICIA_SESION`, `SESION_EXPIRADA`, `SIN_SESION`                                                  |
| Excepciones de precio (`excepciones.ts`)            | `NO_AUTORIZADO`, `EXCEPCION_NO_ENCONTRADA`, `ESTADO_INVALIDO`, `VALOR_INVALIDO`                                                                                             |
| Freelance (`freelance.ts`)                          | `NO_AUTORIZADO`, `MALETA_NO_ENCONTRADA`, `MALETA_EN_ESTADO_TERMINAL`, `TOKEN_INVALIDO`, `TOKEN_REVOCADO`, `NOMBRE_REQUERIDO`                                                |

Ningun codigo distingue "usuario no existe" de "clave incorrecta" a proposito
(decision 24) — no pedir ese detalle, es una decision de seguridad, no un
descuido.

## 20. Qué falta — no inventar silenciosamente sobre esto

1. **Validación del QR de fábrica** en insumos: sin probar, es un supuesto
   técnico pendiente, no de este contrato (PoC 4 del brief).
2. **Validación física del marcado tras autoclave**: requiere prueba de campo.

El servidor de sincronización, Supabase Auth, la administración central, las
excepciones de precio, el acceso freelance y las notificaciones del Supervisor
ya están integrados. Las mutaciones administrativas centrales requieren red;
las operaciones físicas autorizadas siguen siendo offline-first.

Cuando cualquiera de estos se resuelva, este documento se actualiza antes de
que el codigo lo necesite, no despues.
