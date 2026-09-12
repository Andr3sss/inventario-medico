# Informe de carencias y trabajo pendiente para finalizar Crearcos Inventario

**Fecha de corte:** 12 de septiembre de 2026
**Fuente principal de requisitos:** `inventario.md`  
**Alcance de la revisión:** aplicación web/PWA, lógica de dominio, persistencia local, sincronización, PostgreSQL/Supabase, Edge Functions, seguridad, pruebas, operación y preparación para producción.

## 1. Conclusión ejecutiva

El proyecto tiene una base técnica avanzada y buena parte del flujo de negocio ya está implementada. Existen el modelo central de inventario, piezas y maletas; la trazabilidad local; los ciclos de reprocesamiento; precios; facturación; conflictos; roles; acceso freelance; funcionamiento PWA; almacenamiento local durable; sincronización con Supabase; RLS forzado; datos de demostración y procedimientos de entrega a producción.

Sin embargo, **el sistema todavía no debe considerarse terminado ni listo para producción**. Los principales motivos son:

1. La trazabilidad histórica entre dispositivos ya está cubierta técnicamente, pero falta demostrarla en el escenario E2E y en dispositivos físicos.
2. El diagnóstico real de sincronización y la cuarentena ya están implementados; falta validarlos contra staging con fallos reales de red y proyección.
3. No existe una prueba automatizada, repetible y completa del caso crítico de dos dispositivos trabajando sin conexión y generando un conflicto real.
4. El desbloqueo offline ya está implementado para dispositivos previamente enrolados; falta la aprobación formal de la política y su validación en los equipos objetivo.
5. Faltan validaciones de campo con códigos reales, etiquetas esterilizables, lectores físicos y dispositivos objetivo.
6. El proyecto Supabase sigue en modo `DEMO`, con el reinicio de demostración habilitado, y todavía no se ha ejecutado una entrega controlada a producción.
7. La configuración, seguridad, despliegue, respaldo, monitoreo, documentación operativa y aceptación de usuarios finales aún no están cerrados.
8. La rama de trabajo ya conserva puntos de transferencia completos, pero aún falta una versión candidata etiquetada y verificada desde un clon limpio.

Por tanto, el estado correcto es **prototipo funcional avanzado, pendiente de endurecimiento, validación integral y puesta en producción controlada**.

## 2. Evidencia y estado verificado

### 2.1 Elementos que ya están cubiertos

No deben contarse nuevamente como trabajo faltante los siguientes componentes, aunque algunos necesiten pruebas o mejoras:

- Esquema PostgreSQL normalizado con productos, piezas físicas, maletas, contenido histórico de maletas, reprocesamientos, precios, facturas, conflictos, dispositivos y sincronización.
- Identificadores UUID, restricciones, claves foráneas, índices y valores monetarios almacenados en centavos enteros.
- Historial inmutable para eventos de dominio y facturas.
- Operaciones de sincronización idempotentes, entrega al menos una vez, cursor monotónico y registro de evidencias de conflicto.
- Autenticación central con Supabase Auth, perfiles, roles y políticas RLS.
- Las 27 tablas públicas examinadas tienen RLS habilitado y forzado y al menos una política.
- Roles y rutas para Administrador, Auxiliar/Instrumentista, Coordinadora, Contable y Supervisor.
- Acceso freelance mediante enlace limitado y autenticación propia de alcance restringido.
- Inventario por pieza, productos simples y kits, preparación y cierre de maletas, reprocesamiento, precios, excepciones, facturación y resolución de conflictos.
- Persistencia local con IndexedDB/Dexie, cola de salida, bandeja de entrada y réplica local.
- Aplicación PWA con `service worker` y caché del shell principal.
- Datos de demostración, purga de la demostración y documentación de entrega a producción.
- Cuatro Edge Functions desplegadas y activas: `sync`, `prepare-production`, `administration` y `freelance-access`.
- Migraciones locales y remotas coincidentes al momento de la revisión.
- Verificación actual del frontend y paquetes: lint, comprobación de tipos,
  compilación y 220 pruebas TypeScript aprobadas. Los 2 escenarios E2E con
  Supabase se ejecutan únicamente en el job de infraestructura local de CI.
- Auditoría actual de dependencias npm sin vulnerabilidades conocidas.
- Suite pgTAP existente con 41 aserciones aprobadas contra la base remota.

