// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-pending-dte-simple.action.test.ts
//
// FASE VI-E3 — migra a requireOperationalContext. Certifica:
//   - Support Session (READ_ONLY) bloquea antes de tocar la DB.
//   - Sale/DteIssuerConfig se leen desde context.client (nunca Prisma
//     global) — certifica FE_CCFE_CREATION_SAME_RUNTIME_DB.
//   - Cross-tenant/cross-location: el lookup de Sale siempre filtra
//     por context.tenantId/context.locationId (nunca IDs del body).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/permissions/guards", () => ({
  requireAdmin: vi.fn(async () => ({ id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" })),
}));

const { requireOperationalContextMock, disposeMock, FakeOperationalContextError, createPendingDteForSaleSpy } = vi.hoisted(() => {
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
    requireOperationalContextMock: vi.fn(),
    disposeMock: vi.fn().mockResolvedValue(undefined),
    FakeOperationalContextError,
    createPendingDteForSaleSpy: vi.fn(),
  };
});

vi.mock("@/modules/platform/runtime/require-operational-context", () => ({
  requireOperationalContext: requireOperationalContextMock,
  OperationalContextError: FakeOperationalContextError,
}));

vi.mock("../services/dte-outgoing.service", () => ({
  createPendingDteForSale: createPendingDteForSaleSpy,
}));

import { createPendingDteSimpleAction } from "./create-pending-dte-simple.action";

function fakeRuntimeClient(overrides: { sale?: unknown; configs?: unknown[] } = {}) {
  const saleFindFirst = vi.fn().mockResolvedValue(
    overrides.sale === undefined
      ? { id: "sale-1", status: "CONFIRMED", inventory_moved: true, primary_dte_type_code: "01" }
      : overrides.sale,
  );
  const issuerFindMany = vi.fn().mockResolvedValue(
    overrides.configs ?? [{ id: "cfg-1", environment: "TEST" }],
  );
  return {
    __marker: "RUNTIME_CLIENT_DB",
    sale: { findFirst: saleFindFirst },
    dteIssuerConfig: { findMany: issuerFindMany },
  };
}

function fakeHandle(client: unknown, overrides: Partial<{ tenantId: string; locationId: string | null }> = {}) {
  return {
    context: {
      effectiveUser: { id: "u1", role: "super_admin" },
      tenantId: overrides.tenantId ?? "tenant-1",
      locationId: overrides.locationId === undefined ? "loc-1" : overrides.locationId,
      client,
    },
    dispose: disposeMock,
  };
}

beforeEach(() => {
  requireOperationalContextMock.mockReset();
  disposeMock.mockClear();
  createPendingDteForSaleSpy.mockReset();
});

describe("createPendingDteSimpleAction — FASE VI-E3", () => {
  it("Support Session (READ_ONLY) bloquea -> ningún lookup ni creación ocurre", async () => {
    requireOperationalContextMock.mockRejectedValue(
      new FakeOperationalContextError("READ_ONLY", "Modo runtime read-only activo.", 403),
    );

    const result = await createPendingDteSimpleAction("sale-1");

    expect(result).toMatchObject({ ok: false, error: "Modo runtime read-only activo." });
    expect(createPendingDteForSaleSpy).not.toHaveBeenCalled();
  });

  it("Sale y DteIssuerConfig se leen desde context.client (misma runtime DB)", async () => {
    const client = fakeRuntimeClient();
    requireOperationalContextMock.mockResolvedValue(fakeHandle(client));
    createPendingDteForSaleSpy.mockResolvedValue({ ok: true, dte_document_id: "dte-1" });

    const result = await createPendingDteSimpleAction("sale-1");

    expect(result).toMatchObject({ ok: true, dte_document_id: "dte-1" });
    expect(client.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sale-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(client.dteIssuerConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenant_id: "tenant-1", location_id: "loc-1", is_active: true } }),
    );
    expect(createPendingDteForSaleSpy).toHaveBeenCalledWith(
      "tenant-1", "loc-1", "u1",
      expect.objectContaining({ sale_id: "sale-1", issuer_config_id: "cfg-1", environment: "TEST" }),
      client,
    );
  });

  it("Sale de otro tenant/location (cross-tenant) -> findFirst no la devuelve, se rechaza", async () => {
    const client = fakeRuntimeClient({ sale: null });
    requireOperationalContextMock.mockResolvedValue(fakeHandle(client));

    const result = await createPendingDteSimpleAction("sale-of-other-tenant");

    expect(result).toMatchObject({ ok: false });
    expect(createPendingDteForSaleSpy).not.toHaveBeenCalled();
  });

  it("más de una config DTE activa (TEST y PRODUCTION) -> rechaza sin inferir", async () => {
    const client = fakeRuntimeClient({
      configs: [{ id: "cfg-1", environment: "TEST" }, { id: "cfg-2", environment: "PRODUCTION" }],
    });
    requireOperationalContextMock.mockResolvedValue(fakeHandle(client));

    const result = await createPendingDteSimpleAction("sale-1");

    expect(result).toMatchObject({ ok: false });
    expect(createPendingDteForSaleSpy).not.toHaveBeenCalled();
  });

  it("sin location activa -> error explícito", async () => {
    const client = fakeRuntimeClient();
    requireOperationalContextMock.mockResolvedValue(fakeHandle(client, { locationId: null }));

    const result = await createPendingDteSimpleAction("sale-1");

    expect(result).toMatchObject({ ok: false });
    expect(client.sale.findFirst).not.toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });
});
