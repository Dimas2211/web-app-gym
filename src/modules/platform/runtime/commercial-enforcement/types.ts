// ─────────────────────────────────────────────────────────────────
// platform/runtime/commercial-enforcement — types.ts
//
// Bloque B — Enforcement real de módulos y capacidades estáticas.
//
// Tipos de dominio del Commercial Enforcement Context. Este archivo
// NO hace queries — solo define formas de datos y el error tipado
// compartido por module-guard.ts y capacity-engine.ts.
//
// Fuentes de datos (separación obligatoria, ver capacity-registry.ts):
//   - Commercial configuration source = CONTROL PLANE (controlPlanePrisma)
//   - Usage source                    = TARGET RUNTIME DB (runtimeDb explícito)
// ─────────────────────────────────────────────────────────────────

import type { EffectiveModule, EffectiveEntitlement, EntitlementSource } from "../../types/platform.types";

export type CommercialEnforcementMode = "MANAGED" | "LEGACY_UNMANAGED";

/**
 * Contexto comercial resuelto para el tenant efectivo de la request actual.
 * MANAGED: existe PlatformOrganization para tenantId — módulos/entitlements
 *   se resuelven contra el resolver del Bloque A (Organization override →
 *   Plan → UNCONFIGURED).
 * LEGACY_UNMANAGED: no existe PlatformOrganization para tenantId — bypass
 *   temporal de compatibilidad, nunca confundido con "unlimited" ni con
 *   source PLAN. Los Maps quedan vacíos porque no hay configuración que
 *   resolver.
 */
export interface CommercialEnforcementContext {
  mode: CommercialEnforcementMode;
  tenantId: string;
  organizationId: string | null;
  planId: string | null;
  verticalId: string | null;
  effectiveModules: Map<string, EffectiveModule>;
  effectiveEntitlements: Map<string, EffectiveEntitlement>;
}

export type CommercialErrorCode =
  | "MODULE_NOT_ENABLED" // 403 — módulo no contratado/habilitado
  | "CAPACITY_LIMIT_REACHED" // 409 — límite de capacidad alcanzado
  | "ENTITLEMENT_NOT_CONFIGURED" // 422 — MANAGED sin configuración comercial (fail-closed)
  | "COMMERCIAL_CONTEXT_ERROR"; // 500 — error resolviendo el contexto (nunca degrada a legacy)

export type CommercialErrorHttpStatus = 403 | 409 | 422 | 500;

const HTTP_STATUS_BY_CODE: Record<CommercialErrorCode, CommercialErrorHttpStatus> = {
  MODULE_NOT_ENABLED: 403,
  CAPACITY_LIMIT_REACHED: 409,
  ENTITLEMENT_NOT_CONFIGURED: 422,
  COMMERCIAL_CONTEXT_ERROR: 500,
};

/**
 * Error tipado de dominio comercial. userMessage está en español y listo
 * para devolverse tal cual en `{ error: e.userMessage }` (Server Actions)
 * o `NextResponse.json({ error: e.userMessage }, { status: e.httpStatus })`
 * (Route Handlers). Nunca incluye detalles internos/secrets.
 */
export class CommercialEnforcementError extends Error {
  readonly code: CommercialErrorCode;
  readonly httpStatus: CommercialErrorHttpStatus;
  readonly userMessage: string;

  constructor(code: CommercialErrorCode, userMessage: string) {
    super(`[${code}] ${userMessage}`);
    this.name = "CommercialEnforcementError";
    this.code = code;
    this.userMessage = userMessage;
    this.httpStatus = HTTP_STATUS_BY_CODE[code];
  }
}

/**
 * Estado de una capacidad estática para un tenant. `status` distingue
 * explícitamente LEGACY_UNMANAGED_BYPASS de UNLIMITED real — NUNCA se
 * reporta un bypass legacy como un plan "Ilimitado" comercial.
 */
export type CapacityStatusLabel =
  | "FINITE"
  | "UNLIMITED"
  | "UNCONFIGURED"
  | "OVER_LIMIT"
  | "LEGACY_UNMANAGED_BYPASS";

export interface CapacityStatus {
  code: string;
  /** true únicamente cuando el effective entitlement real (PLAN u ORGANIZATION_OVERRIDE) trae is_unlimited=true. Nunca true en LEGACY_UNMANAGED. */
  isUnlimited: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  source: EntitlementSource | "LEGACY_UNMANAGED_BYPASS";
  /** false cuando MANAGED y no hay definición efectiva (UNCONFIGURED) — bloquea, nunca se interpreta como ilimitado. */
  configured: boolean;
  status: CapacityStatusLabel;
}
