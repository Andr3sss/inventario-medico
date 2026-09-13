interface ClienteMfa {
  readonly auth: {
    readonly mfa: {
      getAuthenticatorAssuranceLevel(jwt?: string): Promise<{
        readonly data: {
          readonly currentLevel: string | null;
          readonly nextLevel: string | null;
        } | null;
        readonly error: unknown;
      }>;
    };
  };
}

interface ClientePerfiles {
  from(tabla: string): {
    select(columnas: string): {
      eq(
        columna: string,
        valor: string,
      ): {
        maybeSingle(): Promise<{
          readonly data: { readonly rol?: string; readonly activo?: boolean } | null;
          readonly error: unknown;
        }>;
      };
    };
  };
}

/**
 * Exige AAL2 a Administradores y a cualquier usuario que ya tenga un factor
 * verificado. La consulta privilegiada solo obtiene rol/estado; nunca acepta
 * esos datos desde el navegador.
 */
export async function validarMfaServidor(
  clienteUsuarioEntrada: unknown,
  servicioEntrada: unknown,
  usuarioId: string,
  jwt: string,
): Promise<'PERFIL_INACTIVO' | 'MFA_REQUERIDA' | null> {
  const clienteUsuario = clienteUsuarioEntrada as ClienteMfa;
  const servicio = servicioEntrada as ClientePerfiles;
  const [{ data: perfil, error: perfilError }, { data: aal, error: aalError }] = await Promise.all([
    servicio.from('perfiles').select('rol,activo').eq('id', usuarioId).maybeSingle(),
    clienteUsuario.auth.mfa.getAuthenticatorAssuranceLevel(jwt),
  ]);
  if (perfilError || perfil?.activo !== true) return 'PERFIL_INACTIVO';
  if (aalError || aal === null) return 'MFA_REQUERIDA';
  const debeElevar = perfil.rol === 'ADMINISTRADOR' || aal.nextLevel === 'aal2';
  return debeElevar && aal.currentLevel !== 'aal2' ? 'MFA_REQUERIDA' : null;
}
