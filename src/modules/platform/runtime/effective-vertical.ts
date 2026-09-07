// ─────────────────────────────────────────────────────────────────
// platform/runtime — effective-vertical.ts
//
// PASO 6F — Navegación runtime-aware + aislamiento de superficie por
// vertical. Resuelve el código de vertical (GYM, RETAIL, CLINIC, ...)
// del CommercialEnforcementContext YA resuelto (nunca vuelve a resolver
// runtime-session ni precedencia comercial — reutiliza
// resolveCommercialEnforcementContext tal cual, ver Bloque B/6A).
//
// Un módulo (moduleCode) ya basta para gobernar superficies GYM que
// tienen module code propio (gym.memberships, gym.trainers, ...).
// Este helper cubre el caso restante: superficies GYM SIN module code
// propio (Clientes, Reportes) que deben depender de la vertical
// efectiva en vez de inventar un module code ficticio
// (gym.clients/gym.reports) — instrucción explícita del ticket.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[effective-vertical] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { redirect } from "next/navigation";
import { controlPlanePrisma } from "./control-plane-prisma";
import { resolveCommercialEnforcementContext } from "./commercial-enforcement";
import type { CommercialEnforcementContext } from "./commercial-enforcement/types";

/**
 * Resuelve el código de vertical (ej. "GYM") a partir de un
 * CommercialEnforcementContext ya resuelto. `null` si la organización
 * no tiene vertical asignada (ej. TrustMe: Commerce-only) o en
 * LEGACY_UNMANAGED (bypass — ver `hasEffectiveVertical` más abajo para
 * cómo se trata ese caso en el guard).
 */
export async function resolveEffectiveVerticalCode(
  commercialCtx: CommercialEnforcementContext,
): Promise<string | null> {
  if (!commercialCtx.verticalId) return null;
  try {
    const vertical = await controlPlanePrisma.platformVertical.findUnique({
      where: { id: commercialCtx.verticalId },
      select: { code: true },
    });
    return vertical?.code ?? null;
  } catch {
    return null;
  }
}

/**
 * ¿La organización efectiva tiene la vertical requerida? LEGACY_UNMANAGED
 * es bypass explícito (mismo criterio que hasOrganizationModule) — nunca
 * se confunde con "vertical GYM real".
 */
export function hasEffectiveVertical(
  commercialCtx: CommercialEnforcementContext,
  verticalCode: string | null,
  requiredVerticalCode: string,
): boolean {
  if (commercialCtx.mode === "LEGACY_UNMANAGED") return true;
  return verticalCode === requiredVerticalCode;
}

/**
 * Guard de superficie server-first para páginas GYM SIN module code
 * propio (Clientes, Reportes GYM, Configuración > Deportes/Metas/Datos
 * del gimnasio). Redirige si la organización efectiva no tiene la
 * vertical requerida — simétrico a requireOrganizationModule.
 *
 *   const { context, dispose } = await resolveEffectiveTenantContext(user);
 *   await requireEffectiveVertical(context.tenantId, "GYM");
 *
 * `tenantId` es responsabilidad del caller: SIEMPRE el tenant EFECTIVO
 * (ver resolveEffectiveTenantContext) — nunca sessionUser.tenant_id
 * directo cuando puede existir una sesión runtime.
 */
export async function requireEffectiveVertical(
  tenantId: string,
  requiredVerticalCode: string,
): Promise<void> {
  const commercialCtx = await resolveCommercialEnforcementContext(tenantId);
  const verticalCode = await resolveEffectiveVerticalCode(commercialCtx);
  if (!hasEffectiveVertical(commercialCtx, verticalCode, requiredVerticalCode)) {
    redirect("/dashboard?commercial_error=vertical_not_enabled");
  }
}
