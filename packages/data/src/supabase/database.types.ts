export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      accesos_freelance: {
        Row: {
          creado_en: string;
          creado_por: string;
          expira_en: string;
          id: string;
          lote_semilla_id: string | null;
          maleta_id: string;
          motivo_revocacion: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          revocado_en: string | null;
          revocado_por: string | null;
          token_hash: string;
          token_prefijo: string;
          ultimo_uso_en: string | null;
        };
        Insert: {
          creado_en?: string;
          creado_por: string;
          expira_en: string;
          id: string;
          lote_semilla_id?: string | null;
          maleta_id: string;
          motivo_revocacion?: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          revocado_en?: string | null;
          revocado_por?: string | null;
          token_hash: string;
          token_prefijo: string;
          ultimo_uso_en?: string | null;
        };
        Update: {
          creado_en?: string;
          creado_por?: string;
          expira_en?: string;
          id?: string;
          lote_semilla_id?: string | null;
          maleta_id?: string;
          motivo_revocacion?: string | null;
          origen?: Database['public']['Enums']['origen_datos'];
          revocado_en?: string | null;
          revocado_por?: string | null;
          token_hash?: string;
          token_prefijo?: string;
          ultimo_uso_en?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'accesos_freelance_creado_por_fkey';
            columns: ['creado_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'accesos_freelance_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'accesos_freelance_maleta_id_fkey';
            columns: ['maleta_id'];
            isOneToOne: false;
            referencedRelation: 'maletas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'accesos_freelance_revocado_por_fkey';
            columns: ['revocado_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      bodegas: {
        Row: {
          activa: boolean;
          actualizado_en: string;
          codigo: string;
          creado_en: string;
          id: string;
          lote_semilla_id: string | null;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          responsable_id: string | null;
          tipo: Database['public']['Enums']['tipo_bodega'];
        };
        Insert: {
          activa?: boolean;
          actualizado_en?: string;
          codigo: string;
          creado_en?: string;
          id?: string;
          lote_semilla_id?: string | null;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          responsable_id?: string | null;
          tipo: Database['public']['Enums']['tipo_bodega'];
        };
        Update: {
          activa?: boolean;
          actualizado_en?: string;
          codigo?: string;
          creado_en?: string;
          id?: string;
          lote_semilla_id?: string | null;
          nombre?: string;
          origen?: Database['public']['Enums']['origen_datos'];
          responsable_id?: string | null;
          tipo?: Database['public']['Enums']['tipo_bodega'];
        };
        Relationships: [
          {
            foreignKeyName: 'bodegas_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bodegas_responsable_id_fkey';
            columns: ['responsable_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      cambios_sync: {
        Row: {
          eliminado: boolean;
          entidad_id: string;
          entidad_tipo: string;
          entidad_version: number;
          ordinal: number;
          payload: Json;
          secuencia_servidor: number;
        };
        Insert: {
          eliminado?: boolean;
          entidad_id: string;
          entidad_tipo: string;
          entidad_version: number;
          ordinal: number;
          payload: Json;
          secuencia_servidor: number;
        };
        Update: {
          eliminado?: boolean;
          entidad_id?: string;
          entidad_tipo?: string;
          entidad_version?: number;
          ordinal?: number;
          payload?: Json;
          secuencia_servidor?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'cambios_sync_secuencia_servidor_fkey';
            columns: ['secuencia_servidor'];
            isOneToOne: false;
            referencedRelation: 'commits_sync';
            referencedColumns: ['secuencia_servidor'];
          },
        ];
      };
      ciclos_reprocesamiento: {
        Row: {
          actualizado_en: string;
          bodega_destino_id: string | null;
          cancelada_en: string | null;
          cancelada_por: string | null;
          creado_en: string;
          estado: Database['public']['Enums']['estado_reprocesamiento'];
          finalizada_en: string | null;
          finalizada_por: string | null;
          id: string;
          ingresada_por: string | null;
          ingresada_por_sesion_freelance_id: string | null;
          ingreso_en: string;
          lote_semilla_id: string | null;
          maleta_origen_id: string | null;
          motivo: string;
          observacion: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          pieza_id: string;
          version: number;
        };
        Insert: {
          actualizado_en?: string;
          bodega_destino_id?: string | null;
          cancelada_en?: string | null;
          cancelada_por?: string | null;
          creado_en?: string;
          estado?: Database['public']['Enums']['estado_reprocesamiento'];
          finalizada_en?: string | null;
          finalizada_por?: string | null;
          id: string;
          ingresada_por?: string | null;
          ingresada_por_sesion_freelance_id?: string | null;
          ingreso_en: string;
          lote_semilla_id?: string | null;
          maleta_origen_id?: string | null;
          motivo: string;
          observacion?: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          pieza_id: string;
          version?: number;
        };
        Update: {
          actualizado_en?: string;
          bodega_destino_id?: string | null;
          cancelada_en?: string | null;
          cancelada_por?: string | null;
          creado_en?: string;
          estado?: Database['public']['Enums']['estado_reprocesamiento'];
          finalizada_en?: string | null;
          finalizada_por?: string | null;
          id?: string;
          ingresada_por?: string | null;
          ingresada_por_sesion_freelance_id?: string | null;
          ingreso_en?: string;
          lote_semilla_id?: string | null;
          maleta_origen_id?: string | null;
          motivo?: string;
          observacion?: string | null;
          origen?: Database['public']['Enums']['origen_datos'];
          pieza_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'ciclos_reprocesamiento_bodega_destino_id_fkey';
            columns: ['bodega_destino_id'];
            isOneToOne: false;
            referencedRelation: 'bodegas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ciclos_reprocesamiento_cancelada_por_fkey';
            columns: ['cancelada_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ciclos_reprocesamiento_finalizada_por_fkey';
            columns: ['finalizada_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ciclos_reprocesamiento_ingresada_por_fkey';
            columns: ['ingresada_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ciclos_reprocesamiento_ingresada_por_sesion_freelance_id_fkey';
            columns: ['ingresada_por_sesion_freelance_id'];
            isOneToOne: false;
            referencedRelation: 'sesiones_freelance';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ciclos_reprocesamiento_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ciclos_reprocesamiento_maleta_origen_id_fkey';
            columns: ['maleta_origen_id'];
            isOneToOne: false;
            referencedRelation: 'maletas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ciclos_reprocesamiento_pieza_id_fkey';
            columns: ['pieza_id'];
            isOneToOne: false;
            referencedRelation: 'piezas';
            referencedColumns: ['id'];
          },
        ];
      };
      commits_sync: {
        Row: {
          creado_en: string;
          id: string;
          lote_semilla_id: string | null;
          operacion_id: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          secuencia_servidor: number;
        };
        Insert: {
          creado_en?: string;
          id?: string;
          lote_semilla_id?: string | null;
          operacion_id?: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          secuencia_servidor: number;
        };
        Update: {
          creado_en?: string;
          id?: string;
          lote_semilla_id?: string | null;
          operacion_id?: string | null;
          origen?: Database['public']['Enums']['origen_datos'];
          secuencia_servidor?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'commits_sync_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'commits_sync_operacion_id_fkey';
            columns: ['operacion_id'];
            isOneToOne: false;
            referencedRelation: 'operaciones_sync';
            referencedColumns: ['id'];
          },
        ];
      };
      configuracion_sistema: {
        Row: {
          actualizado_en: string;
          ciclo_vida: Database['public']['Enums']['ciclo_vida_sistema'];
          ciudad_base: string;
          epoca_handoff: string;
          lote_demo_activo_id: string | null;
          reset_demo_habilitado: boolean;
          singleton: boolean;
        };
        Insert: {
          actualizado_en?: string;
          ciclo_vida: Database['public']['Enums']['ciclo_vida_sistema'];
          ciudad_base?: string;
          epoca_handoff?: string;
          lote_demo_activo_id?: string | null;
          reset_demo_habilitado: boolean;
          singleton?: boolean;
        };
        Update: {
          actualizado_en?: string;
          ciclo_vida?: Database['public']['Enums']['ciclo_vida_sistema'];
          ciudad_base?: string;
          epoca_handoff?: string;
          lote_demo_activo_id?: string | null;
          reset_demo_habilitado?: boolean;
          singleton?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'configuracion_sistema_lote_demo_activo_id_fkey';
            columns: ['lote_demo_activo_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
        ];
      };
      conflicto_candidatos: {
        Row: {
          conflicto_id: string;
          creado_en: string;
          dispositivo_id: string;
          estado_propuesto: Database['public']['Enums']['estado_pieza'];
          evento_id: string | null;
          evidencia: Json;
          hlc: string;
          id: string;
          maleta_id: string | null;
          operacion_id: string;
          usuario_id: string;
        };
        Insert: {
          conflicto_id: string;
          creado_en?: string;
          dispositivo_id: string;
          estado_propuesto: Database['public']['Enums']['estado_pieza'];
          evento_id?: string | null;
          evidencia: Json;
          hlc: string;
          id: string;
          maleta_id?: string | null;
          operacion_id: string;
          usuario_id: string;
        };
        Update: {
          conflicto_id?: string;
          creado_en?: string;
          dispositivo_id?: string;
          estado_propuesto?: Database['public']['Enums']['estado_pieza'];
          evento_id?: string | null;
          evidencia?: Json;
          hlc?: string;
          id?: string;
          maleta_id?: string | null;
          operacion_id?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conflicto_candidatos_conflicto_id_fkey';
            columns: ['conflicto_id'];
            isOneToOne: false;
            referencedRelation: 'conflictos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conflicto_candidatos_dispositivo_id_fkey';
            columns: ['dispositivo_id'];
            isOneToOne: false;
            referencedRelation: 'dispositivos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conflicto_candidatos_evento_id_fkey';
            columns: ['evento_id'];
            isOneToOne: false;
            referencedRelation: 'eventos_dominio';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conflicto_candidatos_maleta_id_fkey';
            columns: ['maleta_id'];
            isOneToOne: false;
            referencedRelation: 'maletas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conflicto_candidatos_operacion_id_fkey';
            columns: ['operacion_id'];
            isOneToOne: false;
            referencedRelation: 'operaciones_sync';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conflicto_candidatos_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      conflictos: {
        Row: {
          detectado_en: string;
          estado: Database['public']['Enums']['estado_conflicto'];
          estado_adjudicado: Database['public']['Enums']['estado_pieza'] | null;
          estado_pieza_previo: Database['public']['Enums']['estado_pieza'];
          id: string;
          lote_semilla_id: string | null;
          metadata: Json;
          origen: Database['public']['Enums']['origen_datos'];
          pieza_id: string;
          resolucion: string | null;
          resuelto_en: string | null;
          resuelto_por: string | null;
          version: number;
        };
        Insert: {
          detectado_en?: string;
          estado?: Database['public']['Enums']['estado_conflicto'];
          estado_adjudicado?: Database['public']['Enums']['estado_pieza'] | null;
          estado_pieza_previo: Database['public']['Enums']['estado_pieza'];
          id: string;
          lote_semilla_id?: string | null;
          metadata?: Json;
          origen: Database['public']['Enums']['origen_datos'];
          pieza_id: string;
          resolucion?: string | null;
          resuelto_en?: string | null;
          resuelto_por?: string | null;
          version?: number;
        };
        Update: {
          detectado_en?: string;
          estado?: Database['public']['Enums']['estado_conflicto'];
          estado_adjudicado?: Database['public']['Enums']['estado_pieza'] | null;
          estado_pieza_previo?: Database['public']['Enums']['estado_pieza'];
          id?: string;
          lote_semilla_id?: string | null;
          metadata?: Json;
          origen?: Database['public']['Enums']['origen_datos'];
          pieza_id?: string;
          resolucion?: string | null;
          resuelto_en?: string | null;
          resuelto_por?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'conflictos_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conflictos_pieza_id_fkey';
            columns: ['pieza_id'];
            isOneToOne: false;
            referencedRelation: 'piezas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conflictos_resuelto_por_fkey';
            columns: ['resuelto_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      dispositivo_usuarios: {
        Row: {
          creado_en: string;
          dispositivo_id: string;
          habilitado: boolean;
          usuario_id: string;
          valido_hasta: string;
          verificado_en: string;
        };
        Insert: {
          creado_en?: string;
          dispositivo_id: string;
          habilitado?: boolean;
          usuario_id: string;
          valido_hasta: string;
          verificado_en?: string;
        };
        Update: {
          creado_en?: string;
          dispositivo_id?: string;
          habilitado?: boolean;
          usuario_id?: string;
          valido_hasta?: string;
          verificado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dispositivo_usuarios_dispositivo_id_fkey';
            columns: ['dispositivo_id'];
            isOneToOne: false;
            referencedRelation: 'dispositivos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispositivo_usuarios_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      dispositivos: {
        Row: {
          activo: boolean;
          clave_publica: string | null;
          epoca_handoff: string;
          id: string;
          lote_semilla_id: string | null;
          metadata: Json;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          plataforma: string | null;
          primer_contacto_en: string;
          retirado_en: string | null;
          ultimo_cursor: number;
          ultimo_sync_en: string | null;
        };
        Insert: {
          activo?: boolean;
          clave_publica?: string | null;
          epoca_handoff: string;
          id: string;
          lote_semilla_id?: string | null;
          metadata?: Json;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          plataforma?: string | null;
          primer_contacto_en?: string;
          retirado_en?: string | null;
          ultimo_cursor?: number;
          ultimo_sync_en?: string | null;
        };
        Update: {
          activo?: boolean;
          clave_publica?: string | null;
          epoca_handoff?: string;
          id?: string;
          lote_semilla_id?: string | null;
          metadata?: Json;
          nombre?: string;
          origen?: Database['public']['Enums']['origen_datos'];
          plataforma?: string | null;
          primer_contacto_en?: string;
          retirado_en?: string | null;
          ultimo_cursor?: number;
          ultimo_sync_en?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'dispositivos_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
        ];
      };
      eventos_dominio: {
        Row: {
          actor_rol: Database['public']['Enums']['rol_aplicacion'];
          actor_sesion_freelance_id: string | null;
          actor_tipo: Database['public']['Enums']['tipo_actor'];
          actor_usuario_id: string | null;
          agregado_id: string;
          dispositivo_id: string | null;
          estado_anterior: string | null;
          estado_posterior: string | null;
          hlc: string;
          hlc_contador: number;
          hlc_dispositivo_id: string;
          hlc_milisegundos: number;
          id: string;
          lote_semilla_id: string | null;
          maleta_id: string | null;
          metadata: Json;
          operacion_id: string;
          ordinal: number;
          origen: Database['public']['Enums']['origen_datos'];
          payload: Json;
          pieza_id: string | null;
          recibido_en_servidor: string;
          registrado_en_cliente: string;
          resultado: Database['public']['Enums']['resultado_evento'];
          tipo_agregado: string;
          tipo_evento: string;
          version_esperada: number | null;
          version_resultante: number | null;
        };
        Insert: {
          actor_rol: Database['public']['Enums']['rol_aplicacion'];
          actor_sesion_freelance_id?: string | null;
          actor_tipo: Database['public']['Enums']['tipo_actor'];
          actor_usuario_id?: string | null;
          agregado_id: string;
          dispositivo_id?: string | null;
          estado_anterior?: string | null;
          estado_posterior?: string | null;
          hlc: string;
          hlc_contador: number;
          hlc_dispositivo_id: string;
          hlc_milisegundos: number;
          id: string;
          lote_semilla_id?: string | null;
          maleta_id?: string | null;
          metadata?: Json;
          operacion_id: string;
          ordinal: number;
          origen: Database['public']['Enums']['origen_datos'];
          payload: Json;
          pieza_id?: string | null;
          recibido_en_servidor?: string;
          registrado_en_cliente: string;
          resultado: Database['public']['Enums']['resultado_evento'];
          tipo_agregado: string;
          tipo_evento: string;
          version_esperada?: number | null;
          version_resultante?: number | null;
        };
        Update: {
          actor_rol?: Database['public']['Enums']['rol_aplicacion'];
          actor_sesion_freelance_id?: string | null;
          actor_tipo?: Database['public']['Enums']['tipo_actor'];
          actor_usuario_id?: string | null;
          agregado_id?: string;
          dispositivo_id?: string | null;
          estado_anterior?: string | null;
          estado_posterior?: string | null;
          hlc?: string;
          hlc_contador?: number;
          hlc_dispositivo_id?: string;
          hlc_milisegundos?: number;
          id?: string;
          lote_semilla_id?: string | null;
          maleta_id?: string | null;
          metadata?: Json;
          operacion_id?: string;
          ordinal?: number;
          origen?: Database['public']['Enums']['origen_datos'];
          payload?: Json;
          pieza_id?: string | null;
          recibido_en_servidor?: string;
          registrado_en_cliente?: string;
          resultado?: Database['public']['Enums']['resultado_evento'];
          tipo_agregado?: string;
          tipo_evento?: string;
          version_esperada?: number | null;
          version_resultante?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'eventos_dominio_actor_sesion_freelance_id_fkey';
            columns: ['actor_sesion_freelance_id'];
            isOneToOne: false;
            referencedRelation: 'sesiones_freelance';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'eventos_dominio_actor_usuario_id_fkey';
            columns: ['actor_usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'eventos_dominio_dispositivo_id_fkey';
            columns: ['dispositivo_id'];
            isOneToOne: false;
            referencedRelation: 'dispositivos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'eventos_dominio_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'eventos_dominio_maleta_id_fkey';
            columns: ['maleta_id'];
            isOneToOne: false;
            referencedRelation: 'maletas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'eventos_dominio_operacion_id_fkey';
            columns: ['operacion_id'];
            isOneToOne: false;
            referencedRelation: 'operaciones_sync';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'eventos_dominio_pieza_id_fkey';
            columns: ['pieza_id'];
            isOneToOne: false;
            referencedRelation: 'piezas';
            referencedColumns: ['id'];
          },
        ];
      };
      excepciones_precio: {
        Row: {
          actualizado_en: string;
          creado_en: string;
          decidida_en: string | null;
          decidida_por: string | null;
          estado: Database['public']['Enums']['estado_aprobacion'];
          hospital_id: string;
          id: string;
          lote_semilla_id: string | null;
          motivo: string;
          observaciones: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          precio_centavos: number;
          producto_id: string;
          propuesta_en: string;
          propuesta_por: string;
          version: number;
          vigente_desde: string;
          vigente_hasta: string | null;
        };
        Insert: {
          actualizado_en?: string;
          creado_en?: string;
          decidida_en?: string | null;
          decidida_por?: string | null;
          estado?: Database['public']['Enums']['estado_aprobacion'];
          hospital_id: string;
          id: string;
          lote_semilla_id?: string | null;
          motivo: string;
          observaciones?: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          precio_centavos: number;
          producto_id: string;
          propuesta_en: string;
          propuesta_por: string;
          version?: number;
          vigente_desde: string;
          vigente_hasta?: string | null;
        };
        Update: {
          actualizado_en?: string;
          creado_en?: string;
          decidida_en?: string | null;
          decidida_por?: string | null;
          estado?: Database['public']['Enums']['estado_aprobacion'];
          hospital_id?: string;
          id?: string;
          lote_semilla_id?: string | null;
          motivo?: string;
          observaciones?: string | null;
          origen?: Database['public']['Enums']['origen_datos'];
          precio_centavos?: number;
          producto_id?: string;
          propuesta_en?: string;
          propuesta_por?: string;
          version?: number;
          vigente_desde?: string;
          vigente_hasta?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'excepciones_precio_decidida_por_fkey';
            columns: ['decidida_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'excepciones_precio_hospital_id_fkey';
            columns: ['hospital_id'];
            isOneToOne: false;
            referencedRelation: 'hospitales';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'excepciones_precio_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'excepciones_precio_producto_id_fkey';
            columns: ['producto_id'];
            isOneToOne: false;
            referencedRelation: 'productos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'excepciones_precio_propuesta_por_fkey';
            columns: ['propuesta_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      factura_lineas: {
        Row: {
          actualizado_en: string;
          cantidad: number;
          codigo_pieza_snapshot: string | null;
          creado_en: string;
          estado_aprobacion_snapshot: Database['public']['Enums']['estado_aprobacion'] | null;
          excepcion_precio_id: string | null;
          explicacion: string;
          factura_id: string;
          id: string;
          lote_semilla_id: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          pieza_id: string | null;
          precio_unitario_centavos: number;
          producto_id: string | null;
          producto_nombre_snapshot: string;
          requiere_aprobacion: boolean;
          revision_precio: number;
          sku_snapshot: string;
          subtotal_centavos: number | null;
          tipo_precio: Database['public']['Enums']['tipo_precio_aplicado'];
        };
        Insert: {
          actualizado_en?: string;
          cantidad: number;
          codigo_pieza_snapshot?: string | null;
          creado_en?: string;
          estado_aprobacion_snapshot?: Database['public']['Enums']['estado_aprobacion'] | null;
          excepcion_precio_id?: string | null;
          explicacion: string;
          factura_id: string;
          id: string;
          lote_semilla_id?: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          pieza_id?: string | null;
          precio_unitario_centavos: number;
          producto_id?: string | null;
          producto_nombre_snapshot: string;
          requiere_aprobacion?: boolean;
          revision_precio?: number;
          sku_snapshot: string;
          subtotal_centavos?: number | null;
          tipo_precio: Database['public']['Enums']['tipo_precio_aplicado'];
        };
        Update: {
          actualizado_en?: string;
          cantidad?: number;
          codigo_pieza_snapshot?: string | null;
          creado_en?: string;
          estado_aprobacion_snapshot?: Database['public']['Enums']['estado_aprobacion'] | null;
          excepcion_precio_id?: string | null;
          explicacion?: string;
          factura_id?: string;
          id?: string;
          lote_semilla_id?: string | null;
          origen?: Database['public']['Enums']['origen_datos'];
          pieza_id?: string | null;
          precio_unitario_centavos?: number;
          producto_id?: string | null;
          producto_nombre_snapshot?: string;
          requiere_aprobacion?: boolean;
          revision_precio?: number;
          sku_snapshot?: string;
          subtotal_centavos?: number | null;
          tipo_precio?: Database['public']['Enums']['tipo_precio_aplicado'];
        };
        Relationships: [
          {
            foreignKeyName: 'factura_lineas_excepcion_precio_id_fkey';
            columns: ['excepcion_precio_id'];
            isOneToOne: false;
            referencedRelation: 'excepciones_precio';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'factura_lineas_factura_id_fkey';
            columns: ['factura_id'];
            isOneToOne: false;
            referencedRelation: 'facturas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'factura_lineas_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'factura_lineas_pieza_id_fkey';
            columns: ['pieza_id'];
            isOneToOne: false;
            referencedRelation: 'piezas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'factura_lineas_producto_id_fkey';
            columns: ['producto_id'];
            isOneToOne: false;
            referencedRelation: 'productos';
            referencedColumns: ['id'];
          },
        ];
      };
      facturas: {
        Row: {
          actualizado_en: string;
          creada_por: string;
          creado_en: string;
          emitida_en: string | null;
          emitida_por: string | null;
          estado: Database['public']['Enums']['estado_factura'];
          hospital_ciudad_snapshot: string;
          hospital_id: string;
          hospital_nombre_snapshot: string;
          id: string;
          lote_semilla_id: string | null;
          maleta_id: string;
          nivel_precio_snapshot: Database['public']['Enums']['nivel_precio'];
          numero: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          requiere_aprobacion: boolean;
          requiere_recalculo: boolean;
          revision_precios: number;
          total_centavos: number;
          version: number;
        };
        Insert: {
          actualizado_en?: string;
          creada_por: string;
          creado_en?: string;
          emitida_en?: string | null;
          emitida_por?: string | null;
          estado?: Database['public']['Enums']['estado_factura'];
          hospital_ciudad_snapshot: string;
          hospital_id: string;
          hospital_nombre_snapshot: string;
          id: string;
          lote_semilla_id?: string | null;
          maleta_id: string;
          nivel_precio_snapshot: Database['public']['Enums']['nivel_precio'];
          numero?: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          requiere_aprobacion?: boolean;
          requiere_recalculo?: boolean;
          revision_precios?: number;
          total_centavos?: number;
          version?: number;
        };
        Update: {
          actualizado_en?: string;
          creada_por?: string;
          creado_en?: string;
          emitida_en?: string | null;
          emitida_por?: string | null;
          estado?: Database['public']['Enums']['estado_factura'];
          hospital_ciudad_snapshot?: string;
          hospital_id?: string;
          hospital_nombre_snapshot?: string;
          id?: string;
          lote_semilla_id?: string | null;
          maleta_id?: string;
          nivel_precio_snapshot?: Database['public']['Enums']['nivel_precio'];
          numero?: string | null;
          origen?: Database['public']['Enums']['origen_datos'];
          requiere_aprobacion?: boolean;
          requiere_recalculo?: boolean;
          revision_precios?: number;
          total_centavos?: number;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'facturas_creada_por_fkey';
            columns: ['creada_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'facturas_emitida_por_fkey';
            columns: ['emitida_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'facturas_hospital_id_fkey';
            columns: ['hospital_id'];
            isOneToOne: false;
            referencedRelation: 'hospitales';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'facturas_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'facturas_maleta_id_fkey';
            columns: ['maleta_id'];
            isOneToOne: true;
            referencedRelation: 'maletas';
            referencedColumns: ['id'];
          },
        ];
      };
      hospitales: {
        Row: {
          activo: boolean;
          actualizado_en: string;
          ciudad: string;
          codigo: string;
          creado_en: string;
          eliminado_en: string | null;
          id: string;
          lote_semilla_id: string | null;
          nivel_precio: Database['public']['Enums']['nivel_precio'];
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          version: number;
        };
        Insert: {
          activo?: boolean;
          actualizado_en?: string;
          ciudad: string;
          codigo: string;
          creado_en?: string;
          eliminado_en?: string | null;
          id?: string;
          lote_semilla_id?: string | null;
          nivel_precio: Database['public']['Enums']['nivel_precio'];
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          version?: number;
        };
        Update: {
          activo?: boolean;
          actualizado_en?: string;
          ciudad?: string;
          codigo?: string;
          creado_en?: string;
          eliminado_en?: string | null;
          id?: string;
          lote_semilla_id?: string | null;
          nivel_precio?: Database['public']['Enums']['nivel_precio'];
          nombre?: string;
          origen?: Database['public']['Enums']['origen_datos'];
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'hospitales_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
        ];
      };
      lotes_semilla: {
        Row: {
          creado_en: string;
          estado: Database['public']['Enums']['estado_lote_semilla'];
          id: string;
          purgado_en: string | null;
          resumen_purga: Json | null;
          version_semilla: string;
        };
        Insert: {
          creado_en?: string;
          estado?: Database['public']['Enums']['estado_lote_semilla'];
          id?: string;
          purgado_en?: string | null;
          resumen_purga?: Json | null;
          version_semilla: string;
        };
        Update: {
          creado_en?: string;
          estado?: Database['public']['Enums']['estado_lote_semilla'];
          id?: string;
          purgado_en?: string | null;
          resumen_purga?: Json | null;
          version_semilla?: string;
        };
        Relationships: [];
      };
      maleta_items: {
        Row: {
          actualizado_en: string;
          agregada_en: string;
          agregada_por: string;
          creado_en: string;
          finalizada_en: string | null;
          id: string;
          lote_semilla_id: string | null;
          maleta_id: string;
          origen: Database['public']['Enums']['origen_datos'];
          pieza_id: string;
          resultado: Database['public']['Enums']['resultado_item_maleta'] | null;
          retirada_en: string | null;
          retirada_por: string | null;
          usada_en: string | null;
          usada_por: string | null;
          usada_por_sesion_freelance_id: string | null;
          version: number;
        };
        Insert: {
          actualizado_en?: string;
          agregada_en: string;
          agregada_por: string;
          creado_en?: string;
          finalizada_en?: string | null;
          id: string;
          lote_semilla_id?: string | null;
          maleta_id: string;
          origen: Database['public']['Enums']['origen_datos'];
          pieza_id: string;
          resultado?: Database['public']['Enums']['resultado_item_maleta'] | null;
          retirada_en?: string | null;
          retirada_por?: string | null;
          usada_en?: string | null;
          usada_por?: string | null;
          usada_por_sesion_freelance_id?: string | null;
          version?: number;
        };
        Update: {
          actualizado_en?: string;
          agregada_en?: string;
          agregada_por?: string;
          creado_en?: string;
          finalizada_en?: string | null;
          id?: string;
          lote_semilla_id?: string | null;
          maleta_id?: string;
          origen?: Database['public']['Enums']['origen_datos'];
          pieza_id?: string;
          resultado?: Database['public']['Enums']['resultado_item_maleta'] | null;
          retirada_en?: string | null;
          retirada_por?: string | null;
          usada_en?: string | null;
          usada_por?: string | null;
          usada_por_sesion_freelance_id?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'maleta_items_agregada_por_fkey';
            columns: ['agregada_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maleta_items_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maleta_items_maleta_id_fkey';
            columns: ['maleta_id'];
            isOneToOne: false;
            referencedRelation: 'maletas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maleta_items_pieza_id_fkey';
            columns: ['pieza_id'];
            isOneToOne: false;
            referencedRelation: 'piezas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maleta_items_retirada_por_fkey';
            columns: ['retirada_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maleta_items_usada_por_fkey';
            columns: ['usada_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maleta_items_usada_por_sesion_freelance_id_fkey';
            columns: ['usada_por_sesion_freelance_id'];
            isOneToOne: false;
            referencedRelation: 'sesiones_freelance';
            referencedColumns: ['id'];
          },
        ];
      };
      maleta_participantes: {
        Row: {
          agregado_en: string;
          agregado_por: string;
          funcion: string;
          maleta_id: string;
          retirado_en: string | null;
          usuario_id: string;
        };
        Insert: {
          agregado_en?: string;
          agregado_por: string;
          funcion: string;
          maleta_id: string;
          retirado_en?: string | null;
          usuario_id: string;
        };
        Update: {
          agregado_en?: string;
          agregado_por?: string;
          funcion?: string;
          maleta_id?: string;
          retirado_en?: string | null;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'maleta_participantes_agregado_por_fkey';
            columns: ['agregado_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maleta_participantes_maleta_id_fkey';
            columns: ['maleta_id'];
            isOneToOne: false;
            referencedRelation: 'maletas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maleta_participantes_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      maletas: {
        Row: {
          abierta_en: string;
          actualizado_en: string;
          cancelada_en: string | null;
          cerrada_en: string | null;
          creado_en: string;
          eliminado_en: string | null;
          estado: Database['public']['Enums']['estado_maleta'];
          hospital_id: string | null;
          id: string;
          lote_semilla_id: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          procedimiento: string | null;
          responsable_id: string;
          salio_en: string | null;
          ultimo_hlc: string;
          version: number;
        };
        Insert: {
          abierta_en: string;
          actualizado_en?: string;
          cancelada_en?: string | null;
          cerrada_en?: string | null;
          creado_en?: string;
          eliminado_en?: string | null;
          estado?: Database['public']['Enums']['estado_maleta'];
          hospital_id?: string | null;
          id: string;
          lote_semilla_id?: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          procedimiento?: string | null;
          responsable_id: string;
          salio_en?: string | null;
          ultimo_hlc: string;
          version?: number;
        };
        Update: {
          abierta_en?: string;
          actualizado_en?: string;
          cancelada_en?: string | null;
          cerrada_en?: string | null;
          creado_en?: string;
          eliminado_en?: string | null;
          estado?: Database['public']['Enums']['estado_maleta'];
          hospital_id?: string | null;
          id?: string;
          lote_semilla_id?: string | null;
          origen?: Database['public']['Enums']['origen_datos'];
          procedimiento?: string | null;
          responsable_id?: string;
          salio_en?: string | null;
          ultimo_hlc?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'maletas_hospital_id_fkey';
            columns: ['hospital_id'];
            isOneToOne: false;
            referencedRelation: 'hospitales';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maletas_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'maletas_responsable_id_fkey';
            columns: ['responsable_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      membresias_kit_pieza: {
        Row: {
          agregado_en: string;
          agregado_por: string;
          componente_pieza_id: string;
          creado_en: string;
          id: string;
          kit_pieza_id: string;
          lote_semilla_id: string | null;
          motivo_retiro: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          retirado_en: string | null;
          retirado_por: string | null;
        };
        Insert: {
          agregado_en: string;
          agregado_por: string;
          componente_pieza_id: string;
          creado_en?: string;
          id: string;
          kit_pieza_id: string;
          lote_semilla_id?: string | null;
          motivo_retiro?: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          retirado_en?: string | null;
          retirado_por?: string | null;
        };
        Update: {
          agregado_en?: string;
          agregado_por?: string;
          componente_pieza_id?: string;
          creado_en?: string;
          id?: string;
          kit_pieza_id?: string;
          lote_semilla_id?: string | null;
          motivo_retiro?: string | null;
          origen?: Database['public']['Enums']['origen_datos'];
          retirado_en?: string | null;
          retirado_por?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'membresias_kit_pieza_agregado_por_fkey';
            columns: ['agregado_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'membresias_kit_pieza_componente_pieza_id_fkey';
            columns: ['componente_pieza_id'];
            isOneToOne: false;
            referencedRelation: 'piezas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'membresias_kit_pieza_kit_pieza_id_fkey';
            columns: ['kit_pieza_id'];
            isOneToOne: false;
            referencedRelation: 'piezas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'membresias_kit_pieza_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'membresias_kit_pieza_retirado_por_fkey';
            columns: ['retirado_por'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      operaciones_sync: {
        Row: {
          actor_sesion_freelance_id: string | null;
          actor_usuario_id: string | null;
          codigo_resultado: string | null;
          detalle_resultado: Json;
          dispositivo_id: string;
          estado: Database['public']['Enums']['estado_operacion_sync'];
          id: string;
          lote_semilla_id: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          payload_hash: string;
          procesada_en: string | null;
          recibida_en: string;
          secuencia_cliente: number;
        };
        Insert: {
          actor_sesion_freelance_id?: string | null;
          actor_usuario_id?: string | null;
          codigo_resultado?: string | null;
          detalle_resultado?: Json;
          dispositivo_id: string;
          estado?: Database['public']['Enums']['estado_operacion_sync'];
          id: string;
          lote_semilla_id?: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          payload_hash: string;
          procesada_en?: string | null;
          recibida_en?: string;
          secuencia_cliente: number;
        };
        Update: {
          actor_sesion_freelance_id?: string | null;
          actor_usuario_id?: string | null;
          codigo_resultado?: string | null;
          detalle_resultado?: Json;
          dispositivo_id?: string;
          estado?: Database['public']['Enums']['estado_operacion_sync'];
          id?: string;
          lote_semilla_id?: string | null;
          origen?: Database['public']['Enums']['origen_datos'];
          payload_hash?: string;
          procesada_en?: string | null;
          recibida_en?: string;
          secuencia_cliente?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'operaciones_sync_actor_sesion_freelance_id_fkey';
            columns: ['actor_sesion_freelance_id'];
            isOneToOne: false;
            referencedRelation: 'sesiones_freelance';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operaciones_sync_actor_usuario_id_fkey';
            columns: ['actor_usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operaciones_sync_dispositivo_id_fkey';
            columns: ['dispositivo_id'];
            isOneToOne: false;
            referencedRelation: 'dispositivos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operaciones_sync_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
        ];
      };
      perfiles: {
        Row: {
          activo: boolean;
          actualizado_en: string;
          creado_en: string;
          eliminado_en: string | null;
          id: string;
          lote_semilla_id: string | null;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          rol: Database['public']['Enums']['rol_aplicacion'];
        };
        Insert: {
          activo?: boolean;
          actualizado_en?: string;
          creado_en?: string;
          eliminado_en?: string | null;
          id: string;
          lote_semilla_id?: string | null;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          rol: Database['public']['Enums']['rol_aplicacion'];
        };
        Update: {
          activo?: boolean;
          actualizado_en?: string;
          creado_en?: string;
          eliminado_en?: string | null;
          id?: string;
          lote_semilla_id?: string | null;
          nombre?: string;
          origen?: Database['public']['Enums']['origen_datos'];
          rol?: Database['public']['Enums']['rol_aplicacion'];
        };
        Relationships: [
          {
            foreignKeyName: 'perfiles_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
        ];
      };
      piezas: {
        Row: {
          actualizado_en: string;
          bodega_retorno_id: string;
          codigo: string;
          creado_en: string;
          eliminado_en: string | null;
          estado: Database['public']['Enums']['estado_pieza'];
          id: string;
          kit_padre_id: string | null;
          lote_semilla_id: string | null;
          maleta_actual_id: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          producto_id: string;
          ultimo_hlc: string;
          ultimo_hlc_contador: number;
          ultimo_hlc_dispositivo_id: string;
          ultimo_hlc_milisegundos: number;
          version: number;
        };
        Insert: {
          actualizado_en?: string;
          bodega_retorno_id: string;
          codigo: string;
          creado_en?: string;
          eliminado_en?: string | null;
          estado: Database['public']['Enums']['estado_pieza'];
          id: string;
          kit_padre_id?: string | null;
          lote_semilla_id?: string | null;
          maleta_actual_id?: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          producto_id: string;
          ultimo_hlc: string;
          ultimo_hlc_contador: number;
          ultimo_hlc_dispositivo_id: string;
          ultimo_hlc_milisegundos: number;
          version?: number;
        };
        Update: {
          actualizado_en?: string;
          bodega_retorno_id?: string;
          codigo?: string;
          creado_en?: string;
          eliminado_en?: string | null;
          estado?: Database['public']['Enums']['estado_pieza'];
          id?: string;
          kit_padre_id?: string | null;
          lote_semilla_id?: string | null;
          maleta_actual_id?: string | null;
          origen?: Database['public']['Enums']['origen_datos'];
          producto_id?: string;
          ultimo_hlc?: string;
          ultimo_hlc_contador?: number;
          ultimo_hlc_dispositivo_id?: string;
          ultimo_hlc_milisegundos?: number;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'piezas_bodega_retorno_id_fkey';
            columns: ['bodega_retorno_id'];
            isOneToOne: false;
            referencedRelation: 'bodegas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'piezas_kit_padre_id_fkey';
            columns: ['kit_padre_id'];
            isOneToOne: false;
            referencedRelation: 'piezas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'piezas_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'piezas_maleta_actual_id_fkey';
            columns: ['maleta_actual_id'];
            isOneToOne: false;
            referencedRelation: 'maletas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'piezas_producto_id_fkey';
            columns: ['producto_id'];
            isOneToOne: false;
            referencedRelation: 'productos';
            referencedColumns: ['id'];
          },
        ];
      };
      producto_componentes_kit: {
        Row: {
          cantidad: number;
          componente_producto_id: string;
          creado_en: string;
          kit_producto_id: string;
        };
        Insert: {
          cantidad?: number;
          componente_producto_id: string;
          creado_en?: string;
          kit_producto_id: string;
        };
        Update: {
          cantidad?: number;
          componente_producto_id?: string;
          creado_en?: string;
          kit_producto_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'producto_componentes_kit_componente_producto_id_fkey';
            columns: ['componente_producto_id'];
            isOneToOne: false;
            referencedRelation: 'productos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'producto_componentes_kit_kit_producto_id_fkey';
            columns: ['kit_producto_id'];
            isOneToOne: false;
            referencedRelation: 'productos';
            referencedColumns: ['id'];
          },
        ];
      };
      productos: {
        Row: {
          activo: boolean;
          actualizado_en: string;
          atributos: Json;
          costo_base_centavos: number;
          creado_en: string;
          eliminado_en: string | null;
          id: string;
          lote_semilla_id: string | null;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          sku: string;
          tipo: Database['public']['Enums']['tipo_producto'];
          version: number;
        };
        Insert: {
          activo?: boolean;
          actualizado_en?: string;
          atributos?: Json;
          costo_base_centavos: number;
          creado_en?: string;
          eliminado_en?: string | null;
          id: string;
          lote_semilla_id?: string | null;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          sku: string;
          tipo: Database['public']['Enums']['tipo_producto'];
          version?: number;
        };
        Update: {
          activo?: boolean;
          actualizado_en?: string;
          atributos?: Json;
          costo_base_centavos?: number;
          creado_en?: string;
          eliminado_en?: string | null;
          id?: string;
          lote_semilla_id?: string | null;
          nombre?: string;
          origen?: Database['public']['Enums']['origen_datos'];
          sku?: string;
          tipo?: Database['public']['Enums']['tipo_producto'];
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'productos_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
        ];
      };
      rechazos_sync: {
        Row: {
          codigo: string;
          detalle: Json;
          evento_id: string | null;
          id: string;
          motivo: string;
          operacion_id: string;
          rechazado_en: string;
        };
        Insert: {
          codigo: string;
          detalle?: Json;
          evento_id?: string | null;
          id?: string;
          motivo: string;
          operacion_id: string;
          rechazado_en?: string;
        };
        Update: {
          codigo?: string;
          detalle?: Json;
          evento_id?: string | null;
          id?: string;
          motivo?: string;
          operacion_id?: string;
          rechazado_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rechazos_sync_operacion_id_fkey';
            columns: ['operacion_id'];
            isOneToOne: false;
            referencedRelation: 'operaciones_sync';
            referencedColumns: ['id'];
          },
        ];
      };
      sesiones_freelance: {
        Row: {
          acceso_id: string;
          dispositivo_id: string;
          expira_en: string;
          id: string;
          iniciada_en: string;
          lote_semilla_id: string | null;
          nombre_snapshot: string;
          origen: Database['public']['Enums']['origen_datos'];
          revocada_en: string | null;
          ultima_actividad_en: string;
        };
        Insert: {
          acceso_id: string;
          dispositivo_id: string;
          expira_en: string;
          id?: string;
          iniciada_en?: string;
          lote_semilla_id?: string | null;
          nombre_snapshot: string;
          origen: Database['public']['Enums']['origen_datos'];
          revocada_en?: string | null;
          ultima_actividad_en?: string;
        };
        Update: {
          acceso_id?: string;
          dispositivo_id?: string;
          expira_en?: string;
          id?: string;
          iniciada_en?: string;
          lote_semilla_id?: string | null;
          nombre_snapshot?: string;
          origen?: Database['public']['Enums']['origen_datos'];
          revocada_en?: string | null;
          ultima_actividad_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sesiones_freelance_acceso_id_fkey';
            columns: ['acceso_id'];
            isOneToOne: false;
            referencedRelation: 'accesos_freelance';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sesiones_freelance_dispositivo_id_fkey';
            columns: ['dispositivo_id'];
            isOneToOne: false;
            referencedRelation: 'dispositivos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sesiones_freelance_lote_semilla_id_fkey';
            columns: ['lote_semilla_id'];
            isOneToOne: false;
            referencedRelation: 'lotes_semilla';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      activar_produccion: { Args: { p_primer_admin_id: string }; Returns: Json };
      actualizar_perfil: {
        Args: {
          p_activo: boolean;
          p_actor_id: string;
          p_nombre: string;
          p_rol: Database['public']['Enums']['rol_aplicacion'];
          p_usuario_id: string;
        };
        Returns: {
          activo: boolean;
          actualizado_en: string;
          creado_en: string;
          eliminado_en: string | null;
          id: string;
          lote_semilla_id: string | null;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          rol: Database['public']['Enums']['rol_aplicacion'];
        };
        SetofOptions: {
          from: '*';
          to: 'perfiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      actualizar_pieza_central: {
        Args: {
          p_actor_id: string;
          p_codigo: string;
          p_dispositivo_id: string;
          p_kit_padre_codigo?: string;
          p_sku: string;
          p_version_esperada?: number;
        };
        Returns: Json;
      };
      actualizar_producto_central: {
        Args: {
          p_actor_id: string;
          p_costo_base_centavos: number;
          p_nombre: string;
          p_sku: string;
          p_tipo: Database['public']['Enums']['tipo_producto'];
          p_version_esperada?: number;
        };
        Returns: Json;
      };
      aplicar_comando_maestro_offline: {
        Args: {
          p_actor_id: string;
          p_dispositivo_id: string;
          p_operacion_id: string;
          p_payload: Json;
          p_secuencia_cliente: number;
          p_tipo: string;
        };
        Returns: Json;
      };
      cargar_datos_demo: { Args: { p_actor_id: string }; Returns: Json };
      configurar_pin_administrador: {
        Args: { p_actor_id: string; p_pin: string };
        Returns: boolean;
      };
      confirmar_purga_auth: { Args: { p_desafio_id: string }; Returns: Json };
      crear_acceso_freelance: {
        Args: { p_actor_id: string; p_expira_en: string; p_maleta_id: string };
        Returns: Json;
      };
      crear_desafio_handoff: {
        Args: { p_actor_id: string; p_referencia_backup: string };
        Returns: Json;
      };
      crear_producto_central: {
        Args: {
          p_actor_id: string;
          p_costo_base_centavos: number;
          p_nombre: string;
          p_producto_id: string;
          p_sku: string;
          p_tipo: Database['public']['Enums']['tipo_producto'];
        };
        Returns: Json;
      };
      decidir_excepcion_precio: {
        Args: {
          p_actor_id: string;
          p_decision: Database['public']['Enums']['estado_aprobacion'];
          p_excepcion_id: string;
          p_motivo_decision?: string;
        };
        Returns: Json;
      };
      eliminar_hospital_central: {
        Args: {
          p_actor_id: string;
          p_hospital_id: string;
          p_version_esperada?: number;
        };
        Returns: Json;
      };
      eliminar_perfil_por_admin: {
        Args: { p_actor_id: string; p_usuario_id: string };
        Returns: Json;
      };
      eliminar_pieza_central: {
        Args: {
          p_actor_id: string;
          p_codigo: string;
          p_dispositivo_id: string;
          p_version_esperada?: number;
        };
        Returns: Json;
      };
      eliminar_producto_central: {
        Args: { p_actor_id: string; p_sku: string; p_version_esperada?: number };
        Returns: Json;
      };
      emitir_factura_central: {
        Args: {
          p_actor_id: string;
          p_dispositivo_id: string;
          p_eventos: Json;
          p_factura_id: string;
          p_numero: string;
          p_operacion_id: string;
          p_secuencia_cliente: number;
        };
        Returns: Json;
      };
      emitir_factura_central_base: {
        Args: {
          p_actor_id: string;
          p_dispositivo_id: string;
          p_eventos: Json;
          p_factura_id: string;
          p_numero: string;
          p_operacion_id: string;
          p_secuencia_cliente: number;
        };
        Returns: Json;
      };
      guardar_hospital_central: {
        Args: {
          p_actor_id: string;
          p_ciudad: string;
          p_codigo: string;
          p_hospital_id: string;
          p_nivel_precio: Database['public']['Enums']['nivel_precio'];
          p_nombre: string;
          p_version_esperada?: number;
        };
        Returns: Json;
      };
      guardar_hospital_offline: {
        Args: {
          p_actor_id: string;
          p_ciudad: string;
          p_codigo: string;
          p_dispositivo_id: string;
          p_hospital_id: string;
          p_nivel_precio: Database['public']['Enums']['nivel_precio'];
          p_nombre: string;
          p_operacion_id: string;
          p_secuencia_cliente: number;
          p_version_esperada?: number;
        };
        Returns: Json;
      };
      marcar_usuario_demo_auth_eliminado: {
        Args: { p_desafio_id: string; p_usuario_id: string };
        Returns: undefined;
      };
      obtener_cambios_freelance: {
        Args: {
          p_cursor: number;
          p_dispositivo_id: string;
          p_max_commits?: number;
          p_sesion_id: string;
        };
        Returns: Json;
      };
      obtener_cambios_sync: {
        Args: {
          p_actor_id: string;
          p_cursor: number;
          p_dispositivo_id: string;
          p_max_commits?: number;
        };
        Returns: Json;
      };
      procesar_lote_sync: {
        Args: {
          p_actor_id: string;
          p_dispositivo_id: string;
          p_operaciones: Json;
        };
        Returns: Json;
      };
      procesar_operacion_freelance: {
        Args: {
          p_dispositivo_id: string;
          p_operacion: Json;
          p_sesion_id: string;
        };
        Returns: Json;
      };
      proponer_excepcion_precio: {
        Args: {
          p_actor_id: string;
          p_hospital_id: string;
          p_id: string;
          p_motivo: string;
          p_observaciones?: string;
          p_precio_centavos: number;
          p_producto_id: string;
          p_vigente_desde: string;
          p_vigente_hasta: string;
        };
        Returns: {
          actualizado_en: string;
          creado_en: string;
          decidida_en: string | null;
          decidida_por: string | null;
          estado: Database['public']['Enums']['estado_aprobacion'];
          hospital_id: string;
          id: string;
          lote_semilla_id: string | null;
          motivo: string;
          observaciones: string | null;
          origen: Database['public']['Enums']['origen_datos'];
          precio_centavos: number;
          producto_id: string;
          propuesta_en: string;
          propuesta_por: string;
          version: number;
          vigente_desde: string;
          vigente_hasta: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'excepciones_precio';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      provisionar_perfil: {
        Args: {
          p_nombre: string;
          p_rol: Database['public']['Enums']['rol_aplicacion'];
          p_usuario_id: string;
        };
        Returns: {
          activo: boolean;
          actualizado_en: string;
          creado_en: string;
          eliminado_en: string | null;
          id: string;
          lote_semilla_id: string | null;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          rol: Database['public']['Enums']['rol_aplicacion'];
        };
        SetofOptions: {
          from: '*';
          to: 'perfiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      provisionar_usuario_por_admin: {
        Args: {
          p_actor_id: string;
          p_nombre: string;
          p_rol: Database['public']['Enums']['rol_aplicacion'];
          p_usuario_id: string;
        };
        Returns: {
          activo: boolean;
          actualizado_en: string;
          creado_en: string;
          eliminado_en: string | null;
          id: string;
          lote_semilla_id: string | null;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          rol: Database['public']['Enums']['rol_aplicacion'];
        };
        SetofOptions: {
          from: '*';
          to: 'perfiles';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      purgar_datos_demo: {
        Args: {
          p_actor_id: string;
          p_desafio_id: string;
          p_frase: string;
          p_referencia_backup: string;
          p_solo_simular?: boolean;
          p_token: string;
        };
        Returns: Json;
      };
      redimir_acceso_freelance: {
        Args: {
          p_dispositivo_id: string;
          p_nombre_dispositivo: string;
          p_nombre_freelance: string;
          p_plataforma: string;
          p_token: string;
        };
        Returns: Json;
      };
      registrar_cambio_contrasena_admin: {
        Args: { p_actor_id: string; p_usuario_id: string };
        Returns: boolean;
      };
      registrar_dispositivo: {
        Args: {
          p_actor_id: string;
          p_clave_publica: string;
          p_dispositivo_id: string;
          p_metadata?: Json;
          p_nombre: string;
          p_plataforma: string;
          p_valido_hasta: string;
        };
        Returns: {
          activo: boolean;
          clave_publica: string | null;
          epoca_handoff: string;
          id: string;
          lote_semilla_id: string | null;
          metadata: Json;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          plataforma: string | null;
          primer_contacto_en: string;
          retirado_en: string | null;
          ultimo_cursor: number;
          ultimo_sync_en: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'dispositivos';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      registrar_pieza_central: {
        Args: {
          p_actor_id: string;
          p_codigo: string;
          p_dispositivo_id: string;
          p_kit_padre_codigo?: string;
          p_pieza_id: string;
          p_sku: string;
        };
        Returns: Json;
      };
      revocar_acceso_freelance: {
        Args: { p_acceso_id: string; p_actor_id: string; p_motivo: string };
        Returns: Json;
      };
      revocar_dispositivo: {
        Args: { p_actor_id: string; p_dispositivo_id: string; p_motivo: string };
        Returns: {
          activo: boolean;
          clave_publica: string | null;
          epoca_handoff: string;
          id: string;
          lote_semilla_id: string | null;
          metadata: Json;
          nombre: string;
          origen: Database['public']['Enums']['origen_datos'];
          plataforma: string | null;
          primer_contacto_en: string;
          retirado_en: string | null;
          ultimo_cursor: number;
          ultimo_sync_en: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'dispositivos';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      validar_acceso_freelance: { Args: { p_token: string }; Returns: Json };
      verificar_pin_administrador: {
        Args: { p_actor_id: string; p_pin: string };
        Returns: Json;
      };
    };
    Enums: {
      ciclo_vida_sistema: 'DEMO' | 'PURGANDO' | 'LISTO_BOOTSTRAP' | 'PRODUCCION';
      estado_aprobacion: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
      estado_conflicto: 'ABIERTO' | 'RESUELTO';
      estado_factura: 'BORRADOR' | 'EMITIDA';
      estado_lote_semilla: 'ACTIVO' | 'PURGADO' | 'FALLIDO';
      estado_maleta: 'EN_ARMADO' | 'EN_CIRUGIA' | 'CERRADA' | 'CANCELADA';
      estado_operacion_sync: 'RECIBIDA' | 'APLICADA' | 'RECHAZADA' | 'CONFLICTO';
      estado_pieza:
        | 'EN_BODEGA_CENTRAL'
        | 'EN_BODEGA_INSTRUMENTISTA'
        | 'ASIGNADA_A_MALETA'
        | 'EN_MALETA_ACTIVA'
        | 'USADA_PENDIENTE_VALORACION'
        | 'FACTURADA'
        | 'CONSUMIDA'
        | 'EN_REPROCESAMIENTO'
        | 'EN_CONFLICTO'
        | 'EXTRAVIADA';
      estado_reprocesamiento: 'ABIERTO' | 'FINALIZADO' | 'CANCELADO';
      nivel_precio: 'BASE' | 'HABITUAL' | 'PROVINCIA' | 'NOTA_CREDITO';
      origen_datos: 'DEMO' | 'PRODUCCION';
      resultado_evento: 'ACEPTADO' | 'RECHAZADO' | 'CONFLICTO';
      resultado_item_maleta:
        'RETIRADA_ANTES_SALIDA' | 'UTILIZADA' | 'REGRESO_SIN_USO' | 'EXTRAVIADA';
      rol_aplicacion:
        | 'SISTEMA'
        | 'ADMINISTRADOR'
        | 'AUXILIAR'
        | 'COORDINADORA'
        | 'CONTABLE'
        | 'SUPERVISOR'
        | 'FREELANCE';
      tipo_actor: 'USUARIO' | 'SISTEMA' | 'FREELANCE';
      tipo_bodega: 'CENTRAL' | 'INSTRUMENTISTA';
      tipo_precio_aplicado: 'HABITUAL' | 'PROVINCIA' | 'NOTA_CREDITO' | 'ALEATORIO';
      tipo_producto: 'INSTRUMENTAL' | 'INSUMO' | 'KIT';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      ciclo_vida_sistema: ['DEMO', 'PURGANDO', 'LISTO_BOOTSTRAP', 'PRODUCCION'],
      estado_aprobacion: ['PENDIENTE', 'APROBADO', 'RECHAZADO'],
      estado_conflicto: ['ABIERTO', 'RESUELTO'],
      estado_factura: ['BORRADOR', 'EMITIDA'],
      estado_lote_semilla: ['ACTIVO', 'PURGADO', 'FALLIDO'],
      estado_maleta: ['EN_ARMADO', 'EN_CIRUGIA', 'CERRADA', 'CANCELADA'],
      estado_operacion_sync: ['RECIBIDA', 'APLICADA', 'RECHAZADA', 'CONFLICTO'],
      estado_pieza: [
        'EN_BODEGA_CENTRAL',
        'EN_BODEGA_INSTRUMENTISTA',
        'ASIGNADA_A_MALETA',
        'EN_MALETA_ACTIVA',
        'USADA_PENDIENTE_VALORACION',
        'FACTURADA',
        'CONSUMIDA',
        'EN_REPROCESAMIENTO',
        'EN_CONFLICTO',
        'EXTRAVIADA',
      ],
      estado_reprocesamiento: ['ABIERTO', 'FINALIZADO', 'CANCELADO'],
      nivel_precio: ['BASE', 'HABITUAL', 'PROVINCIA', 'NOTA_CREDITO'],
      origen_datos: ['DEMO', 'PRODUCCION'],
      resultado_evento: ['ACEPTADO', 'RECHAZADO', 'CONFLICTO'],
      resultado_item_maleta: [
        'RETIRADA_ANTES_SALIDA',
        'UTILIZADA',
        'REGRESO_SIN_USO',
        'EXTRAVIADA',
      ],
      rol_aplicacion: [
        'SISTEMA',
        'ADMINISTRADOR',
        'AUXILIAR',
        'COORDINADORA',
        'CONTABLE',
        'SUPERVISOR',
        'FREELANCE',
      ],
      tipo_actor: ['USUARIO', 'SISTEMA', 'FREELANCE'],
      tipo_bodega: ['CENTRAL', 'INSTRUMENTISTA'],
      tipo_precio_aplicado: ['HABITUAL', 'PROVINCIA', 'NOTA_CREDITO', 'ALEATORIO'],
      tipo_producto: ['INSTRUMENTAL', 'INSUMO', 'KIT'],
    },
  },
} as const;
