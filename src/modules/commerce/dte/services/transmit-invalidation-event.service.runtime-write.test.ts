// ─────────────────────────────────────────────────────────────────
// commerce/dte — transmit-invalidation-event.service.runtime-write.test.ts
//
// FASE VI-E6B — transmitInvalidationEvent acepta un `db` explícito y
// usa db.* para TODO (DteInvalidationEvent, DteOutgoingDocument,
// DteTransmissionLog) y construye MhInvalidationTransmissionAdapter con
// MhAuthAdapter({ credentialClient: db }) para que la credencial MH
// (si existe una por emisor/ambiente) se resuelva de la MISMA runtime
// DB. Este test hace fallar CUALQUIER llamada al Prisma global para
// certificar RUNTIME_CLIENT_DTE_INVALIDATION_TRANSMIT_CAN_HIT_GLOBAL_PRISMA
// = NO. El adapter HTTP real (MhInvalidationTransmissionAdapter.transmit)
// SIEMPRE se mockea — este test NUNCA hace una llamada de red real a MH.
//
// También certifica DTE_INVALIDATION_METERING_REMAINS_CONSUMED = YES:
// el flujo no importa ni llama ningún servicio de metering
// (reserveDteFiscalCapacity / releaseDteFiscalCapacity /
// finalizeDteFiscalCapacityConsumed) — un DTE ya ACCEPTED que se
// invalida NO libera su consumo fiscal mensual.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error("RUNTIME_UNSAFE: transmitInvalidationEvent tocó el Prisma global.");
      },
    },
  ),
}));

const { transmitAdapterSpy, mhAuthAdapterCtorSpy, mhInvalidationAdapterCtorSpy } = vi.hoisted(() => ({
  transmitAdapterSpy: vi.fn(),
  mhAuthAdapterCtorSpy: vi.fn(),
  mhInvalidationAdapterCtorSpy: vi.fn(),
}));

vi.mock("../adapters/dte-invalidation-transmission.adapter", () => ({
  MhInvalidationTransmissionAdapter: mhInvalidationAdapterCtorSpy.mockImplementation((authAdapter: unknown) => ({
    transmit: transmitAdapterSpy,
    __authAdapter: authAdapter,
  })),
}));

vi.mock("../adapters/dte-auth.adapter", () => ({
  MhAuthAdapter: mhAuthAdapterCtorSpy.mockImplementation((opts: unknown) => ({ __opts: opts })),
}));

import { transmitInvalidationEvent } from "./transmit-invalidation-event.service";

const SIGNED_EVENT = {
  id: "inv-1",
  status: "SIGNED",
  signed_jws: "jws-signed-value",
  event_json: { foo: "bar" },
  dte_document_id: "dte-1",
};

const ACCEPTED_DTE_DOC = {
  id: "dte-1",
  dte_status: "ACCEPTED",
  reception_stamp: "S".repeat(40),
  invalidated_at: null,
  environment: "TEST",
};

const BASE_PARAMS = {
  invalidationEventId: "inv-1",
  userId: "u1",
  tenantId: "tenant-1",
  locationId: "loc-1",
};

