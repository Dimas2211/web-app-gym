// ─────────────────────────────────────────────────────────────────
// commerce/dte — transmit-dte-document.service.metering.test.ts
//
// FASE IV-A — integración del gate de metering comercial dentro de
// transmitDteDocument: si la reserva de fiscal.dte.monthly_issued es
// rechazada, el adapter de transmisión a MH NUNCA debe invocarse
// (ver punto 22 de la especificación de implementación).
//
// prisma y el adapter de transmisión MH quedan completamente
// mockeados — este test no toca la base de datos ni la red.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  findFirstSpy,
  transactionSpy,
  reservationCountSpy,
  reservationFindUniqueSpy,
  reservationCreateSpy,
  reservationUpdateManySpy,
  transmitAdapterSpy,
  resolveCommercialEnforcementContextMock,
  contingencyGuardMock,
} = vi.hoisted(() => ({
  findFirstSpy: vi.fn(),
  transactionSpy: vi.fn(),
  reservationCountSpy: vi.fn(),
  reservationFindUniqueSpy: vi.fn(),
  reservationCreateSpy: vi.fn(),
  reservationUpdateManySpy: vi.fn(),
  transmitAdapterSpy: vi.fn(),
  resolveCommercialEnforcementContextMock: vi.fn(),
  contingencyGuardMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    dteOutgoingDocument: { findFirst: findFirstSpy, update: vi.fn() },
    dteTransmissionLog: { create: vi.fn() },
    $transaction: transactionSpy,
  },
}));

vi.mock("./assert-dte-contingency-transmission-allowed.service", () => ({
  assertDteContingencyTransmissionAllowed: contingencyGuardMock,
}));

vi.mock("../adapters/dte-transmission.adapter", () => ({
  MhDteTransmissionAdapter: vi.fn().mockImplementation(() => ({ transmit: transmitAdapterSpy })),
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement/resolve-commercial-context", () => ({
  resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock,
}));

import { transmitDteDocument } from "./transmit-dte-document.service";

const SIGNED_DOC = {
  id: "dte-doc-1",
  dte_status: "SIGNED",
  signed_jws: "jws-signed",
  generation_code: "GEN-1",
  control_number: "DTE-01-0001-0000000001",
  dte_type_code: "01",
  environment: "PRODUCTION",
  issuer_config_id: "issuer-1",
  retry_count: 0,
  transmission_type_code: "1",
  contingency_type_code: null,
};

function managedCtxAtLimit() {
  return {
    mode: "MANAGED",
    tenantId: "tenant-1",
    organizationId: "org-1",
    planId: "plan-1",
    verticalId: null,
    effectiveModules: new Map(),
    effectiveEntitlements: new Map([
      [
        "fiscal.dte.monthly_issued",
        {
          entitlement_definition_id: "def-dte",
          code: "fiscal.dte.monthly_issued",
          name: "DTE mensuales",
          category: "fiscal",
          value_type: "COUNT",
          period_type: "MONTHLY",
          numeric_value: 0, // límite ya agotado — cualquier delta>0 bloquea
          is_unlimited: false,
          source: "PLAN",
        },
      ],
    ]),
    organizationTimezone: "America/El_Salvador",
  };
}

// FASE IV-D — variante con cupo DISPONIBLE (límite finito, occupied=0),
// para certificar el pipeline completo ACCEPTED/OBSERVED/REJECTED/error
// técnico con ledger finito real (nunca Unlimited, nunca bypass).
function managedCtxWithCapacity(limit: number) {
  const ctx = managedCtxAtLimit();
  ctx.effectiveEntitlements.set("fiscal.dte.monthly_issued", {
    ...ctx.effectiveEntitlements.get("fiscal.dte.monthly_issued")!,
    numeric_value: limit,
  });
  return ctx;
}

