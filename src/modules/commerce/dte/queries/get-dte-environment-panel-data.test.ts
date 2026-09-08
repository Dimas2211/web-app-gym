// ─────────────────────────────────────────────────────────────────
// commerce/dte — get-dte-environment-panel-data.test.ts
//
// Bug residual post FASE IV-A.3: /dashboard/settings/dte mostraba
// "Sin ambiente activo" para TrustMe porque esta query (y las que
// consume transitivamente) usaban el prisma singleton global en vez
// del PrismaClient runtime explícito. Este test certifica que, cuando
// se pasa un `db` explícito, TODAS las llamadas transitivas lo usan —
// nunca caen silenciosamente al singleton normal.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { listDteIssuerConfigsSpy, getDteCredentialStatusSpy, getDteProductionPreflightSpy } = vi.hoisted(() => ({
  listDteIssuerConfigsSpy: vi.fn(),
  getDteCredentialStatusSpy: vi.fn(),
  getDteProductionPreflightSpy: vi.fn(),
}));

vi.mock("./list-dte-issuer-configs", () => ({ listDteIssuerConfigs: listDteIssuerConfigsSpy }));
vi.mock("../services/dte-credential.service", () => ({ getDteCredentialStatus: getDteCredentialStatusSpy }));
vi.mock("../services/dte-production-preflight.service", () => ({ getDteProductionPreflight: getDteProductionPreflightSpy }));

import { getDteEnvironmentPanelData } from "./get-dte-environment-panel-data";
import { prisma } from "@/lib/db/prisma";

const RUNTIME_CLIENT_MARKER = { __marker: "RUNTIME_TRUSTME_CLIENT" } as never;

beforeEach(() => {
  listDteIssuerConfigsSpy.mockReset();
  getDteCredentialStatusSpy.mockReset();
  getDteProductionPreflightSpy.mockReset();
});

describe("getDteEnvironmentPanelData — db explícita (runtime-aware)", () => {
  it("con db explícita (runtime TrustMe) -> listDteIssuerConfigs y getDteProductionPreflight reciben ese mismo client, nunca el singleton implícito", async () => {
    listDteIssuerConfigsSpy.mockResolvedValue([
      { id: "cfg-test", environment: "TEST", is_active: true },
      { id: "cfg-prod", environment: "PRODUCTION", is_active: false },
    ]);
    getDteCredentialStatusSpy.mockResolvedValue({ configured: true });
    getDteProductionPreflightSpy.mockResolvedValue({ status: "READY", checks: [], issuer_config_id: "cfg-prod" });

    await getDteEnvironmentPanelData("tenant-trustme", "branch-trustme", RUNTIME_CLIENT_MARKER);

    expect(listDteIssuerConfigsSpy).toHaveBeenCalledWith(
      { tenant_id: "tenant-trustme", location_id: "branch-trustme" },
      RUNTIME_CLIENT_MARKER,
    );
    expect(getDteProductionPreflightSpy).toHaveBeenCalledWith("tenant-trustme", "branch-trustme", RUNTIME_CLIENT_MARKER);
    // Ambas credenciales (TEST activa, PRODUCTION inactiva) también reciben el client runtime.
    expect(getDteCredentialStatusSpy).toHaveBeenCalledWith("cfg-test", RUNTIME_CLIENT_MARKER);
    expect(getDteCredentialStatusSpy).toHaveBeenCalledWith("cfg-prod", RUNTIME_CLIENT_MARKER);
  });

  it("sin db explícita (modo normal) -> el default propio de la función forwardea el prisma singleton real, nunca undefined", async () => {
    listDteIssuerConfigsSpy.mockResolvedValue([]);
    getDteProductionPreflightSpy.mockResolvedValue({ status: "BLOCKED", checks: [], issuer_config_id: null });

    await getDteEnvironmentPanelData("tenant-gym", "branch-gym");

    // Comparación por identidad (no deep-equal: el PrismaClient real tiene
    // referencias circulares que rompen el matcher estructural de vitest).
    expect(listDteIssuerConfigsSpy.mock.calls[0]?.[1]).toBe(prisma);
    expect(getDteProductionPreflightSpy.mock.calls[0]?.[2]).toBe(prisma);
  });
});
