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
  transmitAdapterSpy,
  resolveCommercialEnforcementContextMock,
  contingencyGuardMock,
} = vi.hoisted(() => ({
  findFirstSpy: vi.fn(),
  transactionSpy: vi.fn(),
  reservationCountSpy: vi.fn(),
  reservationFindUniqueSpy: vi.fn(),
  reservationCreateSpy: vi.fn(),
  transmitAdapterSpy: vi.fn(),
  resolveCommercialEnforcementContextMock: vi.fn(),
  contingencyGuardMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    dteOutgoingDocument: { findFirst: findFirstSpy },
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

beforeEach(() => {
  findFirstSpy.mockReset();
  transactionSpy.mockReset();
  reservationCountSpy.mockReset();
  reservationFindUniqueSpy.mockReset();
  reservationCreateSpy.mockReset();
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
  transactionSpy.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      dteFiscalMeteringReservation: {
        findUnique: reservationFindUniqueSpy,
        count: reservationCountSpy,
        create: reservationCreateSpy,
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      dteOutgoingDocument: { update: vi.fn() },
      dteTransmissionLog: { create: vi.fn() },
    }),
  );
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
