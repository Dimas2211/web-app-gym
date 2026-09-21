// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-outgoing.service.create-pending-dte-for-purchase.runtime-write.test.ts
//
// FASE VI-E4A — createPendingDteForPurchase (FSE 14) acepta un `db`
// explícito y usa db.$transaction para TODO (Purchase, DteOutgoingDocument,
// DteIssuerConfig, DteCorrelative). Este test hace fallar CUALQUIER
// llamada al Prisma global para certificar
// RUNTIME_CLIENT_FSE14_CREATION_CAN_HIT_GLOBAL_PRISMA = NO.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: createPendingDteForPurchase tocó el Prisma global.");
      },
    },
  ),
}));

import { createPendingDteForPurchase } from "./dte-outgoing.service";

function buildFakeRuntimeDb() {
  const tx = {
    purchase: {
      findFirst: vi.fn().mockResolvedValue({
        id: "purchase-1",
        status: "CONFIRMED",
        document_type: "FSE",
        supplier: { id: "sup-1", taxpayer_type: "EXCLUDED_SUBJECT" },
        _count: { items: 1 },
      }),
    },
    dteOutgoingDocument: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany:  vi.fn().mockResolvedValue([]),
      create:    vi.fn().mockResolvedValue({ id: "dte-fse-runtime-1" }),
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
  purchase_id:      "purchase-1",
  issuer_config_id: "cfg-1",
  environment:      "TEST" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPendingDteForPurchase (FSE 14) — FASE VI-E4A (runtime db injection)", () => {
  it("usa db.$transaction (runtime), nunca el Prisma global", async () => {
    const { db, tx } = buildFakeRuntimeDb();

    const result = await createPendingDteForPurchase("tenant-1", "loc-1", "u1", BASE_INPUT, db as never);

    expect(result).toMatchObject({ ok: true, dte_document_id: "dte-fse-runtime-1" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.purchase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "purchase-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(tx.dteOutgoingDocument.create).toHaveBeenCalledTimes(1);
  });

  it("Purchase de otro tenant/location -> tx.purchase.findFirst filtra siempre por tenant_id/location_id (fail closed)", async () => {
    const { db, tx } = buildFakeRuntimeDb();
    tx.purchase.findFirst.mockResolvedValue(null);

    const result = await createPendingDteForPurchase("tenant-1", "loc-1", "u1", BASE_INPUT, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(tx.dteOutgoingDocument.create).not.toHaveBeenCalled();
  });

  it("proveedor no EXCLUDED_SUBJECT -> rechaza sin crear el documento", async () => {
    const { db, tx } = buildFakeRuntimeDb();
    tx.purchase.findFirst.mockResolvedValue({
      id: "purchase-1",
      status: "CONFIRMED",
      document_type: "FSE",
      supplier: { id: "sup-1", taxpayer_type: "GENERAL" },
      _count: { items: 1 },
    });

    const result = await createPendingDteForPurchase("tenant-1", "loc-1", "u1", BASE_INPUT, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(tx.dteOutgoingDocument.create).not.toHaveBeenCalled();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado para callers no migrados)", async () => {
    await expect(createPendingDteForPurchase("tenant-1", "loc-1", "u1", BASE_INPUT)).rejects.toThrow(
      "RUNTIME_UNSAFE",
    );
  });
});
