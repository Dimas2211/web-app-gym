// ─────────────────────────────────────────────────────────────────
// platform/runtime/commercial-enforcement — resolve-commercial-context.ts
//
// Bloque B — resuelve el Commercial Enforcement Context para un
// tenantId ya efectivo (post resolveEffectiveTenantContext/
// resolveEffectiveApiContext — este módulo NO vuelve a resolver
// runtime-session, evita acoplar dos veces la lógica de "operar
// como cliente").
//
// Commercial configuration source = CONTROL PLANE (controlPlanePrisma).
// Nunca usage — eso vive en capacity-registry.ts contra la runtime DB.
//
// MANAGED   — existe PlatformOrganization para tenantId. Módulos y
//             entitlements se resuelven con los wrappers puros del
//             Bloque A (getEffectiveOrganizationModules/Entitlements),
//             cero reimplementación de precedencia.
// LEGACY_UNMANAGED — no existe fila. Bypass temporal explícito,
//             logueado, nunca reportado como "PLAN" ni "unlimited".
//
// Una excepción real al consultar el Control Plane SIEMPRE se relanza
// como COMMERCIAL_CONTEXT_ERROR — nunca degrada a LEGACY_UNMANAGED.
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[resolve-commercial-context] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { cache } from "react";
import { controlPlanePrisma } from "../control-plane-prisma";
import {
  getEffectiveOrganizationModules,
  getEffectiveOrganizationEntitlements,
} from "../../lib/entitlements-resolver";
import { CommercialEnforcementError, type CommercialEnforcementContext } from "./types";

async function resolveUncached(tenantId: string): Promise<CommercialEnforcementContext> {
  let org: { id: string; plan_id: string | null; vertical_id: string | null } | null;
  try {
    org = await controlPlanePrisma.platformOrganization.findUnique({
      where: { tenant_id: tenantId },
      select: { id: true, plan_id: true, vertical_id: true },
    });
  } catch {
    // Nunca degradar a LEGACY_UNMANAGED por un error de infraestructura —
    // eso sería el bypass accidental que Bloque B prohíbe explícitamente.
    throw new CommercialEnforcementError(
      "COMMERCIAL_CONTEXT_ERROR",
      "No se pudo resolver la configuración comercial de la organización. Intenta de nuevo o contacta a soporte.",
    );
  }

  if (!org) {
    console.warn("[commercial-enforcement] LEGACY_UNMANAGED_BYPASS", { tenantId });
    return {
      mode: "LEGACY_UNMANAGED",
      tenantId,
      organizationId: null,
      planId: null,
      verticalId: null,
      effectiveModules: new Map(),
      effectiveEntitlements: new Map(),
    };
  }

  // Si org.plan_id es null, los wrappers ya devuelven todo UNCONFIGURED
  // (fail-closed natural, sin branch especial) — ver Bloque A.
  const [modules, entitlements] = await Promise.all([
    getEffectiveOrganizationModules(org.id),
    getEffectiveOrganizationEntitlements(org.id),
  ]);

  return {
    mode: "MANAGED",
    tenantId,
    organizationId: org.id,
    planId: org.plan_id,
    verticalId: org.vertical_id,
    effectiveModules: new Map(modules.map((m) => [m.code, m])),
    effectiveEntitlements: new Map(entitlements.map((e) => [e.code, e])),
  };
}

/**
 * Resuelve el Commercial Enforcement Context para `tenantId` (ya
 * efectivo). Memoizado por request vía React `cache()` — la key
 * incluye tenantId, así que no hay riesgo de mezclar organizaciones
 * si en un mismo request se resolviera más de un tenant.
 */
export const resolveCommercialEnforcementContext = cache(resolveUncached);
