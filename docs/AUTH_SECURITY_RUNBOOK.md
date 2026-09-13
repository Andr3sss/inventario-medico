# Runbook de seguridad de Auth

Este documento separa lo garantizado por el repositorio de lo que debe
aplicarse y comprobarse en cada proyecto alojado de Supabase. Ningún checkbox
de la segunda categoría se presume completado por una migración.

## Controles implementados en el repositorio

- Contraseñas centrales de al menos 12 caracteres, con mayúscula, minúscula,
  número y símbolo en la configuración local y en la pantalla de cambio.
- Alta central por invitación. El Administrador no define ni conoce la
  contraseña de otra persona.
- Recuperación por enlace temporal y cierre global de sesiones después del
  cambio de contraseña.
- TOTP obligatorio para Administradores. Para los demás roles es opcional;
  una vez verificado un factor, cada nueva sesión debe elevarse a AAL2.
- RLS comprueba AAL2 para Administradores y usuarios con factor verificado.
  Las Edge Functions repiten la comprobación antes de usar `service_role`.
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
- [ ] Habilitar TOTP. Mantener deshabilitado SMS MFA mientras no exista una
      decisión de seguridad que lo justifique.
- [ ] Configurar duración absoluta de sesión de 12 horas, inactividad de 1
      hora, JWT de 1 hora y rotación de refresh tokens.
- [ ] Configurar SMTP propio. Verificar remitente, SPF, DKIM y DMARC; probar
      invitación, recuperación, expiración y límites de reenvío. El SMTP por
      defecto de Supabase no es el canal productivo.
- [ ] Fijar **Site URL** al host HTTPS canónico.
- [ ] Permitir como redirect exacto el host canónico seguido de
      `/actualizar-contrasena`. Añadir staging por separado; no usar comodines.
- [ ] Guardar `ALLOWED_ORIGINS` como lista de orígenes HTTPS exactos, sin ruta
      ni `/` final, y `AUTH_REDIRECT_URL` como URL completa terminada en
      `/actualizar-contrasena` en los secretos de Edge Functions.
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
| Invitación          | El enlace permite definir una clave fuerte y entrar | Enlace vencido o redirect distinto no concede sesión           |
| Recuperación        | El usuario cambia su propia clave y vuelve a entrar | La interfaz no revela si un correo inexistente está registrado |
| Contraseña          | Una clave conforme se acepta                        | Filtrada, corta o sin una clase se rechaza                     |
| MFA Administrador   | TOTP eleva a AAL2 y habilita administración         | AAL1 no lee por RLS ni ejecuta funciones privilegiadas         |
| MFA otros roles     | Sin factor pueden operar; con factor deben elevar   | Un TOTP incorrecto no crea sesión de aplicación                |
| Desactivación       | Perfil, refresh y concesiones quedan revocados      | Token anterior no sincroniza ni lee datos protegidos           |
| Dispositivo perdido | Retiro bloquea sync y todas sus concesiones         | Un rol no autorizado no puede retirarlo                        |
| CORS                | El host exacto recibe cabecera CORS                 | Origen parecido, HTTP remoto o `null` no recibe acceso         |
| Correo              | Invitación y recuperación llegan y funcionan        | Reenvío abusivo queda limitado y no filtra existencia          |

Tras desactivar una identidad, un access token emitido puede existir hasta su
expiración. Por eso la prueba debe confirmar que perfil, RLS y Edge niegan
autorización inmediatamente. El bloqueo de Auth impide nuevos accesos y
renovaciones; el cierre global posterior al cambio de clave revoca los refresh
tokens existentes.

## Acta de ejecución

| Campo                            | Valor     |
| -------------------------------- | --------- |
| Proyecto / entorno               | Pendiente |
| Host canónico                    | Pendiente |
| Fecha y operador                 | Pendiente |
| Commit desplegado                | Pendiente |
| Clave expuesta rotada / revocada | Pendiente |
| SMTP + SPF/DKIM/DMARC            | Pendiente |
| Leaked Password Protection       | Pendiente |
| Security Advisor                 | Pendiente |
| Resultado de la matriz           | Pendiente |

No promover a producción mientras esta acta conserve un campo obligatorio en
`Pendiente`.
