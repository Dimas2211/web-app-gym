// ─────────────────────────────────────────────────────────────────
// platform — entitlements-resolver.test.ts (Bloque A)
//
// Casos mínimos de la FASE A14 del Bloque A: precedencia de
// entitlements (organization override → plan → unconfigured) y de
// módulos (organization row → plan → unconfigured).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { resolveEffectiveEntitlements, resolveEffectiveModules } from "./entitlements-resolver";
import type {
  PlatformEntitlementDefinitionItem,
  OrganizationEntitlementOverrideItem,
  PlatformModuleItem,
  PlanModuleItem,
  OrganizationModuleItem,
} from "../types/platform.types";

function def(overrides: Partial<PlatformEntitlementDefinitionItem> = {}): PlatformEntitlementDefinitionItem {
  return {
    id: "def-1", code: "commerce.products.max", name: "Productos", description: null,
    category: "commerce", value_type: "COUNT", period_type: "NONE", is_active: true,
    created_at: new Date(), ...overrides,
  };
}

function override(overrides: Partial<OrganizationEntitlementOverrideItem> = {}): OrganizationEntitlementOverrideItem {
  return {
    id: "ov-1", organization_id: "org-1", entitlement_definition_id: "def-1",
    numeric_value: null, is_unlimited: false, created_at: new Date(), updated_at: new Date(), ...overrides,
  };
}

describe("resolveEffectiveEntitlements", () => {
  it("1. plan=100, sin override → effective=100 / PLAN", () => {
    const result = resolveEffectiveEntitlements({
      definitions: [def()],
      planEntitlements: [{ entitlement_definition_id: "def-1", numeric_value: 100, is_unlimited: false }],
      overrides: [],
    });
    expect(result[0]).toMatchObject({ numeric_value: 100, is_unlimited: false, source: "PLAN" });
  });

  it("2. plan=100, override=200 → effective=200 / ORGANIZATION_OVERRIDE", () => {
    const result = resolveEffectiveEntitlements({
      definitions: [def()],
      planEntitlements: [{ entitlement_definition_id: "def-1", numeric_value: 100, is_unlimited: false }],
      overrides: [override({ numeric_value: 200 })],
    });
    expect(result[0]).toMatchObject({ numeric_value: 200, is_unlimited: false, source: "ORGANIZATION_OVERRIDE" });
  });

  it("3. plan=100, override unlimited → effective=unlimited", () => {
    const result = resolveEffectiveEntitlements({
      definitions: [def()],
      planEntitlements: [{ entitlement_definition_id: "def-1", numeric_value: 100, is_unlimited: false }],
      overrides: [override({ is_unlimited: true, numeric_value: null })],
    });
    expect(result[0]).toMatchObject({ numeric_value: null, is_unlimited: true, source: "ORGANIZATION_OVERRIDE" });
  });

  it("4. plan unlimited, sin override → effective=unlimited / PLAN", () => {
    const result = resolveEffectiveEntitlements({
      definitions: [def()],
      planEntitlements: [{ entitlement_definition_id: "def-1", numeric_value: null, is_unlimited: true }],
      overrides: [],
    });
    expect(result[0]).toMatchObject({ numeric_value: null, is_unlimited: true, source: "PLAN" });
  });

  // Cubre también el caso pedido en el hardening de seeds: un plan con
  // 0 PlatformPlanEntitlement (planEntitlements: []) resuelve UNCONFIGURED.
  it("5. sin plan entitlement ni override → UNCONFIGURED", () => {
    const result = resolveEffectiveEntitlements({
      definitions: [def()],
      planEntitlements: [],
      overrides: [],
    });
    expect(result[0]).toMatchObject({ numeric_value: null, is_unlimited: false, source: "UNCONFIGURED" });
  });

  // Casos explícitos para core.users.max (ajuste post-cierre, punto 1) —
  // misma precedencia que los demás entitlements, ejercitada con este
  // código concreto para dejar constancia de que está integrado igual
  // que commerce.products.max, commerce.cash_registers.max, etc.
  const usersDef = def({ id: "def-users", code: "core.users.max", name: "Usuarios", category: "core" });

  it("core.users.max — plan=20, sin override → effective=20 / PLAN", () => {
    const result = resolveEffectiveEntitlements({
      definitions: [usersDef],
      planEntitlements: [{ entitlement_definition_id: "def-users", numeric_value: 20, is_unlimited: false }],
      overrides: [],
    });
    expect(result[0]).toMatchObject({ code: "core.users.max", numeric_value: 20, is_unlimited: false, source: "PLAN" });
  });

  it("core.users.max — plan=20, override unlimited → effective=unlimited / ORGANIZATION_OVERRIDE", () => {
    const result = resolveEffectiveEntitlements({
      definitions: [usersDef],
      planEntitlements: [{ entitlement_definition_id: "def-users", numeric_value: 20, is_unlimited: false }],
      overrides: [override({ entitlement_definition_id: "def-users", is_unlimited: true, numeric_value: null })],
    });
    expect(result[0]).toMatchObject({ code: "core.users.max", numeric_value: null, is_unlimited: true, source: "ORGANIZATION_OVERRIDE" });
  });

  it("core.users.max — sin plan entitlement ni override → UNCONFIGURED", () => {
    const result = resolveEffectiveEntitlements({
      definitions: [usersDef],
      planEntitlements: [],
      overrides: [],
    });
    expect(result[0]).toMatchObject({ code: "core.users.max", numeric_value: null, is_unlimited: false, source: "UNCONFIGURED" });
  });
});

