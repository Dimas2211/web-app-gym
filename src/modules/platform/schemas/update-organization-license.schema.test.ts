import { describe, it, expect } from "vitest";
import { updateOrganizationLicenseSchema } from "./update-organization-license.schema";

const ID = "8f8d3c3e-3f0b-4b8e-9d4b-2b8c6f3a1e11";

describe("updateOrganizationLicenseSchema — TRIAL exige trial_ends_at", () => {
  it("TRIAL sin fecha → error en trial_ends_at", () => {
    const r = updateOrganizationLicenseSchema.safeParse({ id: ID, license_status: "TRIAL", trial_ends_at: null });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.trial_ends_at?.[0]).toMatch(/obligatoria/);
  });

  it("TRIAL con fecha → válido y conserva la fecha calendario (medianoche UTC)", () => {
    const r = updateOrganizationLicenseSchema.safeParse({ id: ID, license_status: "TRIAL", trial_ends_at: "2026-10-15" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.trial_ends_at?.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });

  it("ACTIVE sin fechas → válido (compatibilidad)", () => {
    const r = updateOrganizationLicenseSchema.safeParse({ id: ID, license_status: "ACTIVE", trial_ends_at: null });
    expect(r.success).toBe(true);
  });
});
