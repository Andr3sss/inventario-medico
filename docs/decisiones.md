# Decisiones de arquitectura

Cada regla de aqui existe porque su ausencia produce un tipo concreto de dano.
Cuando aparezca la tentacion de romper alguna por conveniencia, este archivo es
el recordatorio del costo.

## 1. Ningun cambio de estado se escribe directo

Prohibido asignar `pieza.estado` desde un componente o desde un repositorio.
Todo pasa por `aplicarEvento()`, que es una funcion pura y devuelve una pieza
nueva.

Si alguien salta esta regla una sola vez, la trazabilidad se rompe en silencio:
la pieza queda en un estado que ningun evento explica y nadie se entera hasta
que un auditor pregunta donde esta una tijera.

## 2. Los identificadores se generan en el cliente

UUIDv7 en el dispositivo, nunca autoincremento del servidor. Un auxiliar tiene
que poder armar una maleta completa sin internet y que esos identificadores
sigan siendo validos cuando sincronice tres horas despues.

## 3. El orden nunca depende del reloj del dispositivo

Los celulares de los instrumentistas van a tener la hora mal. Ordenar eventos
por `Date.now()` produce historias imposibles, como una pieza usada antes de
salir de bodega. El reloj logico hibrido (`eventos/hlc.ts`) es la unica fuente
de orden, y nunca retrocede aunque el reloj del sistema si lo haga.

El corolario es que el dominio jamas lee la hora por su cuenta. El tiempo se
inyecta como parametro, y hay una regla de ESLint que rechaza `new Date()` y
`Date.now()` dentro de `core`.

## 4. Toda operacion de red es idempotente

El servidor deduplica por `eventoId`, nunca por posicion en el lote. Reenviar el
mismo lote diez veces produce el mismo resultado. En una red hospitalaria
intermitente esto no es una optimizacion, es supervivencia.

## 5. Nada se borra fisicamente

Baja logica mas evento. Una fila borrada en un dispositivo offline es un dato
que reaparece como fantasma al sincronizar.

## 6. El dinero se guarda en centavos enteros

`0.1 + 0.2` no es `0.3` en punto flotante. Con cuatro niveles de precio y
facturas emitidas desde el celular, un centavo de deriva por linea se convierte
en una diferencia contable que nadie puede explicar tres meses despues. El tipo
`Centavos` rechaza decimales en tiempo de ejecucion y el redondeo se hace con
aritmetica entera, mitad hacia arriba.

## 7. Errores como valor, no como excepcion

`Resultado<T, E>` en lugar de `throw`. Un `throw` no atrapado deja la
transaccion de IndexedDB a medias y el escaneo se pierde sin que el auxiliar lo
note. Devolviendo ok/fallo, el compilador obliga a decidir que hacer con el
error antes de tocar la base local.

## 8. Identificadores marcados

Codigo de pieza, id de maleta, id de hospital y SKU son todos texto. Confundir
dos de ellos produce corrupcion de inventario silenciosa. Los tipos marcados
hacen que el compilador rechace la confusion antes de compilar.

## 9. Una pieza en conflicto queda congelada

Cuando el servidor detecta que la misma pieza fue reclamada por dos maletas, la
pieza pasa a `EN_CONFLICTO` y no acepta ningun evento salvo la resolucion manual
de la Coordinadora. Sin este estado, un error de sincronizacion se arrastra a
las siguientes tres cirugias.

La resolucion incluye la opcion "etiqueta duplicada" a proposito. En la practica
la causa habitual no es la desincronizacion sino que dos piezas fisicas quedaron
con el mismo codigo, y si el sistema solo ofrece elegir una maleta, la
Coordinadora esta obligada a mentirle a la base de datos.

## 10. FACTURADA no es terminal para el instrumental

El brief dice que lo usado se factura y lo no usado se reprocesa, pero una
tijera usada tambien se reesteriliza. Por eso `CONFIRMAR_FACTURA` ramifica segun
el tipo: un insumo pasa a `CONSUMIDA` y sale del inventario, el instrumental
pasa a `FACTURADA` y de ahi vuelve a reprocesamiento. Sin esta bifurcacion, el
activo fijo desapareceria del inventario despues de su primera cirugia.

## 11. Provincia es un piso, no un reemplazo

