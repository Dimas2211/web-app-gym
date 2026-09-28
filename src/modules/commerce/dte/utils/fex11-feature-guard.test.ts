// ─────────────────────────────────────────────────────────────────
// commerce/dte — fex11-feature-guard.test.ts
//
// FEX-PROD-1 — matriz de flags TEST/PRODUCTION. Solo el literal YES
// habilita; DTE_FEX11_ENABLED nunca habilita PRODUCTION; NODE_ENV no
// decide el ambiente fiscal.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isFex11TestEnabled,
  isFex11ProductionEnabled,
  isFex11EnvironmentEnabled,
  isFex11Enabled,
  isFex11TestConsoleEnabled,
  canUseFex11InServerFlow,
  assertFex11EnabledOrReturnError,
  FEX11_NOT_ENABLED_ERROR,
} from "./fex11-feature-guard";

// Hermético: el .env local puede traer flags FEX.
beforeEach(() => {
  vi.stubEnv("DTE_FEX11_TEST_ENABLED", "");
  vi.stubEnv("DTE_FEX11_ENABLED", "");
  vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const TEST_DOC = { dte_type_code: "11", environment: "TEST" };
const PROD_DOC = { dte_type_code: "11", environment: "PRODUCTION" };

describe("fex11-feature-guard — matriz FEX-PROD-1", () => {
  it("TEST + flag TEST OFF -> false", () => {
    expect(canUseFex11InServerFlow(TEST_DOC)).toBe(false);
    expect(isFex11Enabled()).toBe(false);
  });

  it("TEST + flag TEST YES -> true", () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    expect(isFex11TestEnabled()).toBe(true);
    expect(canUseFex11InServerFlow(TEST_DOC)).toBe(true);
  });

  it("TEST + DTE_FEX11_ENABLED YES (compatibilidad comercial) -> true", () => {
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    expect(canUseFex11InServerFlow(TEST_DOC)).toBe(true);
  });

  it("PROD + flag PROD OFF -> false", () => {
    expect(canUseFex11InServerFlow(PROD_DOC)).toBe(false);
  });

  it("PROD + flag PROD YES -> true", () => {
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    expect(isFex11ProductionEnabled()).toBe(true);
    expect(canUseFex11InServerFlow(PROD_DOC)).toBe(true);
  });

  it("PROD + solo DTE_FEX11_ENABLED YES -> false", () => {
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    expect(canUseFex11InServerFlow(PROD_DOC)).toBe(false);
  });

  it("PROD + solo flag TEST YES -> false", () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    expect(canUseFex11InServerFlow(PROD_DOC)).toBe(false);
  });

  it("TEST + solo flag PROD YES -> false", () => {
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    expect(canUseFex11InServerFlow(TEST_DOC)).toBe(false);
  });

  it("tipo distinto de 11 -> el guard FEX no concede permiso", () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    vi.stubEnv("DTE_FEX11_ENABLED", "YES");
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    for (const code of ["01", "03", "05", "14"]) {
      expect(canUseFex11InServerFlow({ dte_type_code: code, environment: "TEST" })).toBe(false);
      expect(canUseFex11InServerFlow({ dte_type_code: code, environment: "PRODUCTION" })).toBe(false);
      // No es FEX: el helper de error no opina.
      expect(assertFex11EnabledOrReturnError({ dte_type_code: code, environment: "PRODUCTION" })).toBeNull();
    }
  });

  it("solo el literal YES habilita", () => {
    for (const value of ["yes", "Yes", "true", "1", " YES", "YES "]) {
      vi.stubEnv("DTE_FEX11_TEST_ENABLED", value);
      vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", value);
      expect(canUseFex11InServerFlow(TEST_DOC)).toBe(false);
      expect(canUseFex11InServerFlow(PROD_DOC)).toBe(false);
    }
  });

  it("ambiente desconocido o vacío -> false aun con todos los flags", () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    vi.stubEnv("DTE_FEX11_PRODUCTION_ENABLED", "YES");
    expect(isFex11EnvironmentEnabled("")).toBe(false);
    expect(isFex11EnvironmentEnabled(null)).toBe(false);
    expect(isFex11EnvironmentEnabled("production")).toBe(false);
  });

  it("NODE_ENV=production no habilita PROD por sí mismo ni bloquea el flujo fiscal TEST", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(canUseFex11InServerFlow(PROD_DOC)).toBe(false);

    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    expect(canUseFex11InServerFlow(TEST_DOC)).toBe(true);
    expect(canUseFex11InServerFlow(PROD_DOC)).toBe(false);
  });

  it("consola de prueba dev-only sigue bloqueada con NODE_ENV=production", () => {
    vi.stubEnv("DTE_FEX11_TEST_ENABLED", "YES");
    vi.stubEnv("NODE_ENV", "production");
    expect(isFex11TestConsoleEnabled()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(isFex11TestConsoleEnabled()).toBe(true);
  });

  it("mensaje de error de negocio no expone variables de entorno", () => {
    expect(assertFex11EnabledOrReturnError(PROD_DOC)).toBe(FEX11_NOT_ENABLED_ERROR);
    expect(FEX11_NOT_ENABLED_ERROR).not.toMatch(/DTE_|YES|TEST/);
  });
});
