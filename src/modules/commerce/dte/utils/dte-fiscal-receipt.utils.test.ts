import { describe, it, expect } from "vitest";
import { isFiscallyReceivedByMh } from "./dte-fiscal-receipt.utils";

describe("isFiscallyReceivedByMh", () => {
  it("ACCEPTED + sello → true", () => {
    expect(isFiscallyReceivedByMh("ACCEPTED", "SELLO123")).toBe(true);
  });

  it("OBSERVED + sello → true", () => {
    expect(isFiscallyReceivedByMh("OBSERVED", "SELLO123")).toBe(true);
  });

  it("ACCEPTED + null → false", () => {
    expect(isFiscallyReceivedByMh("ACCEPTED", null)).toBe(false);
  });

  it("OBSERVED + null → false", () => {
    expect(isFiscallyReceivedByMh("OBSERVED", null)).toBe(false);
  });

  it("ACCEPTED + string vacío → false", () => {
    expect(isFiscallyReceivedByMh("ACCEPTED", "   ")).toBe(false);
  });

  it("REJECTED + sello → false", () => {
    expect(isFiscallyReceivedByMh("REJECTED", "SELLO123")).toBe(false);
  });

  it("SIGNED + sello → false", () => {
    expect(isFiscallyReceivedByMh("SIGNED", "SELLO123")).toBe(false);
  });

  it("SCHEMA_VALIDATED + sello → false", () => {
    expect(isFiscallyReceivedByMh("SCHEMA_VALIDATED", "SELLO123")).toBe(false);
  });

  it("PENDING_GENERATION + sello → false", () => {
    expect(isFiscallyReceivedByMh("PENDING_GENERATION", "SELLO123")).toBe(false);
  });

  it("INVALIDATED + sello → false", () => {
    expect(isFiscallyReceivedByMh("INVALIDATED", "SELLO123")).toBe(false);
  });
});