Un hospital fuera de la ciudad base paga al menos precio provincia. Si ademas
esta configurado con nota de credito, paga el mayor de los dos. Tomar el nivel
de provincia como reemplazo haria facturar por debajo de lo esperado en los
casos combinados.

## 12. Un precio aleatorio pendiente bloquea, no cae al precio habitual

Si una excepcion de precio esta pendiente de aprobacion de gerencia, la linea
devuelve el valor negociado marcado como bloqueante. Si en cambio cayera al
precio habitual, el Contable podria emitir la factura sin notar que gerencia
nunca aprobo nada.

## 13. Los datos de prueba son reproducibles

El generador usa una semilla fija. Con `Math.random()` cada desarrollador
probaria contra un inventario distinto y un error no se podria reproducir.
`npm run seed` regenera exactamente las mismas 221 piezas y verifica sus
invariantes antes de escribir el archivo.

## 14. El escaneo escribe cuatro cosas en una sola transaccion

Reloj logico, evento, pieza y cola de salida se escriben dentro de la misma
transaccion de IndexedDB. O quedan las cuatro o no queda ninguna.

Si se corta la luz a mitad del escaneo, el auxiliar ve que no paso nada y vuelve
a escanear. La alternativa, escribir por partes, produce piezas movidas sin
evento que las explique, y eso no se puede auditar despues.

Cuidado al modificar `registrarEvento`: dentro de una transaccion de Dexie solo
se pueden esperar promesas de Dexie. Un `await fetch(...)` o cualquier promesa
ajena hace que la transaccion se cierre antes de tiempo y las escrituras se
pierdan sin error visible.

## 15. La confirmacion visual va despues de que el dato este en disco

La interfaz no muestra el visto verde hasta que la transaccion confirma. Un
escaneo optimista que despues falla deja al auxiliar creyendo que la pieza esta
cargada cuando no lo esta.

## 16. Los lectores HID rebotan

Un lector fisico a veces emite dos veces la misma lectura. Sin guarda, el
segundo disparo produce un evento perfectamente valido pero falso. Se ignora una
lectura repetida del mismo codigo y del mismo tipo dentro de 400 ms.

## 17. La cola solo se vacia con confirmacion explicita del servidor

Un fallo de red reprograma el reintento y no borra nada. Un rechazo definitivo
del servidor tampoco descarta: el evento sale de la cola y queda en cuarentena
en la tabla de fallidos, con su motivo y su contenido completo. Un dato perdido
en silencio es peor que un dato que alguien tiene que revisar.

## 18. Los cambios del servidor no pisan piezas con escaneos pendientes

Si una pieza tiene eventos locales sin enviar, el estado que baja del servidor
se omite. Pisarla borraria escaneos que el servidor todavia no vio. Esa pieza se
reconcilia en la vuelta siguiente, cuando su cola ya este vacia.

## 19. Reintento exponencial con dispersion

El retraso crece 2s, 4s, 8s hasta un techo de cinco minutos, y se le suma una
dispersion aleatoria. Sin la dispersion, veinte dispositivos que perdieron la red
en el mismo apagon vuelven a golpear el servidor exactamente en el mismo
instante.

## 20. SISTEMA es un rol, no una persona

Marcar una pieza en conflicto es una accion del motor de sincronizacion, no del
auxiliar que tenia la sesion abierta. El rol SISTEMA existe para no atribuirle a
una persona algo que nunca ejecuto, y es el unico autorizado a emitir
`CONFLICTO_SYNC`.

## 21. Se pide persistencia del almacenamiento al iniciar sesion

`navigator.storage.persist()` en el arranque. Sin esto, Safari y algunos Android
desalojan IndexedDB por presion de espacio o por inactividad, y con ello una
maleta entera. Cuando el navegador no concede la persistencia, la app tiene que
avisarlo en pantalla en vez de seguir como si nada.

## 22. La misma matriz decide el menu y decide el acceso

`areasDe(rol)` dibuja la navegacion y `puedeAcceder(rol, area)` protege la ruta,
y las dos leen la misma tabla. Si el menu se construyera con una lista y la
validacion con otra, tarde o temprano una ruta quedaria alcanzable escribiendo
la direccion a mano.

Esa matriz vive en el nucleo, no en la interfaz, porque es politica de negocio y
tiene que poder probarse sin navegador.

## 23. La credencial vive en el dispositivo, con su costo asumido

