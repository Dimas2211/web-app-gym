import { describe, it, expect } from "vitest";
import {
  mapCancellationTypeToCat017,
  CAT017_EFECTIVO,
  CAT017_TARJETA_DEBITO,
  CAT017_CHEQUE,
  CAT017_TRANSFERENCIA,
  CAT017_OTROS,
} from "./purchase-payment-method.mapper";

describe("mapCancellationTypeToCat017", () => {
  // TEST 4 — FSE Contado + Efectivo → pagos[0].codigo = "01"
  it("EFE (Efectivo) → 01", () => {
    expect(mapCancellationTypeToCat017("EFE")).toBe(CAT017_EFECTIVO);
    expect(mapCancellationTypeToCat017("EFE")).toBe("01");
  });

  it("CHE (Cheque) → 04", () => {
    expect(mapCancellationTypeToCat017("CHE")).toBe(CAT017_CHEQUE);
  });

  it("TRN (Transferencia) → 05 — evidencia real de DTE recibido por MH con transferencia", () => {
    expect(mapCancellationTypeToCat017("TRN")).toBe(CAT017_TRANSFERENCIA);
    expect(mapCancellationTypeToCat017("TRN")).toBe("05");
  });

  it("POS (Tarjeta) → 02 (Tarjeta Débito, valor por defecto)", () => {
    expect(mapCancellationTypeToCat017("POS")).toBe(CAT017_TARJETA_DEBITO);
  });

  it("OTR (Otro) → 99", () => {
    expect(mapCancellationTypeToCat017("OTR")).toBe(CAT017_OTROS);
  });

  it("null/undefined → 99 (fallback, nunca lanza)", () => {
    expect(mapCancellationTypeToCat017(null)).toBe(CAT017_OTROS);
    expect(mapCancellationTypeToCat017(undefined)).toBe(CAT017_OTROS);
  });

  it("valor desconocido → 99 (fallback, nunca lanza)", () => {
    expect(mapCancellationTypeToCat017("XYZ")).toBe(CAT017_OTROS);
  });
});