beforeEach(() => {
  findFirstSpy.mockReset();
  transactionSpy.mockReset();
  reservationCountSpy.mockReset();
  reservationFindUniqueSpy.mockReset();
  reservationCreateSpy.mockReset();
  reservationUpdateManySpy.mockReset();
  transmitAdapterSpy.mockReset();
  resolveCommercialEnforcementContextMock.mockReset();
  contingencyGuardMock.mockReset();

  findFirstSpy.mockResolvedValue(SIGNED_DOC);
  contingencyGuardMock.mockResolvedValue({ ok: true });

  // Simula CUALQUIER $transaction del service (la reserva de metering Y la
  // transición final de estado ACCEPTED/OBSERVED/REJECTED comparten el
  // mismo prisma.$transaction mockeado) — expone todos los sub-clientes
  // que cualquiera de esos bloques pueda necesitar.
  reservationFindUniqueSpy.mockResolvedValue(null);
  reservationCountSpy.mockResolvedValue(0);
  reservationCreateSpy.mockResolvedValue({ id: "res-1", status: "PENDING" });
  reservationUpdateManySpy.mockResolvedValue({ count: 1 });
  transactionSpy.mockImplementation(async (arg: unknown) => {
    // El pipeline usa $transaction en dos formas: callback (reserva de
    // metering, finalize/release) y array de promesas ya disparadas
    // (rama de error técnico — solo update + log, sin ledger). Ambas
    // formas conviven en el service real.
    if (Array.isArray(arg)) return Promise.all(arg);
    const cb = arg as (tx: unknown) => Promise<unknown>;
    return cb({
      dteFiscalMeteringReservation: {
        findUnique: reservationFindUniqueSpy,
        count: reservationCountSpy,
        create: reservationCreateSpy,
        update: vi.fn(),
        updateMany: reservationUpdateManySpy,
      },
      dteOutgoingDocument: { update: vi.fn() },
      dteTransmissionLog: { create: vi.fn() },
    });
  });
});

describe("transmitDteDocument — gate de metering comercial (FASE IV-A)", () => {
  it("PRODUCTION + entitlement en el límite -> CAPACITY_LIMIT_REACHED, adapter.transmit NUNCA se invoca", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(managedCtxAtLimit());

    const result = await transmitDteDocument({
      dteDocumentId: "dte-doc-1",
      userId: "user-1",
      tenantId: "tenant-1",
      locationId: "loc-1",
    });

    expect(result.ok).toBe(false);
    expect(transmitAdapterSpy).not.toHaveBeenCalled();
    expect(reservationCreateSpy).not.toHaveBeenCalled(); // nunca se crea la reserva si el check falla
  });

  it("TEST -> bypass de metering, no consulta capacidad ni crea reserva, SÍ llama al adapter", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(managedCtxAtLimit());
    findFirstSpy.mockResolvedValue({ ...SIGNED_DOC, environment: "TEST" });
    transmitAdapterSpy.mockResolvedValue({
      ok: true,
      mhEstado: "PROCESADO",
      httpStatus: 200,
      idEnvio: "1",
      selloRecibido: "S".repeat(40),
      observaciones: null,
      descripcionMsg: null,
    });

    const result = await transmitDteDocument({
      dteDocumentId: "dte-doc-1",
      userId: "user-1",
      tenantId: "tenant-1",
      locationId: "loc-1",
    });

    expect(transmitAdapterSpy).toHaveBeenCalledTimes(1);
    expect(reservationCountSpy).not.toHaveBeenCalled(); // TEST nunca pasa por el gate de capacidad
    expect(result.ok).toBe(true);
  });
});