### 2.2 Estado actual del entorno Supabase

- Ciclo de vida: `DEMO`.
- Reinicio de demostración: habilitado.
- Datos presentes: 2 usuarios Auth, 2 perfiles, 1 dispositivo, 2 hospitales, 4 productos y 4 piezas.
- Sin operación real acumulada: 0 maletas, 0 facturas, 0 eventos y 0 conflictos en el corte revisado.
- 18 migraciones remotas aplicadas y coincidentes con el repositorio.
- Las funciones protegidas rechazan solicitudes anónimas y el acceso freelance rechaza tokens inválidos.
- El asesor de seguridad mantiene una advertencia: protección contra contraseñas filtradas deshabilitada.
- El asesor de rendimiento informa 17 índices no utilizados. Por ahora es información, no evidencia suficiente para eliminarlos: el entorno tiene muy pocos datos y ninguna carga representativa.

### 2.3 Limitación de la verificación actual

Docker no está instalado en el entorno revisado. Por eso no se ha demostrado todavía que una base Supabase completamente vacía pueda reconstruirse localmente, ejecutar todas las migraciones y superar las pruebas desde cero. Las verificaciones SQL remotas realizadas son útiles, pero no sustituyen un `supabase db reset` reproducible en CI o en un entorno limpio.

## 3. Matriz de cumplimiento frente a `inventario.md`

| Requisito                                                  | Estado                  | Carencia para considerarlo cerrado                                                                                                                                                   |
| ---------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Usuarios, contraseña y roles                               | Parcial                 | El PIN offline y la revocación eventual están cubiertos técnicamente; faltan aprobación formal, recuperación y política productiva de contraseña.                                    |
| Alta autónoma de usuarios por Administrador                | Parcial                 | Existe administración central, pero falta el ciclo de vida operativo completo: invitación/entrega segura, cambio obligatorio de contraseña, recuperación y desactivación comprobada. |
| Inventario con código único por instrumento                | Cubierto técnicamente   | Falta validar etiquetas y lectura real después de uso, limpieza y esterilización.                                                                                                    |
| Consumibles con QR de fábrica                              | Pendiente de validación | Debe comprobarse si el código identifica una unidad, lote o empaque; el modelo actual supone una pieza física identificable de forma única.                                          |
| Productos simples y kits padre/hijos                       | Parcial                 | La relación física está soportada; falta validar y, si el negocio lo exige, completar administración de composición, armado, desarmado y versionado de kits.                         |
| Lectura del código padre y selección de componentes usados | Parcial                 | El flujo existe conceptualmente; falta aceptación de campo con lector físico, velocidad y ergonomía reales.                                                                          |
| Preparación y salida de maleta sin hospital ni precio      | Cubierto técnicamente   | Falta prueba integral en campo y definición del documento operativo si se necesita impresión o exportación de la nota.                                                               |
| Registro de piezas usadas/no usadas                        | Cubierto técnicamente   | Falta UAT con instrumentistas y confirmación formal de estados/transiciones.                                                                                                         |
| Reprocesamiento indefinido                                 | Cubierto técnicamente   | Falta prueba de ciclos múltiples, historial entre dispositivos y conciliación con inventario físico.                                                                                 |
| Bodega central y bodega personal                           | Cubierto técnicamente   | Falta prueba de concurrencia real y recuperación de conflictos en dos o más dispositivos.                                                                                            |
| Precio base, habitual, otra provincia y nota de crédito    | Cubierto técnicamente   | Falta configurar y auditar la ciudad base de producción y validar los cálculos con casos reales.                                                                                     |
| Precio excepcional con aprobación de gerencia              | Parcial                 | El rol aprobador se ha mapeado a Administrador; falta aprobación formal del negocio y prueba completa de solicitud, aprobación, rechazo y auditoría.                                 |
| Facturación al cerrar procedimiento                        | Parcial                 | Existe el registro/emisión; falta acordar si “facturación final” incluye PDF, impresión, exportación, integración contable o tributaria.                                             |
| Funcionamiento permanente sin internet                     | Cubierto técnicamente   | Un usuario previamente enrolado puede reingresar con PIN durante siete días; el primer acceso requiere conexión y falta validar la política y UX en dispositivos reales.             |
| Sincronización y resolución de conflictos                  | Cubierto técnicamente   | El historial remoto y la visibilidad de fallos están implementados; falta la prueba E2E repetible de dos dispositivos contra una base reconstruida.                                  |
| Uso móvil y PC                                             | Parcial                 | La interfaz es adaptable, pero falta matriz de navegadores/dispositivos, accesibilidad y aceptación real.                                                                            |
| Lector físico QR/código de barras                          | Pendiente               | No hay evidencia de pruebas con modelos de lector objetivo ni configuración de sufijo, teclado, foco y lecturas repetidas.                                                           |
| Supervisor y notificaciones                                | Parcial                 | Hay agregados de conflictos, maletas demoradas y facturas bloqueadas; falta definir el alcance final, frecuencia, confirmación, escalamiento e historial.                            |
| Acceso freelance mediante enlace limitado                  | Parcial                 | Está implementado; falta aceptación de vigencia exacta, revocación, expiración, reutilización y procedimiento de soporte.                                                            |

