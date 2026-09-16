import {
  BODEGA_CENTRAL,
  centavos,
  codigoPieza as crearCodigoPieza,
  hospitalId as crearHospitalId,
  sku as crearSku,
  type EstadoAprobacion,
  type Hospital,
  type Pieza,
  type Rol,
} from '@crearcos/core';
import type { BaseLocal, FilaCatalogo, FilaExcepcionPrecio, FilaTokenFreelance } from '../db.js';
import type { DatosExcepcionNueva } from '../excepciones.js';
import type { DatosPiezaNueva, DatosProductoNuevo } from '../inventario.js';
import type { UsuarioResumen } from '../usuarios.js';
import { uuidV7 } from '../identificadores.js';
import type { ClienteSupabase } from './cliente.js';

type Accion = Record<string, unknown> & { readonly accion: string };

const MENSAJES_ADMINISTRACION: Readonly<Record<string, string>> = {
  AUTENTICACION_REQUERIDA: 'Tu sesión central terminó. Inicia sesión nuevamente.',
  CAMBIO_CONTRASENA_INVALIDO:
    'Usa una contraseña de 12 a 72 caracteres con mayúscula, minúscula, número y símbolo.',
  CAMBIO_CONTRASENA_PARCIAL:
    'La contraseña cambió, pero no se revocaron todos los accesos offline. Reintenta la operación.',
  CONFIRMACION_ELIMINACION_INVALIDA: 'Escribe ELIMINAR para confirmar la eliminación definitiva.',
  NO_SE_PUEDE_ELIMINAR_PROPIA_CUENTA: 'No puedes eliminar la cuenta con la que estás trabajando.',
  NO_SE_PUEDE_ELIMINAR_ULTIMO_ADMIN:
    'Debe existir otro Administrador activo antes de eliminar esta cuenta.',
  NO_SE_PUEDE_MODIFICAR_PROPIO_ACCESO:
    'No puedes cambiar tu propio rol ni desactivar tu acceso desde esta sesión.',
  PIN_ADMIN_BLOQUEADO: 'El PIN de Administrador está bloqueado durante 15 minutos.',
  PIN_ADMIN_DEBIL: 'El PIN debe tener 8 dígitos y evitar secuencias o números repetidos.',
  PIN_ADMIN_INVALIDO: 'El PIN de Administrador es incorrecto.',
  SESION_INVALIDA: 'Tu sesión central terminó. Inicia sesión nuevamente.',
  USUARIO_NO_ADMITE_CONTRASENA: 'Esta identidad no admite contraseña o ya fue eliminada.',
  USUARIO_INVALIDO: 'Revisa el correo, el nombre y el rol del usuario.',
};

export interface DispositivoCentral {
  readonly id: string;
  readonly nombre: string;
  readonly plataforma: string | null;
  readonly activo: boolean;
  readonly ultimoSyncEn: string | null;
  readonly retiradoEn: string | null;
}

function registro(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function cadena(valor: unknown): string | null {
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
}

function numero(valor: unknown): number {
  const convertido = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isSafeInteger(convertido) || convertido < 0)
    throw new Error('ENTERO_CENTRAL_INVALIDO');
  return convertido;
}

function esRol(valor: unknown): valor is Rol {
  return (
    typeof valor === 'string' &&
    [
      'SISTEMA',
      'ADMINISTRADOR',
      'AUXILIAR',
      'COORDINADORA',
      'CONTABLE',
      'SUPERVISOR',
      'FREELANCE',
    ].includes(valor)
  );
}

function esUuid(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor);
}

async function mensajeFuncion(error: unknown): Promise<string> {
  const envelope = registro(error);
  const context = envelope?.context;
  if (context instanceof Response) {
    try {
      const body = registro(await context.clone().json());
      const codigo = cadena(body?.error);
      return (
        cadena(body?.detalle) ??
        (codigo === null ? null : MENSAJES_ADMINISTRACION[codigo]) ??
        codigo ??
        cadena(envelope?.message) ??
        'Operación central rechazada'
      );
    } catch {
      // La respuesta puede no ser JSON; se usa el mensaje del cliente.
    }
  }
  return (
    cadena(envelope?.message) ??
    (error instanceof Error ? error.message : 'Operación central rechazada')
  );
}

