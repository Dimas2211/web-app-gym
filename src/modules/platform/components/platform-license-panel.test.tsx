// platform-license-panel — fechas comerciales date-only (sin desplazamiento de zona).
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../actions/update-organization-license.action", () => ({
  updateOrganizationLicenseAction: vi.fn(),
}));

import { PlatformLicensePanel } from "./platform-license-panel";
import type { PlatformOrganizationDetail } from "../types/platform.types";

const ORG = {
  id: "8f8d3c3e-3f0b-4b8e-9d4b-2b8c6f3a1e11",
  status: "SUSPENDED",
  license_status: "SUSPENDED",
  billing_cycle: "MONTHLY",
  trial_ends_at: null,
  license_expires_at: null,
  timezone: "America/El_Salvador",
  suspended_at: new Date("2026-10-12T00:00:00Z"),
  suspension_reason: "Pago pendiente",
} as unknown as PlatformOrganizationDetail;

describe("PlatformLicensePanel — suspended_at date-only", () => {
  it("2026-10-12T00:00:00Z → banner 12/10/2026 e input 2026-10-12, nunca el día 11", () => {
    const html = renderToStaticMarkup(<PlatformLicensePanel org={ORG} />);
    expect(html).toContain("12/10/2026");
    expect(html).toContain('value="2026-10-12"');
    expect(html).not.toContain("11/10/2026");
    expect(html).not.toContain("2026-10-11");
  });
});