## 4. Bloqueos prioritarios antes de producción

### P0-01. Completar la trazabilidad histórica entre dispositivos

> **Estado de implementación (11 de septiembre de 2026):** resuelto técnicamente
> en la rama de trabajo. El cliente proyecta `EVENTO_DOMINIO` de piezas y maletas de forma
> idempotente, Dexie v6 ordena ambos historiales por HLC y el PULL freelance
> incluye únicamente los eventos de su maleta. Antes del cierre productivo aún
> deben aplicarse la migración en un entorno no productivo y ejecutar la prueba
> E2E con dos dispositivos físicos.

**Carencia:** `historialDePieza` y el historial de maletas consultan eventos almacenados localmente. La sincronización replica estados como pieza, maleta, producto, factura y conflicto, pero el registro central de eventos de dominio no forma parte de la proyección normal de cambios hacia todos los dispositivos. Un segundo dispositivo puede conocer el estado actual sin poder reconstruir el historial completo que se originó en el primero.

**Riesgo:** incumplir el requisito de trazabilidad completa, dificultar auditorías y mostrar historiales distintos según el dispositivo.

**Trabajo necesario:**

- Incorporar eventos de dominio al protocolo de cambios o crear un endpoint paginado de historial por pieza/maleta.
- Proyectar eventos remotos en IndexedDB con deduplicación e idempotencia.
- Definir paginación, retención y descarga inicial para evitar transferencias ilimitadas.
- Probar eventos creados en A y consultados en B, tanto en línea como después de periodos sin conexión.

**Criterio de cierre:** dos dispositivos distintos muestran el mismo historial ordenado, completo e inmutable después de sincronizar, sin duplicados ni pérdidas.

### P0-02. Corregir el estado visible de sincronización y la gestión de rechazos

> **Estado de implementación (11 de septiembre de 2026):** resuelto técnicamente
> en la rama de trabajo. El estado visible combina conexión, PUSH/PULL, cursor,
> pendientes, cuarentena, inbox y último error; los rechazos pueden revisarse y
> exportarse sin borrarlos, y existen alertas locales de cola/PULL atrasados. La
> aceptación final requiere probar el panel contra staging y simular fallos
> reales de red y proyección en los dispositivos objetivo.

**Carencia:** el indicador actual se basa principalmente en el conteo de operaciones pendientes. Puede mostrar “Todo sincronizado” aunque haya operaciones archivadas como fallidas, errores al aplicar cambios de entrada o ninguna descarga reciente exitosa. No existe una pantalla operativa para revisar y remediar la cuarentena de operaciones rechazadas.

**Riesgo:** falsa sensación de seguridad y pérdida operativa no detectada por el usuario.

**Trabajo necesario:**

- Mostrar conexión, último envío exitoso, última descarga exitosa, cursor, pendientes, fallidas, entradas no aplicadas y último error.
- Crear una vista autorizada de operaciones rechazadas con motivo, entidad, fecha y acciones seguras de reintento, corrección o exportación.
- Evitar que “Todo sincronizado” aparezca si hay cuarentena, errores o nunca hubo una sincronización central exitosa.
- Añadir alertas para colas estancadas y dispositivos atrasados.

**Criterio de cierre:** cualquier operación que no haya llegado o no se haya aplicado es visible y accionable; el estado “sincronizado” solo aparece cuando no existe trabajo ni error pendiente.

