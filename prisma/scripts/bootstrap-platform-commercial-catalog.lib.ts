/**
 * bootstrap-platform-commercial-catalog.lib.ts
 *
 * Definiciones deterministas y funciones puras (sin Prisma, sin I/O) del
 * runner `bootstrap-platform-commercial-catalog.ts`. Separadas en este
 * archivo para que el mapping y los diffs CREATE/SKIP sean testeables
 * con Vitest sin tocar ninguna base de datos.
 *
 * Reutiliza tal cual (import, no copia) las definiciones de catálogo ya
 * existentes en prisma/seeds/seed.platform.ts (VERTICALS/PLANS/MODULES/
 * ENTITLEMENT_DEFINITIONS) — nunca las duplica ni las reinterpreta.
 */

import { VERTICALS, PLANS, MODULES, ENTITLEMENT_DEFINITIONS, shouldSeedBasePlans } from "../seeds/seed.platform";

export { VERTICALS, PLANS, MODULES, ENTITLEMENT_DEFINITIONS, shouldSeedBasePlans };

// ── Organizaciones objetivo (bootstrap de producción — NUNCA se crean) ──

export const TARGET_ORG_CODES = {
  GYM:      "gym-0001",
  TRUSTME:  "trustme-0001",
} as const;

// ── Módulos deseados por organización ──────────────────────────────
//
// TrustMe: los 11 módulos transversales (core.* + commerce.* + fiscal.dte).
// Ningún gym.* — TrustMe no es vertical GYM.
export const TRUSTME_MODULE_CODES: readonly string[] = [
  "core.users",
  "core.roles",
  "core.locations",
  "core.customers",
  "commerce.products",
  "commerce.inventory",
  "commerce.suppliers",
  "commerce.purchases",
  "commerce.sales",
  "commerce.cash",
  "fiscal.dte",
] as const;

// GYM: los 15 módulos operativos actuales (transversales + los 4 gym.*).
export const GYM_MODULE_CODES: readonly string[] = [
  ...TRUSTME_MODULE_CODES,
  "gym.memberships",
  "gym.trainers",
  "gym.classes",
  "gym.weekly_plans",
] as const;

// ── Entitlements con override transitorio Unlimited ────────────────
//
// Las 4 capacidades estáticas ya instrumentadas en Bloque B. Deliberadamente
// NO incluye "fiscal.dte.monthly_issued" — queda sin configurar (UNCONFIGURED)
// a propósito, es el siguiente bloque comercial/fiscal.
export const UNLIMITED_ENTITLEMENT_CODES: readonly string[] = [
  "core.users.max",
  "core.locations.max",
  "commerce.products.max",
  "commerce.cash_registers.max",
] as const;

export const DEFERRED_ENTITLEMENT_CODE = "fiscal.dte.monthly_issued" as const;

// ── Validación de consistencia del catálogo (falla rápido y claro si ──
// alguien edita las listas de arriba sin mantener la coherencia con el
// catálogo real de seed.platform.ts) ────────────────────────────────

export class CatalogConsistencyError extends Error {}

