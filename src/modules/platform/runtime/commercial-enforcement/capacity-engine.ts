// ─────────────────────────────────────────────────────────────────
// platform/runtime/commercial-enforcement — capacity-engine.ts
//
// Bloque B — getCapacityStatus / assertCapacityAvailable. Motor
// genérico: resuelve entitlement (Commercial Enforcement Context,
// ya calculado) + usage provider (Capacity Registry) + runtimeDb
// explícito (Target Runtime DB).
//
// LEGACY_UNMANAGED nunca se reporta como isUnlimited:true — es un
// bypass temporal de compatibilidad (status: LEGACY_UNMANAGED_BYPASS),
// no un plan "Ilimitado" comercial. Unlimited real solo existe cuando
// el effective entitlement (PLAN u ORGANIZATION_OVERRIDE) trae
// is_unlimited=true.
//
// UNCONFIGURED (MANAGED sin definición efectiva) bloquea — nunca se
// interpreta como ilimitado (fail-closed).
// ─────────────────────────────────────────────────────────────────

import { CAPACITY_REGISTRY, type RuntimeDbClient } from "./capacity-registry";
import { CommercialEnforcementError, type CapacityStatus, type CommercialEnforcementContext } from "./types";

/**
 * Estado de capacidad para `entitlementCode` bajo `ctx`. `runtimeDb` es
 * obligatorio (fuerza al caller a decidir explícitamente la base
 * correcta) salvo en LEGACY_UNMANAGED, donde no se cuenta usage —
 * evita tocar una DB potencialmente ambigua en modo legacy.
 */
export async function getCapacityStatus(
  entitlementCode: string,
  ctx: CommercialEnforcementContext,
  runtimeDb: RuntimeDbClient,
): Promise<CapacityStatus> {
  if (ctx.mode === "LEGACY_UNMANAGED") {
    return {
      code: entitlementCode,
      isUnlimited: false,
      limit: null,
      used: 0,
      remaining: null,
      source: "LEGACY_UNMANAGED_BYPASS",
      configured: false,
      status: "LEGACY_UNMANAGED_BYPASS",
    };
  }

  const provider = CAPACITY_REGISTRY[entitlementCode];
  const entitlement = ctx.effectiveEntitlements.get(entitlementCode);
  if (!provider || !entitlement) {
    throw new CommercialEnforcementError(
      "ENTITLEMENT_NOT_CONFIGURED",
      `No hay una definición de capacidad para "${entitlementCode}".`,
    );
  }

  if (entitlement.source === "UNCONFIGURED") {
    const used = await provider.countUsage(ctx.tenantId, runtimeDb);
    return {
      code: entitlementCode,
      isUnlimited: false,
      limit: null,
      used,
      remaining: 0,
      source: "UNCONFIGURED",
      configured: false,
      status: "UNCONFIGURED",
    };
  }

  const used = await provider.countUsage(ctx.tenantId, runtimeDb);

  if (entitlement.is_unlimited) {
    return {
      code: entitlementCode,
      isUnlimited: true,
      limit: null,
      used,
      remaining: null,
      source: entitlement.source,
      configured: true,
      status: "UNLIMITED",
    };
  }

  const limit = entitlement.numeric_value ?? 0;
  return {
    code: entitlementCode,
    isUnlimited: false,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    source: entitlement.source,
    configured: true,
    status: used > limit ? "OVER_LIMIT" : "FINITE",
  };
}

/**
 * Verifica que exista capacidad para incrementar `entitlementCode` en
 * `delta`. `delta<=0` (desactivar/liberar/editar) siempre se permite sin
 * consultar usage. LEGACY_UNMANAGED permite por `ctx.mode`, nunca por
 * `isUnlimited`. Lanza CAPACITY_LIMIT_REACHED o ENTITLEMENT_NOT_CONFIGURED.
 */
export async function assertCapacityAvailable(
  entitlementCode: string,
  delta: number,
  ctx: CommercialEnforcementContext,
  runtimeDb: RuntimeDbClient,
): Promise<void> {
  if (delta <= 0) return;
  if (ctx.mode === "LEGACY_UNMANAGED") return; // bypass por modo, no por unlimited

  const status = await getCapacityStatus(entitlementCode, ctx, runtimeDb);

  if (status.status === "UNLIMITED") return;

  if (!status.configured) {
    throw new CommercialEnforcementError(
      "ENTITLEMENT_NOT_CONFIGURED",
      `Tu plan no tiene configurado un límite para "${entitlementCode}". Contacta a soporte.`,
    );
  }

  if (status.used + delta > (status.limit ?? 0)) {
    throw new CommercialEnforcementError(
      "CAPACITY_LIMIT_REACHED",
      `Alcanzaste el límite de tu plan (${status.limit}). Actualiza tu plan o desactiva elementos existentes para continuar.`,
    );
  }
}
