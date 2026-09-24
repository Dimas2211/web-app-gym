// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — create-supplier.action.test.ts
//
// FASE VI-D2 — certifica que createSupplierAction pasa por el helper
// operativo común: usa el client EFECTIVO (nunca Prisma global cuando
// hay uno runtime), y autoriza con el ROL LIVE, no con el rol stale
// de requireAdmin()/JWT.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { createSupplierSpy, requireOperationalContextMock, disposeMock, FakeOperationalContextError } = vi.hoisted(() => {
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
    createSupplierSpy: vi.fn(),
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
  };
});

vi.mock("../services/supplier.service", () => ({
  createSupplier: createSupplierSpy,
}));

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

import { createSupplierAction } from "./create-supplier.action";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const VALID_FORM = fd({
  supplier_code: "PROV-001",
  name: "Proveedor Test",
  taxpayer_type: "SMALL_TAXPAYER",
});

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
  createSupplierSpy.mockReset();
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
});

describe("createSupplierAction — FASE VI-D2", () => {
  it("usa context.client (runtime efectivo) al crear, nunca prisma global implícito", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    createSupplierSpy.mockResolvedValue({ ok: true, id: "s1", supplier_code: "PROV-001" });

    await createSupplierAction(undefined, VALID_FORM);

    expect(createSupplierSpy).toHaveBeenCalledWith("tenant-1", "u1", expect.anything(), runtimeDbMarker);
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("rol LIVE (reception) sin canManageStaff -> deniega, createSupplier NUNCA se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ role: "reception" }));

    const result = await createSupplierAction(undefined, VALID_FORM);

    expect(result?.error).toBeTruthy();
    expect(createSupplierSpy).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("requireOperationalContext falla (RUNTIME_CLIENT inválido) -> fail closed, createSupplier NUNCA se invoca", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("RUNTIME_UNAVAILABLE", "No se pudo acceder al entorno de la organización.", 503),
    );

    const result = await createSupplierAction(undefined, VALID_FORM);

    expect(result?.error).toBe("No se pudo acceder al entorno de la organización.");
    expect(createSupplierSpy).not.toHaveBeenCalled();
  });
});

describe("createSupplierAction — SHARED-PILOT-4C-C1 (NIT id_type_code=36)", () => {
  it("SMALL_TAXPAYER + 36 + NIT válido pasa Zod e invoca createSupplier con el client runtime", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    requireOperationalContextMock.mockResolvedValue(fakeHandle({ client: runtimeDbMarker }));
    createSupplierSpy.mockResolvedValue({ ok: true, id: "s-nit", supplier_code: "PROV-NIT-001" });

    const result = await createSupplierAction(undefined, fd({
      supplier_code: "PROV-NIT-001",
      name:          "Supplier Test NIT",
      taxpayer_type: "SMALL_TAXPAYER",
      person_type:   "NATURAL_PERSON",
      id_type_code:  "36",
      nit:           "0614-010268-009-9",
      nrc:           "160466-8",
    }));

    expect(result).toBeUndefined();
    expect(result?.errors?.taxpayer_type).toBeUndefined();
    expect(result?.errors?.id_type_code).toBeUndefined();
    expect(createSupplierSpy).toHaveBeenCalledTimes(1);
    expect(createSupplierSpy).toHaveBeenCalledWith(
      "tenant-1",
      "u1",
      expect.objectContaining({
        taxpayer_type: "SMALL_TAXPAYER",
        person_type:   "NATURAL_PERSON",
        id_type_code:  "36",
        nit:           "0614-010268-009-9",
        nrc:           "160466-8",
      }),
      runtimeDbMarker,
    );
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("NIT mal formado → error en nit, sin error en taxpayer_type/id_type_code, createSupplier NO se invoca", async () => {
    requireOperationalContextMock.mockResolvedValue(fakeHandle());

    const result = await createSupplierAction(undefined, fd({
      supplier_code: "PROV-NIT-002",
      name:          "Supplier Test NIT",
      taxpayer_type: "SMALL_TAXPAYER",
      id_type_code:  "36",
      nit:           "0614010268",
    }));

    expect(result?.errors?.nit).toBeTruthy();
    expect(result?.errors?.taxpayer_type).toBeUndefined();
    expect(result?.errors?.id_type_code).toBeUndefined();
    expect(createSupplierSpy).not.toHaveBeenCalled();
  });
});
