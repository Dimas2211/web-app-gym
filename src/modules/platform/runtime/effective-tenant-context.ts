// ─────────────────────────────────────────────────────────────────
// platform/runtime — effective-tenant-context.ts
//
// PASO 6A — Resuelve el contexto de datos "efectivo" para las
// páginas reales del dashboard (products, customers, suppliers,
// inventory): el tenant y el PrismaClient propios del usuario en
// modo normal, o el tenant/PrismaClient del perfil runtime activo
// cuando un super_admin está "Operando como cliente".
//
// Uso en una página runtime-aware:
//
//   const user = await requireAdmin();
//   const { context, dispose } = await resolveEffectiveTenantContext(user);
//   try {
//     const result = await getProducts(context.tenantId, params, context.client);
//     return <ProductsClient ... />;
//   } finally {
//     await dispose();
//   }
//
// Reglas:
// - En modo normal, context.client es undefined — las queries usan su
//   propio default (el Prisma singleton normal), sin costo adicional.
// - En modo runtime, context.client es un PrismaClient temporal
//   abierto por el Runtime Database Router — SIEMPRE debe cerrarse
//   con `dispose()` al terminar de renderizar la página.
// - Si la sesión runtime apunta a un perfil que ya no es válido
//   (desactivado, tenant desvinculado, eliminado) desde que se abrió,
//   se degrada silenciosamente a modo normal y se limpia la cookie —
//   nunca se rompe la página por esto.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[effective-tenant-context] Módulo server-only. No usar en contexto de navegador.",
  );
}

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";
import {
  resolveRuntimeDatabaseProfileById,
  createRuntimePrismaClient,
} from "./runtime-database-router";
import {
  getRuntimeSession,
  clearRuntimeSession,
  type RuntimeSessionPayload,
} from "./runtime-session";
import { requireRuntimeOrganizationContext } from "./require-runtime-organization-context";
import { isAuthScope } from "@/core/auth/types";

export type { RuntimeSessionPayload } from "./runtime-session";

// FASE VI-D — ETAPA C. Modo operativo efectivo de la identidad actual.
// PLATFORM_NATIVE  → super_admin/staff normal, sin Support Session. client
//                     efectivo = Prisma global (contexto sin `client` definido).
// SUPPORT_RUNTIME  → super_admin PLATFORM con Support Session ("Operar como
//                     cliente") activa. client = runtime Prisma, readOnly=true.
// RUNTIME_CLIENT   → identidad auth_scope="RUNTIME_CLIENT" (login runtime real,
//                     FASE VI-C). client = runtime Prisma de SU organización,
//                     readOnly=false, resuelto vía requireRuntimeOrganizationContext
//                     (fail closed, nunca fallback a Prisma global/Control Plane).
export type RuntimeMode = "PLATFORM_NATIVE" | "SUPPORT_RUNTIME" | "RUNTIME_CLIENT";

export interface EffectiveTenantContext {
  tenantId: string;
  /** Presente solo en modo runtime (SUPPORT_RUNTIME o RUNTIME_CLIENT). Pasar a las queries que lo acepten. */
  client?:  PrismaClient;
  /** Metadata de la sesión Support Session activa, o null si no aplica (incluido RUNTIME_CLIENT, que nunca la usa). */
  runtime:  RuntimeSessionPayload | null;
  /** location_id efectivo. null si no se pudo/debió resolver uno. */
  locationId: string | null;
  runtimeMode: RuntimeMode;
  /** true en SUPPORT_RUNTIME (Support Session siempre es solo lectura). false en los otros dos modos. */
  readOnly: boolean;
  /**
   * FASE VI-D2 — ETAPA A. Rol a usar para autorización operacional.
   * RUNTIME_CLIENT: rol LIVE revalidado contra runtimeDb en esta misma
   * resolución (requireRuntimeOrganizationContext) — nunca el rol
   * congelado en el JWT. PLATFORM_NATIVE/SUPPORT_RUNTIME: `user.role`
   * del JWT, sin cambios de comportamiento en esta fase.
   */
  effectiveRole: string;
}

export interface EffectiveTenantContextHandle {
  context: EffectiveTenantContext;
  /** Cierra el PrismaClient runtime si se abrió uno. Idempotente/no-op en modo normal. */
  dispose: () => Promise<void>;
}

