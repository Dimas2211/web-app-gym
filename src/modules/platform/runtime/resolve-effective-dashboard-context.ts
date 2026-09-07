// ─────────────────────────────────────────────────────────────────
// platform/runtime — resolve-effective-dashboard-context.ts
//
// PASO 6F — Navegación runtime-aware + aislamiento de superficie por
// vertical. Centraliza lo que layout.tsx / dashboard/page.tsx (y
// cualquier otra superficie de navegación) necesitan resolver UNA
// sola vez, siempre contra el tenant EFECTIVO — nunca
// sessionUser.tenant_id directo cuando existe una sesión runtime
// "Operar como cliente".
//
// Reutiliza tal cual (cero reimplementación de precedencia):
//   - resolveEffectiveTenantContext  (tenant/PrismaClient efectivo)
//   - resolveCommercialEnforcementContext (módulos/entitlements, cache
//     por request vía React cache())
//   - resolveEffectiveVerticalCode   (código de vertical efectivo)
//
//   authenticated user
//         ↓
//   resolveEffectiveTenantContext         → effective tenantId / client / runtime
//         ↓
//   resolveCommercialEnforcementContext   → effective organization / modules
//         ↓
//   resolveEffectiveVerticalCode          → effective vertical code
//         ↓
//   navigation / dashboard / settings / branding
//
// El caller SIEMPRE debe invocar `dispose()` (ideal: try/finally) para
// cerrar el PrismaClient runtime si se abrió uno.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[resolve-effective-dashboard-context] Módulo server-only. No usar en contexto de navegador.",
  );
}

import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions/guards";
import {
  resolveEffectiveTenantContext,
  type RuntimeSessionPayload,
} from "./effective-tenant-context";
import { resolveCommercialEnforcementContext } from "./commercial-enforcement";
import { resolveEffectiveVerticalCode } from "./effective-vertical";
import { controlPlanePrisma } from "./control-plane-prisma";

export interface EffectiveDashboardContext {
  /** Tenant EFECTIVO: el del perfil runtime si hay sesión "Operar como cliente", si no el del usuario autenticado. */
  tenantId: string;
  /** PrismaClient runtime — presente solo en modo runtime. Pasar a queries que lo acepten. */
  client?: PrismaClient;
  /** Metadata de la sesión runtime activa, o null en modo normal. */
  runtime: RuntimeSessionPayload | null;
  /** true si hay una sesión runtime "Operar como cliente" activa. */
  isRuntime: boolean;
  /** true si la sesión actual debe tratarse como solo-lectura (siempre true cuando isRuntime). */
  readOnly: boolean;
  organizationId: string | null;
  /** Nombre comercial de la organización efectiva. null si no se pudo resolver (LEGACY_UNMANAGED sin fila). */
  organizationName: string | null;
  /** Código de vertical efectivo (ej. "GYM"), o null si la organización no tiene vertical (ej. Commerce-only) o es LEGACY_UNMANAGED. */
  verticalCode: string | null;
  /**
   * true si el tenant efectivo no tiene fila PlatformOrganization (bypass
   * temporal de compatibilidad, mismo criterio que enabledModuleCodes).
   * Los consumidores que filtran por `requiredVerticalCode` (nav, hub de
   * reportes) deben tratar esto como bypass — igual que ya hacen con los
   * module codes — para no ocultar nada bajo compatibilidad legacy.
   */
  isLegacyUnmanaged: boolean;
  /** Subconjunto de `allModuleCodes` efectivamente habilitado para la organización efectiva. */
  enabledModuleCodes: Set<string>;
}

export interface EffectiveDashboardContextHandle {
  context: EffectiveDashboardContext;
  /** Cierra el PrismaClient runtime si se abrió uno. Idempotente/no-op en modo normal. */
  dispose: () => Promise<void>;
}

/**
 * Resuelve el contexto de navegación/dashboard efectivo para `user`.
 * `allModuleCodes` es la lista completa de module codes referenciados
 * por la navegación (ver MODULE_GROUPS en dashboard-nav.ts) — el
 * resultado es el subconjunto efectivamente habilitado.
 */
export async function resolveEffectiveDashboardContext(
  user: SessionUser,
  allModuleCodes: readonly string[],
): Promise<EffectiveDashboardContextHandle> {
  const { context: tenantContext, dispose } = await resolveEffectiveTenantContext(user);

  const commercialCtx = await resolveCommercialEnforcementContext(tenantContext.tenantId);

  const enabledModuleCodes =
    commercialCtx.mode === "LEGACY_UNMANAGED"
      ? new Set(allModuleCodes)
      : new Set(
          allModuleCodes.filter((code) => commercialCtx.effectiveModules.get(code)?.enabled === true),
        );

  const verticalCode = await resolveEffectiveVerticalCode(commercialCtx);

  // Nombre de organización: si hay sesión runtime, ya viene en el payload
  // (evita una query adicional); si no, se resuelve del Control Plane con
  // el organizationId ya resuelto por el Commercial Enforcement Context.
  let organizationName: string | null = tenantContext.runtime?.organizationName ?? null;
  if (!organizationName && commercialCtx.organizationId) {
    try {
      const org = await controlPlanePrisma.platformOrganization.findUnique({
        where: { id: commercialCtx.organizationId },
        select: { name: true },
      });
      organizationName = org?.name ?? null;
    } catch {
      organizationName = null;
    }
  }

  return {
    context: {
      tenantId: tenantContext.tenantId,
      client: tenantContext.client,
      runtime: tenantContext.runtime,
      isRuntime: tenantContext.runtime !== null,
      readOnly: tenantContext.runtime?.readOnly === true,
      organizationId: commercialCtx.organizationId,
      organizationName,
      verticalCode,
      isLegacyUnmanaged: commercialCtx.mode === "LEGACY_UNMANAGED",
      enabledModuleCodes,
    },
    dispose,
  };
}
