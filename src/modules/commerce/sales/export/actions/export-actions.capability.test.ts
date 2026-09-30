// ─────────────────────────────────────────────────────────────────
// commerce/sales/export/actions — export-actions.capability.test.ts
//
// FEX11-FINAL-CLOSURE — enforcement server-side de fiscal.dte en los
// wrappers de ambas familias de actions de exportación. Una
// organización sin fiscal.dte recibe FEX_NOT_AVAILABLE_ERROR ANTES de
// cualquier query, generación, firma o transmisión. No existe capability
// propia de exportación ni flags DTE_FEX11_*.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/permissions/guards", () => ({ requireAdmin: vi.fn().mockResolvedValue({ id: "user-1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireOperationalContextMock = vi.fn();
vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: (...args: unknown[]) => requireOperationalContextMock(...args),
  OperationalContextError: class extends Error {},
}));

const searchForeignCustomersMock = vi.fn();
vi.mock("../queries/search-foreign-customers", () => ({
  searchForeignCustomers: (...args: unknown[]) => searchForeignCustomersMock(...args),
}));

const { generateFexJsonMock, signMock, transmitMock } = vi.hoisted(() => ({
  generateFexJsonMock: vi.fn(),
  signMock:            vi.fn(),
  transmitMock:        vi.fn(),
}));
vi.mock("../../../dte/actions/generate-fex-json-for-sale.action", () => ({ generateFexJsonForSaleAction: generateFexJsonMock }));
vi.mock("../../../dte/actions/sign-dte-document.action", () => ({ signDteDocumentAction: signMock }));
vi.mock("../../../dte/actions/transmit-dte-document.action", () => ({ transmitDteDocumentAction: transmitMock }));
vi.mock("../../../dte/actions/deliver-dte-to-external-db.action", () => ({ deliverDteToExternalDbAction: vi.fn() }));

import { searchForeignCustomersAction } from "./export-sale.actions";
import { generateExportDteJsonAction, signExportDteAction, transmitExportDteAction } from "./export-sale-dte.actions";
import { FEX_NOT_AVAILABLE_ERROR } from "../services/sales-export-availability";

function commercialContext(enabledCodes: string[]) {
  return {
    mode: "MANAGED",
    tenantId: "tenant-A",
    organizationId: "org-A",
    planId: "plan-1",
    verticalId: null,
    effectiveModules: new Map(enabledCodes.map((code) => [code, { code, enabled: true }])),
    effectiveEntitlements: new Map(),
    organizationTimezone: null,
  };
}

function handle(enabledCodes: string[]) {
  const dispose = vi.fn();
  return {
    dispose,
    value: {
      context: {
        tenantId: "tenant-A",
        locationId: "loc-1",
        client: {},
        commercialContext: commercialContext(enabledCodes),
      },
      dispose,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Hermético: los antiguos flags FEX no deben influir en nada.
  vi.stubEnv("DTE_FEX11_TEST_ENABLED", "");
  vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "");
  vi.stubEnv("DTE_FEX11_ENABLED", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("actions de exportación — acceso por fiscal.dte", () => {
  it("sin fiscal.dte → error de disponibilidad, sin consultar datos", async () => {
    const h = handle(["commerce.sales"]);
    requireOperationalContextMock.mockResolvedValue(h.value);

    const result = await searchForeignCustomersAction("acme");

    expect(result).toEqual({ ok: false, error: FEX_NOT_AVAILABLE_ERROR });
    expect(searchForeignCustomersMock).not.toHaveBeenCalled();
    expect(h.dispose).toHaveBeenCalled();
  });

  it("con fiscal.dte y sin ningún DTE_FEX11_* → la action opera normalmente", async () => {
    requireOperationalContextMock.mockResolvedValue(handle(["commerce.sales", "fiscal.dte"]).value);
    searchForeignCustomersMock.mockResolvedValue([]);

    const result = await searchForeignCustomersAction("acme");

    expect(result).toEqual({ ok: true, items: [] });
  });

  it.each([
    ["generate", generateExportDteJsonAction],
    ["sign", signExportDteAction],
    ["transmit", transmitExportDteAction],
  ])("DTE %s sin fiscal.dte → bloqueado antes de generar/firmar/transmitir", async (_label, action) => {
    requireOperationalContextMock.mockResolvedValue(handle(["commerce.sales"]).value);

    const result = await action("dte-1");

    expect(result).toEqual({ ok: false, error: FEX_NOT_AVAILABLE_ERROR });
    expect(generateFexJsonMock).not.toHaveBeenCalled();
    expect(signMock).not.toHaveBeenCalled();
    expect(transmitMock).not.toHaveBeenCalled();
  });

  it("los antiguos DTE_FEX11_*=YES no sustituyen a fiscal.dte", async () => {
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    requireOperationalContextMock.mockResolvedValue(handle(["commerce.sales"]).value);

    const result = await searchForeignCustomersAction("acme");

    expect(result).toEqual({ ok: false, error: FEX_NOT_AVAILABLE_ERROR });
    expect(searchForeignCustomersMock).not.toHaveBeenCalled();
  });
});
