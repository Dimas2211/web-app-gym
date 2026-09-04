// ─────────────────────────────────────────────────────────────────
// platform/runtime/commercial-enforcement — module-guard.ts
//
// Bloque B — module guard central. Server-first: bloquea páginas,
// Server Actions y Route Handlers sin depender solo del sidebar.
//
// hasOrganizationModule / assertOrganizationModule operan sobre un
// CommercialEnforcementContext ya resuelto (no hacen queries).
// requireOrganizationModule es la variante "todo en uno" para
// page.tsx: resuelve tenant efectivo + contexto comercial y redirige.
//
// is_core NO es un bypass — ver docs/modules/platform-block-b-runtime-enforcement.md.
// El guard respeta el resolver del Bloque A tal cual.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[module-guard] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { redirect } from "next/navigation";
import { resolveCommercialEnforcementContext } from "./resolve-commercial-context";
import { CommercialEnforcementError, type CommercialEnforcementContext } from "./types";

/** ¿El módulo está habilitado para el tenant de este contexto? LEGACY_UNMANAGED = bypass por modo (no confundir con unlimited). */
export function hasOrganizationModule(
  ctx: CommercialEnforcementContext,
  moduleCode: string,
): boolean {
  if (ctx.mode === "LEGACY_UNMANAGED") return true;
  return ctx.effectiveModules.get(moduleCode)?.enabled === true;
}

/** Lanza CommercialEnforcementError("MODULE_NOT_ENABLED") si el módulo no está habilitado. Para Server Actions/Route Handlers que devuelven {error} en vez de redirigir. */
export function assertOrganizationModule(
  ctx: CommercialEnforcementContext,
  moduleCode: string,
): void {
  if (!hasOrganizationModule(ctx, moduleCode)) {
    throw new CommercialEnforcementError(
      "MODULE_NOT_ENABLED",
      "Este módulo no está habilitado para tu organización. Contacta a soporte para activarlo.",
    );
  }
}

/**
 * Resuelve el Commercial Enforcement Context para `tenantId` y exige el
 * módulo, redirigiendo si no está habilitado. Uso en page.tsx, simétrico
 * a requireAdmin()/requireSuperAdmin():
 *
 *   const user = await requireAdmin();
 *   const commercialCtx = await requireOrganizationModule(user.tenant_id, "commerce.products");
 *
 * `tenantId` es responsabilidad del caller: en páginas "runtime-aware"
 * (products/customers/suppliers/inventory) debe ser el tenant EFECTIVO ya
 * resuelto por `resolveEffectiveTenantContext`/`resolveEffectiveApiContext`
 * (para que un super_admin "operando como cliente" quede sujeto al
 * contrato del cliente, no al suyo) — nunca se resuelve dos veces aquí
 * para no duplicar la apertura/cierre del PrismaClient runtime temporal.
 */
export async function requireOrganizationModule(
  tenantId: string,
  moduleCode: string,
): Promise<CommercialEnforcementContext> {
  const commercialCtx = await resolveCommercialEnforcementContext(tenantId);
  if (!hasOrganizationModule(commercialCtx, moduleCode)) {
    redirect("/dashboard?commercial_error=module_not_enabled");
  }
  return commercialCtx;
}
