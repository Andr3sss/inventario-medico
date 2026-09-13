# Despliegue, promoción y rollback

Este runbook es la fuente operativa para desplegar Crearcos Inventario. El
repositorio automatiza las verificaciones, migraciones, Edge Functions,
frontend y smoke tests; los proyectos, dominios, credenciales y aprobaciones
pertenecen a la organización y se configuran una sola vez en las plataformas.

## 1. Topología obligatoria

| Entorno    | Rama o referencia                               | Supabase                    | Web                         | Datos permitidos       |
| ---------- | ----------------------------------------------- | --------------------------- | --------------------------- | ---------------------- |
| Desarrollo | rama de trabajo                                 | instancia local de Supabase | `localhost:5173`            | ficticios              |
| Staging    | `develop` o ejecución manual sobre el candidato | proyecto alojado exclusivo  | subdominio HTTPS de staging | ficticios anonimizados |
| Producción | etiqueta exacta `v<package.version>`            | proyecto alojado exclusivo  | dominio HTTPS productivo    | reales conciliados     |

Staging y producción no pueden compartir `SUPABASE_PROJECT_ID`, contraseña de
base, claves Auth ni usuarios. Se puede usar un solo proyecto de Cloudflare
Pages: la rama `staging` produce el preview estable y `main` la publicación
productiva. Sus hosts, variables y proyectos Supabase siguen siendo distintos.

## 2. Preparación de plataformas

1. Crear dos proyectos Supabase, uno para staging y otro para producción. No
   enlazar el proyecto productivo desde un equipo de desarrollo habitual.
2. Crear el proyecto Cloudflare Pages mediante Direct Upload y seleccionar
   `main` como rama productiva.
3. Asociar primero los hosts en **Workers & Pages > proyecto > Custom domains**.
   Para un subdominio externo, crear después un CNAME hacia
   `<proyecto>.pages.dev`. Esperar certificado TLS activo antes de continuar.
4. En Supabase Auth configurar para cada entorno:
   - Site URL: el `PUBLIC_APP_URL` de ese entorno.
   - Redirect permitido: exactamente
     `<PUBLIC_APP_URL>/actualizar-contrasena`.
   - SMTP, política de contraseña y protección contra filtradas según
     `docs/AUTH_SECURITY_RUNBOOK.md`.
5. Crear los GitHub Environments `staging` y `production`. En `production`,
   exigir revisores y bloquear el acceso salvo desde etiquetas protegidas.

## 3. Variables y secretos de GitHub

Copiar la estructura de `.env.staging.example` y `.env.production.example`.
Cada GitHub Environment debe contener estas **variables**:

| Variable                   | Regla                                          |
| -------------------------- | ---------------------------------------------- |
| `PUBLIC_APP_URL`           | origen HTTPS, sin ruta ni `/` final            |
| `VITE_SUPABASE_URL`        | origen HTTPS del proyecto Supabase del entorno |
| `AUTH_REDIRECT_URL`        | `<PUBLIC_APP_URL>/actualizar-contrasena`       |
| `ALLOWED_ORIGINS`          | sólo `PUBLIC_APP_URL`; sin comodines           |
| `SUPABASE_PROJECT_ID`      | referencia de 20 letras del proyecto exclusivo |
| `CLOUDFLARE_PAGES_PROJECT` | nombre del proyecto Pages                      |

Y estos **secretos**:

| Secreto                         | Alcance mínimo                                                      |
| ------------------------------- | ------------------------------------------------------------------- |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | clave publicable del entorno; nunca `service_role` ni `sb_secret_*` |
| `SUPABASE_ACCESS_TOKEN`         | cuenta capaz de desplegar sólo los proyectos necesarios             |
| `SUPABASE_DB_PASSWORD`          | contraseña de la base del entorno                                   |
| `CLOUDFLARE_ACCOUNT_ID`         | cuenta propietaria del proyecto Pages                               |
| `CLOUDFLARE_API_TOKEN`          | permiso Account / Cloudflare Pages / Edit                           |

