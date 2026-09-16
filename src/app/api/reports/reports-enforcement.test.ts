// ─────────────────────────────────────────────────────────────────
// api/reports — reports-enforcement.test.ts
//
// FASE VI-D7 (certificación VI-D6): certifica que resolveReportApiContext()
// SIEMPRE pasa `user` como segundo argumento a resolveEffectiveApiContext().
// Antes se omitía, y una identidad RUNTIME_CLIENT (super_admin "operando
// como cliente") caía silenciosamente al branch PLATFORM_NATIVO (Prisma
// global + baseTenantId sin revalidar) en vez de resolver el tenant/cliente
// runtime efectivo.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/modules/platform/runtime/commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: vi.fn().mockResolvedValue({}),
  hasOrganizationModule: vi.fn().mockReturnValue(true),
  assertOrganizationModule: vi.fn(),
  CommercialEnforcementError: class extends Error {},
}));

const resolveEffectiveApiContextMock = vi.fn();
vi.mock("@/modules/platform/runtime/effective-tenant-context", () => ({
  resolveEffectiveApiContext: (...args: unknown[]) => resolveEffectiveApiContextMock(...args),
}));

import { resolveReportApiContext } from "./reports-enforcement";

describe("resolveReportApiContext — propagación de `user` a resolveEffectiveApiContext", () => {
  beforeEach(() => {
    resolveEffectiveApiContextMock.mockReset();
  });

  it("pasa `user` (con auth_scope/organization_id) como segundo argumento — nunca lo omite", async () => {
    const sessionUser = {
      id: "user-1",
      role: "super_admin" as const,
      tenant_id: "tenant-real",
      location_id: "location-real",
      auth_scope: "RUNTIME_CLIENT" as const,
      organization_id: "org-1",
    };
    const disposeMock = vi.fn();
    resolveEffectiveApiContextMock.mockResolvedValue({
      context: {
        tenantId: "tenant-runtime-client",
        client: {},
      },
      dispose: disposeMock,
    });

    const result = await resolveReportApiContext(
      "tenant-real",
      "commerce.reports",
      sessionUser,
    );

    expect(resolveEffectiveApiContextMock).toHaveBeenCalledTimes(1);
    const [baseArg, passedUser] = resolveEffectiveApiContextMock.mock.calls[0];
    expect(baseArg).toMatchObject({ tenantId: "tenant-real" });
    expect(passedUser).toBeDefined();
    expect(passedUser).toMatchObject({ auth_scope: "RUNTIME_CLIENT", organization_id: "org-1" });

    // El guard comercial debe evaluarse sobre el tenant EFECTIVO (runtime),
    // nunca sobre baseTenantId directamente.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe("tenant-runtime-client");
    }
  });

  it("funciona sin `user` (compatibilidad con callers PLATFORM_NATIVE existentes)", async () => {
    resolveEffectiveApiContextMock.mockResolvedValue({
      context: { tenantId: "tenant-real", client: {} },
      dispose: vi.fn(),
    });

    await resolveReportApiContext("tenant-real", "commerce.reports");

    expect(resolveEffectiveApiContextMock).toHaveBeenCalledTimes(1);
    const [, passedUser] = resolveEffectiveApiContextMock.mock.calls[0];
    expect(passedUser).toBeUndefined();
  });
});
