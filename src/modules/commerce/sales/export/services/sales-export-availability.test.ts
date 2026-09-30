// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — sales-export-availability.test.ts
//
// FINAL-RUNTIME-CLOSURE — capability por organización fiscal.dte.export:
//   disponible = capability AND flag técnico DTE_FEX11_* AND emisor válido.
// Contexto comercial construido con el resolver PURO real del Bloque A
// (resolveEffectiveModules) — misma precedencia Organization override →
// Plan que producción. Prisma global prohibido; sin red, sin escrituras.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({}, {
    get() {
      throw new Error("RUNTIME_UNSAFE: sales-export-availability tocó el Prisma global.");
    },
  }),
}));

const resolveCommercialMock = vi.fn();
vi.mock("@/modules/platform/runtime/commercial-enforcement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/platform/runtime/commercial-enforcement")>()),
  resolveCommercialEnforcementContext: (...args: unknown[]) => resolveCommercialMock(...args),
}));

import { resolveEffectiveModules } from "@/modules/platform/lib/entitlements-resolver";
import type { CommercialEnforcementContext } from "@/modules/platform/runtime/commercial-enforcement";
import {
  FEX_EXPORT_MODULE_CODE,
  hasFexExportCapability,
  resolveSalesExportAvailability,
} from "./sales-export-availability";

const VERTICAL_GYM = "vertical-gym";

// Catálogo real: fiscal.dte.export es transversal (vertical_id null) y
// NO está incluido en ningún plan.
const ALL_MODULES = [
  { id: "m-sales",  code: "commerce.sales",    vertical_id: null },
  { id: "m-dte",    code: "fiscal.dte",        vertical_id: null },
  { id: "m-export", code: "fiscal.dte.export", vertical_id: null },
  { id: "m-gym",    code: "gym.memberships",   vertical_id: VERTICAL_GYM },
].map((m) => ({
  ...m, name: m.code, description: null, category: "INTEGRATION" as const, status: "AVAILABLE" as const,
  version: "1.0", is_core: false, vertical: null, created_at: new Date(),
}));

const PLAN_MODULES = [
  { module_id: "m-sales", is_enabled: true },
  { module_id: "m-dte",   is_enabled: true },
];

function commercialCtx(opts: { tenantId: string; verticalId: string | null; exportOverride?: boolean }): CommercialEnforcementContext {
  const orgModules = opts.exportOverride === undefined
    ? []
    : [{
        id: "", organization_id: `org-${opts.tenantId}`, module_id: "m-export",
        module: { code: "", name: "", category: "CORE" as const }, is_active: opts.exportOverride,
        activated_at: new Date(), deactivated_at: null,
      }];
  const modules = resolveEffectiveModules({
    allModules: ALL_MODULES,
    planModules: PLAN_MODULES,
    orgModules,
    organizationVerticalId: opts.verticalId,
  });
  return {
    mode: "MANAGED",
    tenantId: opts.tenantId,
    organizationId: `org-${opts.tenantId}`,
    planId: "plan-1",
    verticalId: opts.verticalId,
    effectiveModules: new Map(modules.map((m) => [m.code, m])),
    effectiveEntitlements: new Map(),
    organizationTimezone: "America/El_Salvador",
  };
}

// TrustMe = Commerce transversal (sin vertical) con override explícito.
const TRUSTME = () => commercialCtx({ tenantId: "tenant-trustme", verticalId: null, exportOverride: true });
// Otra organización Commerce del mismo plan, sin override.
const OTHER_COMMERCE = () => commercialCtx({ tenantId: "tenant-other", verticalId: null });
// Organización GYM del mismo plan, sin override.
const GYM = () => commercialCtx({ tenantId: "tenant-gym", verticalId: VERTICAL_GYM });

function runtimeDb(issuers: { environment: "TEST" | "PRODUCTION" }[]) {
  return { dteIssuerConfig: { findMany: vi.fn().mockResolvedValue(issuers) } };
}

