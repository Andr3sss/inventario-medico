interface ClientePerfiles {
  from(tabla: string): {
    select(columnas: string): {
      eq(
        columna: string,
        valor: string,
      ): {
        maybeSingle(): Promise<{
          readonly data: { readonly activo?: boolean } | null;
          readonly error: unknown;
        }>;
      };
    };
  };
}

/**
 * Comprueba en el servidor que la identidad autenticada conserva un perfil
 * activo. La autorización por rol continúa en las RPC y políticas RLS.
 */
export async function validarPerfilActivoServidor(
  servicioEntrada: unknown,
  usuarioId: string,
): Promise<'PERFIL_INACTIVO' | null> {
  const servicio = servicioEntrada as ClientePerfiles;
  const { data: perfil, error: perfilError } = await servicio
    .from('perfiles')
    .select('activo')
    .eq('id', usuarioId)
    .maybeSingle();
  if (perfilError || perfil?.activo !== true) return 'PERFIL_INACTIVO';
  return null;
}
