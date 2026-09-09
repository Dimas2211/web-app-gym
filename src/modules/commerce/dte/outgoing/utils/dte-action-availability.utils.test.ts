// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-action-availability.utils.test.ts
//
// FASE IV-C — garantiza `canReconcile` (botón "Consultar estado MH"):
// disponible solo en SIGNED, con reason explícita en el resto de
// estados, sin afectar el resto de banderas ya existentes.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { computeDteOutgoingActionAvailability, type ActionAvailabilityInput } from "./dte-action-availability.utils";

function baseInput(overrides: Partial<ActionAvailabilityInput> = {}): ActionAvailabilityInput {
  return {
    dte_status: "SIGNED",
    dte_type_code: "01",
    reception_stamp: null,
    related_nc: null,
    latest_invalidation: null,
    delivery: { hasSuccessfulDelivery: false },
    invalidation_delivery: { hasSuccessfulDelivery: false },
    ...overrides,
  };
}

describe("computeDteOutgoingActionAvailability — canReconcile (FASE IV-C)", () => {
  it("SIGNED -> canReconcile=true, sin reason", () => {
    const av = computeDteOutgoingActionAvailability(baseInput({ dte_status: "SIGNED" }));
    expect(av.canReconcile).toBe(true);
    expect(av.reasons.reconcile).toBeUndefined();
  });

  it("ACCEPTED -> canReconcile=false, reason explica resultado fiscal ya registrado", () => {
    const av = computeDteOutgoingActionAvailability(baseInput({ dte_status: "ACCEPTED" }));
    expect(av.canReconcile).toBe(false);
    expect(av.reasons.reconcile).toMatch(/resultado fiscal ya registrado|ACCEPTED/);
  });

  it("REJECTED -> canReconcile=false", () => {
    const av = computeDteOutgoingActionAvailability(baseInput({ dte_status: "REJECTED" }));
    expect(av.canReconcile).toBe(false);
  });

  it("PENDING_GENERATION (nunca llegó a SIGNED) -> canReconcile=false, reason distinta a 'ya procesado'", () => {
    const av = computeDteOutgoingActionAvailability(baseInput({ dte_status: "PENDING_GENERATION" }));
    expect(av.canReconcile).toBe(false);
    expect(av.reasons.reconcile).toMatch(/Solo disponible/);
  });

  it("no interfiere con canTransmit/canSign (mismo predicado SIGNED, independiente)", () => {
    const av = computeDteOutgoingActionAvailability(baseInput({ dte_status: "SIGNED" }));
    expect(av.canTransmit).toBe(true);
    expect(av.canReconcile).toBe(true);
    expect(av.canSign).toBe(false);
  });
});