beforeEach(() => {
  resolveCommercialMock.mockReset();
  vi.stubEnv("DTE_FEX11_TEST_ENABLED", "");
  vi.stubEnv("DTE_FEX11_ENABLED", "");
  vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hasFexExportCapability — modelo comercial por organización", () => {
  it("código de capability = fiscal.dte.export", () => {
    expect(FEX_EXPORT_MODULE_CODE).toBe("fiscal.dte.export");
  });

  it("org con override fiscal.dte.export (Commerce transversal, sin vertical) → true", () => {
    expect(hasFexExportCapability(TRUSTME())).toBe(true);
  });

  it("otra org del MISMO plan sin override → false (no se hereda del plan)", () => {
    expect(hasFexExportCapability(OTHER_COMMERCE())).toBe(false);
  });

  it("org GYM del mismo plan sin override → false; con override → true (no depende de vertical)", () => {
    expect(hasFexExportCapability(GYM())).toBe(false);
    expect(hasFexExportCapability(commercialCtx({ tenantId: "tenant-gym", verticalId: VERTICAL_GYM, exportOverride: true }))).toBe(true);
  });

  it("override desactivado (is_active=false) → false", () => {
    expect(hasFexExportCapability(commercialCtx({ tenantId: "t", verticalId: null, exportOverride: false }))).toBe(false);
  });
});

describe("resolveSalesExportAvailability — capability AND flag técnico AND emisor", () => {
  it("capability + flag TEST + emisor TEST activo → disponible (TEST)", async () => {
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    resolveCommercialMock.mockResolvedValue(TRUSTME());
    const db = runtimeDb([{ environment: "TEST" }]);

    expect(await resolveSalesExportAvailability("tenant-trustme", "loc-1", db as never))
      .toEqual({ enabled: true, environment: "TEST" });
    expect(resolveCommercialMock).toHaveBeenCalledWith("tenant-trustme");
  });

  it("sin capability → bloqueado aunque flag y emisor lo permitan (sin consultar emisor)", async () => {
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    resolveCommercialMock.mockResolvedValue(OTHER_COMMERCE());
    const db = runtimeDb([{ environment: "TEST" }]);

    expect(await resolveSalesExportAvailability("tenant-other", "loc-1", db as never))
      .toEqual({ enabled: false, environment: null });
    expect(db.dteIssuerConfig.findMany).not.toHaveBeenCalled();
  });

  it("capability pero sin emisor activo → bloqueado", async () => {
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    resolveCommercialMock.mockResolvedValue(TRUSTME());

    expect(await resolveSalesExportAvailability("tenant-trustme", "loc-1", runtimeDb([]) as never))
      .toEqual({ enabled: false, environment: null });
  });

  it("capability pero TEST y PRODUCTION activos a la vez (emisor ambiguo) → bloqueado", async () => {
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    resolveCommercialMock.mockResolvedValue(TRUSTME());
    const db = runtimeDb([{ environment: "TEST" }, { environment: "PRODUCTION" }]);

    expect(await resolveSalesExportAvailability("tenant-trustme", "loc-1", db as never))
      .toEqual({ enabled: false, environment: null });
  });

  it("capability pero ambiente no permitido (emisor PROD, solo flag TEST) → bloqueado", async () => {
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    resolveCommercialMock.mockResolvedValue(TRUSTME());

    expect(await resolveSalesExportAvailability("tenant-trustme", "loc-1", runtimeDb([{ environment: "PRODUCTION" }]) as never))
      .toEqual({ enabled: false, environment: "PRODUCTION" });
  });

  it("capability pero sin ningún flag técnico DTE_FEX11_* → bloqueado (kill switch)", async () => {
    resolveCommercialMock.mockResolvedValue(TRUSTME());

    expect(await resolveSalesExportAvailability("tenant-trustme", "loc-1", runtimeDb([{ environment: "TEST" }]) as never))
      .toEqual({ enabled: false, environment: null });
  });

  it("no depende de hostname: mismo resultado con cualquier host configurado", async () => {
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    resolveCommercialMock.mockResolvedValue(TRUSTME());
    const results = [];
    for (const host of ["trustme.getzolvi.com", "otro-cliente.example.com"]) {
      vi.stubEnv("NEXTAUTH_URL", `https://${host}`);
      results.push(await resolveSalesExportAvailability("tenant-trustme", "loc-1", runtimeDb([{ environment: "TEST" }]) as never));
    }
    expect(results[0]).toEqual(results[1]);
  });
});