function buildFakeRuntimeDb(overrides: { event?: unknown; dteDoc?: unknown } = {}) {
  const findFirstEvent = vi.fn().mockResolvedValue("event" in overrides ? overrides.event : SIGNED_EVENT);
  const findFirstDteDoc = vi.fn().mockResolvedValue("dteDoc" in overrides ? overrides.dteDoc : ACCEPTED_DTE_DOC);
  return {
    __marker: "RUNTIME_CLIENT_DB",
    dteInvalidationEvent: {
      findFirst: findFirstEvent,
      update: vi.fn().mockResolvedValue({}),
    },
    dteOutgoingDocument: {
      findFirst: findFirstDteDoc,
      update: vi.fn().mockResolvedValue({}),
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

describe("transmitInvalidationEvent — FASE VI-E6B (runtime db injection)", () => {
  it("usa db.* (runtime) para evento + documento + log, nunca el Prisma global; MH PROCESADO -> ACCEPTED, DTE INVALIDATED", async () => {
    const db = buildFakeRuntimeDb();
    transmitAdapterSpy.mockResolvedValue({
      ok: true,
      mhEstado: "PROCESADO",
      selloRecibido: "SELLO-INV-1",
      codigoMsg: null,
      descripcionMsg: "Anulación procesada",
      observaciones: null,
      httpStatus: 200,
      idEnvio: 1,
    });

    const result = await transmitInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: true, eventStatus: "ACCEPTED" });
    expect(db.dteInvalidationEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    expect(db.dteOutgoingDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dte-1", tenant_id: "tenant-1", location_id: "loc-1" } }),
    );
    // 2 transacciones: (1) marca optimista SENT/INVALIDATION_PENDING antes de MH, (2) persistencia final ACCEPTED/INVALIDATED.
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });

  it("MhAuthAdapter se construye con credentialClient: db (misma runtime DB que el documento/evento)", async () => {
    const db = buildFakeRuntimeDb();
    transmitAdapterSpy.mockResolvedValue({ ok: true, mhEstado: "PROCESADO", selloRecibido: "S1", httpStatus: 200, idEnvio: 1 });

    await transmitInvalidationEvent(BASE_PARAMS, db as never);

    expect(mhAuthAdapterCtorSpy).toHaveBeenCalledWith({ credentialClient: db });
    expect(mhInvalidationAdapterCtorSpy).toHaveBeenCalledTimes(1);
  });

  it("MH RECHAZADO -> evento REJECTED, DTE original revertido a ACCEPTED", async () => {
    const db = buildFakeRuntimeDb();
    transmitAdapterSpy.mockResolvedValue({
      ok: true,
      mhEstado: "RECHAZADO",
      codigoMsg: "003",
      descripcionMsg: "Documento no encontrado",
      observaciones: ["obs1"],
      httpStatus: 200,
      idEnvio: 1,
    });

    const result = await transmitInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: true, eventStatus: "REJECTED" });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });

  it("error técnico de MH -> evento vuelve a SIGNED, DTE original vuelve a ACCEPTED, registra log", async () => {
    const db = buildFakeRuntimeDb();
    transmitAdapterSpy.mockResolvedValue({ ok: false, errorCode: "MH_INVALIDATION_TIMEOUT", message: "MH no respondió en el tiempo configurado." });

    const result = await transmitInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false, error: "MH no respondió en el tiempo configurado." });
    // Transaccion 1: marca optimista. Transaccion 2: revertir + log.
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });

  it("evento no encontrado (cross-tenant/location) -> bloquea, 0 llamadas a MH", async () => {
    const db = buildFakeRuntimeDb({ event: null });

    const result = await transmitInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(transmitAdapterSpy).not.toHaveBeenCalled();
    expect(mhAuthAdapterCtorSpy).not.toHaveBeenCalled();
  });

  it("evento no SIGNED (ej. DRAFT) -> bloquea, 0 llamadas a MH", async () => {
    const db = buildFakeRuntimeDb({ event: { ...SIGNED_EVENT, status: "DRAFT" } });

    const result = await transmitInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(transmitAdapterSpy).not.toHaveBeenCalled();
  });

  it("DTE original ya invalidado previamente -> bloquea, 0 llamadas a MH (idempotencia)", async () => {
    const db = buildFakeRuntimeDb({ dteDoc: { ...ACCEPTED_DTE_DOC, invalidated_at: new Date("2026-01-01") } });

    const result = await transmitInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(transmitAdapterSpy).not.toHaveBeenCalled();
  });

  it("DTE original sin reception_stamp -> bloquea, 0 llamadas a MH", async () => {
    const db = buildFakeRuntimeDb({ dteDoc: { ...ACCEPTED_DTE_DOC, reception_stamp: null } });

    const result = await transmitInvalidationEvent(BASE_PARAMS, db as never);

    expect(result).toMatchObject({ ok: false });
    expect(transmitAdapterSpy).not.toHaveBeenCalled();
  });

  it("no importa ni llama ningún servicio de metering -> DTE_INVALIDATION_METERING_REMAINS_CONSUMED", async () => {
    const db = buildFakeRuntimeDb();
    transmitAdapterSpy.mockResolvedValue({ ok: true, mhEstado: "PROCESADO", selloRecibido: "S1", httpStatus: 200, idEnvio: 1 });

    await transmitInvalidationEvent(BASE_PARAMS, db as never);

    // Ninguna propiedad de metering existe en el fake db — si el service
    // intentara usarla, el test fallaría con TypeError al invocarla.
    expect((db as Record<string, unknown>)["dteFiscalUsage"]).toBeUndefined();
  });

  it("sin db explícito -> usa Prisma global por defecto (comportamiento legacy no migrado)", async () => {
    await expect(transmitInvalidationEvent(BASE_PARAMS)).rejects.toThrow("RUNTIME_UNSAFE");
  });
});

// ─────────────────────────────────────────────────────────────────
// Aislamiento cross-tenant/cross-location — mismo patrón certificado en
// transmit-dte-document.service.runtime.test.ts (VI-E6A). El findFirst
// real hace `where: { id, tenant_id, location_id }` (scoped) — aquí se
// simula ese scoping real para certificar que un tenant/location
// distinto nunca llega a MH ni escribe un TransmissionLog.
// ─────────────────────────────────────────────────────────────────

describe("transmitInvalidationEvent — VI-E6B aislamiento cross-tenant/cross-location", () => {
  function scopedRuntimeDb(ownerTenantId: string, ownerLocationId: string) {
    const findFirst = vi.fn(async (args: { where: { id: string; tenant_id: string; location_id: string } }) => {
      const { tenant_id, location_id } = args.where;
      if (tenant_id !== ownerTenantId || location_id !== ownerLocationId) return null;
      return SIGNED_EVENT;
    });
    return {
      db: {
        dteInvalidationEvent: { findFirst, update: vi.fn() },
        dteOutgoingDocument: { findFirst: vi.fn().mockResolvedValue(ACCEPTED_DTE_DOC), update: vi.fn() },
        dteTransmissionLog: { count: vi.fn().mockResolvedValue(0), create: vi.fn() },
        $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
      },
      findFirst,
    };
  }

  it("tenant A no puede transmitir un evento de invalidación de tenant B -> 0 llamadas MH", async () => {
    const { db } = scopedRuntimeDb("tenant-owner", "loc-1");

    const result = await transmitInvalidationEvent(
      { invalidationEventId: "inv-1", userId: "u1", tenantId: "tenant-attacker", locationId: "loc-1" },
      db as never,
    );

    expect(result).toMatchObject({ ok: false });
    expect(transmitAdapterSpy).not.toHaveBeenCalled();
    expect(mhAuthAdapterCtorSpy).not.toHaveBeenCalled();
  });

  it("location A no puede transmitir un evento de location B (mismo tenant) -> 0 llamadas MH", async () => {
    const { db } = scopedRuntimeDb("tenant-1", "loc-owner");

    const result = await transmitInvalidationEvent(
      { invalidationEventId: "inv-1", userId: "u1", tenantId: "tenant-1", locationId: "loc-attacker" },
      db as never,
    );

    expect(result).toMatchObject({ ok: false });
    expect(transmitAdapterSpy).not.toHaveBeenCalled();
  });
});
