# Pruebas PostgreSQL

Ejecutar sobre una base local descartable:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

`001_schema_and_security.test.sql` comprueba presencia del modelo, RLS forzado,
RPC críticas y ausencia de lectura anónima. Las pruebas funcionales de sync,
factura, conflicto y handoff se ejecutan dentro de transacciones con `ROLLBACK`;
el procedimiento y la matriz están en `docs/SUPABASE_SETUP.md`.

Nunca ejecutar pruebas destructivas de handoff contra producción.
