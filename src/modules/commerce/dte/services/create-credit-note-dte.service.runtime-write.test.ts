// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-credit-note-dte.service.runtime-write.test.ts
//
// FASE VI-E4B — createCreditNoteDteFromAcceptedCcfe acepta un `db`
// explícito y usa db.$transaction para TODO (DteOutgoingDocument
// original, DteDocumentRelation, DteIssuerConfig, correlativo,
// creación del NC 05). Este test hace fallar CUALQUIER llamada al
// Prisma global para certificar
// RUNTIME_CLIENT_NC05_CREATION_CAN_HIT_GLOBAL_PRISMA = NO.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: createCreditNoteDteFromAcceptedCcfe tocó el Prisma global.");
      },
    },
  ),
}));

vi.mock("./dte-correlative.service", () => ({
  reserveDteControlNumber: vi.fn(async () => ({ sequence: 1, control_number: "DTE-05-C001P001-000000000000001" })),
}));

import { createCreditNoteDteFromAcceptedCcfe } from "./create-credit-note-dte.service";
import { reserveDteControlNumber } from "./dte-correlative.service";

const ORIGINAL_CCFE = {
  id: "ccfe-1",
  tenant_id: "tenant-1",
  location_id: "loc-1",
  sale_id: "sale-1",
  issuer_config_id: "cfg-1",
  dte_type_code: "03",
  dte_status: "ACCEPTED",
  environment: "TEST",
  generation_code: "GEN-CCFE-1",
  control_number: "DTE-03-C001P001-000000000000001",
  reception_stamp: "STAMP-1",
  json_document: { resumen: { totalPagar: 113 } },
};

function buildFakeRuntimeDb() {
  const tx = {
    dteOutgoingDocument: {
      findFirst: vi.fn().mockResolvedValue(ORIGINAL_CCFE),
      create: vi.fn().mockResolvedValue({
        id: "nc-1",
        control_number: "DTE-05-C001P001-000000000000001",
        generation_code: "GEN-NC-1",
        dte_status: "PENDING_GENERATION",
      }),
    },
    dteDocumentRelation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "rel-1" }),
    },
    dteIssuerConfig: {
      findFirst: vi.fn().mockResolvedValue({
        id: "cfg-1",
        cod_estable_mh: "M001",
        cod_punto_venta_mh: "P001",
      }),
    },
  };

  const db = {
    __marker: "RUNTIME_CLIENT_DB",
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
  };

  return { db, tx };
}

const BASE_INPUT = {
  sourceDteDocumentId: "ccfe-1",
  reasonText: "Devolución de mercadería",
  userId: "u1",
  tenantId: "tenant-1",
  locationId: "loc-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCreditNoteDteFromAcceptedCcfe — FASE VI-E4B (runtime db injection)", () => {
  it("usa db.$transaction (runtime), nunca el Prisma global", async () => {
    const { db, tx } = buildFakeRuntimeDb();

    const result = await createCreditNoteDteFromAcceptedCcfe(BASE_INPUT, db as never);

    expect(result).toMatchObject({ ok: true, creditNoteDteId: "nc-1" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.dteOutgoingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ccfe-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(reserveDteControlNumber).toHaveBeenCalledWith(tx, expect.objectContaining({ dte_type_code: "05" }));
    expect(tx.dteOutgoingDocument.create).toHaveBeenCalledTimes(1);
    expect(tx.dteDocumentRelation.create).toHaveBeenCalledTimes(1);
  });

  it("CCFE original de otro tenant/location -> tx.dteOutgoingDocument.findFirst filtra siempre por tenant_id/location_id (fail closed)", async () => {
    const { db, tx } = buildFakeRuntimeDb();
    tx.dteOutgoingDocument.findFirst.mockResolvedValue(null);

    const result = await createCreditNoteDteFromAcceptedCcfe(BASE_INPUT, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(tx.dteOutgoingDocument.create).not.toHaveBeenCalled();
  });

  it("DTE original no es CCFE 03 -> rechaza sin crear NC", async () => {
    const { db, tx } = buildFakeRuntimeDb();
    tx.dteOutgoingDocument.findFirst.mockResolvedValue({ ...ORIGINAL_CCFE, dte_type_code: "01" });

    const result = await createCreditNoteDteFromAcceptedCcfe(BASE_INPUT, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(tx.dteOutgoingDocument.create).not.toHaveBeenCalled();
  });

  it("CCFE original no ACCEPTED -> rechaza sin crear NC", async () => {
    const { db, tx } = buildFakeRuntimeDb();
    tx.dteOutgoingDocument.findFirst.mockResolvedValue({ ...ORIGINAL_CCFE, dte_status: "PENDING_GENERATION" });

    const result = await createCreditNoteDteFromAcceptedCcfe(BASE_INPUT, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(tx.dteOutgoingDocument.create).not.toHaveBeenCalled();
  });

  it("ya existe NC activa sobre el mismo CCFE -> bloquea duplicado (idempotencia preservada)", async () => {
    const { db, tx } = buildFakeRuntimeDb();
    tx.dteDocumentRelation.findFirst.mockResolvedValue({
      id: "rel-existing",
      source_document: { id: "nc-existing", dte_status: "GENERATED", control_number: "DTE-05-..." },
    });

    const result = await createCreditNoteDteFromAcceptedCcfe(BASE_INPUT, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(tx.dteOutgoingDocument.create).not.toHaveBeenCalled();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado para callers no migrados)", async () => {
    await expect(createCreditNoteDteFromAcceptedCcfe(BASE_INPUT)).rejects.toThrow("RUNTIME_UNSAFE");
  });
});