La app funciona sin internet, asi que la contrasena se verifica localmente
contra un derivado PBKDF2 con sal por usuario. El costo es real: quien robe el
equipo puede intentar romper el hash sin el limite que impondria un servidor.

Se compensa con tres cosas: iteraciones altas, bloqueo de cinco minutos tras
cinco intentos fallidos, y sesiones que caducan en vez de quedar abiertas para
siempre. Cuando entre la autenticacion contra el servidor, la verificacion local
queda como camino de respaldo para el quirofano, no como el camino principal.

## 24. El mensaje de error no distingue entre usuario inexistente y clave mala

Los dos casos devuelven el mismo texto, y ademas se deriva el hash aunque el
usuario no exista, para que el tiempo de respuesta tampoco delate cual de los
dos fallo. La comparacion del hash es de tiempo constante por la misma razon.

## 25. La sesion del instrumentista externo dura menos

Seis horas contra doce del personal de planta. El brief pide que el acceso del
freelance viva solo durante su cirugia, y mientras no exista el link temporal de
la PoC 4, una vigencia mas corta es la aproximacion honesta.

## 26. Las pantallas sin construir no muestran datos falsos

Cada area todavia vacia dice que va a vivir ahi y en que rebanada, y no enseña
tablas de mentira. Una pantalla con datos inventados hace que el cliente valide
algo que no existe, y despues reclama funciones que nadie prometio.

## 27. El color es estado, nunca adorno

La paleta tiene cinco tonos de trabajo mas dos de señal. El ambar aparece solo
cuando algo esta bloqueado o pendiente de enviar, y el azul solo para transito.
Ningun elemento toma color por gusto.

Por lo mismo, el estado activo del menu no se distingue solo por el fondo, lleva
tambien una barra lateral y peso tipografico: en una pantalla con brillo de
quirofano y guantes puestos, un cambio de tono solo no alcanza.

## 28. Tipografia elegida para que no se confundan los codigos

Atkinson Hyperlegible para la interfaz, disenada para separar caracteres que se
parecen, y IBM Plex Mono para todo codigo de pieza. Un codigo como INS-4471 se
dicta en voz alta y se teclea con prisa, y confundir un cero con una O es un
error que termina en la maleta equivocada.

Ambas van empaquetadas en la app, no cargadas desde un CDN, porque la app tiene
que verse igual sin internet.

## 29. El estado de sincronizacion esta siempre visible

La barra lateral resume la salud completa del dispositivo y abre un diagnostico
para cualquier rol autenticado. No basta contar escaneos pendientes: tambien se
consideran cuarentena, errores del inbox, ultimo intento, PUSH, PULL, cursor y
conexion. De ese estado depende si el usuario puede cerrar el equipo y no puede
quedar escondido detras de un menu.

## 30. La maleta es una entidad con su propia maquina de estados, espejo de la de Pieza

`maletas/maquina.ts` repite a proposito la forma de `estados/maquina.ts`:
mismo patron de evento puro, mismo `Resultado<T,E>`, mismos nombres de campo.
Antes de esto, "el estado de la maleta" no existia como dato: se hubiera
tenido que inferir contando los estados de sus piezas, y esa inferencia es
ambigua (¿una maleta con piezas en `EN_MALETA_ACTIVA` y otras ya
`USADA_PENDIENTE_VALORACION` esta "en cirugia" o "regresando"?). Sin una
maquina propia, cada pantalla que necesitara ese estado tendria que
reinventar la misma logica de inferencia, y dos pantallas la reinventarian
distinto.

## 31. Pieza y maleta conservan el mismo historial autoritativo en cada dispositivo

El servidor publica cada `EVENTO_DOMINIO` dentro del flujo normal de cambios.
El cliente valida el contrato del evento y lo proyecta por UUID en `eventos` o
`eventosMaleta`; una repeticion es idempotente y una colision con contenido
distinto queda en el inbox como error, sin sobrescribir la evidencia local.
Los historiales se ordenan siempre por HLC y no por el reloj de pared.

Dexie v6 elimina los marcadores `CONFLICTO_SYNC` que versiones anteriores
fabricaban solo en el dispositivo afectado. El estado de conflicto se aplica de
inmediato, pero la evidencia visible del historial procede del evento central
canonico recibido por PULL, para que todos los dispositivos converjan.
La migracion reinicia una vez el cursor para recuperar, en paginas de 100
commits, eventos que un cliente anterior hubiera ignorado o que el PULL
freelance anterior no hubiera entregado.

