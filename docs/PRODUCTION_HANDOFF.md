# Handoff a producción

Este procedimiento elimina datos ficticios. No ejecutarlo sin backup probado.

## Lista de entrega

1. Detener escrituras de demostración y esperar que todos los dispositivos
   queden sincronizados.
2. Crear un backup/PITR o export verificable y anotar su referencia.
3. Ejecutar `npm run verificar`, `npm run build`, pruebas PostgreSQL y advisors.
   No continuar mientras exista una advertencia de seguridad; en particular,
   habilitar **Leaked Password Protection** en Supabase Auth.
4. Iniciar sesión como Administrador DEMO y solicitar un desafío mediante la
   Edge Function `prepare-production`, incluyendo la referencia del backup.
5. Ejecutar primero `soloSimular=true` con la frase exacta
   `ELIMINAR DATOS DEMO`; revisar todos los conteos.
6. Repetir con `soloSimular=false`. PostgreSQL borra el grafo de negocio demo
   dentro de una transacción y cambia a `PURGANDO`.
7. La Edge Function elimina las identidades demo con Admin API, registra cada
   resultado y solo entonces llama `confirmar_purga_auth`.
8. Verificar `LISTO_BOOTSTRAP`, cero usuarios demo en Auth y cero filas demo en
   hospitales, productos, piezas, maletas, eventos, facturas, precios,
   conflictos, reprocesamientos, dispositivos y tokens.
9. Definir las variables `PRODUCTION_*` y ejecutar:

   ```bash
   npm run supabase:bootstrap:production
   ```

   El script invita al primer Administrador real, crea su perfil y llama
   `activar_produccion`. Esa transición crea la bodega central productiva de
   forma atómica; no se copia ninguna bodega de demostración.

10. Confirmar `ciclo_vida = PRODUCCION`, login, primera alta real, sync desde dos
    dispositivos y restricciones RLS.
11. Rotar secretos utilizados por el operador y retirar cualquier archivo de
    entorno temporal.

## Protecciones

El desafío dura diez minutos, almacena solo hash del token y queda ligado al
Administrador DEMO y a la referencia del backup. Se exige frase explícita,
service role server-side y ciclo `DEMO`. La operación real se serializa con
advisory lock y deja auditoría privada. Después de la confirmación:

- `reset_demo_habilitado = false`;
- cambia `epoca_handoff`, invalidando dispositivos anteriores;
- la función de purge rechaza nuevas llamadas;
- `activar_produccion` no tiene transición inversa.

La eliminación de Auth y PostgreSQL no puede ser una única transacción entre
sistemas. Por eso existe la saga `PURGANDO`: si Auth falla, el sistema no queda
operativo a medias y la Edge Function puede reintentar los usuarios pendientes.

## Recuperación

Antes de `activar_produccion`, corregir el paso fallido y reanudar la saga. Una
restauración posterior requiere el backup; el sistema no promete deshacer una
purga ni una activación productiva sin él.
