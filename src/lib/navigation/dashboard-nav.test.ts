// ─────────────────────────────────────────────────────────────────
// lib/navigation — dashboard-nav.test.ts
//
// PASO 6F — Navegación runtime-aware + aislamiento de superficie por
// vertical. Fija filterModuleGroupsByAccess:
//   - un módulo Commerce deshabilitado oculta su item sin importar vertical.
//   - vertical null + sin módulos GYM oculta Clientes/Reportes GYM (items
//     SIN moduleCode propio) aunque el rol y el resto de módulos pasen.
//   - LEGACY_UNMANAGED es bypass explícito, igual que ya lo es para módulos.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { MODULE_GROUPS, filterModuleGroupsByAccess } from "./dashboard-nav";

const SUPER_ADMIN = "super_admin" as const;

const ALL_GYM_MODULES = ["gym.memberships", "gym.trainers", "gym.classes", "gym.weekly_plans"];
const ALL_COMMERCE_MODULES = [
  "commerce.products",
  "commerce.inventory",
  "commerce.suppliers",
  "core.customers",
  "commerce.purchases",
  "commerce.sales",
  "commerce.cash",
  "fiscal.dte",
];
const ALL_CORE_MODULES = ["core.users", "core.locations"];

function findItem(groups: ReturnType<typeof filterModuleGroupsByAccess>, href: string) {
  for (const g of groups) {
    const item = g.items.find((i) => i.href === href);
    if (item) return item;
  }
  return undefined;
}

describe("filterModuleGroupsByAccess — caso 1: NORMAL GYM (vertical GYM, 15 módulos)", () => {
  it("GYM, Commerce, Administración y Platform Admin visibles completos", () => {
    const enabled = new Set([...ALL_GYM_MODULES, ...ALL_COMMERCE_MODULES, ...ALL_CORE_MODULES]);
    const groups = filterModuleGroupsByAccess(MODULE_GROUPS, SUPER_ADMIN, enabled, "GYM", false);

    const groupIds = groups.map((g) => g.id);
    expect(groupIds).toContain("gym");
    expect(groupIds).toContain("commerce");
    expect(groupIds).toContain("admin");
    expect(groupIds).toContain("platform");

    expect(findItem(groups, "/dashboard/clients")).toBeDefined();
    expect(findItem(groups, "/dashboard/reports")).toBeDefined();
    expect(findItem(groups, "/dashboard/memberships/client-memberships")).toBeDefined();
  });
});

describe("filterModuleGroupsByAccess — caso 2: RUNTIME TRUSTME (vertical null, Commerce-only)", () => {
  it("el grupo Gestión GYM desaparece por completo; Commerce/Administración/Platform Admin se conservan", () => {
    const enabled = new Set([...ALL_COMMERCE_MODULES, ...ALL_CORE_MODULES]);
    const groups = filterModuleGroupsByAccess(MODULE_GROUPS, SUPER_ADMIN, enabled, null, false);

    const groupIds = groups.map((g) => g.id);
    expect(groupIds).not.toContain("gym");
    expect(groupIds).toContain("commerce");
    expect(groupIds).toContain("admin");
    expect(groupIds).toContain("platform");

    expect(findItem(groups, "/dashboard/clients")).toBeUndefined();
    expect(findItem(groups, "/dashboard/reports")).toBeUndefined();
    expect(findItem(groups, "/dashboard/users")).toBeDefined();
    expect(findItem(groups, "/dashboard/branches")).toBeDefined();
  });
});

describe("filterModuleGroupsByAccess — caso 4: filtro de módulo (NAV_MODULE_FILTER)", () => {
  it("un módulo Commerce deshabilitado oculta su item sin importar la vertical (GYM/RETAIL/null)", () => {
    const enabledWithoutSales = new Set(
      [...ALL_GYM_MODULES, ...ALL_COMMERCE_MODULES, ...ALL_CORE_MODULES].filter((c) => c !== "commerce.sales"),
    );

    for (const vertical of ["GYM", "RETAIL", null]) {
      const groups = filterModuleGroupsByAccess(MODULE_GROUPS, SUPER_ADMIN, enabledWithoutSales, vertical, false);
      expect(findItem(groups, "/dashboard/sales")).toBeUndefined();
    }
  });
});

describe("filterModuleGroupsByAccess — caso 5: filtro de vertical (VERTICAL_FILTER)", () => {
  it("vertical null + sin módulos gym -> Clientes/Reportes GYM no pasan solo por carecer de moduleCode", () => {
    const enabled = new Set(ALL_COMMERCE_MODULES);
    const groups = filterModuleGroupsByAccess(MODULE_GROUPS, SUPER_ADMIN, enabled, null, false);

    expect(findItem(groups, "/dashboard/clients")).toBeUndefined();
    expect(findItem(groups, "/dashboard/reports")).toBeUndefined();
  });

  it("Commerce nunca depende de vertical: visible con vertical GYM, RETAIL o null si sus módulos están habilitados", () => {
    const enabled = new Set(ALL_COMMERCE_MODULES);
    for (const vertical of ["GYM", "RETAIL", null]) {
      const groups = filterModuleGroupsByAccess(MODULE_GROUPS, SUPER_ADMIN, enabled, vertical, false);
      expect(findItem(groups, "/dashboard/products")).toBeDefined();
      expect(findItem(groups, "/dashboard/sales")).toBeDefined();
    }
  });
});

describe("filterModuleGroupsByAccess — LEGACY_UNMANAGED: bypass explícito", () => {
  it("isLegacyUnmanaged=true no oculta Clientes/Reportes GYM aunque effectiveVerticalCode sea null", () => {
    const enabled = new Set([...ALL_GYM_MODULES, ...ALL_COMMERCE_MODULES, ...ALL_CORE_MODULES]);
    const groups = filterModuleGroupsByAccess(MODULE_GROUPS, SUPER_ADMIN, enabled, null, true);

    expect(findItem(groups, "/dashboard/clients")).toBeDefined();
    expect(findItem(groups, "/dashboard/reports")).toBeDefined();
  });
});

describe("filterModuleGroupsByAccess — Platform Admin", () => {
  it("nunca se filtra por módulo ni por vertical, solo por rol", () => {
    const groups = filterModuleGroupsByAccess(MODULE_GROUPS, SUPER_ADMIN, new Set(), null, false);
    const platformGroup = groups.find((g) => g.id === "platform");
    expect(platformGroup).toBeDefined();
    expect(platformGroup!.items.length).toBeGreaterThan(0);
  });
});
