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

La barra superior muestra cuantos escaneos no han salido del dispositivo. De ese
numero depende si el auxiliar puede apagar el equipo o no, y no puede quedar
escondido detras de un menu.

## Pendiente de decidir

- Si la autenticacion contra el servidor sera Supabase Auth o propia. Mientras
  tanto el prototipo usa credenciales locales sembradas, que se eliminan cuando
  eso se defina.

- Tamano optimo del lote de sincronizacion, a medir con el volumen real de una
  jornada de Crearcos.
- Politica de purga del log de eventos ya sincronizados en dispositivos con poco
  espacio.
- Formato exacto del token del instrumentista freelance, atado al resultado de
  la PoC 4.
- Si el marcado fisico sobrevive al autoclave, atado al resultado de la PoC 3.
  Si no sobrevive, el modelo de codigo unico por pieza hay que replantearlo.
