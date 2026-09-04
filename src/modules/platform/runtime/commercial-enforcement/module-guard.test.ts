// ─────────────────────────────────────────────────────────────────
// platform/runtime/commercial-enforcement — module-guard.test.ts
//
// Bloque B — casos de la sección 29 del enunciado (motor de módulos):
//   1-4: precedencia MANAGED (plan / override true / override false / sin fila)
//   5:   LEGACY_UNMANAGED (bypass explícito)
//   6:   MANAGED con config incompleta -> cubierto en resolve-commercial-context.test.ts
//        (COMMERCIAL_CONTEXT_ERROR nunca degrada a legacy)
//   7:   Superadmin en Platform Admin -> las páginas /dashboard/platform/**
//        nunca llaman requireOrganizationModule (solo requireSuperAdmin),
//        por diseño quedan exentas del module entitlement del cliente —
//        no hay nada que probar a nivel de este guard puro.
//   8:   Superadmin operando como cliente -> requireOrganizationModule recibe
//        el tenantId EFECTIVO como parámetro explícito (responsabilidad del
//        caller, resuelto vía resolveEffectiveTenantContext) — el guard en
//        sí no distingue "quién" está detrás de la sesión, solo aplica el
//        contrato del tenant que se le pasa, así que un super_admin operando
//        como cliente queda sujeto al contrato del cliente automáticamente.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { hasOrganizationModule, assertOrganizationModule } from "./module-guard";
import { CommercialEnforcementError, type CommercialEnforcementContext } from "./types";
import type { EffectiveModule } from "../../types/platform.types";

const CODE = "commerce.products";

function mod(overrides: Partial<EffectiveModule> = {}): EffectiveModule {
  return {
    module_id: "mod-1",
    code: CODE,
    name: "Productos",
    category: "COMMERCE",
    is_core: false,
    enabled: true,
    source: "PLAN",
    ...overrides,
  };
}

function managedCtx(m: EffectiveModule | undefined): CommercialEnforcementContext {
  return {
    mode: "MANAGED",
    tenantId: "tenant-1",
    organizationId: "org-1",
    planId: "plan-1",
    verticalId: null,
    effectiveModules: m ? new Map([[CODE, m]]) : new Map(),
    effectiveEntitlements: new Map(),
  };
}

const legacyCtx: CommercialEnforcementContext = {
  mode: "LEGACY_UNMANAGED",
  tenantId: "tenant-legacy",
  organizationId: null,
  planId: null,
  verticalId: null,
  effectiveModules: new Map(),
  effectiveEntitlements: new Map(),
};

describe("hasOrganizationModule / assertOrganizationModule", () => {
  it("1. MANAGED, plan module enabled, sin override -> permitido", () => {
    expect(hasOrganizationModule(managedCtx(mod({ enabled: true, source: "PLAN" })), CODE)).toBe(true);
  });

  it("2. MANAGED, plan enabled, override false -> bloqueado", () => {
    expect(hasOrganizationModule(managedCtx(mod({ enabled: false, source: "ORGANIZATION_OVERRIDE_REMOVED" })), CODE)).toBe(false);
  });

  it("3. MANAGED, sin plan module, override true -> permitido", () => {
    expect(hasOrganizationModule(managedCtx(mod({ enabled: true, source: "ORGANIZATION_OVERRIDE_ADDED" })), CODE)).toBe(true);
  });

  it("4. MANAGED, sin plan module, sin override -> bloqueado (UNCONFIGURED)", () => {
    expect(hasOrganizationModule(managedCtx(mod({ enabled: false, source: "UNCONFIGURED" })), CODE)).toBe(false);
    expect(hasOrganizationModule(managedCtx(undefined), CODE)).toBe(false);
  });

  it("5. LEGACY_UNMANAGED -> bypass explícito, siempre permitido", () => {
    expect(hasOrganizationModule(legacyCtx, CODE)).toBe(true);
  });

  it("is_core=true no es bypass automático — se resuelve igual que cualquier módulo", () => {
    // Verifica explícitamente que el guard NO trata is_core como caso especial:
    // un módulo core deshabilitado/no configurado sigue bloqueado.
    expect(hasOrganizationModule(managedCtx(mod({ code: "core.users", is_core: true, enabled: false, source: "UNCONFIGURED" })), "core.users")).toBe(false);
  });

  it("assertOrganizationModule lanza MODULE_NOT_ENABLED (403) cuando no hay acceso", () => {
    expect(() => assertOrganizationModule(managedCtx(mod({ enabled: false, source: "UNCONFIGURED" })), CODE)).toThrow(
      CommercialEnforcementError,
    );
    try {
      assertOrganizationModule(managedCtx(mod({ enabled: false, source: "UNCONFIGURED" })), CODE);
      expect.unreachable();
    } catch (err) {
      expect((err as CommercialEnforcementError).code).toBe("MODULE_NOT_ENABLED");
      expect((err as CommercialEnforcementError).httpStatus).toBe(403);
    }
  });

  it("assertOrganizationModule no lanza cuando el módulo está habilitado", () => {
    expect(() => assertOrganizationModule(managedCtx(mod({ enabled: true })), CODE)).not.toThrow();
  });
});
