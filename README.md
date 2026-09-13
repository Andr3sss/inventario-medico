# Crearcos Inventario Quirúrgico

Aplicación offline-first para el control de instrumental médico y la
prefacturación por institución hospitalaria. IndexedDB/Dexie mantiene la
réplica operativa en cada dispositivo y Supabase/PostgreSQL es la fuente
central autoritativa.

El dominio, las pantallas y la integración central cubren inventario, maletas,
escaneo, cirugía, reprocesamiento, precios, facturación, conflictos, usuarios,
hospitales y accesos freelance. La sincronización usa operaciones atómicas,
HLC, entrega at-least-once, cursor monotónico y detección explícita de
conflictos físicos.

Si es la primera vez que lo levantas, sigue `docs/entorno-y-github.md`. Trae
la instalacion paso a paso, la configuracion de VS Code y como publicarlo en
GitHub.

## Como arrancar

```bash
npm install
npx supabase start # requiere Docker para el stack local
npx supabase db reset
npx supabase test db
npm run build
npm run dev         # abre la app en http://localhost:5173
npm run verificar   # lint + tipos + pruebas
```

Configura la URL y la clave publishable según
[`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md). El demo local y la carga
demo central son explícitos; una base vacía nunca se siembra automáticamente
en producción y no existe una contraseña compartida compilada en la app.

Comandos sueltos:

| Comando                 | Que hace                                  |
| ----------------------- | ----------------------------------------- |
| `npm run typecheck`     | Compila con TypeScript en modo estricto   |
| `npm run test`          | Corre las pruebas del dominio y los datos |
| `npm run test:watch`    | Las mismas pruebas en modo continuo       |
| `npm run lint`          | ESLint con reglas de tipos                |
| `npm run format`        | Prettier sobre todo el repositorio        |
| `npm run seed [numero]` | Regenera el inventario de prueba          |

## Estructura

```
packages/core/     dominio puro, sin dependencias de navegador
  comun/             Resultado, tipos marcados, dinero en centavos, paginacion
  estados/           maquina de estados de la pieza
  maletas/           maquina de estados de la maleta como entidad propia
  facturacion/       Factura (borrador -> emitida) y su guardia de aprobacion
  eventos/           tipos de evento y reloj logico hibrido
  precios/           matriz de 4 niveles y precios aleatorios
  contratos/         validacion de frontera con Zod
packages/data/     persistencia local y sincronizacion (offline-first)
  db.ts              esquema Dexie sobre IndexedDB
  escaneo.ts         transaccion atomica del escaneo (nucleo reutilizable)
  maletas.ts         crear/escanear/confirmar salida/cerrar/cancelar maleta
  facturacion.ts     cierre de maleta -> borrador de factura -> emision
  reprocesamiento.ts listar y cerrar el ciclo de reesterilizacion
  conflictos.ts      listar y resolver conflictos de sincronizacion
  inventario.ts      busqueda, filtro y paginacion del inventario
  trazabilidad.ts    historial ordenado de una pieza
  usuarios.ts        alta/baja/reset, autoservicio del Administrador
  hospitales.ts      catalogo de instituciones
  sync.ts            motor de sincronizacion y reconciliacion
  reloj.ts           HLC persistido
apps/web/          la aplicacion
  estilos/           tokens y hoja base
  datos/             arranque del dispositivo y contexto de sesion
  componentes/       marco, etiqueta de bandeja, estado de sincronizacion
  pantallas/         ingreso, áreas y flujos operativos conectados a data
seeds/             generador determinista del inventario, usuarios y hospitales de prueba
docs/              decisiones de arquitectura y el contrato con el frontend
supabase/          migraciones, pruebas PostgreSQL y Edge Functions
```

La regla de dependencias es una sola: `core` no importa nada de la capa de
datos ni de la interfaz. Las flechas apuntan siempre hacia adentro. Cuando se
agregue Dexie o React, el dominio no se entera.

## Lo que ya funciona

Dominio y datos (offline-first, corren en el dispositivo):

- Las 11 transiciones de la pieza, con guardas de rol, de maleta y de estado.
- Maleta como entidad propia: crear, escanear armado, confirmar salida
  (idempotente), escanear uso, cerrar con asignacion de hospital, cancelar.
- Facturacion: cierre de maleta genera el borrador con el precio ya resuelto
  por linea; emision bloqueada si una excepcion de precio esta pendiente de
  aprobacion de gerencia; instrumental vuelve a reprocesamiento, insumo se
  consume.
- Reprocesamiento sin limite de ciclos, y su ingreso manual fuera del cierre
  de maleta.
- Conflictos: listar, ver la pieza asociada y resolver manualmente
  (solo Coordinadora).
- Inventario con busqueda, filtro por estado/tipo/sku y paginacion; kits con
  sus componentes hijos.
- Trazabilidad: historial completo de una pieza ordenado por HLC, nunca por
  reloj de pared.
- Usuarios: alta por invitación, baja, recuperación autocontenida, MFA TOTP y
  retiro de dispositivos, sin exponer credenciales al Administrador.
- Hospitales: catalogo persistido, sembrado con la semilla de prueba.
- Alta de catalogo (`crearProducto`) y de piezas fisicas (`registrarPieza`),
  autoservicio del Administrador (brief §4).
- Excepciones de precio con aprobacion del Administrador (`excepciones.ts`).
- Enlace temporal de instrumentista freelance, atado al ciclo de vida de la
  maleta (`freelance.ts`).
- Notificaciones agregadas para el Supervisor: conflictos abiertos, maletas
  demoradas, facturas bloqueadas (`notificaciones.ts`).
- Lectura abierta de usuarios basicos (`listarUsuariosBasico`) y conteo de
  piezas por estado en una sola pasada (`contarPiezasPorEstado`).
- Congelamiento por conflicto de sincronizacion y resolucion manual.
- Reloj logico hibrido que no retrocede aunque el celular tenga la hora mal.
- Matriz de precios con piso de provincia y bloqueo por precio aleatorio.
- Inventario semilla reproducible con invariantes verificadas.
- Escaneo atomico: reloj, evento, pieza y cola en una sola transaccion.
- Guarda contra el rebote del lector HID.
- Cola de salida con reintento exponencial disperso y cuarentena de rechazos.
- Sincronizacion idempotente que no pisa escaneos locales sin enviar.

App:

- Ingreso con credencial local, bloqueo por intentos y sesion que caduca.
- Ruteo por rol: el menu y la guardia de ruta leen la misma matriz.
- Estado de sincronizacion visible en todo momento.
- Las 8 pantallas de contenido (`Tablero`, `Maletas`, `Cirugia`, `Inventario`,
  `Reprocesamiento`, `Conflictos`, `Facturacion`, `Usuarios`) consumen
  exclusivamente funciones de `@crearcos/data` — sin datos de ejemplo.

## Operación y entrega

- Arquitectura y ERD: [`docs/DATABASE_ARCHITECTURE.md`](docs/DATABASE_ARCHITECTURE.md).
- Protocolo offline/sync: [`docs/SYNC_PROTOCOL.md`](docs/SYNC_PROTOCOL.md).
- Datos de demostración: [`docs/DEMO_DATA.md`](docs/DEMO_DATA.md).
- Handoff irreversible: [`docs/PRODUCTION_HANDOFF.md`](docs/PRODUCTION_HANDOFF.md).

Antes de operar con datos reales aún corresponde validar en campo la lectura
del QR de fábrica y la resistencia del marcado físico al autoclave. Son pruebas
operativas; no se sustituyen con cambios de software.