### P0-03. Resolver la autenticación realmente sin conexión

> **Estado de implementación (12 de septiembre de 2026):** resuelto
> técnicamente en la rama de trabajo. El dispositivo se enrola únicamente tras
> una sesión Supabase válida; guarda un derivado PBKDF2 del PIN, limita la
> autorización a siete días, bloquea quince minutos después de cinco intentos y
> registra una bitácora local. La PWA permite desbloqueo offline, detiene el PUSH
> hasta revalidar con `auth.getUser()` y el perfil central, y revoca el acceso si
> recibe un perfil inactivo o eliminado. Los fallos transitorios de red no se
> interpretan como revocación. Falta la aprobación formal de negocio/seguridad y
> la validación de campo antes de cerrar el criterio productivo.

**Carencia:** el acceso central usa Supabase Auth y necesita red. Una sesión local permite continuar durante un periodo limitado, pero al vencer no existe un verificador offline seguro. Un usuario legítimo puede quedar bloqueado tras varias horas sin conexión.

**Riesgo:** incumplir el requisito de que el sistema funcione en todo momento sin internet. También existe el riesgo inverso: un usuario deshabilitado puede seguir operando localmente hasta la siguiente conexión.

**Decisión y trabajo necesarios:**

- Definir con el negocio y seguridad si se permitirá desbloqueo offline en dispositivos previamente enrolados.
- Si se permite, implementar credencial/PIN local protegido, vigencia, intentos, bloqueo, revocación eventual y registro de auditoría.
- Si no se permite, corregir el requisito y documentar explícitamente la ventana máxima de operación offline.
- Diseñar el comportamiento de operaciones creadas por un usuario revocado antes de que el dispositivo reciba la revocación.

**Criterio de cierre:** política aprobada, implementación probada tras vencimiento de sesión, reconexión segura y UX clara para revocación o credencial vencida.

**Política técnica implementada:** PIN local distinto de la contraseña central,
exactamente ocho dígitos no secuenciales ni excesivamente repetidos; derivación
PBKDF2-SHA256 con sal individual y 310.000 iteraciones; autorización de siete
días por usuario y dispositivo; sesiones de hasta doce horas sin superar la
vigencia restante; cinco intentos y bloqueo de quince minutos. La ventana se
renueva solo después de validación central. Una operación creada antes de
conocer una revocación conserva el actor original y queda pendiente o en
cuarentena según la decisión del servidor: nunca se reasigna silenciosamente a
otro usuario. La evidencia puede exportarse desde el diagnóstico de sync para
resolución administrativa.

### P0-04. Crear pruebas repetibles del escenario crítico multidispositivo

> **Estado de implementación (12 de septiembre de 2026):** resuelto
> técnicamente en la rama de trabajo. Una prueba E2E levanta cuatro réplicas
> IndexedDB aisladas (dos auxiliares, Coordinadora y Contable) contra una base
> Supabase reconstruida desde cero. Ejecuta ambos órdenes de reconexión,
> pérdida de respuesta después del commit, reinicio de la réplica, reintento
> idempotente, conflicto con dos candidatos, congelamiento, resolución,
> cierre, factura, emisión y convergencia de estado e historiales. GitHub
> Actions ejecuta primero pgTAP y después el escenario. La aceptación en
> equipos físicos continúa perteneciendo a P0-06, no a este cierre técnico.

**Carencia original:** existían pruebas unitarias y comprobaciones SQL, pero no una prueba end-to-end automatizada que reprodujera el flujo central del requisito: dos dispositivos sin conexión asignan la misma pieza, reinician, se conectan en distinto orden, generan evidencia, resuelven el conflicto y convergen.

**Trabajo necesario:**

- Automatizar al menos dos clientes con bases IndexedDB aisladas.
- Probar ambas órdenes de reconexión, reintentos, duplicados y caída/reinicio durante el envío.
- Verificar congelamiento, candidatos del conflicto, resolución por Coordinadora, factura e historial final.
- Ejecutar la prueba en CI con una base recién construida.

**Criterio de cierre:** el escenario pasa consistentemente desde un clon limpio y ambos clientes terminan con el mismo estado e historial.

### P0-05. Ampliar las pruebas de PostgreSQL, RLS y Edge Functions

