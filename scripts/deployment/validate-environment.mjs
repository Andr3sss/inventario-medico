import { leerConfiguracionDespliegue } from './environment.mjs';

try {
  const configuracion = leerConfiguracionDespliegue();
  process.stdout.write(
    `Entorno ${configuracion.entorno} valido: ${configuracion.appUrl} -> ${configuracion.supabaseUrl}\n`,
  );
} catch (error) {
  process.stderr.write(`Configuracion de despliegue invalida: ${error.message}\n`);
  process.exitCode = 1;
}
