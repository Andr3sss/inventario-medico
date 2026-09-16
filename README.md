# Crearcos — Sistema de Inventario Quirúrgico

Sistema web **offline-first** para la gestión integral de instrumental médico y maletas quirúrgicas. Diseñado para operar en entornos clínicos con conectividad intermitente, garantizando trazabilidad completa, sincronización entre dispositivos y operación ininterrumpida sin internet.

---

## ¿Qué problema resuelve?

Los equipos de instrumentación quirúrgica necesitan rastrear en tiempo real el estado de cada pieza de instrumental — desde que sale en una maleta hasta que regresa, se esteriliza y vuelve al inventario. Este proceso involucra múltiples personas, dispositivos y ubicaciones, con o sin conexión a internet.

Crearcos Inventario reemplaza el control manual en hojas de cálculo o papel por un sistema digital robusto que:

- Funciona **sin internet** y sincroniza automáticamente al reconectarse.
- Mantiene un **historial inmutable** de cada instrumento físico.
- Detecta y resuelve **conflictos** cuando dos dispositivos trabajan sobre el mismo dato offline.
- Controla **acceso por roles** con autenticación segura y PIN offline.

---

## Capacidades principales

### Inventario y trazabilidad
- Registro de piezas físicas con código único (QR, código de barras o manual).
- Soporte para productos simples, consumibles y **kits padre/hijo**.
- Historial inmutable por pieza: cada estado, movimiento y reprocesamiento queda registrado.
- El historial es idéntico en todos los dispositivos después de sincronizar.

### Maletas quirúrgicas
- Preparación, armado y salida de maletas por Auxiliar/Instrumentista.
- Registro de piezas usadas y no usadas al cierre del procedimiento.
- Ciclos de **reprocesamiento/esterilización** ilimitados con trazabilidad completa.

### Precios y facturación
- Motor de precios por categoría de hospital: habitual, otra provincia y nota de crédito.
- Precios excepcionales con flujo de aprobación por Administrador.
- Generación de facturas vinculadas al cierre del procedimiento, con historial inmutable.

### Sincronización distribuida
- Protocolo de sincronización incremental con cursor monotónico.
- Resolución de conflictos por identidad de pieza: detección automática, congelamiento y resolución por Coordinadora.
- Cola de salida persistente, bandeja de entrada y cuarentena de operaciones rechazadas.
- Panel de diagnóstico de sincronización con estado real: conexión, pendientes, fallos y último error.

### Autenticación y acceso
- Autenticación central con Supabase Auth: roles, sesiones y revocación.
- Desbloqueo **offline** con PIN local derivado (PBKDF2-SHA256, 310.000 iteraciones).
- Vigencia de 7 días sin conexión; renovación automática al reconectar.
- Acceso **freelance** temporal mediante enlace limitado para instrumentistas externos.
- Administración centralizada de usuarios: el Administrador asigna contraseñas con confirmación de PIN.

### Supervisión y alertas
- Panel de Supervisor con conflictos sin resolver, maletas demoradas y facturas bloqueadas.
- Alertas configurables por umbral de demora.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite, TailwindCSS |
| Persistencia local | Dexie v6 (IndexedDB), HLC para orden de eventos |
| Backend | Supabase (PostgreSQL 15, Row Level Security, Edge Functions en Deno) |
| Sincronización | Protocolo propio offline-first con cursor monotónico e idempotencia |
| Autenticación | Supabase Auth + PIN offline PBKDF2-SHA256 |
| PWA | Service Worker, caché del shell, instalable en escritorio y móvil |
| Pruebas | Vitest (263 pruebas unitarias e integración), pgTAP (52 aserciones SQL) |
| CI | GitHub Actions: lint, typecheck, pruebas, reconstrucción Supabase desde cero, E2E multidispositivo |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                  Navegador / PWA                    │
│                                                     │
│  ┌──────────┐   ┌──────────┐   ┌─────────────────┐ │
│  │  React   │   │  Domain  │   │  Dexie/IndexedDB│ │
│  │  (apps/) │──▶│  Core    │──▶│  Réplica local  │ │
│  │          │   │(packages/│   │  Cola de salida │ │
│  └──────────┘   │  core/)  │   │  Bandeja entrada│ │
│                 └──────────┘   └────────┬────────┘ │
└──────────────────────────────────────────┼──────────┘
                                           │ sync (PUSH/PULL)
                    ┌──────────────────────▼──────────────────┐
                    │              Supabase                   │
                    │                                         │
                    │  ┌────────────┐  ┌──────────────────┐  │
                    │  │ PostgreSQL │  │  Edge Functions  │  │
                    │  │ 27 tablas  │  │  sync            │  │
                    │  │ RLS forzado│  │  administration  │  │
                    │  │ 18 migrac. │  │  freelance-access│  │
                    │  └────────────┘  │  prepare-prod    │  │
                    │                  └──────────────────┘  │
                    └─────────────────────────────────────────┘
