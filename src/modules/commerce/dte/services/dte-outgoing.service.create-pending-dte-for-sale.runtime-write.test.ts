// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-outgoing.service.create-pending-dte-for-sale.runtime-write.test.ts
//
// FASE VI-E3 — createPendingDteForSale acepta un `db` explícito y usa
// db.$transaction para TODO (Sale, DteOutgoingDocument, DteIssuerConfig,
// DteCorrelative). Este test hace fallar CUALQUIER llamada al Prisma
// global (`@/lib/db/prisma`) para certificar
// RUNTIME_CLIENT_FE01_CREATION_CAN_HIT_GLOBAL_PRISMA = NO y
// RUNTIME_CLIENT_CCFE03_CREATION_CAN_HIT_GLOBAL_PRISMA = NO.
//
// createPendingDteForPurchase (FSE 14) NO se toca en esta fase — no se
// certifica aquí a propósito.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: createPendingDteForSale tocó el Prisma global.");
      },
    },
  ),
}));

vi.mock("../utils/dte-transmission-validation.utils", () => ({
  validateDteTransmissionInput: vi.fn(() => ({
    ok: true,
    data: { transmission_type_code: "1", contingency_type_code: null, contingency_reason: null },
  })),
}));

import { createPendingDteForSale } from "./dte-outgoing.service";

function buildFakeRuntimeDb() {
  const tx = {
    sale: {
      findFirst: vi.fn().mockResolvedValue({
        id: "sale-1",
        status: "CONFIRMED",
        inventory_moved: true,
        customer_id: null,
        customer: null,
        _count: { items: 1 },
      }),
    },
    dteOutgoingDocument: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "dte-runtime-1" }),
    },
    dteIssuerConfig: {
      findFirst: vi.fn().mockResolvedValue({
        id: "cfg-1",
        cod_estable_mh: "M001",
        cod_punto_venta_mh: "P001",
      }),
    },
    dteCorrelative: {
      upsert: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        last_sequence: 0,
        external_baseline_last_used_sequence: 0,
      }),
      update: vi.fn().mockResolvedValue({ last_sequence: 1 }),
    },
  };

  const db = {
    __marker: "RUNTIME_CLIENT_DB",
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
  };

  return { db, tx };
}

const BASE_INPUT = {
  sale_id: "sale-1",
  dte_type_code: "01" as const,
  issuer_config_id: "cfg-1",
  environment: "TEST" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPendingDteForSale — FASE VI-E3 (runtime db injection)", () => {
  it("FE 01 -> usa db.$transaction (runtime), nunca el Prisma global", async () => {
    const { db, tx } = buildFakeRuntimeDb();

    const result = await createPendingDteForSale("tenant-1", "loc-1", "u1", BASE_INPUT, db as never);

    expect(result).toMatchObject({ ok: true, dte_document_id: "dte-runtime-1" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sale-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(tx.dteOutgoingDocument.create).toHaveBeenCalledTimes(1);
  });

  it("CCFE 03 -> también usa la misma DB runtime para Sale, correlativo y documento", async () => {
    const { db, tx } = buildFakeRuntimeDb();
    tx.sale.findFirst.mockResolvedValue({
      id: "sale-1",
      status: "CONFIRMED",
      inventory_moved: true,
      customer_id: "cust-1",
      customer: { id: "cust-1", nit: "00000000000000", nrc: "123456", activity_code: "01111" },
      _count: { items: 1 },
    });

    const result = await createPendingDteForSale(
      "tenant-1", "loc-1", "u1",
      { ...BASE_INPUT, dte_type_code: "03" },
      db as never,
    );

    expect(result).toMatchObject({ ok: true, dte_document_id: "dte-runtime-1" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.dteIssuerConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "cfg-1", tenant_id: "tenant-1", location_id: "loc-1", environment: "TEST" }),
      }),
    );
  });

  it("Sale de otro tenant/location -> tx.sale.findFirst filtra siempre por tenant_id/location_id (fail closed)", async () => {
    const { db, tx } = buildFakeRuntimeDb();
    tx.sale.findFirst.mockResolvedValue(null);

    const result = await createPendingDteForSale("tenant-1", "loc-1", "u1", BASE_INPUT, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(tx.dteOutgoingDocument.create).not.toHaveBeenCalled();
  });

  it("no pasar db -> por defecto usa el Prisma global (comportamiento preservado para callers no migrados)", async () => {
    await expect(createPendingDteForSale("tenant-1", "loc-1", "u1", BASE_INPUT)).rejects.toThrow(
      "RUNTIME_UNSAFE",
    );
  });
});
