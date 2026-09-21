// ─────────────────────────────────────────────────────────────────
// commerce/dte — transmit-contingency-event.service.runtime-write.test.ts
//
// FASE VI-E6C — transmitContingencyEvent acepta un `db` explícito y
// usa db.* para TODO (DteContingencyEvent, DteIssuerConfig,
// DteTransmissionLog). Este test hace fallar CUALQUIER llamada al
// Prisma global para certificar
// RUNTIME_CLIENT_DTE_CONTINGENCY_TRANSMIT_CAN_HIT_GLOBAL_PRISMA = NO.
// El adapter MH real (MhContingencyTransmissionAdapter.transmit)
// SIEMPRE se mockea — este test NUNCA hace una llamada de red real.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: transmitContingencyEvent tocó el Prisma global.");
      },
    },
  ),
}));

const { transmitSpy } = vi.hoisted(() => ({
  transmitSpy: vi.fn(),
}));

vi.mock("../adapters/dte-contingency-transmission.adapter", () => ({
  MhContingencyTransmissionAdapter: vi.fn().mockImplementation(() => ({
    transmit: transmitSpy,
  })),
}));

import { transmitContingencyEvent } from "./transmit-contingency-event.service";

const EVENT_SIGNED = {
  id: "evt-1",
  status: "SIGNED",
  signed_jws: "jws-signed",
  items: [{ dte_document_id: "dte-1", dte_document: { issuer_config_id: "cfg-1" } }],
};

const ISSUER_CONFIG = { nit: "06141234567890", environment: "TEST" };

const BASE_PARAMS = {
  contingencyEventId: "evt-1",
  tenantId: "tenant-1",
  locationId: "loc-1",
};

function buildFakeRuntimeDb() {
  return {
    __marker: "RUNTIME_CLIENT_DB",
    dteContingencyEvent: {
      findFirst: vi.fn().mockResolvedValue(EVENT_SIGNED),
      update: vi.fn().mockResolvedValue({}),
    },
    dteIssuerConfig: {
      findFirst: vi.fn().mockResolvedValue(ISSUER_CONFIG),
    },
    dteTransmissionLog: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("transmitContingencyEvent — FASE VI-E6C (runtime db injection)", () => {
  it("MH ACEPTA -> usa db.* (runtime) para evento + emisor + log, nunca el Prisma global; status -> ACCEPTED", async () => {
    const db = buildFakeRuntimeDb();
    transmitSpy.mockResolvedValue({
      ok: true,
      mhEstado: "RECIBIDO",
      mensaje: "OK",
      selloRecibido: "SELLO-1",
      observaciones: null,
      httpStatus: 200,
    });

    const result = await transmitContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: true, eventStatus: "ACCEPTED" });
    expect(db.dteContingencyEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "evt-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.dteIssuerConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cfg-1" } }),
    );
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("MH RECHAZA -> status -> REJECTED, registra log vía db", async () => {
    const db = buildFakeRuntimeDb();
    transmitSpy.mockResolvedValue({
      ok: true,
      mhEstado: "RECHAZADO",
      mensaje: "Motivo de rechazo",
      selloRecibido: null,
      observaciones: null,
      httpStatus: 200,
    });

    const result = await transmitContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: true, eventStatus: "REJECTED" });
  });

  it("error técnico de MH -> revierte a SIGNED, registra log vía db", async () => {
    const db = buildFakeRuntimeDb();
    transmitSpy.mockResolvedValue({ ok: false, errorCode: "NETWORK_ERROR", message: "Timeout", httpStatus: null });

    const result = await transmitContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false, error: "Timeout" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.dteContingencyEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SIGNED", sent_at: null }) }),
    );
  });

  it("evento no encontrado (cross-tenant/location) -> bloquea, adapter nunca se invoca", async () => {
    const db = buildFakeRuntimeDb();
    db.dteContingencyEvent.findFirst = vi.fn().mockResolvedValue(null);

    const result = await transmitContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(transmitSpy).not.toHaveBeenCalled();
  });

  it("evento en estado distinto a SIGNED -> bloquea, adapter nunca se invoca", async () => {
    const db = buildFakeRuntimeDb();
    db.dteContingencyEvent.findFirst = vi.fn().mockResolvedValue({ ...EVENT_SIGNED, status: "PENDING_SIGNATURE" });

    const result = await transmitContingencyEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(transmitSpy).not.toHaveBeenCalled();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento preservado para callers PLATFORM_NATIVE no migrados)", async () => {
    // transmitContingencyEvent solo atrapa TransmitContingencyBusinessError y
    // relanza cualquier otro error (ver catch final) — el proxy del Prisma
    // global mockeado lanza al primer acceso, por lo que la promesa rechaza.
    await expect(transmitContingencyEvent(BASE_PARAMS)).rejects.toThrow("RUNTIME_UNSAFE");
  });
});
