// ─────────────────────────────────────────────────────────────────
// commerce/dte — create-contingency-event.service.runtime-write.test.ts
//
// FASE VI-E6C — createContingencyEvent acepta un `db` explícito y usa
// db.* para TODO (DteOutgoingDocument, DteContingencyEventItem,
// DteContingencyEvent). Este test hace fallar CUALQUIER llamada al
// Prisma global para certificar
// RUNTIME_CLIENT_DTE_CONTINGENCY_CREATE_CAN_HIT_GLOBAL_PRISMA = NO.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: createContingencyEvent tocó el Prisma global.");
      },
    },
  ),
}));

import { createContingencyEvent } from "./create-contingency-event.service";

const DTE_DOC = {
  id: "dte-1",
  dte_type_code: "01",
  dte_status: "SIGNED",
  generation_code: "GEN-1",
  transmission_type_code: "2",
  contingency_type_code: "1",
  json_document: { identificacion: { fecEmi: "2026-01-15", horEmi: "10:00:00" } },
};

const BASE_PARAMS = {
  dteDocumentIds: ["dte-1"],
  contingencyTypeCode: "1" as const,
  reason: null,
  periodStartDate: new Date("2026-01-15T00:00:00Z"),
  periodStartTime: "00:00:00",
  periodEndDate: new Date("2026-01-15T00:00:00Z"),
  periodEndTime: "23:59:59",
  responsable: {
    nombre: "Responsable Prueba",
    tipoDocumento: "13",
    numeroDocumento: "12345678-9",
  },
  userId: "user-1",
  tenantId: "tenant-1",
  locationId: "loc-1",
};

function buildFakeRuntimeDb() {
  return {
    __marker: "RUNTIME_CLIENT_DB",
    dteOutgoingDocument: {
      findMany: vi.fn().mockResolvedValue([DTE_DOC]),
    },
    dteContingencyEventItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        dteContingencyEvent: { create: vi.fn().mockResolvedValue({ id: "evt-1" }) },
        dteContingencyEventItem: { createMany: vi.fn().mockResolvedValue({}) },
      }),
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createContingencyEvent — FASE VI-E6C (runtime db injection)", () => {
  it("usa db.* (runtime) para DTE + eventos conflictivos + creación transaccional, nunca el Prisma global", async () => {
    const db = buildFakeRuntimeDb();

    const result = await createContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: true, contingencyEventId: "evt-1", itemCount: 1 });
    expect(db.dteOutgoingDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["dte-1"] }, tenant_id: "tenant-1", location_id: "loc-1" },
      }),
    );
    expect(db.dteContingencyEventItem.findMany).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("DTE de otro tenant/location (no aparece en el findMany scoped) -> bloquea la creación", async () => {
    const db = buildFakeRuntimeDb();
    db.dteOutgoingDocument.findMany = vi.fn().mockResolvedValue([]);

    const result = await createContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("DTE ya cubierto por otro evento de contingencia activo -> bloquea la creación", async () => {
    const db = buildFakeRuntimeDb();
    db.dteContingencyEventItem.findMany = vi
      .fn()
      .mockResolvedValue([{ dte_document_id: "dte-1", contingency_event_id: "evt-other" }]);

    const result = await createContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado para callers PLATFORM_NATIVE no migrados)", async () => {
    const result = await createContingencyEvent(BASE_PARAMS);
    expect(result).toMatchObject({ ok: false });
  });
});
