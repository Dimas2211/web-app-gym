// ─────────────────────────────────────────────────────────────────
// bootstrap-platform-commercial-catalog.lib.test.ts
//
// Tests puros (sin Prisma, sin DB) del bootstrap comercial del Control
// Plane: consistencia del catálogo deseado contra seed.platform.ts, y
// los diffs CREATE/REACTIVATE/SKIP/CONFLICT usados por INSPECT y EXECUTE.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  MODULES,
  ENTITLEMENT_DEFINITIONS,
  TRUSTME_MODULE_CODES,
  GYM_MODULE_CODES,
  UNLIMITED_ENTITLEMENT_CODES,
  DEFERRED_ENTITLEMENT_CODE,
  assertCatalogConsistency,
  planModuleActivation,
  planUnlimitedOverrides,
  shouldSeedBasePlans,
} from "./bootstrap-platform-commercial-catalog.lib";

describe("assertCatalogConsistency", () => {
  it("no lanza contra el catálogo real de seed.platform.ts", () => {
    expect(() => assertCatalogConsistency()).not.toThrow();
  });
});

describe("TRUSTME_MODULE_CODES / GYM_MODULE_CODES", () => {
  it("TrustMe tiene exactamente 11 módulos, ninguno gym.*", () => {
    expect(TRUSTME_MODULE_CODES).toHaveLength(11);
    expect(TRUSTME_MODULE_CODES.every((c) => !c.startsWith("gym."))).toBe(true);
  });

  it("GYM tiene exactamente 15 módulos: los 11 de TrustMe + los 4 gym.*", () => {
    expect(GYM_MODULE_CODES).toHaveLength(15);
    for (const code of TRUSTME_MODULE_CODES) {
      expect(GYM_MODULE_CODES).toContain(code);
    }
    const gymOnly = GYM_MODULE_CODES.filter((c) => c.startsWith("gym."));
    expect(gymOnly.sort()).toEqual(["gym.classes", "gym.memberships", "gym.trainers", "gym.weekly_plans"]);
  });

  it("todos los codes de ambas listas existen en el catálogo real MODULES", () => {
    const catalogCodes = new Set<string>(MODULES.map((m) => m.code));
    for (const code of GYM_MODULE_CODES) expect(catalogCodes.has(code)).toBe(true);
    for (const code of TRUSTME_MODULE_CODES) expect(catalogCodes.has(code)).toBe(true);
  });

  it("sin duplicados en ninguna de las dos listas", () => {
    expect(new Set(TRUSTME_MODULE_CODES).size).toBe(TRUSTME_MODULE_CODES.length);
    expect(new Set(GYM_MODULE_CODES).size).toBe(GYM_MODULE_CODES.length);
  });
});

describe("UNLIMITED_ENTITLEMENT_CODES / DEFERRED_ENTITLEMENT_CODE", () => {
  it("son exactamente las 4 capacidades estáticas, sin fiscal.dte.monthly_issued", () => {
    expect([...UNLIMITED_ENTITLEMENT_CODES].sort()).toEqual([
      "commerce.cash_registers.max",
      "commerce.products.max",
      "core.locations.max",
      "core.users.max",
    ]);
    expect(UNLIMITED_ENTITLEMENT_CODES).not.toContain(DEFERRED_ENTITLEMENT_CODE);
  });

  it("DEFERRED_ENTITLEMENT_CODE es fiscal.dte.monthly_issued y existe en el catálogo real", () => {
    expect(DEFERRED_ENTITLEMENT_CODE).toBe("fiscal.dte.monthly_issued");
    expect(ENTITLEMENT_DEFINITIONS.some((e) => e.code === DEFERRED_ENTITLEMENT_CODE)).toBe(true);
  });

  it("todos los codes Unlimited existen en el catálogo real ENTITLEMENT_DEFINITIONS", () => {
    const catalogCodes = new Set<string>(ENTITLEMENT_DEFINITIONS.map((e) => e.code));
    for (const code of UNLIMITED_ENTITLEMENT_CODES) expect(catalogCodes.has(code)).toBe(true);
  });
});

