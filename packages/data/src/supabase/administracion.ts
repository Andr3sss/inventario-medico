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
      return (
        cadena(body?.detalle) ??
        cadena(body?.error) ??
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

async function invocar(cliente: ClienteSupabase, cuerpo: Accion): Promise<Record<string, unknown>> {
  const respuestaFuncion = await cliente.functions.invoke<unknown>('administration', {
    body: cuerpo,
  });
  const data: unknown = respuestaFuncion.data;
  const error: unknown = respuestaFuncion.error;
  if (error) throw new Error(await mensajeFuncion(error));
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
  }): Promise<UsuarioResumen>;
  cambiarEstadoUsuario(usuario: UsuarioResumen, activo: boolean): Promise<UsuarioResumen>;
  resetearContrasena(usuario: UsuarioResumen, contrasena: string): Promise<UsuarioResumen>;
  guardarHospital(hospital: Hospital, codigoPublico: string): Promise<Hospital>;
  crearProducto(datos: DatosProductoNuevo): Promise<FilaCatalogo>;
  registrarPieza(datos: DatosPiezaNueva, dispositivoId: string): Promise<Pieza>;
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
): AdministracionCentral {
  const guardarPerfil = async (valor: unknown): Promise<UsuarioResumen> => {
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
    return { usuarioId: id, nombre, rol: fila.rol, activo: fila.activo, bloqueadoHasta: null };
  };

  return {
    listarUsuarios: async () => {
      const respuesta = await invocar(cliente, { accion: 'LISTAR_USUARIOS' });
      const filas = Array.isArray(respuesta.usuarios) ? respuesta.usuarios : [];
      return Promise.all(filas.map(guardarPerfil));
    },

    crearUsuario: async (datos) => {
      const respuesta = await invocar(cliente, {
        accion: 'CREAR_USUARIO',
        correo: datos.correo,
        nombre: datos.nombre,
        rol: datos.rol,
        contrasena: datos.contrasena,
      });
      return guardarPerfil(respuesta.usuario);
    },

    cambiarEstadoUsuario: async (usuario, activo) => {
      const respuesta = await invocar(cliente, {
        accion: 'ACTUALIZAR_USUARIO',
        usuarioId: usuario.usuarioId,
        nombre: usuario.nombre,
        rol: usuario.rol,
        activo,
      });
      return guardarPerfil(respuesta.usuario);
    },

    resetearContrasena: async (usuario, contrasena) => {
      await invocar(cliente, {
        accion: 'RESTABLECER_CONTRASENA',
        usuarioId: usuario.usuarioId,
        contrasena,
      });
      return usuario;
    },

    guardarHospital: async (hospital, codigoPublico) => {
      const id = esUuid(hospital.id) ? hospital.id : uuidV7(ahora());
      const replica = await db.replicaCentral.get(`HOSPITAL:${id}`);
      const respuesta = await invocar(cliente, {
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

    crearProducto: async (datos) => {
      const respuesta = await invocar(cliente, {
        accion: 'CREAR_PRODUCTO',
        productoId: uuidV7(ahora()),
        sku: datos.sku,
        nombre: datos.nombre,
        tipo: datos.tipo,
        costoBaseCentavos: datos.costoBase,
      });
      const fila = registro(respuesta.producto);
      const sku = cadena(fila?.sku);
      const nombre = cadena(fila?.nombre);
      const tipo = cadena(fila?.tipo);
      if (
        fila === null ||
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
      await db.catalogo.put(resultado);
      return resultado;
    },

    registrarPieza: async (datos, deviceId) => {
      const respuesta = await invocar(cliente, {
        accion: 'REGISTRAR_PIEZA',
        dispositivoId: deviceId,
        nombreDispositivo: globalThis.navigator.userAgent.slice(0, 120),
        piezaId: uuidV7(ahora()),
        codigo: datos.codigo,
        sku: datos.sku,
        kitPadreCodigo: datos.parentCodigo ?? null,
      });
      const fila = registro(respuesta.pieza);
      const codigo = cadena(fila?.codigo);
      const sku = cadena(fila?.sku);
      const tipo = cadena(fila?.tipo);
      const hlc = cadena(fila?.hlc);
      if (
        fila === null ||
        codigo === null ||
        sku === null ||
        hlc === null ||
        !['INSTRUMENTAL', 'INSUMO', 'KIT'].includes(tipo ?? '')
      ) {
        throw new Error('PIEZA_CENTRAL_INVALIDA');
      }
      const padre = cadena(fila.parentCodigo);
      const resultado: Pieza = {
        codigo: crearCodigoPieza(codigo),
        sku: crearSku(sku),
        tipo: tipo as Pieza['tipo'],
        estado: 'EN_BODEGA_CENTRAL',
        ubicacion: BODEGA_CENTRAL,
        maletaId: null,
        parentCodigo: padre === null ? null : crearCodigoPieza(padre),
        version: numero(fila.version),
        hlc,
      };
      await db.piezas.put(resultado);
      return resultado;
    },

    proponerExcepcion: async (datos) => {
      const id = uuidV7(ahora());
      await invocar(cliente, {
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
      await invocar(cliente, {
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
      const respuesta = await invocar(cliente, {
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
      const respuesta = await invocar(cliente, {
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
      await invocar(cliente, {
        accion: 'REVOCAR_ACCESO_FREELANCE',
        accesoId: fila.accesoId,
        motivo: 'Revocado desde la aplicación',
      });
      await db.tokensFreelance.update(token, { revocado: true });
    },
  };
}