**Carencia:** la suite pgTAP actual verifica principalmente existencia de tablas, activación de RLS, funciones y algunos privilegios. No prueba de forma suficiente la matriz de roles, restricciones, transiciones, cursores, concurrencia, facturas, precios, acceso freelance, purga o reinicio. No hay archivos de prueba para las Edge Functions.

**Trabajo necesario:**

- Añadir pruebas SQL de restricciones, transiciones, idempotencia, orden del cursor, no pérdida, congelamiento y resolución de conflictos.
- Probar RLS por cada rol y operación sensible, incluidos intentos negativos.
- Probar instantáneas e inmutabilidad de facturas y reevaluación de precios.
- Probar alcance, expiración, revocación y reutilización del acceso freelance.
- Añadir pruebas de Edge Functions para JWT, rol, CORS, tamaño/cuerpo inválido, errores, reintentos y compensación.
- Ejecutar `supabase db reset`, pruebas DB, pruebas Edge y detección de deriva en CI.

**Criterio de cierre:** una base vacía se reconstruye y supera automáticamente todas las pruebas de seguridad y comportamiento sin pasos manuales.

### P0-06. Validar hardware, etiquetas y flujo clínico real

**Carencia:** no se ha demostrado que los códigos y lectores funcionen con el material, empaque y entorno reales.

**Trabajo necesario:**

- Determinar qué representa el QR de fábrica de cada consumible: unidad, lote o empaque.
- Hacer una prueba de concepto de etiquetas o marcado que resistan limpieza y autoclave.
- Probar los lectores físicos elegidos en Windows, móvil y navegadores objetivo.
- Verificar distribución de teclado, sufijo Enter/Tab, foco, doble lectura, baja iluminación y uso con guantes.
- Medir la velocidad del proceso frente al registro manual actual.

**Criterio de cierre:** piloto firmado con códigos y lectores reales, sin ambigüedad de identidad y con una tasa de lectura aceptada por operaciones.

### P0-07. Endurecer autenticación y configuración de Supabase

**Carencia:** la protección de contraseñas filtradas está deshabilitada y no está cerrado el ciclo productivo de correo, recuperación, redirecciones, revocación y secretos.

**Trabajo necesario:**

- Activar la protección contra contraseñas filtradas en Supabase Auth.
- Configurar SMTP productivo, URL del sitio y redirecciones permitidas.
- Definir reglas de contraseña, recuperación, cambio obligatorio tras restablecimiento y decisión sobre MFA.
- Configurar orígenes CORS exactos, secretos de Edge Functions y rotación de claves.
- Probar desactivación de usuario, revocación de sesiones y dispositivos perdidos.

**Criterio de cierre:** no quedan advertencias de seguridad aplicables y los flujos Auth productivos pasan pruebas positivas y negativas.

### P0-08. Preparar despliegue web y separar entornos

**Carencia:** existe CI de verificación, pero no configuración ni flujo de despliegue productivo. La configuración local usa URLs de localhost y no hay evidencia de separación formal entre desarrollo, pruebas y producción.

**Trabajo necesario:**

- Crear entornos separados de desarrollo, staging y producción o una estrategia equivalente aprobada.
- Definir host HTTPS, DNS, variables `VITE_*`, URL y redirects de Auth, `ALLOWED_ORIGINS` y secretos.
- Añadir cabeceras de seguridad, política CSP y comportamiento de caché.
- Automatizar despliegue, migraciones controladas y smoke tests con posibilidad de rollback.
- Evitar probar nuevas migraciones directamente sobre el único proyecto destinado a producción.

**Criterio de cierre:** una versión etiquetada se despliega primero en staging, supera smoke/UAT y puede promoverse o revertirse de forma documentada.

### P0-09. Ejecutar respaldo, restauración y entrega a producción

**Carencia:** Supabase sigue en `DEMO`, con el reinicio habilitado y datos de demostración. No hay evidencia de un ensayo de restauración ni de una entrega final ejecutada.

**Trabajo necesario:**

- Configurar y verificar copias de seguridad/PITR según el plan contratado.
- Ejecutar al menos un ensayo de restauración y documentar RPO/RTO aceptados.
- Crear e invitar al administrador real y confirmar su acceso.
- Purgar la demostración, cargar maestros reales y deshabilitar irreversiblemente el reset de demo siguiendo el handoff.
- Preparar plan de corte, conciliación física y rollback.

