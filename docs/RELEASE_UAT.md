# Acta UAT de versión candidata

Duplicar este archivo por versión y conservar el acta aprobada fuera del
repositorio si contiene nombres o datos internos.

## Identificación

- Versión / etiqueta:
- Commit SHA:
- URL de staging:
- Ejecución `Desplegar staging`:
- Fecha y ventana:
- Responsable técnico:
- Responsables de negocio:

## Evidencia automática

- [ ] CI completo aprobado.
- [ ] Migraciones probadas desde base vacía y `db push --dry-run` revisado.
- [ ] Deployment de staging exitoso para el mismo SHA.
- [ ] Smoke remoto aprobado, incluido CORS negativo.
- [ ] No se usaron seed ni datos productivos en staging.

## Recorrido de aceptación

- [ ] Administrador entra con MFA y revisa usuarios/dispositivos.
- [ ] Auxiliar prepara, opera y cierra una maleta.
- [ ] Flujo offline conserva operaciones y converge al recuperar red.
- [ ] Dos dispositivos generan, resuelven y convergen un conflicto.
- [ ] Freelance sólo accede a la maleta autorizada y el token expira.
- [ ] Reprocesamiento y liberación respetan estados y trazabilidad.
- [ ] Contabilidad revisa precios, excepciones y factura.
- [ ] Recuperación de contraseña usa el host de staging correcto.
- [ ] Instalación/actualización PWA y recarga de rutas profundas funcionan.
- [ ] No existen defectos críticos o altos abiertos.

## Decisión

- Resultado: APROBADO / RECHAZADO
- Defectos aceptados y responsable:
- Observaciones:
- Aprobación técnica:
- Aprobación de negocio:
