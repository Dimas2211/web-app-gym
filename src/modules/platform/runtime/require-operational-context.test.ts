// ─────────────────────────────────────────────────────────────────
// platform/runtime — require-operational-context.test.ts
//
// FASE VI-D2 — ETAPA C/D. Certifica el helper operativo común:
// selección de DB, readOnly, module enforcement, y sobre todo el rol
// LIVE para RUNTIME_CLIENT (ETAPA A) — sin regresión para PLATFORM.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  resolveEffectiveTenantContextMock,
  resolveCommercialEnforcementContextMock,
  assertOrganizationModuleMock,
  FakeCommercialEnforcementError,
} = vi.hoisted(() => {
  class FakeCommercialEnforcementError extends Error {
    readonly httpStatus: number;
    readonly userMessage: string;
    constructor(userMessage: string, httpStatus: number) {
      super(userMessage);
      this.httpStatus = httpStatus;
      this.userMessage = userMessage;
    }
  }
  return {
    resolveEffectiveTenantContextMock: vi.fn(),
    resolveCommercialEnforcementContextMock: vi.fn(),
    assertOrganizationModuleMock: vi.fn(),
    FakeCommercialEnforcementError,
  };
});

vi.mock("./effective-tenant-context", () => ({
  resolveEffectiveTenantContext: resolveEffectiveTenantContextMock,
}));

vi.mock("./commercial-enforcement", () => ({
  resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock,
  assertOrganizationModule: assertOrganizationModuleMock,
  CommercialEnforcementError: FakeCommercialEnforcementError,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { __marker: "NORMAL_SINGLETON" },
}));

import {
  requireOperationalContext,
  OperationalContextError,
} from "./require-operational-context";
import type { SessionUser } from "@/lib/permissions/guards";

function fakeEffective(overrides: Partial<{
  tenantId: string;
  locationId: string | null;
  client: unknown;
  runtimeMode: string;
  readOnly: boolean;
  effectiveRole: string;
}> = {}) {
  const disposeMock = vi.fn().mockResolvedValue(undefined);
  return {
    handle: {
      context: {
        tenantId: "tenant-1",
        locationId: "loc-1",
        client: undefined,
        runtime: null,
        runtimeMode: "PLATFORM_NATIVE",
        readOnly: false,
        effectiveRole: "super_admin",
        ...overrides,
      },
      dispose: disposeMock,
    },
    disposeMock,
  };
}

const PLATFORM_USER = {
  id: "u1",
  tenant_id: "tenant-1",
  location_id: "loc-1",
  role: "super_admin",
  auth_scope: "PLATFORM",
} as unknown as SessionUser;

const RUNTIME_CLIENT_USER = {
  id: "u-runtime",
  tenant_id: "tenant-trustme",
  location_id: "branch-1",
  role: "branch_admin", // JWT — stale a propósito en los tests de role live
  auth_scope: "RUNTIME_CLIENT",
  organization_id: "org-trustme",
} as unknown as SessionUser;

beforeEach(() => {
  resolveEffectiveTenantContextMock.mockReset();
  resolveCommercialEnforcementContextMock.mockReset();
  assertOrganizationModuleMock.mockReset();
});