**Criterio de cierre:** producción está fuera de modo demo, tiene responsables reales, datos conciliados, respaldo restaurable y acta de corte aprobada.

### P0-10. Consolidar una versión liberable en Git

**Carencia:** en el corte revisado hay 89 rutas sin consolidar: 43 modificadas y 46 no rastreadas. El historial tiene solo dos commits y no permite reproducir ni revisar claramente el estado actual.

**Trabajo necesario:**

- Revisar cada cambio y separar código, migraciones, pruebas y documentación en commits lógicos.
- Confirmar que no se incluyan secretos, residuos temporales o archivos locales.
- Abrir revisión de código, resolver observaciones y ejecutar CI desde un clon limpio.
- Etiquetar la versión candidata y mantener un registro de cambios.

**Criterio de cierre:** el árbol de trabajo de la versión queda limpio, revisado, reproducible y asociado a una etiqueta desplegable.

## 5. Carencias funcionales importantes

### P1-01. Acción directa para marcar una pieza extraviada

El dominio y SQL admiten `MARCAR_EXTRAVIADA`, pero la interfaz solo ofrece `EXTRAVIADA` como resultado de resolver un conflicto ya abierto. Falta una acción autorizada para que Coordinación registre una pérdida normal, con motivo, confirmación y trazabilidad, sin fabricar un conflicto previo.

### P1-02. Configuración operativa de ciudad base

La ciudad base se inicializa como Guayaquil y afecta el precio de otra provincia, pero no hay una administración visible para consultarla y cambiarla con auditoría. Debe establecerse explícitamente para producción y protegerse contra cambios accidentales que alteren cálculos.

### P1-03. Ciclo de vida completo de datos maestros

- Productos: existe creación central, pero falta edición controlada, desactivación y reactivación.
- Hospitales: falta una operación explícita y clara de desactivación/soft delete.
- Dispositivos: falta listado administrativo, nombre/propietario, última sincronización y revocación por pérdida o reemplazo.
- Inventario inicial: falta importación masiva validada y, si aplica, generación/impresión de etiquetas.
- Kits: debe decidirse si la composición de catálogo necesita administración, versiones y armado/desarmado masivo además de la relación física ya existente.

### P1-04. Cierre del alcance documental y contable

La aplicación conserva una base de factura y su estado. `inventario.md` no precisa si el cierre exige PDF, impresión, exportación, integración contable o integración tributaria. Esta decisión no puede inferirse: debe acordarse con Contabilidad y convertirse en criterio de aceptación. Si se requiere alguna salida, debe implementarse, versionarse y probarse.

### P1-05. Finalizar reglas de Supervisor y alertas

Actualmente se presentan conflictos, maletas demoradas más de ocho horas y facturas bloqueadas. Falta cerrar con el negocio:

- Umbral de demora y si debe ser configurable.
- Actualización manual, periódica, Realtime o push.
- Reconocimiento, asignación, escalamiento e historial de alertas.
- Alcance global cuando el dispositivo todavía no ha sincronizado.
- Notificaciones adicionales que el requisito dejó abiertas.

### P1-06. Formalizar reglas de acceso freelance

El acceso tiene expiración absoluta, sesiones de duración limitada e invalidación vinculada a la maleta. Aun así, deben aprobarse duración exacta, cantidad de usos, revocación de emergencia, reenvío, dispositivo permitido y procedimiento cuando el enlace se filtra o el teléfono cambia.

### P1-07. Aprobación formal de reglas de negocio

Se necesita firma de usuarios responsables sobre:

- Estados exactos de pieza, maleta, factura y reprocesamiento.
- Tratamiento de usados, no usados, faltantes y extraviados.
- Rol que representa a Gerencia para aprobar excepciones de precio.
- Prioridad de precio y comportamiento al cambiar hospital o provincia.
- Vigencia de enlaces freelance.
- Umbral y destinatarios de notificaciones.
- Aprobación formal de la política técnica ya implementada para un usuario revocado durante una jornada offline.

## 6. Calidad, operación y deuda técnica

### P2-01. Automatización CI/CD incompleta