function mod(overrides: Partial<PlatformModuleItem> = {}): PlatformModuleItem {
  return {
    id: "mod-1", code: "commerce.inventory", name: "Inventario", description: null,
    category: "COMMERCE", status: "AVAILABLE", version: "1.0", is_core: false,
    vertical_id: null, vertical: null, created_at: new Date(), ...overrides,
  };
}

function orgModRow(overrides: Partial<OrganizationModuleItem> = {}): OrganizationModuleItem {
  return {
    id: "om-1", organization_id: "org-1", module_id: "mod-1",
    module: { code: "commerce.inventory", name: "Inventario", category: "COMMERCE" },
    is_active: true, activated_at: new Date(), deactivated_at: null, ...overrides,
  };
}

describe("resolveEffectiveModules", () => {
  it("6. módulo incluido por plan, sin override → enabled / PLAN", () => {
    const result = resolveEffectiveModules({
      allModules: [mod()],
      planModules: [{ module_id: "mod-1", is_enabled: true }] as PlanModuleItem[],
      orgModules: [],
    });
    expect(result[0]).toMatchObject({ enabled: true, source: "PLAN" });
  });

  it("7. módulo incluido por plan, override disabled → disabled / ORGANIZATION_OVERRIDE_REMOVED", () => {
    const result = resolveEffectiveModules({
      allModules: [mod()],
      planModules: [{ module_id: "mod-1", is_enabled: true }],
      orgModules: [orgModRow({ is_active: false })],
    });
    expect(result[0]).toMatchObject({ enabled: false, source: "ORGANIZATION_OVERRIDE_REMOVED" });
  });

  it("8. módulo no incluido por plan, override enabled → enabled / ORGANIZATION_OVERRIDE_ADDED", () => {
    const result = resolveEffectiveModules({
      allModules: [mod()],
      planModules: [],
      orgModules: [orgModRow({ is_active: true })],
    });
    expect(result[0]).toMatchObject({ enabled: true, source: "ORGANIZATION_OVERRIDE_ADDED" });
  });

  // Cubre también el caso pedido en el hardening de seeds: un plan con
  // 0 PlatformPlanModule (planModules: []) resuelve el módulo no
  // heredado/disabled — exactamente el estado de un plan recién sembrado
  // sin composición comercial configurada todavía.
  it("módulo no incluido por plan y sin fila de organización → UNCONFIGURED, disabled", () => {
    const result = resolveEffectiveModules({
      allModules: [mod()],
      planModules: [],
      orgModules: [],
    });
    expect(result[0]).toMatchObject({ enabled: false, source: "UNCONFIGURED" });
  });

  // Punto 3 del ajuste post-cierre — resolución de "Heredar" (eliminar
  // el override) en los dos escenarios exactos del enunciado.
  describe("transición HEREDAR (revertOrganizationModuleToInheritAction elimina la fila)", () => {
    it("Plan incluye Inventory + override deshabilitado → Heredar (sin fila) vuelve a habilitado/PLAN", () => {
      const inventoryMod = mod({ id: "mod-inv", code: "commerce.inventory", name: "Inventario" });
      const planModules: PlanModuleItem[] = [{ module_id: "mod-inv", is_enabled: true }];

      const beforeRevert = resolveEffectiveModules({
        allModules: [inventoryMod],
        planModules,
        orgModules: [orgModRow({ module_id: "mod-inv", is_active: false })],
      });
      expect(beforeRevert[0]).toMatchObject({ enabled: false, source: "ORGANIZATION_OVERRIDE_REMOVED" });

      // "Heredar" == deleteMany del override → orgModules queda vacío para ese módulo
      const afterRevert = resolveEffectiveModules({
        allModules: [inventoryMod],
        planModules,
        orgModules: [],
      });
      expect(afterRevert[0]).toMatchObject({ enabled: true, source: "PLAN" });
    });

    it("Plan NO incluye DTE + override habilitado → Heredar (sin fila) vuelve a UNCONFIGURED/disabled", () => {
      const dteMod = mod({ id: "mod-dte", code: "fiscal.dte", name: "DTE" });

      const beforeRevert = resolveEffectiveModules({
        allModules: [dteMod],
        planModules: [],
        orgModules: [orgModRow({ module_id: "mod-dte", is_active: true })],
      });
      expect(beforeRevert[0]).toMatchObject({ enabled: true, source: "ORGANIZATION_OVERRIDE_ADDED" });

      const afterRevert = resolveEffectiveModules({
        allModules: [dteMod],
        planModules: [],
        orgModules: [],
      });
      expect(afterRevert[0]).toMatchObject({ enabled: false, source: "UNCONFIGURED" });
    });
  });
});
