// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-v3-formulas.test.ts
//
// FEX-PROD-0B — pruebas matemáticas independientes del resumen FEX v3
// (Manual Funcional V2.0 §XII, §XIV, §XVIII).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { computeFexV3ResumenTotals, r2 } from "./fex11-v3-formulas";

const line = (ventaGravada: number, montoDescu = 0, noGravado = 0) => ({ ventaGravada, montoDescu, noGravado });

describe("computeFexV3ResumenTotals", () => {
  it("totalGravada = Σ ventaGravada (con redondeo a centavos)", () => {
    const t = computeFexV3ResumenTotals({
      lines: [line(10.005), line(20.1), line(0.3)],
      seguro: 0, flete: 0, descuGravada: 0, tributosValor: 0, saldoFavor: 0,
    });
    expect(t.totalGravada).toBe(30.41);
  });

  it("descuento: totalDescu = Σ montoDescu + descuGravada; el descuento por ítem no altera montoTotalOperacion", () => {
    // Manual §XVIII ej.: 10 × $1.00 con $1.00 de descuento → ventaGravada 9.00
    const t = computeFexV3ResumenTotals({
      lines: [line(9, 1), line(200, 0), line(35, 5)],
      seguro: 0, flete: 0, descuGravada: 0, tributosValor: 0, saldoFavor: 0,
    });
    expect(t.totalDescu).toBe(6);
    expect(t.descuGravada).toBe(0);
    expect(t.montoTotalOperacion).toBe(244);
  });

  it("descuento global (descuGravada) se resta del total gravado y suma a totalDescu", () => {
    const t = computeFexV3ResumenTotals({
      lines: [line(610, 45)],
      seguro: 0, flete: 0, descuGravada: 61, tributosValor: 0, saldoFavor: 0,
    });
    expect(t.totalDescu).toBe(106);
    expect(t.montoTotalOperacion).toBe(549);
  });

  it("seguro y flete se suman a montoTotalOperacion", () => {
    const t = computeFexV3ResumenTotals({
      lines: [line(1000)],
      seguro: 25.5, flete: 74.49, descuGravada: 0, tributosValor: 0, saldoFavor: 0,
    });
    expect(t.montoTotalOperacion).toBe(1099.99);
    expect(t.totalPagar).toBe(1099.99);
  });

  it("C3 con valor 0 no altera el total; tributos con valor se sumarían", () => {
    const base = { lines: [line(100)], seguro: 0, flete: 0, descuGravada: 0, saldoFavor: 0 };
    expect(computeFexV3ResumenTotals({ ...base, tributosValor: 0 }).montoTotalOperacion).toBe(100);
    expect(computeFexV3ResumenTotals({ ...base, tributosValor: 0.2 }).montoTotalOperacion).toBe(100.2);
  });

  it("totalPagar = montoTotalOperacion + totalNoGravado (§XII: cargos suman, abonos restan)", () => {
    const t = computeFexV3ResumenTotals({
      lines: [line(100, 0, 10), line(50, 0, -4)],
      seguro: 5, flete: 0, descuGravada: 0, tributosValor: 0, saldoFavor: 0,
    });
    expect(t.totalNoGravado).toBe(6);
    expect(t.montoTotalOperacion).toBe(155);
    expect(t.totalPagar).toBe(161);
  });

  it("saldoFavor = 0 es neutro sobre totalPagar", () => {
    const t = computeFexV3ResumenTotals({
      lines: [line(450, 50)],
      seguro: 0, flete: 0, descuGravada: 0, tributosValor: 0, saldoFavor: 0,
    });
    expect(t.totalPagar).toBe(t.montoTotalOperacion);
  });

  it("r2 redondea a 2 decimales", () => {
    expect(r2(1.005 + 0.0001)).toBe(1.01);
    expect(r2(2.344)).toBe(2.34);
  });
});