La automatización actual comprueba dependencias, lint, tipos, pruebas
TypeScript y build. Desde la fase 5 también reconstruye Supabase desde cero,
ejecuta pgTAP y prueba el escenario E2E multidispositivo. Aún debe incorporar:

- Pruebas unitarias y negativas específicas de Edge Functions.
- Pruebas E2E de interfaz/PWA.
- Comparación de migraciones y tipos generados.
- Auditoría de dependencias.
- Despliegue a staging, smoke y promoción controlada.

### P2-02. Observabilidad y soporte

Faltan paneles, alertas y procedimientos para:

- Errores y latencia de Edge Functions.
- Errores PostgreSQL y presión de conexiones.
- Tasa de operaciones rechazadas y tamaño de colas.
- Dispositivos/cursos de sincronización atrasados.
- Conflictos sin resolver y facturas bloqueadas.
- Crecimiento de base de datos, almacenamiento local y fallos de respaldo.
- Diagnóstico, escalamiento, recuperación y comunicación de incidentes.

### P2-03. Retención, volumen y rendimiento

No está definida la retención o archivado de eventos, commits/cambios de sync, rechazos, accesos/sesiones freelance expirados y datos locales ya sincronizados. Tampoco se ha hecho una prueba de carga con volumen representativo.

Debe definirse y probarse:

- Retención legal y operativa sin romper la trazabilidad.
- Limpieza segura de registros técnicos y cachés locales.
- Tamaño de lote de sincronización —actualmente 200— y comportamiento ante semanas offline.
- Límites de IndexedDB, cuota llena, backpressure y recuperación.
- Planes `EXPLAIN` con datos reales y concurrencia del cursor global.
- Evaluación posterior de los 17 índices reportados como no utilizados; no eliminarlos basándose en la demo vacía.

### P2-04. Robustez PWA y navegadores

Falta comprobar instalación, actualización y recuperación de la PWA en la matriz real de equipos. El `service worker` usa una caché manual y no existe una experiencia visible de “actualización disponible”. Se deben probar:

- Chrome/Edge de escritorio y navegadores móviles acordados.
- Actualización de versión, rollback y caché obsoleta.
- Migraciones IndexedDB desde versiones anteriores.
- Cierre abrupto, reinicio del navegador/equipo y corte de energía.
- Denegación de persistencia, expulsión de almacenamiento y cuota llena.
- Reloj incorrecto, varias pestañas y dos sincronizaciones concurrentes.
- Accesibilidad, diseño adaptable y regresión visual.
- Compatibilidad de iconos de instalación en las plataformas seleccionadas.

### P2-05. Tamaño y carga del frontend

La compilación termina correctamente, pero advierte que el paquete JavaScript principal ronda 780 KB sin comprimir. Conviene dividir por rutas o funcionalidades y medir carga/actualización en conexiones móviles deficientes. No es un error funcional inmediato, pero sí un riesgo de despliegue y actualización en campo.

### P2-06. Interfaz incompleta o engañosa

- El botón visible “Buscar en el sistema” no tiene una acción implementada.
- Debe revisarse que ninguna otra acción visible sea decorativa o termine sin confirmación.
- Mensajes de modo local, último dato central y alcance de las notificaciones deben evitar afirmar una actualidad que no pueda demostrarse.

### P2-07. Documentación desactualizada

`docs/decisiones.md` conserva afirmaciones que ya no coinciden con el código, entre ellas que los eventos de maleta no se sincronizan, que no existe la pantalla de hospitales y descripciones antiguas del acceso freelance y credenciales locales. También existen comentarios de código que indican que la sincronización de usuarios sigue pendiente cuando ya hay administración central.

Debe realizarse una revisión completa de arquitectura, decisiones, configuración, recuperación, protocolos y cifras de pruebas. La versión de aplicación que se envía en operaciones está fijada manualmente como `0.1.0`, mientras el paquete declara `0.0.1`; debe provenir de una única fuente de versión de compilación.

## 7. Validación de negocio y entrega operativa

Además del desarrollo, para declarar el proyecto finalizado se requiere:

