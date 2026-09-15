// ─────────────────────────────────────────────────────────────────
// commerce/customers — create-customer.action.test.ts
//
// FASE VI-D2 — certifica que createCustomerAction pasa por el helper
// operativo común: usa el client EFECTIVO (nunca Prisma global cuando
// hay uno runtime), y autoriza con el ROL LIVE (context.effectiveUser.role),
// no con el rol stale de requireAdmin()/JWT.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  // JWT trae super_admin — a propósito distinto del rol LIVE en los
  // tests de downgrade, para demostrar que el rol usado es el efectivo.
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { createCustomerSpy, requireOperationalContextMock, disposeMock, FakeOperationalContextError } = vi.hoisted(() => {
  class FakeOperationalContextError extends Error {
    code: string;
    httpStatus: number;
    userMessage: string;
    constructor(code: string, userMessage: string, httpStatus: number) {
      super(userMessage);
      this.code = code;
      this.httpStatus = httpStatus;
      this.userMessage = userMessage;
    }
  }
  return {
    createCustomerSpy: vi.fn(),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("../services/customer.service", () => ({
  createCustomer: createCustomerSpy,
}));

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { createCustomerAction } from "./create-customer.action";

const VALID_INPUT = { name: "Cliente Test", taxpayer_type: "FINAL_CONSUMER" } as never;

function fakeHandle(overrides: Partial<{ role: string; client: unknown; tenantId: string }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: overrides.role ?? "super_admin" },
      tenantId: overrides.tenantId ?? "tenant-1",
      client: overrides.client ?? { __marker: "RUNTIME_CLIENT_DB" },
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  createCustomerSpy.mockReset();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

describe("createCustomerAction — FASE VI-D2", () => {
  it("usa context.client (runtime efectivo) al crear, nunca prisma global implícito", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    createCustomerSpy.mockResolvedValue({ ok: true, id: "c1", customer_code: "000001" });

    await createCustomerAction(VALID_INPUT);

    expect(createCustomerSpy).toHaveBeenCalledWith("tenant-1", "u1", expect.anything(), runtimeDbMarker);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("rol LIVE (reception) sin canManageStaff -> deniega, createCustomer NUNCA se invoca, aunque el JWT diga super_admin", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ role: "reception" }));

    const result = await createCustomerAction(VALID_INPUT);

    expect(result.ok).toBe(false);
    expect(createCustomerSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("rol LIVE branch_admin -> permite (canManageStaff)", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ role: "branch_admin" }));
    createCustomerSpy.mockResolvedValue({ ok: true, id: "c1", customer_code: "000001" });

    const result = await createCustomerAction(VALID_INPUT);

    expect(result.ok).toBe(true);
    expect(createCustomerSpy).toHaveBeenCalled();
  });

  it("requireOperationalContext falla (RUNTIME_CLIENT inválido) -> fail closed, createCustomer NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("RUNTIME_UNAVAILABLE", "No se pudo acceder al entorno de la organización.", 503),
    );

    const result = await createCustomerAction(VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("No se pudo acceder al entorno de la organización.");
    expect(createCustomerSpy).not.toHaveBeenCalled();
  });
});
