import { describe, it, expect } from "vitest";
import { computeIncomeTaxWithholding } from "./income-tax-withholding.util";

// Casos A-K del bloque de auditoría "Naturaleza del pago FSE 14".
// No toca DB, correlativos, firma ni transmisión — cálculo puro.

describe("computeIncomeTaxWithholding", () => {
  // A. GOODS
  it("A — GOODS nunca aplica retención automática", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: "GOODS", supplierPersonType: "NATURAL_PERSON", totalCompra: 1000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toEqual({ applies: false, rate: null, base: 0, amount: 0 });
  });

  // B. SERVICES + persona natural
  it("B — SERVICES + persona natural → 10% de 1000 = 100", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: "SERVICES", supplierPersonType: "NATURAL_PERSON", totalCompra: 1000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toEqual({ applies: true, rate: 10, base: 1000, amount: 100 });
  });

  // C. GOODS_AND_SERVICES + persona natural, base manual 300 de 1000
  it("C — GOODS_AND_SERVICES + persona natural, base 300 → retención 30", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: "GOODS_AND_SERVICES", supplierPersonType: "NATURAL_PERSON",
      totalCompra: 1000, manualBase: 300,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toEqual({ applies: true, rate: 10, base: 300, amount: 30 });
  });

  // D. SERVICES 333.33 + persona natural — caso local final del bloque
  it("D — SERVICES 333.33 + persona natural → reteRenta 33.33, sin error de redondeo binario", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: "SERVICES", supplierPersonType: "NATURAL_PERSON", totalCompra: 333.33,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.base).toBe(333.33);
      expect(r.result.amount).toBe(33.33);
      expect(333.33 - r.result.amount).toBe(300);
    }
  });

  // E. SERVICES → GOODS: se limpia (esto lo verifica el caller al recalcular
  // con paymentNature GOODS; aquí solo se confirma que GOODS siempre da cero,
  // sin importar el estado previo).
  it("E — cambiar a GOODS siempre limpia base/rate/amount/applies", () => {
    const before = computeIncomeTaxWithholding({
      paymentNature: "SERVICES", supplierPersonType: "NATURAL_PERSON", totalCompra: 333.33,
    });
    expect(before.ok && before.result.applies).toBe(true);

    const after = computeIncomeTaxWithholding({
      paymentNature: "GOODS", supplierPersonType: "NATURAL_PERSON", totalCompra: 333.33,
    });
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.result).toEqual({ applies: false, rate: null, base: 0, amount: 0 });
  });

  // F. base inválida (> totalCompra) → rechazado
  it("F — GOODS_AND_SERVICES con base > totalCompra es rechazado", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: "GOODS_AND_SERVICES", supplierPersonType: "NATURAL_PERSON",
      totalCompra: 1000, manualBase: 1200,
    });
    expect(r.ok).toBe(false);
  });

  // G. persona jurídica + SERVICES → no aplica automáticamente
  it("G — SERVICES + persona jurídica no aplica retención automática", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: "SERVICES", supplierPersonType: "LEGAL_ENTITY", totalCompra: 1000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toEqual({ applies: false, rate: null, base: 0, amount: 0 });
  });

  // H. Supplier UNKNOWN + SERVICES → bloqueado, no se asume persona natural
  it("H — SERVICES + proveedor UNKNOWN bloquea la automatización silenciosa", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: "SERVICES", supplierPersonType: "UNKNOWN", totalCompra: 1000,
    });
    expect(r.ok).toBe(false);
  });

  it("H2 — LUMP_SUM_CONTRACT + proveedor UNKNOWN también bloquea", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: "LUMP_SUM_CONTRACT", supplierPersonType: "UNKNOWN", totalCompra: 1000,
    });
    expect(r.ok).toBe(false);
  });

  it("H3 — GOODS_AND_SERVICES + proveedor UNKNOWN con base > 0 también bloquea", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: "GOODS_AND_SERVICES", supplierPersonType: "UNKNOWN",
      totalCompra: 1000, manualBase: 300,
    });
    expect(r.ok).toBe(false);
  });

  // LUMP_SUM_CONTRACT + persona natural → 10% del total
  it("LUMP_SUM_CONTRACT + persona natural → 10% del total completo", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: "LUMP_SUM_CONTRACT", supplierPersonType: "NATURAL_PERSON", totalCompra: 500,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toEqual({ applies: true, rate: 10, base: 500, amount: 50 });
  });

  // OTHER — nunca sujeto a automatización
  it("OTHER nunca aplica retención automática", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: "OTHER", supplierPersonType: "NATURAL_PERSON", totalCompra: 1000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toEqual({ applies: false, rate: null, base: 0, amount: 0 });
  });

  // J. histórico — sin naturaleza declarada (null) sigue siendo legible/seguro
  it("J — payment_nature null (histórico) no aplica retención", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: null, supplierPersonType: "UNKNOWN", totalCompra: 1000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result).toEqual({ applies: false, rate: null, base: 0, amount: 0 });
  });

  // GOODS_AND_SERVICES con base 0 → applies false pero sin error
  it("GOODS_AND_SERVICES con base 0 no aplica pero no es un error", () => {
    const r = computeIncomeTaxWithholding({
      paymentNature: "GOODS_AND_SERVICES", supplierPersonType: "NATURAL_PERSON",
      totalCompra: 1000, manualBase: 0,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.applies).toBe(false);
  });
});
