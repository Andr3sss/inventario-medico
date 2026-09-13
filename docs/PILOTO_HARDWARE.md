# Protocolo de piloto de códigos, lectores y etiquetas

**Estado:** listo para ejecución en campo.

**Objetivo:** cerrar P0-06 con evidencia reproducible, códigos y lectores reales y aceptación firmada de Operaciones.

**Alcance:** lectores físicos que se comportan como teclado HID; no valida la cámara del teléfono ni autoriza materiales o procesos de esterilización.

## 1. Condiciones obligatorias

Antes de iniciar deben quedar escritos en el acta:

- responsable del piloto y representante de Operaciones;
- responsable de reprocesamiento o control de infecciones;
- modelos, números de serie y configuración de cada lector;
- dispositivos, sistema operativo, navegador, versión y distribución de teclado que se admitirán en producción;
- clases de código que se usarán: instrumento, kit y consumible;
- umbrales de aceptación acordados antes de observar los resultados;
- cantidad de ciclos de limpieza o esterilización que representa la vida útil esperada del marcado.

El piloto se ejecutará en staging o en una instalación de demostración aislada, con identificadores de prueba y sin datos de pacientes. Las pruebas de doble lectura y desconexión que generan eventos de negocio no se harán sobre inventario productivo.

Ninguna etiqueta, adhesivo, tinta o soporte entrará a un autoclave o proceso de limpieza por iniciativa del equipo de software. El material, método de colocación, parámetros del ciclo y manipulación deben estar aprobados previamente por el fabricante y por el responsable clínico correspondiente.

## 2. Definiciones de medición

- **Lectura exacta:** el valor normalizado recibido coincide completamente con el valor impreso esperado.
- **Primer intento:** una sola activación del lector, sin reorientar la pieza ni volver a disparar.
- **Falso positivo:** la aplicación acepta un identificador diferente del impreso o lo atribuye a otra entidad.
- **Duplicado de negocio:** una activación física produce más de un evento o movimiento válido.
- **Ráfaga compatible:** la cadencia de teclas es consistente con un lector HID. Es una señal diagnóstica, no una prueba de identidad del hardware.
- **Lectura adversa:** lectura ejecutada con guantes, baja iluminación o después del ciclo de limpieza definido.
- **Código ambiguo:** el mismo valor aparece en dos unidades que el sistema necesita rastrear por separado, o su semántica unidad/lote/empaque no puede demostrarse.

Las métricas se calculan así:

```text
tasa de primer intento = lecturas exactas al primer intento / intentos totales × 100
tasa de lectura final  = códigos leídos exactamente dentro de 3 intentos / muestras × 100
tasa de falsos positivos = falsos positivos / intentos totales × 100
tiempo por elemento = fin del registro confirmado − inicio de manipulación del elemento
```

## 3. Preparación de evidencia

Crear una carpeta de evidencia por ejecución sin incluir secretos ni datos personales:

```text
evidencias/hardware/AAAA-MM-DD/
  00-acta.md
  01-inventario-equipos.csv
  02-semantica-qr.csv
  03-diagnostico-hid-<equipo>-<navegador>.csv
  04-flujo-negocio.csv
  05-durabilidad.csv
  06-tiempos.csv
  fotos/
```

El CSV exportado por **Probar lector sin registrar** conserva valor esperado, valor crudo, sufijo, coincidencia y cadencia. Su diagnóstico nunca llama al flujo de inventario. Las fotografías deben evitar pacientes, documentos clínicos, credenciales y códigos productivos sensibles.

Registrar el hash SHA-256 de cada archivo entregado junto con el acta final. La evidencia real puede almacenarse fuera de Git si contiene información operativa sensible; el repositorio solo necesita el acta depurada y los hashes.

## 4. Matriz mínima de muestras

La siguiente es una base mínima de piloto, no una validación estadística formal:

| Prueba                             | Mínimo por combinación soportada |
| ---------------------------------- | -------------------------------: |
| Lectura normal por clase de código |                      30 intentos |
| Lectura con baja iluminación       |                      20 intentos |
| Lectura con guantes                |                      20 intentos |
| Recuperación de foco               |                 10 por escenario |
| Emisión duplicada intencional      |                  20 activaciones |
| Trabajo sin conexión y reinicio    |                      20 lecturas |
| Comparación manual frente a lector |          30 elementos por método |