describe("requireOperationalContext", () => {
  it("1. PLATFORM sin runtime -> comportamiento actual, effectiveUser.role = JWT", async () => {
    const { handle, disposeMock } = fakeEffective({ effectiveRole: "super_admin" });
    resolveEffectiveTenantContextMock.mockResolvedValue(handle);

    const { context, dispose } = await requireOperationalContext(PLATFORM_USER);

    expect(context.authScope).toBe("PLATFORM");
    expect(context.runtimeMode).toBe("PLATFORM_NATIVE");
    expect(context.effectiveUser.role).toBe("super_admin");
    expect(context.client).toEqual({ __marker: "NORMAL_SINGLETON" }); // default cuando context.client es undefined
    expect(context.readOnly).toBe(false);

    await dispose();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("2. JWT super_admin, DB role branch_admin (RUNTIME_CLIENT) -> effective role branch_admin", async () => {
    const { handle } = fakeEffective({
      runtimeMode: "RUNTIME_CLIENT",
      effectiveRole: "branch_admin",
      client: { __marker: "RUNTIME_DB" },
    });
    resolveEffectiveTenantContextMock.mockResolvedValue(handle);

    const { context } = await requireOperationalContext({ ...RUNTIME_CLIENT_USER, role: "super_admin" } as SessionUser);

    expect(context.authScope).toBe("RUNTIME_CLIENT");
    expect(context.effectiveUser.role).toBe("branch_admin");
    expect(context.effectiveUser.role).not.toBe("super_admin");
  });

  it("3. JWT branch_admin, DB role reception (RUNTIME_CLIENT) -> effective role reception", async () => {
    const { handle } = fakeEffective({ runtimeMode: "RUNTIME_CLIENT", effectiveRole: "reception" });
    resolveEffectiveTenantContextMock.mockResolvedValue(handle);

    const { context } = await requireOperationalContext(RUNTIME_CLIENT_USER); // JWT role = branch_admin

    expect(context.effectiveUser.role).toBe("reception");
    expect(context.effectiveUser.role).not.toBe(RUNTIME_CLIENT_USER.role);
  });

  it("4/5/6. runtime user inactivo/inexistente/tenant mismatch -> resolveEffectiveTenantContext lanza -> RUNTIME_UNAVAILABLE (fail closed, sin detalle)", async () => {
    resolveEffectiveTenantContextMock.mockRejectedValue(new Error("RUNTIME_USER_INACTIVE"));

    await expect(requireOperationalContext(RUNTIME_CLIENT_USER)).rejects.toMatchObject({
      code: "RUNTIME_UNAVAILABLE",
      userMessage: "No se pudo acceder al entorno de la organización.",
    });
  });

  it("7. PLATFORM_NATIVE — sin regresión: client=Prisma global, readOnly=false", async () => {
    const { handle } = fakeEffective();
    resolveEffectiveTenantContextMock.mockResolvedValue(handle);

    const { context } = await requireOperationalContext(PLATFORM_USER);

    expect(context.runtimeMode).toBe("PLATFORM_NATIVE");
    expect(context.readOnly).toBe(false);
  });

  it("8. Support Session — usa identidad PLATFORM original (role JWT) y sigue readOnly", async () => {
    const { handle } = fakeEffective({
      runtimeMode: "SUPPORT_RUNTIME",
      readOnly: true,
      effectiveRole: "super_admin", // JWT del super_admin en soporte, no revalidado
      client: { __marker: "SUPPORT_RUNTIME_DB" },
    });
    resolveEffectiveTenantContextMock.mockResolvedValue(handle);

    const { context } = await requireOperationalContext(PLATFORM_USER);

    expect(context.runtimeMode).toBe("SUPPORT_RUNTIME");
    expect(context.readOnly).toBe(true);
    expect(context.effectiveUser.role).toBe("super_admin");
  });

  it("write:true + readOnly (Support Session) -> OperationalContextError READ_ONLY, y dispose() se llama", async () => {
    const { handle, disposeMock } = fakeEffective({ runtimeMode: "SUPPORT_RUNTIME", readOnly: true });
    resolveEffectiveTenantContextMock.mockResolvedValue(handle);

    await expect(
      requireOperationalContext(PLATFORM_USER, { write: true }),
    ).rejects.toMatchObject({ code: "READ_ONLY", httpStatus: 403 });
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("write:true + RUNTIME_CLIENT válido (readOnly=false) -> permite, no lanza", async () => {
    const { handle } = fakeEffective({ runtimeMode: "RUNTIME_CLIENT", readOnly: false });
    resolveEffectiveTenantContextMock.mockResolvedValue(handle);

    await expect(
      requireOperationalContext(RUNTIME_CLIENT_USER, { write: true }),
    ).resolves.toBeDefined();
  });

  it("module deshabilitado -> OperationalContextError MODULE_DISABLED, y dispose() se llama", async () => {
    const { handle, disposeMock } = fakeEffective();
    resolveEffectiveTenantContextMock.mockResolvedValue(handle);
    resolveCommercialEnforcementContextMock.mockResolvedValue({ organizationId: "org-1" });
    assertOrganizationModuleMock.mockImplementation(() => {
      throw new FakeCommercialEnforcementError("Módulo no habilitado para esta organización.", 402);
    });

    await expect(
      requireOperationalContext(PLATFORM_USER, { module: "core.customers" }),
    ).rejects.toMatchObject({ code: "MODULE_DISABLED", httpStatus: 402 });
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("module habilitado -> organizationId viene del Commercial Enforcement Context", async () => {
    const { handle } = fakeEffective();
    resolveEffectiveTenantContextMock.mockResolvedValue(handle);
    resolveCommercialEnforcementContextMock.mockResolvedValue({ organizationId: "org-resolved" });
    assertOrganizationModuleMock.mockImplementation(() => {});

    const { context } = await requireOperationalContext(PLATFORM_USER, { module: "core.customers" });
    expect(context.organizationId).toBe("org-resolved");
  });

  it("RUNTIME_CLIENT sin module option -> organizationId viene de sessionUser.organization_id", async () => {
    const { handle } = fakeEffective({ runtimeMode: "RUNTIME_CLIENT" });
    resolveEffectiveTenantContextMock.mockResolvedValue(handle);

    const { context } = await requireOperationalContext(RUNTIME_CLIENT_USER);
    expect(context.organizationId).toBe("org-trustme");
    expect(resolveCommercialEnforcementContextMock).not.toHaveBeenCalled();
  });

  it("errores son instancia de OperationalContextError", async () => {
    resolveEffectiveTenantContextMock.mockRejectedValue(new Error("boom"));
    await expect(requireOperationalContext(RUNTIME_CLIENT_USER)).rejects.toBeInstanceOf(
      OperationalContextError,
    );
  });
});