function esSesionInvalida(error: unknown): boolean {
  const context = registro(error)?.context;
  return context instanceof Response && context.status === 401;
}

async function invocar(
  cliente: ClienteSupabase,
  cuerpo: Accion,
  alInvalidarSesion?: () => void,
): Promise<Record<string, unknown>> {
  const respuestaFuncion = await cliente.functions.invoke<unknown>('administration', {
    body: cuerpo,
  });
  const data: unknown = respuestaFuncion.data;
  const error: unknown = respuestaFuncion.error;
  if (error) {
    if (esSesionInvalida(error)) alInvalidarSesion?.();
    throw new Error(await mensajeFuncion(error));
  }
  const respuesta = registro(data);
  if (respuesta === null) throw new Error('RESPUESTA_CENTRAL_INVALIDA');
  return respuesta;
}

export interface AdministracionCentral {
  listarUsuarios(): Promise<readonly UsuarioResumen[]>;
  crearUsuario(datos: {
    readonly correo: string;
    readonly nombre: string;
    readonly rol: Exclude<Rol, 'SISTEMA' | 'FREELANCE'>;
    readonly contrasena: string;
    readonly pinAdministrador: string;
  }): Promise<UsuarioResumen>;
  editarUsuario(
    usuario: UsuarioResumen,
    cambios: {
      readonly correo: string;
      readonly nombre: string;
      readonly rol: Exclude<Rol, 'SISTEMA' | 'FREELANCE'>;
    },
  ): Promise<UsuarioResumen>;
  cambiarEstadoUsuario(usuario: UsuarioResumen, activo: boolean): Promise<UsuarioResumen>;
  cambiarContrasena(
    usuario: UsuarioResumen,
    contrasena: string,
    pinAdministrador: string,
  ): Promise<UsuarioResumen>;
  configurarPinAdministrador(pin: string): Promise<void>;
  eliminarUsuario(usuario: UsuarioResumen): Promise<void>;
  listarDispositivos(): Promise<readonly DispositivoCentral[]>;
  revocarDispositivo(dispositivoId: string, motivo: string): Promise<void>;
  guardarHospital(hospital: Hospital, codigoPublico: string): Promise<Hospital>;
  eliminarHospital(hospital: Hospital): Promise<void>;
  crearProducto(datos: DatosProductoNuevo): Promise<FilaCatalogo>;
  actualizarProducto(producto: FilaCatalogo, datos: DatosProductoNuevo): Promise<FilaCatalogo>;
  eliminarProducto(producto: FilaCatalogo): Promise<void>;
  registrarPieza(datos: DatosPiezaNueva, dispositivoId: string): Promise<Pieza>;
  actualizarPieza(pieza: Pieza, datos: DatosPiezaNueva, dispositivoId: string): Promise<Pieza>;
  eliminarPieza(pieza: Pieza, dispositivoId: string): Promise<void>;
  proponerExcepcion(datos: DatosExcepcionNueva): Promise<FilaExcepcionPrecio>;
  decidirExcepcion(
    excepcion: FilaExcepcionPrecio,
    decision: Exclude<EstadoAprobacion, 'PENDIENTE'>,
    motivo?: string,
  ): Promise<FilaExcepcionPrecio>;
  listarAccesosFreelance(maletaId: string): Promise<readonly FilaTokenFreelance[]>;
  crearAccesoFreelance(maletaId: string): Promise<FilaTokenFreelance>;
  revocarAccesoFreelance(token: string): Promise<void>;
}