describe("planModuleActivation", () => {
  it("organización sin ninguna fila -> todo va a toCreate", () => {
    const plan = planModuleActivation(["a", "b", "c"], []);
    expect(plan.toCreate).toEqual(["a", "b", "c"]);
    expect(plan.toReactivate).toEqual([]);
    expect(plan.alreadyActive).toEqual([]);
  });

  it("módulo existente is_active:false -> toReactivate", () => {
    const plan = planModuleActivation(["a"], [{ module_code: "a", is_active: false }]);
    expect(plan.toReactivate).toEqual(["a"]);
    expect(plan.toCreate).toEqual([]);
  });

  it("módulo existente is_active:true -> alreadyActive (no-op)", () => {
    const plan = planModuleActivation(["a"], [{ module_code: "a", is_active: true }]);
    expect(plan.alreadyActive).toEqual(["a"]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.toReactivate).toEqual([]);
  });

  it("caso mixto realista (segunda corrida idempotente parcial)", () => {
    const plan = planModuleActivation(
      ["core.users", "core.roles", "gym.classes"],
      [
        { module_code: "core.users", is_active: true },
        { module_code: "core.roles", is_active: false },
      ],
    );
    expect(plan.alreadyActive).toEqual(["core.users"]);
    expect(plan.toReactivate).toEqual(["core.roles"]);
    expect(plan.toCreate).toEqual(["gym.classes"]);
  });

  it("no toca módulos existentes que no están en la lista deseada (nunca desactiva)", () => {
    const plan = planModuleActivation(["a"], [{ module_code: "extra-no-deseado", is_active: true }]);
    expect(plan.toCreate).toEqual(["a"]);
    // "extra-no-deseado" no aparece en ninguna lista del plan -> el runner nunca lo toca.
  });
});

describe("planUnlimitedOverrides", () => {
  it("sin overrides existentes -> todo va a toCreate", () => {
    const plan = planUnlimitedOverrides(["core.users.max", "core.locations.max"], []);
    expect(plan.toCreate).toEqual(["core.users.max", "core.locations.max"]);
    expect(plan.alreadyCorrect).toEqual([]);
    expect(plan.conflicting).toEqual([]);
  });

  it("override ya existente exactamente Unlimited (numeric_value null) -> alreadyCorrect, no-op", () => {
    const plan = planUnlimitedOverrides(
      ["core.users.max"],
      [{ entitlement_code: "core.users.max", is_unlimited: true, numeric_value: null }],
    );
    expect(plan.alreadyCorrect).toEqual(["core.users.max"]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.conflicting).toEqual([]);
  });

  it("override existente FINITO (is_unlimited:false) -> conflicting, nunca se sobrescribe", () => {
    const plan = planUnlimitedOverrides(
      ["core.users.max"],
      [{ entitlement_code: "core.users.max", is_unlimited: false, numeric_value: 10 }],
    );
    expect(plan.conflicting).toEqual(["core.users.max"]);
    expect(plan.toCreate).toEqual([]);
    expect(plan.alreadyCorrect).toEqual([]);
  });

  it("override Unlimited pero con numeric_value no nulo (dato inconsistente) -> conflicting", () => {
    const plan = planUnlimitedOverrides(
      ["core.users.max"],
      [{ entitlement_code: "core.users.max", is_unlimited: true, numeric_value: 5 }],
    );
    expect(plan.conflicting).toEqual(["core.users.max"]);
  });

  it("segunda corrida completa contra un estado ya sembrado -> todo alreadyCorrect (idempotencia real)", () => {
    const existing = UNLIMITED_ENTITLEMENT_CODES.map((code) => ({
      entitlement_code: code,
      is_unlimited: true,
      numeric_value: null,
    }));
    const plan = planUnlimitedOverrides(UNLIMITED_ENTITLEMENT_CODES, existing);
    expect(plan.toCreate).toEqual([]);
    expect(plan.conflicting).toEqual([]);
    expect(plan.alreadyCorrect).toEqual([...UNLIMITED_ENTITLEMENT_CODES]);
  });

  it("nunca incluye fiscal.dte.monthly_issued al planificar con UNLIMITED_ENTITLEMENT_CODES", () => {
    const plan = planUnlimitedOverrides(UNLIMITED_ENTITLEMENT_CODES, []);
    expect(plan.toCreate).not.toContain(DEFERRED_ENTITLEMENT_CODE);
  });
});

// FASE V-C — tras realinear códigos (enterprise→starter, starter→growth,
// professional→business) un re-run del seed/bootstrap NO debe renombrar
// planes existentes ni recrear "professional"/"enterprise" huérfanos.
describe("shouldSeedBasePlans", () => {
  it("siembra planes base solo en un catálogo de planes vacío", () => {
    expect(shouldSeedBasePlans(0)).toBe(true);
  });

  it("no toca planes cuando ya existe al menos uno", () => {
    expect(shouldSeedBasePlans(1)).toBe(false);
    expect(shouldSeedBasePlans(3)).toBe(false);
  });
});