const NOOP_DISPOSE = async () => {};

/**
 * Resuelve el contexto de datos efectivo para la sesión actual.
 * `user` es el usuario de sesión de la aplicación (super_admin en
 * el caso runtime; cualquier rol con acceso al módulo en modo normal).
 */
export async function resolveEffectiveTenantContext(
  user: SessionUser,
): Promise<EffectiveTenantContextHandle> {
  // FASE VI-D — ETAPA D/Q. RUNTIME_CLIENT tiene su propio contrato fail
  // closed (requireRuntimeOrganizationContext): nunca degrada a modo
  // normal/global. Support Session ("Operar como cliente") es exclusivo
  // de auth_scope="PLATFORM" — una identidad RUNTIME_CLIENT nunca lee ni
  // honra esa cookie, porque su tenant ya es el real.
  if (user.auth_scope === "RUNTIME_CLIENT") {
    const { context: runtimeCtx, dispose } = await requireRuntimeOrganizationContext(user);
    return {
      context: {
        tenantId:      runtimeCtx.tenantId,
        client:        runtimeCtx.runtimeDb,
        runtime:       null,
        locationId:    runtimeCtx.locationId,
        runtimeMode:   "RUNTIME_CLIENT",
        readOnly:      false,
        effectiveRole: runtimeCtx.role,
      },
      dispose,
    };
  }

  const normal: EffectiveTenantContextHandle = {
    context: {
      tenantId:      user.tenant_id as string,
      runtime:       null,
      locationId:    user.location_id,
      runtimeMode:   "PLATFORM_NATIVE",
      readOnly:      false,
      effectiveRole: user.role,
    },
    dispose: NOOP_DISPOSE,
  };

  const runtime = await getRuntimeSession();
  if (!runtime) return normal;

  try {
    const profile = await resolveRuntimeDatabaseProfileById(runtime.profileId);
    const { client, disconnect } = createRuntimePrismaClient(profile);
    return {
      context: {
        tenantId:      profile.tenantId,
        client,
        runtime,
        locationId:    null,
        runtimeMode:   "SUPPORT_RUNTIME",
        readOnly:      true,
        effectiveRole: user.role,
      },
      dispose: disconnect,
    };
  } catch {
    // Perfil inválido/inactivo/tenant desvinculado desde que se abrió la
    // sesión — degradar a modo normal en vez de romper la página, y
    // limpiar la cookie para que el banner deje de mostrarse.
    await clearRuntimeSession();
    return normal;
  }
}

/**
 * Resuelve la primera location activa del tenant runtime (orden
 * alfabético) — mismo criterio pragmático usado por Support Session:
 * muestra representativa de una sede, no consolidado multi-sede.
 * Solo tiene sentido cuando `context.client` está presente (modo runtime).
 */
