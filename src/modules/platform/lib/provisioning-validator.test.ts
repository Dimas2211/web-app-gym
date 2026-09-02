// ─────────────────────────────────────────────────────────────────
// platform — provisioning-validator.test.ts (Bloque A, FASE A14)
//
// Casos 9-10: Commerce sin vertical no debe fallar el provisioning
// únicamente por vertical_id=null; GYM con vertical sigue funcionando.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { validateProvisioning } from "./provisioning-validator";
import type { PlatformOrganizationDetail } from "../types/platform.types";

function baseOrg(overrides: Partial<PlatformOrganizationDetail> = {}): PlatformOrganizationDetail {
  return {
    id: "org-1", code: "org-1", name: "Org de prueba", legal_name: null, tenant_id: null,
    status: "ACTIVE", license_status: "ACTIVE", billing_cycle: "MONTHLY", provisioning_status: "NOT_READY",
    country_code: "SV", timezone: "America/El_Salvador",
    vertical: null,
    plan: { id: "plan-1", code: "commerce-standard", name: "Commerce Standard" },
    created_at: new Date(),
    nit: null, domain: null, logo_url: null, trial_ends_at: null, license_expires_at: null,
    deployment_url: null, instance_identifier: null, suspended_at: null, suspension_reason: null,
    updated_at: new Date(),
    ...overrides,
  };
}

describe("validateProvisioning — checkVertical (Bloque A)", () => {
  it("9. organización Commerce con vertical null no falla únicamente por vertical", () => {
    const result = validateProvisioning({
      org: baseOrg({ vertical: null }),
      branding: { id: "b1", organization_id: "org-1", primary_color: "#000000", secondary_color: null, logo_url: null, favicon_url: null, custom_domain: null, updated_at: new Date() },
      modules: [{ id: "om-1", organization_id: "org-1", module_id: "m1", module: { code: "commerce.sales", name: "Ventas", category: "COMMERCE" }, is_active: true, activated_at: new Date(), deactivated_at: null }],
    });

    const verticalCheck = result.checks.find((c) => c.key === "vertical");
    expect(verticalCheck?.passed).toBe(true);
  });

  it("10. organización GYM con vertical asignada sigue validando correctamente", () => {
    const result = validateProvisioning({
      org: baseOrg({ vertical: { id: "v1", code: "GYM", name: "Gimnasio" } }),
      branding: { id: "b1", organization_id: "org-1", primary_color: "#000000", secondary_color: null, logo_url: null, favicon_url: null, custom_domain: null, updated_at: new Date() },
      modules: [{ id: "om-1", organization_id: "org-1", module_id: "m1", module: { code: "gym.memberships", name: "Membresías", category: "VERTICAL" }, is_active: true, activated_at: new Date(), deactivated_at: null }],
    });

    const verticalCheck = result.checks.find((c) => c.key === "vertical");
    expect(verticalCheck?.passed).toBe(true);
    expect(verticalCheck?.message).toBeNull();
  });
});