// FASE IV-D — pipeline completo (transmitDteDocument, no solo el ledger
// aislado) con límite finito real DISPONIBLE — certifica que el resultado
// del adapter MH se traduce correctamente al ledger vía el mismo camino
// productivo, sin atajos de test. Nunca red real (adapter mockeado).
describe("transmitDteDocument — pipeline completo con límite finito disponible (FASE IV-D)", () => {
  it("L1: capacidad disponible + adapter ACCEPTED -> reserve PENDING, ledger CONSUMED, adapter llamado 1 vez", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(managedCtxWithCapacity(1));
    transmitAdapterSpy.mockResolvedValue({
      ok: true, mhEstado: "PROCESADO", httpStatus: 200, idEnvio: "1",
      selloRecibido: "S".repeat(40), observaciones: [], codigoMsg: "001", descripcionMsg: "RECIBIDO",
    });

    const result = await transmitDteDocument({
      dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-1", locationId: "loc-1",
    });

    expect(transmitAdapterSpy).toHaveBeenCalledTimes(1);
    expect(reservationCreateSpy).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dteStatus).toBe("ACCEPTED");
    expect(reservationUpdateManySpy).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CONSUMED" }) }),
    );
  });

  it("L3: adapter OBSERVED -> ledger igual que ACCEPTED (CONSUMED), DTE OBSERVED", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(managedCtxWithCapacity(1));
    transmitAdapterSpy.mockResolvedValue({
      ok: true, mhEstado: "PROCESADO", httpStatus: 200, idEnvio: "1",
      selloRecibido: "S".repeat(40), observaciones: [], codigoMsg: "001",
      descripcionMsg: "RECIBIDO CON OBSERVACIONES",
    });

    const result = await transmitDteDocument({
      dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-1", locationId: "loc-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dteStatus).toBe("OBSERVED");
    expect(reservationUpdateManySpy).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CONSUMED" }) }),
    );
  });

  it("L4: adapter RECHAZADO confirmado -> ledger RELEASED (cupo recuperado), DTE REJECTED", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(managedCtxWithCapacity(1));
    transmitAdapterSpy.mockResolvedValue({
      ok: true, mhEstado: "RECHAZADO", httpStatus: 400, idEnvio: "1",
      selloRecibido: null, observaciones: null, codigoMsg: "ERR", descripcionMsg: "Rechazado por Hacienda",
    });

    const result = await transmitDteDocument({
      dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-1", locationId: "loc-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dteStatus).toBe("REJECTED");
    expect(reservationUpdateManySpy).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RELEASED" }) }),
    );
  });

  it("L5: error técnico/timeout del adapter -> ledger NUNCA se toca (sigue PENDING), sin finalize/release", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(managedCtxWithCapacity(1));
    transmitAdapterSpy.mockResolvedValue({
      ok: false, errorCode: "MH_TRANSMISSION_TIMEOUT", message: "MH no respondió en el tiempo configurado.",
    });

    const result = await transmitDteDocument({
      dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-1", locationId: "loc-1",
    });

    expect(transmitAdapterSpy).toHaveBeenCalledTimes(1);
    expect(reservationCreateSpy).toHaveBeenCalledTimes(1); // la reserva SÍ se creó (capacidad ya comprometida)
    expect(reservationUpdateManySpy).not.toHaveBeenCalled(); // nunca CONSUMED ni RELEASED por error técnico
    expect(result.ok).toBe(false);
  });

  it("M: reintento sobre el mismo DTE ya PENDING -> reserve devuelve la MISMA reserva, nunca crea una segunda fila", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(managedCtxWithCapacity(1));
    // Simula que el documento YA tiene una reserva PENDING de un intento anterior.
    reservationFindUniqueSpy.mockResolvedValue({ id: "res-existing", status: "PENDING", period_key: "2026-09" });
    transmitAdapterSpy.mockResolvedValue({
      ok: true, mhEstado: "PROCESADO", httpStatus: 200, idEnvio: "1",
      selloRecibido: "S".repeat(40), observaciones: [], codigoMsg: "001", descripcionMsg: "RECIBIDO",
    });

    const result = await transmitDteDocument({
      dteDocumentId: "dte-doc-1", userId: "user-1", tenantId: "tenant-1", locationId: "loc-1",
    });

    expect(reservationCreateSpy).not.toHaveBeenCalled(); // no segunda fila
    expect(reservationCountSpy).not.toHaveBeenCalled(); // PENDING existente -> idempotente, sin recontar capacidad
    expect(result.ok).toBe(true);
    // El finalize final opera sobre la MISMA reserva (res-existing) vía updateMany({status:"PENDING"}).
    expect(reservationUpdateManySpy).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CONSUMED" }) }),
    );
  });
});
