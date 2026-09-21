// ─────────────────────────────────────────────────────────────────
// commerce/dte — assert-dte-contingency-transmission-allowed.service.runtime-write.test.ts
//
// FASE VI-E6C — assertDteContingencyTransmissionAllowed acepta un `db`
// explícito y usa db.* para TODO (DteContingencyEventItem). Este test
// hace fallar CUALQUIER llamada al Prisma global para certificar
// RUNTIME_CLIENT_DTE_CONTINGENCY_TRANSMIT_CAN_HIT_GLOBAL_PRISMA = NO
// (el guard es parte del pipeline de transmisión type "2").
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: assertDteContingencyTransmissionAllowed tocó el Prisma global.");
      },
    },
  ),
}));

import { assertDteContingencyTransmissionAllowed } from "./assert-dte-contingency-transmission-allowed.service";

const BASE_PARAMS = {
  dteDocumentId: "dte-1",
  tenantId: "tenant-1",
  locationId: "loc-1",
  transmissionTypeCode: "2",
  contingencyTypeCode: "1",
  generationCode: "GEN-1",
};

const ACCEPTED_EVENT_JSON = {
  detalleDTE: [{ codigoGeneracion: "GEN-1" }],
};

function buildFakeRuntimeDb(findManyResult: unknown[] = []) {
  return {
    __marker: "RUNTIME_CLIENT_DB",
    dteContingencyEventItem: {
      findMany: vi.fn().mockResolvedValue(findManyResult),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertDteContingencyTransmissionAllowed — FASE VI-E6C (runtime db injection)", () => {
  it("transmission_type_code='1' (normal) -> siempre permitido, NUNCA consulta la DB", async () => {
    const db = buildFakeRuntimeDb();

    const result = await assertDteContingencyTransmissionAllowed(
      { ...BASE_PARAMS, transmissionTypeCode: "1" },
      db as never,
    );

    expect(result).toEqual({ ok: true });
    expect(db.dteContingencyEventItem.findMany).not.toHaveBeenCalled();
  });

  it("transmission_type_code='2' cubierto por evento ACCEPTED del mismo tenant/location -> permitido, usa db.* (runtime)", async () => {
    const db = buildFakeRuntimeDb([{ contingency_event: { event_json: ACCEPTED_EVENT_JSON } }]);

    const result = await assertDteContingencyTransmissionAllowed(BASE_PARAMS, db as never);

    expect(result).toEqual({ ok: true });
    expect(db.dteContingencyEventItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dte_document_id: "dte-1",
          contingency_event: {
            tenant_id: "tenant-1",
            location_id: "loc-1",
            status: "ACCEPTED",
            contingency_type_code: "1",
          },
        },
      }),
    );
  });

  it("sin evento ACCEPTED que lo cubra -> bloquea la transmisión", async () => {
    const db = buildFakeRuntimeDb([]);

    const result = await assertDteContingencyTransmissionAllowed(BASE_PARAMS, db as never);

    expect(result.ok).toBe(false);
  });

  it("el where filtra por tenant/location/status/tipo en la consulta misma — un evento de otro tenant/location no puede colarse porque el mock de findMany ya simula el enforcement en la query", async () => {
    // Runtime B: el fake db solo devuelve resultados para SU propio tenant/location
    // (findMany en runtime real ya excluiría filas ajenas vía WHERE) — se simula
    // devolviendo [] para representar "cero filas visibles" en la runtime DB
    // que no pertenece al tenant/location del guard.
    const db = buildFakeRuntimeDb([]);

    const result = await assertDteContingencyTransmissionAllowed(
      { ...BASE_PARAMS, tenantId: "tenant-attacker" },
      db as never,
    );

    expect(result.ok).toBe(false);
    expect(db.dteContingencyEventItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          contingency_event: expect.objectContaining({ tenant_id: "tenant-attacker" }),
        }),
      }),
    );
  });

  it("evento ACCEPTED pero de otro contingency_type_code -> bloquea (simulado por el where sin resultados)", async () => {
    const db = buildFakeRuntimeDb([]);

    const result = await assertDteContingencyTransmissionAllowed(
      { ...BASE_PARAMS, contingencyTypeCode: "3" },
      db as never,
    );

    expect(result.ok).toBe(false);
  });

  it("evento sin el generation_code del DTE en detalleDTE -> bloquea aunque el evento esté ACCEPTED", async () => {
    const db = buildFakeRuntimeDb([
      { contingency_event: { event_json: { detalleDTE: [{ codigoGeneracion: "OTRO-GEN" }] } } },
    ]);

    const result = await assertDteContingencyTransmissionAllowed(BASE_PARAMS, db as never);

    expect(result.ok).toBe(false);
  });

  it("sin generationCode -> bloquea antes de consultar la DB", async () => {
    const db = buildFakeRuntimeDb();

    const result = await assertDteContingencyTransmissionAllowed(
      { ...BASE_PARAMS, generationCode: null },
      db as never,
    );

    expect(result.ok).toBe(false);
    expect(db.dteContingencyEventItem.findMany).not.toHaveBeenCalled();
  });

  it("sin contingencyTypeCode -> bloquea antes de consultar la DB", async () => {
    const db = buildFakeRuntimeDb();

    const result = await assertDteContingencyTransmissionAllowed(
      { ...BASE_PARAMS, contingencyTypeCode: null },
      db as never,
    );

    expect(result.ok).toBe(false);
    expect(db.dteContingencyEventItem.findMany).not.toHaveBeenCalled();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado para callers PLATFORM_NATIVE no migrados)", async () => {
    await expect(assertDteContingencyTransmissionAllowed(BASE_PARAMS)).rejects.toThrow(
      "RUNTIME_UNSAFE",
    );
  });
});