Una **combinación soportada** es lector + dispositivo + sistema operativo + navegador/PWA + distribución de teclado. No se puede extrapolar el resultado de Windows/Edge a Android/Chrome ni de un modelo de lector a otro sin aprobación explícita.

Usar al menos tres valores distintos por formato de código, incluidos caracteres que revelen problemas de teclado: letras, números, guion, barra y cualquier símbolo realmente usado. Incluir códigos cortos y el máximo largo permitido por la operación.

## 5. Prueba A: semántica del QR de fábrica

Esta prueba se ejecuta por cada referencia y proveedor de consumible.

1. Conservar empaque, unidad y etiquetas visibles; registrar proveedor, referencia, lote y fecha de vencimiento sin asumir qué codifica el QR.
2. Escanear tres unidades del mismo empaque.
3. Escanear tres empaques distintos del mismo lote.
4. Escanear unidades o empaques de al menos tres lotes distintos.
5. Comparar el valor crudo, no solo el texto mostrado por otra aplicación.
6. Repetir la muestra con otro lote si el valor incluye separadores o datos GS1 que necesiten interpretación.
7. Clasificar el código como `UNIDAD_UNICA`, `EMPAQUE_UNICO`, `LOTE`, `REFERENCIA`, `URL/DOCUMENTO` o `INDETERMINADO`.
8. Confirmar por documentación del proveedor la semántica observada.

Reglas de decisión:

- Si dos unidades que deben rastrearse individualmente comparten código, ese QR no puede usarse como identidad de pieza.
- Un código de lote o empaque solo puede incorporarse después de decidir si el inventario se modelará por cantidad/lote; no debe forzarse al modelo actual de pieza única.
- Un QR que contiene una URL no identifica necesariamente la unidad. Se debe analizar su contenido efectivo.
- Cualquier colisión o semántica indeterminada bloquea la referencia afectada.

## 6. Prueba B: compatibilidad del lector HID

Para cada combinación soportada:

1. Abrir un flujo con escáner y seleccionar **Probar lector sin registrar**.
2. Escribir manualmente el código impreso esperado.
3. Escanear la muestra sin editar el resultado.
4. Repetir con la configuración real de sufijo del lector: Enter o Tab.
5. Confirmar que el sufijo se registra y no desplaza el foco.
6. Repetir con cada distribución de teclado autorizada.
7. Cubrir los códigos con símbolos y longitudes extremas de la matriz.
8. Exportar el CSV antes de cambiar de combinación o cerrar/recargar la página.

Debe observarse:

- coincidencia exacta entre impreso y recibido;
- ausencia de caracteres agregados, omitidos o sustituidos;
- identificación correcta del sufijo;
- captura en ráfaga cuando se usa el lector y clasificación manual cuando se escribe lentamente;
- foco disponible para la lectura siguiente.

La aplicación acepta Enter y Tab y evita que Tab abandone el campo. La clasificación de cadencia no sustituye la inspección del modelo y configuración declarados en el acta.

## 7. Prueba C: foco, duplicados e integridad del flujo

Usar piezas de prueba conocidas y comprobar la bitácora después de cada bloque.

### Recuperación de foco

Ejecutar diez lecturas después de cada condición:

- registro anterior confirmado;
- aviso de resultado cerrado;
- cambio a otra ventana y regreso;
- pestaña oculta y nuevamente visible;
- apertura y cierre del diagnóstico;
- error de código inexistente;
- rechazo de una transición inválida.

La siguiente lectura debe entrar completa sin hacer clic en el campo. Si el usuario está escribiendo deliberadamente en otro control, el escáner no debe robarle el foco.

### Doble lectura

Configurar o accionar el lector para emitir dos veces el mismo código dentro de la ventana de 400 ms y repetir veinte veces. Para cada activación física debe existir como máximo un evento válido. Revisar tanto el resultado visual como la bitácora persistida; dos avisos iguales no son evidencia suficiente.

Después repetir el mismo código fuera de la ventana de rebote, cuando el estado de negocio ya cambió. El sistema debe responder según la transición vigente y nunca inventar un segundo movimiento válido.

### Desconexión y reinicio