/** Frontera única para comandos privilegiados; los componentes no construyen queries Supabase. */
export function crearAdministracionCentral(
  db: BaseLocal,
  cliente: ClienteSupabase,
  ahora: () => number,
  alInvalidarSesion?: () => void,
): AdministracionCentral {
  const invocarCentral = (cuerpo: Accion): Promise<Record<string, unknown>> =>
    invocar(cliente, cuerpo, alInvalidarSesion);

  const guardarPerfil = async (
    valor: unknown,
    correoAlternativo: string | null = null,
  ): Promise<UsuarioResumen> => {
    const fila = registro(valor);
    if (fila === null) throw new Error('PERFIL_CENTRAL_INVALIDO');
    const id = cadena(fila.id);
    const nombre = cadena(fila.nombre);
    if (id === null || nombre === null || !esRol(fila.rol) || typeof fila.activo !== 'boolean') {
      throw new Error('PERFIL_CENTRAL_INVALIDO');
    }
    await db.perfilesCentrales.put({
      usuarioId: id,
      nombre,
      rol: fila.rol,
      activo: fila.activo,
      validoHasta: ahora() + 30 * 24 * 60 * 60 * 1000,
    });
    return {
      usuarioId: id,
      correo: cadena(fila.correo)?.toLocaleLowerCase('en-US') ?? correoAlternativo,
      nombre,
      rol: fila.rol,
      activo: fila.activo,
      bloqueadoHasta: null,
    };
  };

  const buscarReplica = async (
    entidadTipo: 'PRODUCTO' | 'PIEZA',
    campo: 'sku' | 'codigo',
    valor: string,
  ) =>
    db.replicaCentral
      .where('entidadTipo')
      .equals(entidadTipo)
      .filter((replica) => cadena(registro(replica.payload)?.[campo]) === valor)
      .first();

  const guardarProductoCentral = async (valor: unknown): Promise<FilaCatalogo> => {
    const fila = registro(valor);
    const id = cadena(fila?.id);
    const sku = cadena(fila?.sku);
    const nombre = cadena(fila?.nombre);
    const tipo = cadena(fila?.tipo);
    if (
      fila === null ||
      id === null ||
      sku === null ||
      nombre === null ||
      !['INSTRUMENTAL', 'INSUMO', 'KIT'].includes(tipo ?? '')
    ) {
      throw new Error('PRODUCTO_CENTRAL_INVALIDO');
    }
    const resultado: FilaCatalogo = {
      sku,
      nombre,
      tipo: tipo as FilaCatalogo['tipo'],
      costoBase: numero(fila.costo_base_centavos),
    };
    await db.transaction('rw', [db.catalogo, db.replicaCentral], async () => {
      await db.catalogo.put(resultado);
      await db.replicaCentral.put({
        clave: `PRODUCTO:${id}`,
        entidadTipo: 'PRODUCTO',
        entidadId: id,
        version: numero(fila.version),
        eliminado: false,
        payload: fila,
      });
    });
    return resultado;
  };

  const guardarPiezaCentral = async (valor: unknown): Promise<Pieza> => {
    const fila = registro(valor);
    const id = cadena(fila?.id);
    const codigo = cadena(fila?.codigo);
    const sku = cadena(fila?.sku);
    const tipo = cadena(fila?.tipo);
    const estado = cadena(fila?.estado);
    const hlc = cadena(fila?.hlc);
    const ubicacion = registro(fila?.ubicacion);
    if (
      fila === null ||
      id === null ||
      codigo === null ||
      sku === null ||
      hlc === null ||
      estado !== 'EN_BODEGA_CENTRAL' ||
      ubicacion?.clase !== 'BODEGA_CENTRAL' ||
      !['INSTRUMENTAL', 'INSUMO', 'KIT'].includes(tipo ?? '')
    ) {
      throw new Error('PIEZA_CENTRAL_INVALIDA');
    }
    const padre = cadena(fila.parentCodigo);
    const resultado: Pieza = {
      codigo: crearCodigoPieza(codigo),
      sku: crearSku(sku),
      tipo: tipo as Pieza['tipo'],
      estado,
      ubicacion: BODEGA_CENTRAL,
      maletaId: null,
      parentCodigo: padre === null ? null : crearCodigoPieza(padre),
      version: numero(fila.version),
      hlc,
    };
    await db.transaction('rw', [db.piezas, db.replicaCentral], async () => {
      await db.piezas.put(resultado);
      await db.replicaCentral.put({
        clave: `PIEZA:${id}`,
        entidadTipo: 'PIEZA',
        entidadId: id,
        version: resultado.version,
        eliminado: false,
        payload: fila,
      });
    });
    return resultado;
  };

  return {
    listarUsuarios: async () => {
      const respuesta = await invocarCentral({ accion: 'LISTAR_USUARIOS' });
      const filas = Array.isArray(respuesta.usuarios) ? respuesta.usuarios : [];
      return Promise.all(filas.map((fila) => guardarPerfil(fila)));
    },

    crearUsuario: async (datos) => {
      const respuesta = await invocarCentral({
        accion: 'CREAR_USUARIO',
        correo: datos.correo,
        nombre: datos.nombre,
        rol: datos.rol,
        contrasena: datos.contrasena,
        pinAdministrador: datos.pinAdministrador,
      });
      return guardarPerfil(respuesta.usuario, datos.correo.trim().toLocaleLowerCase('en-US'));
    },

    editarUsuario: async (usuario, cambios) => {
      const respuesta = await invocarCentral({
        accion: 'EDITAR_USUARIO',
        usuarioId: usuario.usuarioId,
        correo: cambios.correo,
        nombre: cambios.nombre,
        rol: cambios.rol,
      });
      return guardarPerfil(respuesta.usuario, cambios.correo.trim().toLocaleLowerCase('en-US'));
    },

    cambiarEstadoUsuario: async (usuario, activo) => {
      const respuesta = await invocarCentral({
        accion: 'ACTUALIZAR_USUARIO',
        usuarioId: usuario.usuarioId,
        nombre: usuario.nombre,
        rol: usuario.rol,
        activo,
      });
      return guardarPerfil(respuesta.usuario, usuario.correo);
    },

    cambiarContrasena: async (usuario, contrasena, pinAdministrador) => {
      const respuesta = await invocarCentral({
        accion: 'CAMBIAR_CONTRASENA_USUARIO',
        usuarioId: usuario.usuarioId,
        contrasena,
        pinAdministrador,
      });
      return guardarPerfil(respuesta.usuario, usuario.correo);
    },

    configurarPinAdministrador: async (pin) => {
      await invocarCentral({
        accion: 'CONFIGURAR_PIN_ADMIN',
        pinAdministrador: pin,
      });
    },

    eliminarUsuario: async (usuario) => {
      await invocarCentral({
        accion: 'ELIMINAR_USUARIO',
        usuarioId: usuario.usuarioId,
        confirmacion: 'ELIMINAR',
      });
      await db.perfilesCentrales.delete(usuario.usuarioId);
    },

    listarDispositivos: async () => {
      const respuesta = await invocarCentral({ accion: 'LISTAR_DISPOSITIVOS' });
      const filas = Array.isArray(respuesta.dispositivos) ? respuesta.dispositivos : [];
      return filas.flatMap((valor) => {
        const fila = registro(valor);
        const id = cadena(fila?.id);
        const nombre = cadena(fila?.nombre);
        if (fila === null || id === null || nombre === null || typeof fila.activo !== 'boolean') {
          return [];
        }
        return [
          {
            id,
            nombre,
            plataforma: cadena(fila.plataforma),
            activo: fila.activo,
            ultimoSyncEn: cadena(fila.ultimo_sync_en),
            retiradoEn: cadena(fila.retirado_en),
          } satisfies DispositivoCentral,
        ];
      });
    },

    revocarDispositivo: async (dispositivoId, motivo) => {
      await invocarCentral({
        accion: 'REVOCAR_DISPOSITIVO',
        dispositivoId,
        motivo,
      });
    },

    guardarHospital: async (hospital, codigoPublico) => {
      const id = esUuid(hospital.id) ? hospital.id : uuidV7(ahora());
      const replica = await db.replicaCentral.get(`HOSPITAL:${id}`);
      const respuesta = await invocarCentral({
        accion: 'GUARDAR_HOSPITAL',
        hospitalId: id,
        codigo: codigoPublico,
        nombre: hospital.nombre,
        ciudad: hospital.ciudad,
        nivelPrecio: hospital.nivelPorDefecto,
        versionEsperada: replica?.version ?? null,
      });
      const fila = registro(respuesta.hospital);
      const remotoId = cadena(fila?.id);
      const nombre = cadena(fila?.nombre);
      const ciudad = cadena(fila?.ciudad);
      const nivel = cadena(fila?.nivel_precio);
      if (
        fila === null ||
        remotoId === null ||
        nombre === null ||
        ciudad === null ||
        !['HABITUAL', 'PROVINCIA', 'NOTA_CREDITO'].includes(nivel ?? '')
      ) {
        throw new Error('HOSPITAL_CENTRAL_INVALIDO');
      }
      const resultado: Hospital = {
        id: crearHospitalId(remotoId),
        nombre,
        ciudad,
        nivelPorDefecto: nivel as Hospital['nivelPorDefecto'],
      };
      await db.transaction('rw', [db.hospitales, db.replicaCentral], async () => {
        if (hospital.id !== resultado.id) await db.hospitales.delete(hospital.id);
        await db.hospitales.put(resultado);
        await db.replicaCentral.put({
          clave: `HOSPITAL:${remotoId}`,
          entidadTipo: 'HOSPITAL',
          entidadId: remotoId,
          version: numero(fila.version),
          eliminado: false,
          payload: fila,
        });
      });
      return resultado;
    },

    eliminarHospital: async (hospital) => {
      const replica = await db.replicaCentral.get(`HOSPITAL:${hospital.id}`);
      const respuesta = await invocarCentral({
        accion: 'ELIMINAR_HOSPITAL',
        hospitalId: hospital.id,
        versionEsperada: replica?.version ?? null,
      });
      const fila = registro(respuesta.hospital);
      await db.transaction('rw', [db.hospitales, db.replicaCentral], async () => {
        await db.hospitales.delete(hospital.id);
        if (fila !== null) {
          await db.replicaCentral.put({
            clave: `HOSPITAL:${hospital.id}`,
            entidadTipo: 'HOSPITAL',
            entidadId: hospital.id,
            version: numero(fila.version),
            eliminado: true,
            payload: fila,
          });
        }
      });
    },

    crearProducto: async (datos) => {
      const respuesta = await invocarCentral({
        accion: 'CREAR_PRODUCTO',
        productoId: uuidV7(ahora()),
        sku: datos.sku,
        nombre: datos.nombre,
        tipo: datos.tipo,
        costoBaseCentavos: datos.costoBase,
      });
      return guardarProductoCentral(respuesta.producto);
    },

    actualizarProducto: async (producto, datos) => {
      const replica = await buscarReplica('PRODUCTO', 'sku', producto.sku);
      const respuesta = await invocarCentral({
        accion: 'ACTUALIZAR_PRODUCTO',
        sku: producto.sku,
        nombre: datos.nombre,
        tipo: datos.tipo,
        costoBaseCentavos: datos.costoBase,
        versionEsperada: replica?.version ?? null,
      });
      return guardarProductoCentral(respuesta.producto);
    },

    eliminarProducto: async (producto) => {
      const replica = await buscarReplica('PRODUCTO', 'sku', producto.sku);
      const respuesta = await invocarCentral({
        accion: 'ELIMINAR_PRODUCTO',
        sku: producto.sku,
        versionEsperada: replica?.version ?? null,
      });
      const fila = registro(respuesta.producto);
      await db.transaction('rw', [db.catalogo, db.replicaCentral], async () => {
        await db.catalogo.delete(producto.sku);
        if (fila !== null) {
          const id = cadena(fila.id) ?? replica?.entidadId;
          if (id !== undefined) {
            await db.replicaCentral.put({
              clave: `PRODUCTO:${id}`,
              entidadTipo: 'PRODUCTO',
              entidadId: id,
              version: numero(fila.version),
              eliminado: true,
              payload: fila,
            });
          }
        }
      });
    },

    registrarPieza: async (datos, deviceId) => {
      const respuesta = await invocarCentral({
        accion: 'REGISTRAR_PIEZA',
        dispositivoId: deviceId,
        nombreDispositivo: globalThis.navigator.userAgent.slice(0, 120),
        piezaId: uuidV7(ahora()),
        codigo: datos.codigo,
        sku: datos.sku,
        kitPadreCodigo: datos.parentCodigo ?? null,
      });
      return guardarPiezaCentral(respuesta.pieza);
    },

    actualizarPieza: async (pieza, datos, deviceId) => {
      const replica = await buscarReplica('PIEZA', 'codigo', pieza.codigo);
      const respuesta = await invocarCentral({
        accion: 'ACTUALIZAR_PIEZA',
        dispositivoId: deviceId,
        nombreDispositivo: globalThis.navigator.userAgent.slice(0, 120),
        codigo: pieza.codigo,
        sku: datos.sku,
        kitPadreCodigo: datos.parentCodigo ?? null,
        versionEsperada: replica?.version ?? pieza.version,
      });
      return guardarPiezaCentral(respuesta.pieza);
    },

    eliminarPieza: async (pieza, deviceId) => {
      const replica = await buscarReplica('PIEZA', 'codigo', pieza.codigo);
      const respuesta = await invocarCentral({
        accion: 'ELIMINAR_PIEZA',
        dispositivoId: deviceId,
        nombreDispositivo: globalThis.navigator.userAgent.slice(0, 120),
        codigo: pieza.codigo,
        versionEsperada: replica?.version ?? pieza.version,
      });
      const fila = registro(respuesta.pieza);
      await db.transaction('rw', [db.piezas, db.replicaCentral], async () => {
        await db.piezas.delete(pieza.codigo);
        if (fila !== null) {
          const id = cadena(fila.id) ?? replica?.entidadId;
          if (id !== undefined) {
            await db.replicaCentral.put({
              clave: `PIEZA:${id}`,
              entidadTipo: 'PIEZA',
              entidadId: id,
              version: numero(fila.version),
              eliminado: true,
              payload: fila,
            });
          }
        }
      });
    },

    proponerExcepcion: async (datos) => {
      const id = uuidV7(ahora());
      await invocarCentral({
        accion: 'PROPONER_EXCEPCION',
        excepcionId: id,
        sku: datos.sku,
        hospitalId: datos.hospitalId,
        precioCentavos: datos.valor,
        vigenteDesde: datos.vigenteDesde,
        vigenteHasta: datos.vigenteHasta ?? null,
        motivo: 'Precio negociado desde la aplicación',
      });
      const resultado: FilaExcepcionPrecio = {
        id,
        sku: crearSku(datos.sku),
        hospitalId: crearHospitalId(datos.hospitalId),
        valor: centavos(datos.valor),
        estado: 'PENDIENTE',
        vigenteDesde: datos.vigenteDesde,
        vigenteHasta: datos.vigenteHasta ?? null,
        motivoRechazo: null,
      };
      await db.excepcionesPrecio.put(resultado);
      return resultado;
    },

    decidirExcepcion: async (excepcion, decision, motivo) => {
      const motivoDecision =
        decision === 'RECHAZADO' && (motivo === undefined || motivo.trim() === '')
          ? 'Rechazado por el Administrador'
          : (motivo ?? null);
      await invocarCentral({
        accion: 'DECIDIR_EXCEPCION',
        excepcionId: excepcion.id,
        decision,
        motivo: motivoDecision,
      });
      const resultado: FilaExcepcionPrecio = {
        ...excepcion,
        estado: decision,
        motivoRechazo: decision === 'RECHAZADO' ? motivoDecision : null,
      };
      await db.excepcionesPrecio.put(resultado);
      return resultado;
    },

    listarAccesosFreelance: async (maletaId) => {
      const respuesta = await invocarCentral({
        accion: 'LISTAR_ACCESOS_FREELANCE',
        maletaId,
      });
      const remotos = Array.isArray(respuesta.accesos) ? respuesta.accesos : [];
      const locales = await db.tokensFreelance.where('maletaId').equals(maletaId).toArray();
      const porAcceso = new Map(locales.map((fila) => [fila.accesoId, fila]));
      const filas = remotos.flatMap((valor) => {
        const fila = registro(valor);
        const id = cadena(fila?.id);
        const maleta = cadena(fila?.maleta_id);
        const creador = cadena(fila?.creado_por);
        const creadoEn = Date.parse(cadena(fila?.creado_en) ?? '');
        const expiraEn = Date.parse(cadena(fila?.expira_en) ?? '');
        if (
          id === null ||
          maleta === null ||
          creador === null ||
          !Number.isFinite(creadoEn) ||
          !Number.isFinite(expiraEn)
        )
          return [];
        const conocida = porAcceso.get(id);
        const tokenPrefijo = cadena(fila?.token_prefijo) ?? conocida?.tokenPrefijo;
        return [
          {
            token: conocida?.secretoDisponible === true ? conocida.token : `oculto:${id}`,
            accesoId: id,
            secretoDisponible: conocida?.secretoDisponible === true,
            ...(tokenPrefijo === undefined ? {} : { tokenPrefijo }),
            maletaId: maleta,
            creadoPorId: creador,
            creadoEn,
            expiraEn,
            revocado: cadena(fila?.revocado_en) !== null,
          } satisfies FilaTokenFreelance,
        ];
      });
      await db.transaction('rw', db.tokensFreelance, async () => {
        await db.tokensFreelance.where('maletaId').equals(maletaId).delete();
        if (filas.length > 0) await db.tokensFreelance.bulkPut(filas);
      });
      return filas;
    },

    crearAccesoFreelance: async (maletaId) => {
      const respuesta = await invocarCentral({
        accion: 'CREAR_ACCESO_FREELANCE',
        maletaId,
        expiraEn: new Date(ahora() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const id = cadena(respuesta.id);
      const token = cadena(respuesta.token);
      const expiraEn = Date.parse(cadena(respuesta.expiraEn) ?? '');
      const creador = (await cliente.auth.getUser()).data.user?.id;
      if (id === null || token === null || creador === undefined || !Number.isFinite(expiraEn)) {
        throw new Error('ACCESO_FREELANCE_CENTRAL_INVALIDO');
      }
      const fila: FilaTokenFreelance = {
        token,
        accesoId: id,
        secretoDisponible: true,
        tokenPrefijo: token.slice(0, 10),
        maletaId: cadena(respuesta.maletaId) ?? maletaId,
        creadoPorId: creador,
        creadoEn: ahora(),
        expiraEn,
        revocado: false,
      };
      await db.tokensFreelance.put(fila);
      return fila;
    },

    revocarAccesoFreelance: async (token) => {
      const fila = await db.tokensFreelance.get(token);
      if (fila?.accesoId === undefined) throw new Error('ACCESO_CENTRAL_NO_IDENTIFICADO');
      await invocarCentral({
        accion: 'REVOCAR_ACCESO_FREELANCE',
        accesoId: fila.accesoId,
        motivo: 'Revocado desde la aplicación',
      });
      await db.tokensFreelance.update(token, { revocado: true });
    },
  };
}