Antes del primer despliegue, copiar esos valores temporalmente a un archivo
local ignorado y ejecutar `npm run deployment:validate`. El comando sólo
muestra los hosts, nunca las claves.

## 4. Despliegue a staging

1. Integrar el candidato en `develop` o abrir **Actions > Desplegar staging >
   Run workflow** sobre el commit candidato.
2. El workflow, en este orden:
   - valida configuración y secretos;
   - ejecuta escáner de secretos, lint, tipos y pruebas;
   - levanta una base local desechable, aplica todas las migraciones, ejecuta
     pgTAP y los escenarios E2E multidispositivo;
   - hace `db push --dry-run` contra staging y luego aplica sólo migraciones
     pendientes, sin seed;
   - fija CORS/redirect de Edge y despliega las cuatro funciones;
   - compila el frontend con versión y commit, conserva el artefacto 30 días,
     despliega la rama `staging` y ejecuta smoke remoto positivo y negativo.
3. Guardar el enlace de la ejecución exitosa y completar
   `docs/RELEASE_UAT.md`. No crear la etiqueta si UAT tiene un defecto crítico.

Nunca se valida una migración por primera vez en producción. Tampoco se usa
`db reset` remoto ni `--include-seed` en staging o producción.

## 5. Promoción a producción

Con staging exitoso y UAT aprobado para el mismo SHA:

```bash
VERSION=$(node -p "require('./package.json').version")
git tag -a "v$VERSION" -m "Crearcos Inventario v$VERSION"
git push origin "v$VERSION"
```

`Desplegar produccion` rechaza la etiqueta si no coincide con `package.json` o
si GitHub no encuentra un deployment exitoso de ese mismo commit en el
Environment `staging`. Luego repite toda la verificación y solicita la
aprobación de los revisores del Environment `production` antes de tocarlo.

Al terminar, registrar etiqueta, SHA, ejecución, deployment de Pages,
migraciones aplicadas, responsable y resultado del smoke en el acta de entrega.

## 6. Smoke automatizado

`npm run deployment:smoke` comprueba:

- raíz y rutas profundas del SPA;
- CSP, HSTS, anti-iframe, MIME sniffing, referrer y permisos del navegador;
- assets inmutables, `sw.js` no cacheable y marcador de caché sustituido;
- salud de Supabase Auth;
- preflight permitido para el host exacto y rechazo de un origen hostil en las
  cuatro Edge Functions.

Si falla cualquier comprobación, el deployment no se considera aprobado.

## 7. Rollback

### Sólo frontend

1. Identificar en Cloudflare un deployment productivo anterior y exitoso.
2. Ejecutar **Actions > Revertir frontend de produccion**.
3. Introducir su `deployment_id` y la confirmación literal
   `REVERTIR-PRODUCCION`.
4. El workflow usa la API oficial de rollback y repite el smoke.

### Base y Edge Functions

Las migraciones publicadas son hacia adelante: nunca se improvisa un `DOWN` ni
se restaura sólo la base mientras clientes escriben. Ante un defecto:

1. detener la promoción y, si procede, revertir primero el frontend;
2. deshabilitar el flujo afectado o publicar una migración compensatoria probada
   primero en staging;
3. restaurar un proyecto completo sólo bajo el runbook de respaldo, con ventana
   de corte, pérdida de datos aceptada según RPO y conciliación posterior;
4. volver a desplegar la versión compatible de Edge Functions y ejecutar smoke.

El rollback productivo debe conservar evidencia y un responsable. El proceso
de respaldo/restauración y RPO/RTO se cierra en P0-09.

## 8. Estado de preparación

El código y los workflows son reproducibles desde un clon limpio. El primer
despliegue real permanece pendiente hasta que la organización proporcione los
dos proyectos Supabase, el proyecto Pages, DNS, secretos, revisores y aprobación
UAT. No se debe marcar P0-08 como cerrado únicamente por existir la automatización.
