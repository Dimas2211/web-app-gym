// ─────────────────────────────────────────────────────────────────
// platform/runtime — effective-vertical.test.ts
//
// PASO 6F — Navegación runtime-aware + aislamiento de superficie por
// vertical. Fija el contrato de resolveEffectiveVerticalCode,
// hasEffectiveVertical y el guard requireEffectiveVertical usado por
// Clientes GYM, Reportes GYM y Configuración > Deportes/Metas/Datos
// del gimnasio.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { platformVerticalFindUniqueSpy, redirectMock } = vi.hoisted(() => ({
  platformVerticalFindUniqueSpy: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("./control-plane-prisma", () => ({
  controlPlanePrisma: {
    platformVertical: { findUnique: platformVerticalFindUniqueSpy },
  },
}));

const { resolveCommercialEnforcementContextMock } = vi.hoisted(() => ({
  resolveCommercialEnforcementContextMock: vi.fn(),
}));

vi.mock("./commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock,
}));

import {
  resolveEffectiveVerticalCode,
  hasEffectiveVertical,
  requireEffectiveVertical,
} from "./effective-vertical";
import type { CommercialEnforcementContext } from "./commercial-enforcement/types";

function managedCtx(verticalId: string | null): CommercialEnforcementContext {
  return {
    mode: "MANAGED",
    tenantId: "tenant-1",
    organizationId: "org-1",
    planId: "plan-1",
    verticalId,
    effectiveModules: new Map(),
    effectiveEntitlements: new Map(),
    organizationTimezone: "America/El_Salvador",
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
  organizationTimezone: null,
};

beforeEach(() => {
  platformVerticalFindUniqueSpy.mockReset();
  resolveCommercialEnforcementContextMock.mockReset();
  redirectMock.mockClear();
});

describe("resolveEffectiveVerticalCode", () => {
  it("MANAGED con vertical_id -> resuelve el code desde el Control Plane", async () => {
    platformVerticalFindUniqueSpy.mockResolvedValue({ code: "GYM" });
    const code = await resolveEffectiveVerticalCode(managedCtx("vertical-gym-id"));
    expect(code).toBe("GYM");
    expect(platformVerticalFindUniqueSpy).toHaveBeenCalledWith({
      where: { id: "vertical-gym-id" },
      select: { code: true },
    });
  });

  it("MANAGED sin vertical_id (Commerce-only, ej. TrustMe) -> null, sin consultar el Control Plane", async () => {
    const code = await resolveEffectiveVerticalCode(managedCtx(null));
    expect(code).toBeNull();
    expect(platformVerticalFindUniqueSpy).not.toHaveBeenCalled();
  });

  it("error de infraestructura al resolver la vertical -> null (nunca lanza)", async () => {
    platformVerticalFindUniqueSpy.mockRejectedValue(new Error("db down"));
    const code = await resolveEffectiveVerticalCode(managedCtx("vertical-gym-id"));
    expect(code).toBeNull();
  });
});

describe("hasEffectiveVertical", () => {
  it("LEGACY_UNMANAGED -> bypass explícito, siempre true", () => {
    expect(hasEffectiveVertical(legacyCtx, null, "GYM")).toBe(true);
  });

  it("MANAGED con vertical coincidente -> true", () => {
    expect(hasEffectiveVertical(managedCtx("v1"), "GYM", "GYM")).toBe(true);
  });

  it("MANAGED con vertical null (Commerce-only) requiriendo GYM -> false", () => {
    expect(hasEffectiveVertical(managedCtx(null), null, "GYM")).toBe(false);
  });

  it("MANAGED con otra vertical -> false", () => {
    expect(hasEffectiveVertical(managedCtx("v2"), "RETAIL", "GYM")).toBe(false);
  });
});

describe("requireEffectiveVertical — guard server-first (Clientes/Reportes GYM/Configuración GYM)", () => {
  it("organización efectiva SIN vertical GYM (ej. TrustMe) -> redirige, nunca deja pasar", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(managedCtx(null));

    await expect(requireEffectiveVertical("tenant-trustme", "GYM")).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard?commercial_error=vertical_not_enabled",
    );
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("organización efectiva CON vertical GYM -> no redirige", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(managedCtx("vertical-gym-id"));
    platformVerticalFindUniqueSpy.mockResolvedValue({ code: "GYM" });

    await expect(requireEffectiveVertical("tenant-gym", "GYM")).resolves.toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("LEGACY_UNMANAGED -> bypass, no redirige aunque no se resuelva vertical", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(legacyCtx);

    await expect(requireEffectiveVertical("tenant-legacy", "GYM")).resolves.toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