export function assertCatalogConsistency(): void {
  const moduleCodes = new Set<string>(MODULES.map((m) => m.code));
  const entitlementCodes = new Set<string>(ENTITLEMENT_DEFINITIONS.map((e) => e.code));

  for (const code of GYM_MODULE_CODES) {
    if (!moduleCodes.has(code)) {
      throw new CatalogConsistencyError(
        `GYM_MODULE_CODES referencia "${code}", que no existe en MODULES (seed.platform.ts).`,
      );
    }
  }
  for (const code of TRUSTME_MODULE_CODES) {
    if (!moduleCodes.has(code)) {
      throw new CatalogConsistencyError(
        `TRUSTME_MODULE_CODES referencia "${code}", que no existe en MODULES (seed.platform.ts).`,
      );
    }
    if (code.startsWith("gym.")) {
      throw new CatalogConsistencyError(
        `TRUSTME_MODULE_CODES no debe incluir módulos gym.* — encontrado "${code}".`,
      );
    }
  }
  for (const code of UNLIMITED_ENTITLEMENT_CODES) {
    if (!entitlementCodes.has(code)) {
      throw new CatalogConsistencyError(
        `UNLIMITED_ENTITLEMENT_CODES referencia "${code}", que no existe en ENTITLEMENT_DEFINITIONS.`,
      );
    }
  }
  if (UNLIMITED_ENTITLEMENT_CODES.includes(DEFERRED_ENTITLEMENT_CODE)) {
    throw new CatalogConsistencyError(
      `"${DEFERRED_ENTITLEMENT_CODE}" debe quedar deliberadamente fuera de UNLIMITED_ENTITLEMENT_CODES.`,
    );
  }
  if (!entitlementCodes.has(DEFERRED_ENTITLEMENT_CODE)) {
    throw new CatalogConsistencyError(
      `DEFERRED_ENTITLEMENT_CODE "${DEFERRED_ENTITLEMENT_CODE}" no existe en ENTITLEMENT_DEFINITIONS.`,
    );
  }
}

// ── Diff puro: activación de módulos por organización ──────────────

export interface ExistingOrganizationModuleRow {
  module_code: string;
  is_active:   boolean;
}

export interface ModuleActivationPlan {
  /** No existe fila PlatformOrganizationModule todavía — se crea con is_active:true. */
  toCreate: string[];
  /** Existe la fila pero is_active:false — se reactiva. */
  toReactivate: string[];
  /** Ya existe y ya está is_active:true — no-op idempotente. */
  alreadyActive: string[];
}

/** Puro — sin Prisma. Calcula qué haría el EXECUTE para una organización dada su estado actual. */
export function planModuleActivation(
  desiredCodes: readonly string[],
  existingRows: readonly ExistingOrganizationModuleRow[],
): ModuleActivationPlan {
  const existingByCode = new Map(existingRows.map((r) => [r.module_code, r]));
  const plan: ModuleActivationPlan = { toCreate: [], toReactivate: [], alreadyActive: [] };

  for (const code of desiredCodes) {
    const existing = existingByCode.get(code);
    if (!existing) {
      plan.toCreate.push(code);
    } else if (!existing.is_active) {
      plan.toReactivate.push(code);
    } else {
      plan.alreadyActive.push(code);
    }
  }
  return plan;
}

// ── Diff puro: overrides Unlimited transitorios ────────────────────

export interface ExistingOverrideRow {
  entitlement_code: string;
  is_unlimited:     boolean;
  numeric_value:    number | null;
}

export interface OverrideUnlimitedPlan {
  /** No existe override todavía — se crea is_unlimited:true, numeric_value:null. */
  toCreate: string[];
  /** Ya existe exactamente como se desea — no-op idempotente. */
  alreadyCorrect: string[];
  /**
   * Existe un override PERO con una configuración distinta (finito, o
   * unlimited con numeric_value no nulo por algún error previo). Nunca se
   * sobrescribe automáticamente — podría representar una decisión de
   * negocio ya tomada manualmente. Se reporta para revisión humana, no
   * se toca.
   */
  conflicting: string[];
}

/** Puro — sin Prisma. */
export function planUnlimitedOverrides(
  desiredCodes: readonly string[],
  existingRows: readonly ExistingOverrideRow[],
): OverrideUnlimitedPlan {
  const existingByCode = new Map(existingRows.map((r) => [r.entitlement_code, r]));
  const plan: OverrideUnlimitedPlan = { toCreate: [], alreadyCorrect: [], conflicting: [] };

  for (const code of desiredCodes) {
    const existing = existingByCode.get(code);
    if (!existing) {
      plan.toCreate.push(code);
    } else if (existing.is_unlimited === true && existing.numeric_value === null) {
      plan.alreadyCorrect.push(code);
    } else {
      plan.conflicting.push(code);
    }
  }
  return plan;
}
