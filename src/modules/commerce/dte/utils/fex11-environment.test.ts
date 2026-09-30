// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-environment.test.ts
//
// FEX11-FINAL-CLOSURE — FEX 11 no depende de variables de entorno: solo
// del ambiente fiscal del documento (TEST / PRODUCTION).
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isFex11Environment,
  canUseFex11InServerFlow,
} from "./fex11-environment";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fex11-environment", () => {
  it("TEST y PRODUCTION son ambientes FEX válidos", () => {
    expect(canUseFex11InServerFlow({ dte_type_code: "11", environment: "TEST" })).toBe(true);
    expect(canUseFex11InServerFlow({ dte_type_code: "11", environment: "PRODUCTION" })).toBe(true);
  });

  it("ambiente desconocido o vacío -> fail-closed", () => {
    expect(canUseFex11InServerFlow({ dte_type_code: "11", environment: "" })).toBe(false);
    expect(canUseFex11InServerFlow({ dte_type_code: "11", environment: "STAGING" })).toBe(false);
    expect(isFex11Environment(null)).toBe(false);
    expect(isFex11Environment(undefined)).toBe(false);
  });

  it("tipo distinto de 11 -> no aplica", () => {
    expect(canUseFex11InServerFlow({ dte_type_code: "01", environment: "TEST" })).toBe(false);
  });

  it("la ausencia de los antiguos DTE_FEX11_* no bloquea TEST ni PRODUCTION", () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "");
    vi.stubEnv("DTE_FEX11_ENABLED", "");
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "");
    expect(canUseFex11InServerFlow({ dte_type_code: "11", environment: "TEST" })).toBe(true);
    expect(canUseFex11InServerFlow({ dte_type_code: "11", environment: "PRODUCTION" })).toBe(true);
  });

  it("NODE_ENV=production no altera el resultado", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(canUseFex11InServerFlow({ dte_type_code: "11", environment: "TEST" })).toBe(true);
  });
});