export async function resolveRuntimeFirstLocationId(
  context: { tenantId: string; client?: PrismaClient; runtime?: RuntimeSessionPayload | null },
): Promise<string | null> {
  if (!context.client) return null;
  const branch = await context.client.branch.findFirst({
    where:   { tenant_id: context.tenantId, status: "active" },
    select:  { id: true },
    orderBy: { name: "asc" },
  });
  return branch?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────
// Variante para Route Handlers (app/api/**) — PASO 6A (corrección de
// alcance): las páginas del dashboard real re-consultan casi todo su
// detalle/paginación/filtros vía fetch(`/api/...`) desde el cliente,
// no solo en el render inicial del Server Component. Esas rutas
// necesitan la misma resolución runtime, pero:
//   - reciben un tenantId/locationId "base" ya resueltos por su propio
//     *-api-context.ts (sesión normal del usuario), en vez de un
//     SessionUser completo;
//   - `client` SIEMPRE es un PrismaClient definido (nunca undefined) —
//     así el route handler no necesita ramificar entre "con runtime" y
//     "sin runtime" al construir sus queries, solo usar `context.client`.
//   - exponen `runtime` para que el propio handler bloquee escrituras
//     (POST/PATCH/DELETE) con `if (context.runtime?.readOnly) ...`.
// ─────────────────────────────────────────────────────────────────

export interface EffectiveApiContext {
  tenantId:    string;
  locationId:  string | null;
  client:      PrismaClient;
  runtime:     RuntimeSessionPayload | null;
  runtimeMode: RuntimeMode;
  readOnly:    boolean;
  /** FASE VI-D2 — ver EffectiveTenantContext.effectiveRole. Ausente ("") si `user` no se pasó (callers no migrados). */
  effectiveRole: string;
}

export interface EffectiveApiContextHandle {
  context: EffectiveApiContext;
  dispose: () => Promise<void>;
}

/**
 * Resuelve el contexto efectivo para un Route Handler. `base` es el
 * tenant_id/location_id ya resueltos por la sesión normal del usuario
 * (ej. el `*-api-context.ts` de cada módulo) — se usan tal cual en modo
 * PLATFORM_NATIVE, o se reemplazan por los del perfil runtime cuando hay
 * Support Session activa.
 *
 * FASE VI-D — ETAPA D (deuda VI-C corregida): esta función antes no
 * recibía `auth_scope` en absoluto, por lo que una identidad
 * RUNTIME_CLIENT terminaba silenciosamente en el branch "normal" con
 * `client = prisma` (Prisma GLOBAL) — el fallback peligroso que VI-D
 * prohíbe. El segundo parámetro opcional `user` cierra ese hueco: si
 * `user.auth_scope === "RUNTIME_CLIENT"`, se delega TODO a
 * requireRuntimeOrganizationContext (fail closed, nunca fallback), y
 * `base` se ignora por completo — el tenant/location de un RUNTIME_CLIENT
 * nunca se toman de un valor calculado por el caller, siempre de su
 * propia sesión ya validada contra Control Plane.
 *
 * Callers existentes que NO pasan `user` (todavía no migrados a VI-D)
 * mantienen exactamente el comportamiento PLATFORM_NATIVE/SUPPORT_RUNTIME
 * de siempre — cambio 100% aditivo y retrocompatible.
 */
export async function resolveEffectiveApiContext(
  base: { tenantId: string; locationId?: string | null },
  user?: Pick<SessionUser, "id" | "auth_scope" | "organization_id" | "tenant_id" | "location_id" | "role">,
): Promise<EffectiveApiContextHandle> {
  // Defensa en profundidad: muchos Route Handlers construyen `user` con
  // `session.user as SessionUser` directamente desde `auth()`, sin pasar
  // por getSessionOrRedirect()/isAuthScope() (que sí normaliza esta
  // frontera). Revalidar aquí con isAuthScope() antes de confiar en
  // auth_scope="RUNTIME_CLIENT" — un valor corrupto/desconocido nunca
  // debe alcanzar requireRuntimeOrganizationContext.
  const effectiveScope = isAuthScope(user?.auth_scope) ? user!.auth_scope : undefined;
  if (effectiveScope === "RUNTIME_CLIENT" && user) {
    const { context: runtimeCtx, dispose } = await requireRuntimeOrganizationContext(user);
    return {
      context: {
        tenantId:      runtimeCtx.tenantId,
        locationId:    runtimeCtx.locationId,
        client:        runtimeCtx.runtimeDb,
        runtime:       null,
        runtimeMode:   "RUNTIME_CLIENT",
        readOnly:      false,
        effectiveRole: runtimeCtx.role,
      },
      dispose,
    };
  }

  const normal: EffectiveApiContextHandle = {
    context: {
      tenantId:      base.tenantId,
      locationId:    base.locationId ?? null,
      client:        prisma,
      runtime:       null,
      runtimeMode:   "PLATFORM_NATIVE",
      readOnly:      false,
      effectiveRole: user?.role ?? "",
    },
    dispose: NOOP_DISPOSE,
  };

  const runtime = await getRuntimeSession();
  if (!runtime) return normal;

  try {
    const profile = await resolveRuntimeDatabaseProfileById(runtime.profileId);
    const { client, disconnect } = createRuntimePrismaClient(profile);
    const locationId = await resolveRuntimeFirstLocationId({
      tenantId: profile.tenantId,
      client,
      runtime,
    });
    return {
      context: {
        tenantId:   profile.tenantId,
        locationId,
        client,
        runtime,
        runtimeMode: "SUPPORT_RUNTIME",
        readOnly:    true,
        effectiveRole: user?.role ?? "",
      },
      dispose: disconnect,
    };
  } catch {
    await clearRuntimeSession();
    return normal;
  }
}