## 32. Un codigo corto no es "los primeros N caracteres" ni "los ultimos N caracteres" de un UUID

`codigoCortoDesde` (identificadores.ts) pliega con XOR los cuatro bloques de
32 bits del UUIDv7 completo en vez de recortar una porcion. Se probaron las
dos versiones ingenuas y las dos colisionaron escribiendo las pruebas de
`maletas.ts`:

- Los primeros 8 caracteres son el timestamp de grano grueso: casi no cambian
  entre dos maletas creadas segundos aparte.
- Los ultimos 8 (la cola aleatoria) tampoco alcanzan si la fuente de azar es
  un generador simple como un LCG: sus bits bajos estan correlacionados entre
  llamadas consecutivas, una debilidad conocida de los LCG, y con `AZAR_FIJO`
  (el generador determinista de las pruebas) volvio a colisionar despues de
  unas pocas decenas de creaciones.

El pliegue usa el UUID entero -tiempo y azar- y no depende de que una parte
especifica tenga buena entropia. `identificadores.test.ts` deja una prueba de
regresion con 2000 creaciones seguidas para que esto no se rompa en silencio.

## 33. El escaneo dentro de una maleta distingue "la operacion no tenia sentido" de "el resultado es un estado esperable"

`escanearArmado`, `retirarDeArmado` y `escanearUso` (maletas.ts) devuelven
`fallo(...)` solo cuando la maleta no existe o ya no admite la operacion.
Cualquier cosa relacionada con la pieza en si -codigo inexistente, rebote del
lector, rol sin permiso, transicion invalida- vuelve como `ok(RespuestaEscaneo)`
con un campo `codigo`. La razon es de UX tanto como de arquitectura: un
auxiliar escaneando decenas de piezas por minuto no esta en un flujo de "error
de sistema" cuando el lector rebota o cuando prueba un codigo que no existe;
esta en el flujo normal del trabajo. Tratar eso como una excepcion obligaria a
Codex a envolver cada escaneo en manejo de errores en vez de un simple switch
sobre `codigo`.

## 34. El alta manual de catalogo/pieza no genera un evento de trazabilidad

