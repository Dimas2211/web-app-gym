import { describe, expect, it } from "vitest";
import { continuationAllowed, continuationLabel } from "./availability";
import type { DteContinuationState, DteContinuationOperation } from "./types";
const initial: DteContinuationState = {
  id: "dte",
  type: "01",
  environment: "TEST",
  status: "PENDING_GENERATION",
  originStatus: "CONFIRMED",
  controlNumber: "N1",
  generationCode: "G1",
  hasJson: false,
  hasSignature: false,
  hasStamp: false,
  delivered: false,
  canReopen: false,
  lastError: null,
};
const ops: DteContinuationOperation[] = [
  "generate",
  "sign",
  "transmit",
  "deliver",
  "reopen",
  "reconcile",
];
function available(overrides: Partial<DteContinuationState>) {
  const state = { ...initial, ...overrides };
  return ops.filter((op) => continuationAllowed(state, op));
}
describe("continuar según estado fiscal", () => {
  it("ofrece el siguiente paso sin ejecutar los posteriores", () => {
    expect(available({})).toEqual(["generate"]);
    expect(available({ status: "GENERATED", hasJson: true })).toEqual(["generate"]);
    expect(available({ status: "SCHEMA_VALIDATED", hasJson: true })).toEqual(["sign"]);
    expect(available({ status: "SIGNED", hasJson: true, hasSignature: true })).toEqual([
      "transmit",
      "reconcile",
    ]);
  });
  it.each(["ACCEPTED", "OBSERVED"])("%s con sello solo permite entrega pendiente", (status) => {
    expect(available({ status, hasStamp: true })).toEqual(["deliver"]);
    expect(available({ status, hasStamp: true, delivered: true })).toEqual([]);
    expect(available({ status, hasStamp: false })).toEqual([]);
  });
  it.each(["CANCELLED", "INVALIDATED", "INVALIDATION_PENDING", "NOT_REQUIRED", "SENT", "UNKNOWN"])(
    "%s no reactiva un DTE",
    (status) => expect(available({ status })).toEqual([])
  );
  it("no opera compras o ventas anuladas ni borradores", () => {
    expect(available({ originStatus: "CANCELLED" })).toEqual([]);
    expect(available({ originStatus: "DRAFT" })).toEqual([]);
  });
  it("rechazo con sello o sin prueba 802 no ofrece reapertura", () => {
    expect(available({ status: "REJECTED" })).toEqual([]);
    expect(available({ status: "REJECTED", canReopen: true })).toEqual(["reopen"]);
    expect(available({ status: "REJECTED", canReopen: true, hasStamp: true })).toEqual([]);
  });
  it("los cinco tipos habilitados tienen su acceso; no habilita tipos nuevos", () => {
    ["01", "03", "05", "11", "14"].forEach((type) =>
      expect(continuationLabel(type)).toMatch(/^Continuar/)
    );
    expect(continuationLabel("99")).toBeNull();
  });
});
