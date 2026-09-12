Brief de Producto

# App de Inventario Médico / Quirúrgico — Prototipo

_Preparado para el equipo de desarrollo. Cliente: Crearcos / Área de instrumentación quirúrgica._

# 1\. Contexto y problema actual

Los doctores solicitan instrumentos quirúrgicos para operar. Un auxiliar de la empresa arma una "maleta" con el instrumental disponible para el doctor, ingresando cada implemento de forma manual. Luego, durante la cirugía, se registran los códigos de lo efectivamente utilizado, y con eso se genera la factura.

Problemas que origina el proceso actual:

-   Proceso lento de ingreso de mercadería.
-   Pérdida de piezas por parte de los auxiliares/instrumentistas.
-   Facturación manual, propensa a error.

# 2\. Objetivo del prototipo

Digitalizar el armado de la maleta quirúrgica mediante escaneo de código de barras/QR, controlando cada pieza individualmente, generando automáticamente la base de la factura, y funcionando en todo momento sin depender de internet.

# 3\. Alcance de este prototipo

Flujo completo end-to-end: gestión de usuarios y roles, inventario, armado de maleta, ciclo de vida del instrumental, precios por institución, y facturación.

# 4\. Roles de usuario

| Rol                            | Función principal                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Administrador                  | Gestiona usuarios (alta/baja/reseteo de contraseña) y catálogo de inventario. No requiere programador para dar de alta personal nuevo.           |
| Auxiliar / Instrumentista      | Arma maletas, escanea salida de mercadería, cierra operación.                                                                                    |
| Coordinadora de instrumentista | Responsable de todos los equipos e insumos. Administra su propia bodega (lo que no vuelve a bodega central) y resuelve conflictos de inventario. |
| Contable                       | Valida instrumentistas freelance (acceso limitado por link durante la cirugía). Gestiona la facturación final.                                   |
| Supervisor                     | Pantalla de solo notificación / lectura general del estado del sistema.                                                                          |

_Nota: los instrumentistas freelance se validan con un enlace de conexión limitado, solo activo durante la cirugía en la que participan._

# 5\. Modelo de códigos e inventario

## 5.1 Instrumental (activo fijo)

Cada unidad de instrumental (ej. una tijera, un separador) tiene un código único e irrepetible. Este código no expira y sirve para el control y la contabilización del instrumental como activo fijo de la empresa.

## 5.2 Insumos (consumibles)

Los insumos vienen con un código QR en el empaque (packing) del proveedor — este código nunca se ha probado en producción. El insumo individual no puede marcarse por su tamaño; solo el empaque puede llevar código. Esto debe validarse técnicamente con el equipo de desarrollo (lectura del QR de fábrica) antes de construir sobre este supuesto.

## 5.3 Cajas / Kits

Una caja/kit (ej. bisturí + gasa + tornillo) es una unidad "padre" que contiene unidades "hijas", cada una con su propio código. Al escanear la caja, el sistema despliega sus componentes para que el auxiliar seleccione únicamente lo efectivamente usado por el doctor.

# 6\. Ciclo de vida del instrumental (reprocesamiento)

El instrumental no expira. Se puede reesterilizar ("reprocesar") un número indefinido de veces.

-   Si el instrumento SE USA en cirugía → se factura.
-   Si el instrumento NO SE USA → se reprocesa (reesteriliza) y puede reutilizarse indefinidamente, sin límite de veces.
-   Tras la cirugía, la pieza puede volver a la bodega central, o quedarse en la "maleta bodega" asignada al instrumentista de la empresa (lo que se usa con frecuencia no siempre regresa a bodega central).
-   Una misma pieza puede aparecer en varias maletas distintas dentro de la misma semana, si salió, no se usó, y volvió a salir.

Implicación para el sistema: cada pieza necesita un estado (ej. en bodega central / en bodega del instrumentista / en maleta activa / en cirugía / en reprocesamiento) que se actualice en cada escaneo, para dar trazabilidad completa y evitar asumir que una pieza "desaparece" del inventario al salir.

# 7\. Modelo de precios

El precio no depende del médico, sino de la institución (hospital) a la que se presta el servicio. Existen hasta 4 precios posibles por producto:

| Tipo de precio         | Definición                                                     |
| ---------------------- | -------------------------------------------------------------- |
| Precio base            | Costo del producto.                                            |
| Precio habitual        | Costo + 10%.                                                   |
| Precio provincia       | Costo + 20%, aplica si el servicio es fuera de la ciudad base. |
| Precio nota de crédito | Costo + 30%.                                                   |

Existen además casos excepcionales de precio "aleatorio" (negociación puntual y única), que requieren aprobación de gerencia antes de aplicarse.

# 8\. Flujo de la operación (nota de venta → factura)

1.  La maleta sale de bodega: se genera un registro tipo "nota de venta", pero todavía SIN precio ni institución/hospital asignados (aún no se sabe qué se usará ni en qué hospital se factura).
2.  Durante la cirugía, el instrumentista escanea lo efectivamente utilizado.
3.  Al regresar la maleta, se factura solo lo que se usó, y en este punto se asigna el hospital (y por tanto el nivel de precio correspondiente: habitual, provincia, o nota de crédito).
4.  Lo que no se usó se marca para reprocesamiento y vuelve a bodega central o a la bodega del instrumentista, según corresponda.

# 9\. Funcionamiento offline y sincronización

-   La app debe funcionar en todo momento sin conexión a internet (armado de maleta, escaneo, cálculo de totales).
-   Arquitectura recomendada: PWA (Progressive Web App) offline-first, con base de datos local en cada dispositivo (celular y PC) y sincronización en segundo plano contra un servidor central cuando haya conexión disponible.
-   Cada escaneo debe guardarse de inmediato en el dispositivo local — ningún dato debe perderse ante un corte de luz o caída del sistema.
-   Manejo de conflictos: si el mismo código aparece escaneado en dos maletas abiertas a la vez (por desincronización entre dispositivos offline), el sistema debe marcarlo como conflicto al sincronizar y notificar a la Coordinadora de instrumentista para resolverlo manualmente — no se espera que este caso ocurra en operación normal, ya que cada pieza tiene un estado único.

# 10\. Requisitos de hardware e interfaz

-   Lector físico de código de barras/QR (no cámara del celular).
-   La app debe verse y funcionar correctamente tanto en celular como en PC.
-   Acceso mediante usuario y contraseña.
-   Panel de administración de usuarios autoservicio: el Administrador debe poder crear usuarios y contraseñas sin intervención de un programador.

# 11\. Puntos abiertos — a validar con el equipo de desarrollo

1.  Validar técnicamente la lectura del QR de fábrica en el empaque de los insumos (nunca se ha probado).
2.  Definir el detalle exacto de los estados de una pieza (bodega central / bodega instrumentista / en maleta / en cirugía / en reprocesamiento) y sus transiciones.
3.  Definir el proceso de aprobación de gerencia para precios "aleatorios" (¿quién aprueba, en qué momento, dentro de la misma app o fuera de ella?).
4.  Definir el mecanismo exacto de validación y expiración del link de conexión limitado para instrumentistas freelance.
5.  Definir el detalle de las notificaciones que ve el rol Supervisor.
