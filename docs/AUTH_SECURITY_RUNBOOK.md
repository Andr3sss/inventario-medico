# Runbook de seguridad de Auth

Este documento separa lo garantizado por el repositorio de lo que debe
aplicarse y comprobarse en cada proyecto alojado de Supabase. Ningún checkbox
de la segunda categoría se presume completado por una migración.

## Controles implementados en el repositorio

- Contraseñas centrales de al menos 12 caracteres, con mayúscula, minúscula,
  número y símbolo en la configuración local y en la pantalla de cambio.
- Alta central con contraseña inicial asignada por el Administrador.
- Cambio manual de contraseña exclusivo del Administrador, confirmado tanto
  localmente como en el servidor mediante su PIN individual de ocho dígitos.
- Cinco PIN incorrectos bloquean la confirmación durante quince minutos; el
  cambio revoca concesiones offline y queda auditado sin almacenar secretos.
- No existe recuperación pública por correo ni rutas de restablecimiento.
- El acceso central usa correo y contraseña. La autenticación multifactor no
  forma parte del alcance funcional aprobado.
- RLS comprueba perfil activo y rol en cada operación. Las Edge Functions
  vuelven a validar el perfil antes de usar `service_role`.
- Desactivar un perfil invalida sus concesiones en `dispositivo_usuarios`; la
  Edge Function también bloquea la identidad de Auth. Reactivar nunca restaura
  automáticamente concesiones antiguas.
- Un dispositivo perdido puede retirarse desde Usuarios; la operación
  desactiva el dispositivo y todas sus concesiones de forma atómica.
- CORS solo refleja orígenes exactos permitidos. HTTP se acepta únicamente
  para loopback local; comodines, rutas, credenciales y HTTP remoto se rechazan.
- `npm run security:secrets` inspecciona archivos versionados y bloquea claves
  secretas modernas, JWT `service_role`, claves privadas y valores sensibles
  en archivos dotenv.

## Configuración obligatoria del proyecto alojado

Registrar fecha, operador y evidencia para cada paso:

- [ ] Rotar o revocar inmediatamente cualquier clave secreta copiada a un
      archivo de ejemplo, terminal, chat o log. Una clave `service_role`
      observada durante esta fase no estaba en el historial de Git, pero debe
      considerarse expuesta. Actualizar el gestor de secretos y volver a
      desplegar las cuatro Edge Functions antes de retirar la clave anterior.
- [ ] En **Authentication > Password Security**, fijar mínimo 12 y exigir las
      cuatro clases de caracteres. Activar **Leaked Password Protection** si
      el plan lo permite; en caso contrario, registrar la excepción y el riesgo.
- [ ] Mantener deshabilitados los proveedores de autenticación multifactor
      (TOTP, teléfono y WebAuthn) en el proyecto alojado.
- [ ] Configurar duración absoluta de sesión de 12 horas, inactividad de 1
      hora, JWT de 1 hora y rotación de refresh tokens.
- [ ] Fijar **Site URL** al host HTTPS canónico.
- [ ] Guardar `ALLOWED_ORIGINS` como lista de orígenes HTTPS exactos, sin ruta
      ni `/` final, en los secretos de Edge Functions.
- [ ] Confirmar que `SUPABASE_SERVICE_ROLE_KEY` existe solo en secretos de
      Edge/CI/operación y que ninguna variable `VITE_*` contiene una clave de
      servidor.
- [ ] Desplegar `sync`, `administration`, `prepare-production` y
      `freelance-access` desde el commit aprobado.
- [ ] Ejecutar Security Advisor y conservar evidencia de cero advertencias
      aplicables o de excepciones aceptadas por escrito.

## Pruebas de aceptación en staging

| Flujo               | Caso positivo                                       | Caso negativo obligatorio                                      |
| ------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| Alta de usuario     | Admin asigna clave fuerte y la cuenta puede entrar  | Otro rol o PIN incorrecto no crea la identidad                  |
| Cambio de clave     | Admin cambia la clave de cualquier rol interactivo  | Otro rol, PIN incorrecto o clave débil son rechazados           |
| Acceso central      | Correo y contraseña válidos crean la sesión         | Perfil inactivo o rol insuficiente no autoriza operaciones     |
| Desactivación       | Perfil, refresh y concesiones quedan revocados      | Token anterior no sincroniza ni lee datos protegidos           |
| Edición de usuario  | Nombre, correo y rol cambian en Auth y perfil        | Otro rol no accede; el Admin no cambia su propio rol            |
| Eliminación         | Auth desaparece y el historial queda anonimizado     | Cuenta propia y último Administrador quedan protegidos          |
| Dispositivo perdido | Retiro bloquea sync y todas sus concesiones         | Un rol no autorizado no puede retirarlo                        |
| CORS                | El host exacto recibe cabecera CORS                 | Origen parecido, HTTP remoto o `null` no recibe acceso         |

Tras desactivar una identidad, un access token emitido puede existir hasta su
expiración. Por eso la prueba debe confirmar que perfil, RLS y Edge niegan
autorización inmediatamente. El bloqueo de Auth impide nuevos accesos y
renovaciones. Un cambio manual de contraseña revoca las concesiones offline;
los access tokens ya emitidos conservan su límite natural y siguen sometidos a
perfil activo, RLS y validación de Edge.

## Acta de ejecución

| Campo                            | Valor     |
| -------------------------------- | --------- |
| Proyecto / entorno               | Pendiente |
| Host canónico                    | Pendiente |
| Fecha y operador                 | Pendiente |
| Commit desplegado                | Pendiente |
| Clave expuesta rotada / revocada | Pendiente |
| Leaked Password Protection       | Pendiente |
| Security Advisor                 | Pendiente |
| Resultado de la matriz           | Pendiente |

No promover a producción mientras esta acta conserve un campo obligatorio en
`Pendiente`.
