# Datos de demostración

## Principio

El seed es explícito. `supabase/config.toml` tiene `db.seed.enabled = false` y
la aplicación web nunca siembra por encontrar una base vacía. El fallback local
solo existe cuando `VITE_ENABLE_LOCAL_DEMO=true`; debe permanecer `false` en
despliegues compartidos.

## Carga central

Definir las variables del bloque demo de `.env.example` en el proceso del
operador, sin guardarlas en Git, y ejecutar:

```bash
npm run supabase:bootstrap:demo
```

El script usa Supabase Admin API para crear la identidad demo, llama
`provisionar_perfil` y luego `cargar_datos_demo`. La función crea un
`lotes_semilla`, dos hospitales ficticios, cuatro productos y cuatro piezas,
con `origen = DEMO`, además de un commit inicial para las réplicas.

Los dominios `.invalid` están reservados y evitan confundir direcciones demo
con personas reales. La contraseña se proporciona únicamente en tiempo de
ejecución y no aparece en archivos del repositorio.

## Identificación

Toda fila demo de negocio incluye `lote_semilla_id`. Las tablas derivadas
propagan el lote mediante el contexto transaccional. Esto permite contar y
eliminar exclusivamente el grafo demo sin un `TRUNCATE CASCADE` indiscriminado.

## Regla irreversible

Cuando `configuracion_sistema.ciclo_vida = PRODUCCION`, la carga demo es
rechazada en servidor. Una base productiva vacía no vuelve a sembrarse.
