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

export type { RuntimeSessionPayload } from "./runtime-session";

export interface EffectiveTenantContext {
  tenantId: string;
  /** Presente solo en modo runtime. Pasar a las queries que lo acepten. */
  client?:  PrismaClient;
  /** Metadata de la sesión runtime activa, o null en modo normal. */
  runtime:  RuntimeSessionPayload | null;
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
  const normal: EffectiveTenantContextHandle = {
    context: { tenantId: user.tenant_id as string, runtime: null },
    dispose: NOOP_DISPOSE,
  };

  const runtime = await getRuntimeSession();
  if (!runtime) return normal;

  try {
    const profile = await resolveRuntimeDatabaseProfileById(runtime.profileId);
    const { client, disconnect } = createRuntimePrismaClient(profile);
    return {
      context: { tenantId: profile.tenantId, client, runtime },
      dispose:  disconnect,
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
  context: EffectiveTenantContext,
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
  tenantId:   string;
  locationId: string | null;
  client:     PrismaClient;
  runtime:    RuntimeSessionPayload | null;
}

export interface EffectiveApiContextHandle {
  context: EffectiveApiContext;
  dispose: () => Promise<void>;
}

/**
 * Resuelve el contexto efectivo para un Route Handler. `base` es el
 * tenant_id/location_id ya resueltos por la sesión normal del usuario
 * (ej. el `*-api-context.ts` de cada módulo) — se usan tal cual si no
 * hay sesión runtime activa, o se reemplazan por los del perfil
 * runtime si la hay.
 */
export async function resolveEffectiveApiContext(base: {
  tenantId:   string;
  locationId?: string | null;
}): Promise<EffectiveApiContextHandle> {
  const normal: EffectiveApiContextHandle = {
    context: {
      tenantId:   base.tenantId,
      locationId: base.locationId ?? null,
      client:     prisma,
      runtime:    null,
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
      context: { tenantId: profile.tenantId, locationId, client, runtime },
      dispose:  disconnect,
    };
  } catch {
    await clearRuntimeSession();
    return normal;
  }
}