```

### Estructura del repositorio

```
apps/web/             Interfaz React, rutas, pantallas y PWA
packages/core/        Dominio puro: estados, roles, precios y máquinas de estado
packages/data/        IndexedDB, sincronización, autenticación y servicios
supabase/migrations/  18 migraciones PostgreSQL reproducibles desde cero
supabase/functions/   4 Edge Functions protegidas (Deno)
seeds/                Generador determinista de datos de demostración
scripts/              Bootstrap, validación de entorno y smoke tests
.github/workflows/    CI: verificación, despliegue por entornos y rollback
```

---

## Roles del sistema

| Rol | Responsabilidad |
|---|---|
| **Administrador** | Usuarios, hospitales, catálogo, precios, excepciones, configuración |
| **Auxiliar / Instrumentista** | Maletas, escaneo de piezas, cirugía, reprocesamiento |
| **Coordinadora** | Resolución de conflictos, supervisión de maletas |
| **Contable** | Borradores de factura, matriz de precios, emisión |
| **Supervisor** | Panel de alertas, maletas demoradas, facturas bloqueadas |
| **Freelance** | Acceso temporal y restringido mediante enlace firmado |

---

## Seguridad

- **RLS habilitado y forzado** en las 27 tablas públicas. Sin excepciones.
- El navegador nunca accede con `service_role`; solo opera con la clave publicable.
- Las Edge Functions validan el JWT del usuario internamente antes de cualquier operación privilegiada.
- Contraseñas con mínimo 12 caracteres y las cuatro clases. Sin recuperación por enlace público.
- PIN offline derivado localmente, nunca transmitido. Caduca a los 7 días.
- CI detecta secretos versionados en cada push.

---

## Estado del proyecto

El sistema se encuentra en estado de **prototipo funcional avanzado**. La base técnica está completa e incluye:

- ✅ Esquema de base de datos normalizado con 27 tablas, RLS e historial inmutable.
- ✅ 263 pruebas automáticas TypeScript + 52 aserciones pgTAP.
- ✅ Escenario E2E automatizado: dos dispositivos offline, conflicto, resolución y convergencia.
- ✅ 4 Edge Functions desplegadas y activas.
- ✅ PWA instalable con soporte offline real.
- ✅ Flujos completos para todos los roles.
- ⏳ Pendiente: validación de campo con lectores físicos, UAT formal y puesta en producción controlada.

---

## Configuración rápida

```bash
git clone https://github.com/Andr3sss/inventario-medico.git
cd inventario-medico
cp .env.example .env.local   # Completar con las credenciales del proyecto Supabase
npm ci
npm run verificar
npm run dev
```

Requiere **Node.js 22 LTS**. Para el backend completo (migraciones y Edge Functions) se necesita acceso a un proyecto Supabase y la CLI incluida como dependencia de desarrollo.

---

## Licencia

Proyecto privado — Crearcos © 2026. Todos los derechos reservados.
