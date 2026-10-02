// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — sales-export-availability.test.ts
//
// FEX11-FINAL-CLOSURE — FEX 11 es un tipo DTE normal de fiscal.dte:
//   disponible = módulo fiscal.dte AND emisor DTE activo único válido.
// Sin capability propia, sin flags DTE_FEX11_*, sin hostname.
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
  FEX_ACCESS_MODULE_CODE,
  FEX_NOT_AVAILABLE_ERROR,
  hasFexAccess,
  resolveSalesExportAvailability,
  resolveSalesExportAvailabilityDetailed,
} from "./sales-export-availability";

const VERTICAL_GYM = "vertical-gym";

const ALL_MODULES = [
  { id: "m-sales", code: "commerce.sales",  vertical_id: null },
  { id: "m-dte",   code: "fiscal.dte",      vertical_id: null },
  { id: "m-gym",   code: "gym.memberships", vertical_id: VERTICAL_GYM },
].map((m) => ({
  ...m, name: m.code, description: null, category: "INTEGRATION" as const, status: "AVAILABLE" as const,
  version: "1.0", is_core: false, vertical: null, created_at: new Date(),
}));

function commercialCtx(opts: {
  tenantId:    string;
  verticalId:  string | null;
  planHasDte:  boolean;
  dteOverride?: boolean;
}): CommercialEnforcementContext {
  const planModules = [
    { module_id: "m-sales", is_enabled: true },
    ...(opts.planHasDte ? [{ module_id: "m-dte", is_enabled: true }] : []),
  ];
  const orgModules = opts.dteOverride === undefined
    ? []
    : [{
        id: "", organization_id: `org-${opts.tenantId}`, module_id: "m-dte",
        module: { code: "", name: "", category: "CORE" as const }, is_active: opts.dteOverride,
        activated_at: new Date(), deactivated_at: null,
      }];
  const modules = resolveEffectiveModules({
    allModules: ALL_MODULES,
    planModules,
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

// Cualquier organización Commerce con fiscal.dte en su plan (no solo TrustMe).
const COMMERCE_WITH_DTE = () => commercialCtx({ tenantId: "tenant-a", verticalId: null, planHasDte: true });
// Organización Commerce sin fiscal.dte.
const COMMERCE_NO_DTE = () => commercialCtx({ tenantId: "tenant-b", verticalId: null, planHasDte: false });
// Organización GYM con fiscal.dte.
const GYM_WITH_DTE = () => commercialCtx({ tenantId: "tenant-gym", verticalId: VERTICAL_GYM, planHasDte: true });

function runtimeDb(issuers: { environment: string }[]) {
  return { dteIssuerConfig: { findMany: vi.fn().mockResolvedValue(issuers) } };
}

beforeEach(() => {
  resolveCommercialMock.mockReset();
  // Hermético: aunque el .env local traiga los antiguos DTE_FEX11_*, no deben influir.
  vi.stubEnv("DTE_FEX11_TEST_ENABLED", "");
  vi.stubEnv("DTE_FEX11_ENABLED", "");
  vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hasFexAccess — FEX 11 pertenece a fiscal.dte", () => {
  it("módulo de acceso = fiscal.dte", () => {
    expect(FEX_ACCESS_MODULE_CODE).toBe("fiscal.dte");
  });

  it("org con fiscal.dte en su plan → true (sin override especial)", () => {
    expect(hasFexAccess(COMMERCE_WITH_DTE())).toBe(true);
  });

  it("org sin fiscal.dte → false", () => {
    expect(hasFexAccess(COMMERCE_NO_DTE())).toBe(false);
  });

  it("no depende de vertical: org GYM con fiscal.dte → true", () => {
    expect(hasFexAccess(GYM_WITH_DTE())).toBe(true);
  });

  it("override de organización sobre fiscal.dte se respeta (activado → true, desactivado → false)", () => {
    expect(hasFexAccess(commercialCtx({ tenantId: "t", verticalId: null, planHasDte: false, dteOverride: true }))).toBe(true);
    expect(hasFexAccess(commercialCtx({ tenantId: "t", verticalId: null, planHasDte: true, dteOverride: false }))).toBe(false);
  });
});

describe("resolveSalesExportAvailability — fiscal.dte AND emisor activo único", () => {
  it("fiscal.dte + emisor TEST activo → disponible (TEST), sin env vars", async () => {
    resolveCommercialMock.mockResolvedValue(COMMERCE_WITH_DTE());
    const db = runtimeDb([{ environment: "TEST" }]);

    expect(await resolveSalesExportAvailability("tenant-a", "loc-1", db as never))
      .toEqual({ enabled: true, environment: "TEST" });
    expect(resolveCommercialMock).toHaveBeenCalledWith("tenant-a");
  });

  it("fiscal.dte + emisor PRODUCTION activo → disponible (PRODUCTION), no depende de env var", async () => {
    resolveCommercialMock.mockResolvedValue(COMMERCE_WITH_DTE());

    expect(await resolveSalesExportAvailability("tenant-a", "loc-1", runtimeDb([{ environment: "PRODUCTION" }]) as never))
      .toEqual({ enabled: true, environment: "PRODUCTION" });
  });

  it("sin fiscal.dte → bloqueado (sin consultar emisor)", async () => {
    resolveCommercialMock.mockResolvedValue(COMMERCE_NO_DTE());
    const db = runtimeDb([{ environment: "TEST" }]);

    expect(await resolveSalesExportAvailability("tenant-b", "loc-1", db as never))
      .toEqual({ enabled: false, environment: null });
    expect(db.dteIssuerConfig.findMany).not.toHaveBeenCalled();
  });

  it("fiscal.dte pero sin emisor activo → bloqueado", async () => {
    resolveCommercialMock.mockResolvedValue(COMMERCE_WITH_DTE());

    expect(await resolveSalesExportAvailability("tenant-a", "loc-1", runtimeDb([]) as never))
      .toEqual({ enabled: false, environment: null });
  });

  it("fiscal.dte pero TEST y PRODUCTION activos a la vez (emisor ambiguo) → fail-closed", async () => {
    resolveCommercialMock.mockResolvedValue(COMMERCE_WITH_DTE());
    const db = runtimeDb([{ environment: "TEST" }, { environment: "PRODUCTION" }]);

    expect(await resolveSalesExportAvailability("tenant-a", "loc-1", db as never))
      .toEqual({ enabled: false, environment: null });
  });

  it("emisor con ambiente no reconocido → fail-closed", async () => {
    resolveCommercialMock.mockResolvedValue(COMMERCE_WITH_DTE());

    expect(await resolveSalesExportAvailability("tenant-a", "loc-1", runtimeDb([{ environment: "STAGING" }]) as never))
      .toEqual({ enabled: false, environment: null });
  });

  it("los antiguos DTE_FEX11_*=YES no conceden acceso sin fiscal.dte", async () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    resolveCommercialMock.mockResolvedValue(COMMERCE_NO_DTE());

    expect(await resolveSalesExportAvailability("tenant-b", "loc-1", runtimeDb([{ environment: "TEST" }]) as never))
      .toEqual({ enabled: false, environment: null });
  });

  it("no depende de hostname: mismo resultado con cualquier host configurado", async () => {
    resolveCommercialMock.mockResolvedValue(COMMERCE_WITH_DTE());
    const results = [];
    for (const host of ["trustme.getzolvi.com", "otro-cliente.example.com"]) {
      vi.stubEnv("NEXTAUTH_URL", `https://${host}`);
      results.push(await resolveSalesExportAvailability("tenant-a", "loc-1", runtimeDb([{ environment: "TEST" }]) as never));
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toEqual({ enabled: true, environment: "TEST" });
  });
});

describe("resolveSalesExportAvailabilityDetailed — motivo visible en /dashboard/sales/export", () => {
  it("sin fiscal.dte → motivo de módulo", async () => {
    resolveCommercialMock.mockResolvedValue(COMMERCE_NO_DTE());
    expect(await resolveSalesExportAvailabilityDetailed("tenant-b", "loc-1", runtimeDb([]) as never))
      .toEqual({ enabled: false, environment: null, reason: FEX_NOT_AVAILABLE_ERROR });
  });

  it("override fiscal.dte habilitado pero sin emisor en la sucursal → motivo de emisor", async () => {
    resolveCommercialMock.mockResolvedValue(commercialCtx({ tenantId: "t", verticalId: VERTICAL_GYM, planHasDte: false, dteOverride: true }));
    const r = await resolveSalesExportAvailabilityDetailed("t", "loc-1", runtimeDb([]) as never);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/configuración DTE activa/);
  });

  it("override fiscal.dte habilitado + emisor activo → disponible sin motivo", async () => {
    resolveCommercialMock.mockResolvedValue(commercialCtx({ tenantId: "t", verticalId: VERTICAL_GYM, planHasDte: false, dteOverride: true }));
    expect(await resolveSalesExportAvailabilityDetailed("t", "loc-1", runtimeDb([{ environment: "TEST" }]) as never))
      .toEqual({ enabled: true, environment: "TEST", reason: null });
  });
});