`crearProducto` y `registrarPieza` (inventario.ts) escriben directo con
`db.catalogo.put`/`db.piezas.put`, sin pasar por `aplicarEvento` ni por
`escribirEventoPieza`. No es una excepcion a la regla 1 ("ningun cambio de
estado se escribe directo"): esa regla protege una _transicion_ de una pieza
que ya existe, y aqui no hay una pieza previa cuyo estado explicar. Es la
primera fila. El primer evento real de esa pieza (`ESCANEO_ARMADO`, etc.) si
pasa por la maquina de estados como cualquier otra.

El campo `hlc` de una pieza recien registrada usa el mismo marcador de
"genesis" que ya usa la semilla (`000000000000000:00000:...`), para que
cualquier evento futuro ordene despues sin ambiguedad y sin tener que inventar
un HLC real para un momento que no corresponde a ningun evento.

## 35. Hospitales vive junto a Usuarios en la navegacion del Administrador

Punto que estaba abierto en el contrato (seccion 11): se agrego el area
`hospitales` a la matriz de `permisos.ts`, visible solo para
`ADMINISTRADOR`, junto a `usuarios` e `inventario`. Motivo: las tres son
pantallas de autoservicio sobre datos maestros (personas, catalogo,
instituciones), no pantallas operativas del dia a dia como maletas o
cirugia -encajan mejor ahi que como un area nueva de primer nivel o escondida
dentro de Inventario, que ya tiene su propia navegacion interna (piezas,
trazabilidad, kits)-.

La pantalla real todavia no existe: `Hospitales.tsx` hoy es un marcador de
posicion (decision 26) para que el switch de `Area.tsx` compile mientras
Codex construye la version definitiva contra `listarHospitales`/
`guardarHospital`, que ya estan probados.

## 36. Aprueba el Administrador, no un rol "Gerencia" nuevo

Punto abierto del brief (§11.3): "quien aprueba, en que momento, dentro de la
app o fuera de ella". Decidido con el usuario: aprueba el Administrador,
dentro de la app (`excepciones.ts`). No se agrega un sexto rol al modelo de 5
posiciones del brief solo para esto.

Quien puede _proponer_ una excepcion (`proponerExcepcionPrecio`) es distinto
de quien la _aprueba_: Contable o Administrador registran la negociacion,
solo Administrador decide. Toda excepcion nace `PENDIENTE` sin importar quien
la cree -incluso si la crea el propio Administrador-, para que la aprobacion
quede como un paso separado y auditable en vez de implicito en el alta.

## 37. El link freelance vive atado a la maleta, y lo genera Contable

Punto abierto del brief (§11.4). Decidido con el usuario: el token expira
cuando la maleta llega a un estado terminal (`CERRADA`/`CANCELADA`), no a una
hora fija de reloj -asi se acerca a "solo activo durante la cirugia en la que
participan" sin necesitar un proceso en segundo plano que revoque sesiones
activas-. La sesion que se abre al redimirlo si tiene un techo de tiempo
(reusa `VIGENCIA_FREELANCE_MS`, 6h) como salvaguarda si nadie cierra la
maleta.

Quien lo genera: el brief (§4) asigna explicitamente "valida instrumentistas
freelance" al rol **Contable**, no a la Coordinadora. La primera version de
esta decision (discutida con el usuario) nombraba a la Coordinadora por
error -se corrigio antes de escribir el codigo, `generarTokenFreelance` exige
`CONTABLE` o `ADMINISTRADOR`-.

La identidad de quien entra por el link es efimera (`freelance-<token>`), no
crea una fila en `usuarios`: nada en el resto del sistema resuelve
autorizacion consultando esa tabla, siempre es por `sobre.rol` del evento, asi
que no hace falta una cuenta previa para que los eventos que firma sean
validos.

## 38. El Supervisor ve tres senales agregadas, no pantallas propias

Punto abierto del brief (§11.5). Decidido con el usuario: conflictos
abiertos, maletas que llevan mas de 8 horas fuera de bodega (`salioEn`), y
facturas en borrador con alguna linea bloqueada por aprobacion pendiente
(`notificaciones.ts`). Las 8 horas son un default documentado, no un numero
del brief -si Crearcos define un umbral distinto por jornada real, es un
parametro de `obtenerNotificaciones`, no un cambio de codigo-.

No existe una tabla de notificaciones ni un mecanismo de push: es una lectura
agregada sobre datos que ya existian, coherente con que el rol Supervisor es
"pantalla de solo notificacion / lectura general" (brief §4), sin escritura.

## 39. Resolver nombres es una lectura abierta, distinta de administrar usuarios

`listarUsuariosBasico` (usuarios.ts) es la unica funcion de ese modulo sin
gating de rol, a proposito: `listarUsuarios` protege una _accion_
administrativa (ver quien esta bloqueado, con cuantos intentos fallidos),
mientras que id+nombre+rol no es informacion que valga la pena esconder de
otro rol autenticado -ya vive sin cifrar en el mismo dispositivo, en la misma
base local-. Existe para cerrar dos huecos reales: la Coordinadora escribiendo
un `usuarioId` a mano para mandar una pieza a una bodega de instrumentista
(sin poder ver la lista de instrumentistas activos), y varias pantallas
mostrando el `usuarioId` crudo donde antes no habia forma de resolverlo a un
nombre. Excluye inactivos por defecto: ofrecer una cuenta desactivada como
destino no tiene sentido.

`contarPiezasPorEstado` (inventario.ts) existe porque Inventario.tsx y
Tablero.tsx pedian el total de cada estado abriendo 5 llamadas paginadas
independientes (`listarPiezas(db, {estado}, {porPagina:1})` x5) solo para leer
`.total` de cada una. Una sola pasada sobre `db.piezas.toArray()` resuelve los
10 conteos a la vez. Los conteos son siempre globales, sin filtro: los
resumenes que los usan muestran la distribucion completa del inventario, no
una vista filtrada.

## 40. Un rechazo terminal se revisa y exporta, pero no se reenvia a ciegas

El servidor deduplica una operacion por UUID y conserva su resultado terminal.
Reponer exactamente la misma operacion rechazada solo devolveria el mismo
rechazo; inventar un UUID nuevo sin volver a validar la transicion podria
duplicar una accion fisica o crear otro conflicto. Por eso el panel ofrece tres
acciones seguras: sincronizar de nuevo lo que aun es recuperable, navegar a la
entidad para corregir el dato mediante su flujo de dominio y exportar toda la
evidencia para soporte. La fila de `fallidos` nunca se borra automaticamente.

La interfaz muestra como maximo cien detalles recientes para no degradarse con
una cuarentena grande, pero presenta los conteos totales. Dexie v7 indexa la
fecha del rechazo y el momento de creacion de cada operacion; una cola se alerta
con tres intentos o quince minutos, y un PULL se considera atrasado tras cinco
minutos con conexion disponible.

## 41. El PIN offline autoriza un dispositivo por una ventana acotada

El primer acceso siempre requiere Supabase Auth. Después de validar la identidad
y el perfil activo, el usuario crea un PIN local distinto de su contraseña
central. El PIN tiene exactamente ocho dígitos, rechaza secuencias y repeticiones
débiles, y solo se guarda como PBKDF2-SHA256 con sal individual y 310.000
iteraciones. La credencial queda ligada al usuario y al UUID lógico estable del
dispositivo. Este vínculo evita usar solo la fila de credencial en otra
instalación, pero no es atestación de hardware: quien pueda clonar todo el
almacenamiento del navegador también copiaría el UUID. En producción debe
complementarse con control del equipo, perfil de navegador y cifrado de disco.

La autorización dura siete días y cada sesión offline hasta doce horas, sin
superar la vigencia restante. Cinco errores bloquean quince minutos. Una
sincronización central correcta renueva la ventana; un error de transporte no
la renueva ni la revoca. Al recuperar red, `auth.getUser()` confirma que el token
pertenece al mismo usuario y `perfiles` confirma que continúa activo. Un perfil
inactivo o eliminado revoca la credencial y una bitácora local de solo agregado
registra enrolamiento, intentos, expiración, revalidación y revocación.

Las operaciones creadas antes de recibir una revocación conservan para siempre
su actor original. No se sincronizan con una identidad distinta ni se
reatribuyen en el cliente: permanecen pendientes o pasan a cuarentena según la
respuesta autoritativa, desde donde soporte puede exportar la evidencia y tomar
una decisión explícita. Esta política técnica necesita firma de negocio y
seguridad antes de producción.

## 42. El escenario multidispositivo usa Supabase local desechable en CI

Una prueba con un transporte simulado no demuestra que Edge Functions,
PostgreSQL, los commits ni las restricciones reales converjan. La prueba de
fase 5 crea dos réplicas IndexedDB auxiliares y réplicas separadas para
Coordinadora y Contable contra el stack local reconstruido desde migraciones.
Ejecuta los órdenes A→B y B→A y pierde deliberadamente la primera respuesta
después de que el servidor confirma, para demostrar que reiniciar y repetir el
mismo UUID es idempotente.

El proceso queda bloqueado por dos defensas: requiere
`CREARCOS_E2E_SUPABASE_LOCAL=true` y la URL debe ser HTTP local en el puerto 54321. De esta forma el servicio privilegiado usado para preparar y comprobar
el escenario no puede apuntar por error a staging o producción. La suite
normal omite estos casos; el job dedicado de CI levanta y destruye su propia
instancia.

Los cursores de servidor se conservan como texto para no perder precisión,
pero el inbox los ordena con `BigInt`. Ordenarlos lexicográficamente habría
proyectado el commit 10 antes que el 9 y podía dejar una instantánea antigua
como resultado final.

## Pendiente de decidir

- Tamaño óptimo del lote de sincronización (el límite defensivo actual es 200),
  a medir con el volumen real de una jornada de Crearcos.
- Politica de purga del log de eventos ya sincronizados en dispositivos con poco
  espacio.
- Si el marcado fisico sobrevive al autoclave, atado al resultado de la PoC 3.
  Si no sobrevive, el modelo de codigo unico por pieza hay que replantearlo.
- Validar tecnicamente la lectura del QR de fabrica en insumos (PoC 4, punto
  abierto 1 del brief) — condiciona si el modelo de "codigo en el empaque"
  aguanta produccion.
- Si el umbral de 8 horas de la decision 38 (maleta demorada) es el correcto
  para una jornada real de Crearcos, o si debe configurarse por hospital.