1. Cargar y validar usuarios, hospitales, catálogo, precios, piezas y relaciones de kits reales.
2. Conciliar el inventario físico con el inventario inicial del sistema.
3. Ejecutar UAT por cada rol con guiones y resultados firmados.
4. Ejecutar un piloto con al menos dos dispositivos, un lector real y periodos de desconexión.
5. Capacitar a Administrador, Instrumentistas, Coordinación, Contabilidad y Supervisión.
6. Entregar manuales de operación, recuperación, soporte y administración.
7. Definir propietario del dato, privacidad, retención y auditoría, incluso si no se almacena información de pacientes.
8. Preparar soporte de salida, responsables, canales, severidades y tiempos de respuesta.
9. Aprobar plan de corte, contingencia manual, rollback y conciliación posterior.

## 8. Orden recomendado para cerrar el proyecto

### Fase A. Estabilización y reproducibilidad

- Consolidar el repositorio y crear una versión candidata limpia.
- Instalar/preparar Supabase local o runner CI y demostrar reconstrucción desde cero.
- Ampliar pruebas SQL, RLS, Edge y E2E.
- Corregir trazabilidad remota y estado real de sincronización.

**Salida:** CI integral verde desde clon limpio y escenario multidispositivo aprobado.

### Fase B. Cierre de producto y campo

- Resolver la política de autenticación offline.
- Completar extravíos, dispositivos, maestros y configuraciones pendientes.
- Cerrar decisiones de precios, factura, freelance y notificaciones.
- Validar QR, etiquetas, lectores y ergonomía con usuarios reales.

**Salida:** reglas firmadas y piloto de campo sin defectos críticos.

### Fase C. Preparación operativa

- Separar entornos y desplegar staging.
- Endurecer Auth, secretos, CORS y cabeceras.
- Implementar monitoreo, retención, backups y runbooks.
- Ejecutar carga, seguridad, PWA, navegadores y restauración.

**Salida:** staging equivalente a producción, restaurable, observable y aprobado en UAT.

### Fase D. Corte productivo

- Crear responsables reales y verificar acceso.
- Respaldar, purgar demo, deshabilitar reset y cargar datos conciliados.
- Desplegar la versión etiquetada y ejecutar smoke/conciliación.
- Mantener soporte reforzado y criterio de rollback durante la estabilización.

**Salida:** acta de puesta en producción y aceptación final.

## 9. Definición verificable de “proyecto terminado”

El proyecto solo debería marcarse como terminado cuando se cumplan todos estos puntos:

- [ ] Cada requisito de `inventario.md` está implementado o formalmente redefinido y aprobado.
- [ ] El historial de una pieza o maleta es idéntico en todos los dispositivos sincronizados.
- [ ] Ningún error o rechazo de sync puede quedar oculto detrás de “Todo sincronizado”.
- [ ] La política de autenticación offline y revocación está aprobada y probada.
- [ ] El caso de dos dispositivos offline, conflicto, resolución y convergencia pasa automáticamente.
- [ ] Base vacía, migraciones, pgTAP, RLS, Edge, frontend y E2E pasan en CI.
- [ ] Las etiquetas, códigos de fábrica y lectores físicos pasan el piloto de campo.
- [ ] Todos los roles completan UAT con datos y flujos reales.
- [ ] Auth, SMTP, redirects, CORS, secretos, contraseñas y dispositivos están endurecidos.
- [ ] Desarrollo, staging y producción están separados y documentados.
- [ ] Existe despliegue y rollback reproducible de una versión etiquetada.
- [ ] Backups y restauración han sido ensayados; RPO/RTO están aceptados.
- [ ] Monitoreo, alertas, retención y procedimientos de incidentes están activos.
- [ ] El inventario inicial está conciliado físicamente.
- [ ] Supabase está fuera de `DEMO` y el reset de demo quedó deshabilitado tras autorización.
- [ ] Repositorio limpio, revisado, sin secretos y documentación actualizada.
- [ ] Responsables de negocio y técnicos firman la aceptación final.

## 10. Dictamen final

La arquitectura implementada permite continuar hacia producción sin rehacer el sistema, pero aún existe trabajo crítico de integridad distribuida, seguridad, validación física, pruebas, operación y liberación. La prioridad inmediata no debe ser añadir más pantallas, sino **demostrar que la información no se pierde, que todos los dispositivos convergen, que los errores son visibles y que el proceso funciona con usuarios, códigos, lectores y condiciones reales**.

Hasta completar los bloqueos P0 y la aceptación operativa, el modo `DEMO` debe mantenerse y no debe ejecutarse la transición irreversible a producción.
