# inventario-medico
=======
# Crearcos Inventario Quirurgico

Prototipo offline-first para el control de instrumental medico y la
prefacturacion automatica por institucion hospitalaria.

Estado actual: **Fases 0, 1, 2 y la primera rebanada de la 3**. Nucleo del
dominio, capa de datos offline-first y la app con ingreso, sesion y ruteo por
rol. Las demas areas existen como rutas protegidas y todavia sin construir.

Si es la primera vez que lo levantas, sigue `docs/entorno-y-github.md`. Trae
la instalacion paso a paso, la configuracion de VS Code y como publicarlo en
GitHub.

## Como arrancar

```bash
npm install
npm run dev         # abre la app en http://localhost:5173
npm run verificar   # lint + tipos + pruebas
```

La primera vez, la app siembra el dispositivo con 221 piezas y las cuentas de
prueba. Todas usan la clave `crearcos-2026`: `u-admin`, `u-aux-1`, `u-coord`,
`u-contable`, `u-supervisor`, `u-free-1`. Son de prototipo y desaparecen cuando
entre la autenticacion real.

Comandos sueltos:

| Comando                 | Que hace                                |
| ----------------------- | --------------------------------------- |
| `npm run typecheck`     | Compila con TypeScript en modo estricto |
| `npm run test`          | Corre las 36 pruebas del dominio        |
| `npm run test:watch`    | Las mismas pruebas en modo continuo     |
| `npm run lint`          | ESLint con reglas de tipos              |
| `npm run format`        | Prettier sobre todo el repositorio      |
| `npm run seed [numero]` | Regenera el inventario de prueba        |

## Estructura

```
packages/core/     dominio puro, sin dependencias de navegador
  comun/             Resultado, tipos marcados, dinero en centavos
  estados/           maquina de estados de la pieza
  eventos/           tipos de evento y reloj logico hibrido
  precios/           matriz de 4 niveles y precios aleatorios
  contratos/         validacion de frontera con Zod
packages/data/     persistencia local y sincronizacion
  db.ts              esquema Dexie sobre IndexedDB
  escaneo.ts         transaccion atomica del escaneo
  sync.ts            motor de sincronizacion y reconciliacion
  reloj.ts           HLC persistido
apps/web/          la aplicacion
  estilos/           tokens y hoja base
  datos/             arranque del dispositivo y contexto de sesion
  componentes/       marco, etiqueta de bandeja, estado de sincronizacion
  pantallas/         ingreso, areas, sin acceso
seeds/             generador determinista del inventario de prueba
docs/              decisiones de arquitectura
```

La regla de dependencias es una sola: `core` no importa nada de la capa de
datos ni de la interfaz. Las flechas apuntan siempre hacia adentro. Cuando se
agregue Dexie o React, el dominio no se entera.

## Lo que ya funciona

- Las 11 transiciones de la pieza, con guardas de rol, de maleta y de estado.
- Congelamiento por conflicto de sincronizacion y resolucion manual.
- Reproduccion de una pieza desde su historial de eventos (auditoria).
- Reloj logico hibrido que no retrocede aunque el celular tenga la hora mal.
- Matriz de precios con piso de provincia y bloqueo por precio aleatorio.
- Inventario semilla reproducible con invariantes verificadas.
- Escaneo atomico: reloj, evento, pieza y cola en una sola transaccion.
- Guarda contra el rebote del lector HID.
- Cola de salida con reintento exponencial disperso y cuarentena de rechazos.
- Sincronizacion idempotente que no pisa escaneos locales sin enviar.
- Deteccion de conflicto que congela la pieza y abre el caso de la Coordinadora.
- Ingreso con credencial local, bloqueo por intentos y sesion que caduca.
- Ruteo por rol: el menu y la guardia de ruta leen la misma matriz.
- Estado de sincronizacion visible en todo momento.

## Lo que sigue

Rebanada 2, catalogo e ingreso de piezas al inventario, y rebanada 3, el armado
de maleta con el lector fisico. Al terminar la sexta, cierre y valorizacion, el
flujo de negocio queda completo de punta a punta.

Falta ademas el servidor. El motor de sincronizacion habla contra la interfaz
`Transporte`, asi que se puede implementar sobre Supabase sin tocar la capa de
datos ni el dominio.