1. Confirmar que el dispositivo está enrolado y que la sesión offline es válida.
2. Desconectar la red.
3. Registrar veinte lecturas representativas.
4. Cerrar y volver a abrir la PWA o navegador.
5. Comprobar que los movimientos y su actor siguen visibles localmente.
6. Reconectar y sincronizar.
7. Verificar una sola operación remota por acción física y ausencia de cuarentena inesperada.

## 8. Prueba D: baja iluminación y guantes

Repetir la matriz adversa sin modificar artificialmente la exposición después de ver el resultado. Registrar tipo/color de superficie, curvatura, distancia, ángulo, tipo de guante e iluminación aproximada si se dispone de luxómetro.

Un fallo debe clasificarse al menos como:

- marcado ilegible o con poco contraste;
- reflejo o curvatura;
- distancia/ángulo no ergonómico;
- lector incapaz de decodificar la simbología;
- problema de enfoque/captura de la aplicación;
- distribución o configuración de teclado;
- daño posterior a limpieza/esterilización.

## 9. Prueba E: durabilidad del marcado

El responsable clínico definirá los ciclos y puntos de inspección según el proceso realmente autorizado. Como guía, registrar línea base y después de 1, 5, 10 y 25 ciclos, siempre que esos puntos sean compatibles con la vida útil y el procedimiento del material.

En cada punto:

1. fotografiar el marcado con una referencia de escala;
2. inspeccionar desprendimiento, bordes, corrosión, decoloración y residuos;
3. hacer al menos diez lecturas normales y diez adversas;
4. registrar primer intento, lectura final, falsos positivos y tiempo;
5. confirmar que el marcado no interfiere con limpieza, inspección, empaque o uso;
6. detener la prueba ante cualquier riesgo material o clínico.

El marcado solo aprueba si sigue siendo único, legible y seguro durante toda la vida útil acordada. Que el lector pueda decodificar una etiqueta parcialmente desprendida no demuestra que sea clínicamente aceptable.

## 10. Prueba F: velocidad frente al registro manual

Usar la misma secuencia aleatoria de al menos treinta elementos para ambos métodos y alternar cuál método se ejecuta primero para reducir el sesgo de aprendizaje.

Registrar por elemento:

- tiempo hasta confirmación visible;
- reintentos;
- correcciones manuales;
- código equivocado;
- movimiento duplicado;
- necesidad de tocar teclado/pantalla.

Comparar mediana, percentil 90 y errores, no solo el promedio. El representante de Operaciones debe aceptar por escrito el umbral. Como punto de partida recomendado, el lector no debería aumentar la mediana frente al método actual, no debe aumentar los errores y debe eliminar la transcripción manual del identificador.

## 11. Criterios de aprobación

P0-06 solo queda cerrada cuando todos estos puntos están firmados:

- [ ] La semántica de cada QR de fábrica está demostrada y no existe ambigüedad de identidad.
- [ ] Hay cero falsos positivos y cero duplicados de negocio en toda la ejecución.
- [ ] Cada combinación declarada como soportada supera su matriz.
- [ ] Operaciones fijó y aceptó la tasa de primer intento. Referencia recomendada: al menos 99 % en condición normal y 95 % en condición adversa.
- [ ] El material autorizado conserva lectura e integridad durante los ciclos acordados.
- [ ] La velocidad y ergonomía son aceptadas frente al proceso manual.
- [ ] No quedan defectos críticos ni altos abiertos.
- [ ] Las desviaciones, referencias excluidas y combinaciones no soportadas están documentadas.
- [ ] Firman Operaciones, responsable clínico/reprocesamiento y responsable técnico.

Una tasa alta no compensa un falso positivo, una identidad ambigua o un material no autorizado. Cualquiera de esos tres resultados bloquea el cierre.

## 12. Resultado técnico esperado

Completar [ACTA_PILOTO_HARDWARE.md](./ACTA_PILOTO_HARDWARE.md), adjuntar los archivos de evidencia y registrar en el informe de pendientes una de estas decisiones:

- `APROBADO`: todas las combinaciones y referencias declaradas superan los criterios;
- `APROBADO_CON_RESTRICCIONES`: se excluyen explícitamente equipos, formatos o referencias sin comprometer los flujos admitidos;
- `RECHAZADO`: existe ambigüedad, falso positivo, duplicación, material inseguro o tasa no aceptada.
