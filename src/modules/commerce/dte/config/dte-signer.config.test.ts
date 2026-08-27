// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-signer.config.test.ts
//
// FSE14-DUAL-SIGNER — invariante de seguridad: resolveDteSignerConfig
// debe resolver SIEMPRE por el ambiente explícito recibido, nunca por
// env global ni fallback cruzado TEST↔PRODUCTION. Falta de config para
// el ambiente pedido debe fallar explícitamente.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveDteSignerConfig, DteSignerConfigError } from "./dte-signer.config";

const ENV_KEYS = [
  "DTE_SIGNER_URL_TEST",
  "DTE_SIGNER_URL_PRODUCTION",
  "DTE_SIGNER_TIMEOUT_MS",
  "DTE_SIGNER_API_KEY",
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("resolveDteSignerConfig", () => {
  it("TEST resuelve DTE_SIGNER_URL_TEST", () => {
    process.env["DTE_SIGNER_URL_TEST"] = "http://localhost:8114/firmardocumento/";
    process.env["DTE_SIGNER_URL_PRODUCTION"] = "http://localhost:8113/firmardocumento/";

    const config = resolveDteSignerConfig("TEST");
    expect(config.signerUrl).toBe("http://localhost:8114/firmardocumento/");
  });

  it("PRODUCTION resuelve DTE_SIGNER_URL_PRODUCTION", () => {
    process.env["DTE_SIGNER_URL_TEST"] = "http://localhost:8114/firmardocumento/";
    process.env["DTE_SIGNER_URL_PRODUCTION"] = "http://localhost:8113/firmardocumento/";

    const config = resolveDteSignerConfig("PRODUCTION");
    expect(config.signerUrl).toBe("http://localhost:8113/firmardocumento/");
  });

  it("TEST nunca devuelve la URL de PRODUCTION, aunque sea la única configurada", () => {
    process.env["DTE_SIGNER_URL_PRODUCTION"] = "http://localhost:8113/firmardocumento/";
    // DTE_SIGNER_URL_TEST deliberadamente ausente.

    expect(() => resolveDteSignerConfig("TEST")).toThrow(DteSignerConfigError);
  });

  it("PRODUCTION nunca devuelve la URL de TEST, aunque sea la única configurada", () => {
    process.env["DTE_SIGNER_URL_TEST"] = "http://localhost:8114/firmardocumento/";
    // DTE_SIGNER_URL_PRODUCTION deliberadamente ausente.

    expect(() => resolveDteSignerConfig("PRODUCTION")).toThrow(DteSignerConfigError);
  });

  it("falta DTE_SIGNER_URL_TEST → error explícito, no fallback silencioso", () => {
    process.env["DTE_SIGNER_URL_PRODUCTION"] = "http://localhost:8113/firmardocumento/";

    expect(() => resolveDteSignerConfig("TEST")).toThrow(/DTE_SIGNER_URL_TEST/);
  });

  it("falta DTE_SIGNER_URL_PRODUCTION → error explícito, no fallback silencioso", () => {
    process.env["DTE_SIGNER_URL_TEST"] = "http://localhost:8114/firmardocumento/";

    expect(() => resolveDteSignerConfig("PRODUCTION")).toThrow(/DTE_SIGNER_URL_PRODUCTION/);
  });

  it("healthUrl se deriva de la URL resuelta del ambiente pedido, no de un valor global", () => {
    process.env["DTE_SIGNER_URL_TEST"] = "http://localhost:8114/firmardocumento/";
    process.env["DTE_SIGNER_URL_PRODUCTION"] = "http://localhost:8113/firmardocumento/";

    const test = resolveDteSignerConfig("TEST");
    const prod = resolveDteSignerConfig("PRODUCTION");

    expect(test.healthUrl).toBe("http://localhost:8114/firmardocumento/status");
    expect(prod.healthUrl).toBe("http://localhost:8113/firmardocumento/status");
  });

  it("timeoutMs cae a 10000ms si DTE_SIGNER_TIMEOUT_MS no es un entero positivo válido", () => {
    process.env["DTE_SIGNER_URL_TEST"] = "http://localhost:8114/firmardocumento/";
    process.env["DTE_SIGNER_TIMEOUT_MS"] = "not-a-number";

    const config = resolveDteSignerConfig("TEST");
    expect(config.timeoutMs).toBe(10_000);
  });

  // VPS-SIGNER-APIKEY
  it("TEST resuelve apiKey desde DTE_SIGNER_API_KEY", () => {
    process.env["DTE_SIGNER_URL_TEST"] = "https://firmador-test.getzolvi.com/firmardocumento/";
    process.env["DTE_SIGNER_URL_PRODUCTION"] = "https://firmador.getzolvi.com/firmardocumento/";
    process.env["DTE_SIGNER_API_KEY"] = "abc123";

    const config = resolveDteSignerConfig("TEST");
    expect(config.signerUrl).toBe("https://firmador-test.getzolvi.com/firmardocumento/");
    expect(config.apiKey).toBe("abc123");
  });

  it("PRODUCTION resuelve apiKey desde DTE_SIGNER_API_KEY", () => {
    process.env["DTE_SIGNER_URL_TEST"] = "https://firmador-test.getzolvi.com/firmardocumento/";
    process.env["DTE_SIGNER_URL_PRODUCTION"] = "https://firmador.getzolvi.com/firmardocumento/";
    process.env["DTE_SIGNER_API_KEY"] = "abc123";

    const config = resolveDteSignerConfig("PRODUCTION");
    expect(config.signerUrl).toBe("https://firmador.getzolvi.com/firmardocumento/");
    expect(config.apiKey).toBe("abc123");
  });

  it("sin DTE_SIGNER_API_KEY, apiKey queda undefined y no rompe la resolución", () => {
    process.env["DTE_SIGNER_URL_TEST"] = "http://localhost:8114/firmardocumento/";
    delete process.env["DTE_SIGNER_API_KEY"];

    const config = resolveDteSignerConfig("TEST");
    expect(config.apiKey).toBeUndefined();
  });

  it("DTE_SIGNER_API_KEY vacía o solo espacios resuelve a undefined", () => {
    process.env["DTE_SIGNER_URL_TEST"] = "http://localhost:8114/firmardocumento/";
    process.env["DTE_SIGNER_API_KEY"] = "   ";

    const config = resolveDteSignerConfig("TEST");
    expect(config.apiKey).toBeUndefined();
  });
});
