// ─────────────────────────────────────────────────────────────────
// commerce/dte — transmit-dte-document.service.determine-final-status.test.ts
//
// FASE IV-B.3, ETAPA C — regresión del hotfix del clasificador de
// observaciones del pipeline SEND: `determineFinalStatus` ahora
// reutiliza `isMhProcessedObserved` (mismo helper que
// dte-reconciliation.service.ts) en vez del criterio previo
// `Array.isArray(observaciones) && observaciones.length > 0`, que
// clasificaba incorrectamente `["", ""]` (ejemplo oficial "Sin
// Observaciones" del Manual MH) como OBSERVED.
//
// Este archivo mockea prisma/adapters solo para permitir importar el
// módulo (mismo patrón que transmit-dte-document.service.metering.test.ts)
// — no toca DB ni red, y solo ejercita `determineFinalStatus`.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    dteOutgoingDocument: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("./assert-dte-contingency-transmission-allowed.service", () => ({
  assertDteContingencyTransmissionAllowed: vi.fn(),
}));

vi.mock("../adapters/dte-transmission.adapter", () => ({
  MhDteTransmissionAdapter: vi.fn().mockImplementation(() => ({ transmit: vi.fn() })),
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement/resolve-commercial-context", () => ({
  resolveCommercialEnforcementContext: vi.fn(),
}));

import { determineFinalStatus } from "./transmit-dte-document.service";
import type { DteTransmissionSuccessResult } from "../types/dte-transmission.types";

function baseResult(overrides: Partial<DteTransmissionSuccessResult>): DteTransmissionSuccessResult {
  return {
    ok: true,
    mhEstado: "PROCESADO",
    codigoGeneracion: "GEN-1",
    selloRecibido: "SELLO-1",
    fhProcesamiento: "01/09/2026 01:52:08",
    codigoMsg: "001",
    descripcionMsg: "RECIBIDO",
    observaciones: null,
    rawResponse: {},
    httpStatus: 200,
    idEnvio: 1,
    ...overrides,
  };
}

describe("determineFinalStatus — hotfix isMhProcessedObserved (FASE IV-B.3)", () => {
  it("1. PROCESADO + observaciones=[] + codigoMsg=001 + RECIBIDO -> ACCEPTED", () => {
    const result = baseResult({ observaciones: [] });
    expect(determineFinalStatus(result)).toBe("ACCEPTED");
  });

  it('2. PROCESADO + observaciones=["", ""] + codigoMsg=001 + RECIBIDO -> ACCEPTED (bug corregido)', () => {
    const result = baseResult({ observaciones: ["", ""] });
    expect(determineFinalStatus(result)).toBe("ACCEPTED");
  });

  it('3. PROCESADO + observaciones=["observación real"] -> OBSERVED', () => {
    const result = baseResult({ observaciones: ["observación real"] });
    expect(determineFinalStatus(result)).toBe("OBSERVED");
  });

  it("4. PROCESADO + codigoMsg=002 -> OBSERVED", () => {
    const result = baseResult({ codigoMsg: "002", observaciones: [] });
    expect(determineFinalStatus(result)).toBe("OBSERVED");
  });

  it('5. PROCESADO + descripcionMsg="RECIBIDO CON OBSERVACIONES" -> OBSERVED', () => {
    const result = baseResult({ descripcionMsg: "RECIBIDO CON OBSERVACIONES", observaciones: [] });
    expect(determineFinalStatus(result)).toBe("OBSERVED");
  });

  it("6. RECHAZADO -> REJECTED (sin cambio de comportamiento)", () => {
    const result = baseResult({ mhEstado: "RECHAZADO", selloRecibido: null, observaciones: null });
    expect(determineFinalStatus(result)).toBe("REJECTED");
  });

  it("estado inesperado (ni PROCESADO ni RECHAZADO) -> null", () => {
    const result = baseResult({ mhEstado: "OTRO" });
    expect(determineFinalStatus(result)).toBeNull();
  });
});
