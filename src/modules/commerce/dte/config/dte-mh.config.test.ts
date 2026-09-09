// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-mh.config.test.ts
//
// FASE IV-B.1 — resolveDteMhUrls debe resolver SIEMPRE por el
// `environment` explícito recibido, nunca por DTE_ENVIRONMENT global,
// y sin contaminación cruzada TEST↔PRODUCTION en los overrides.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveDteMhUrls } from "./dte-mh.config";

const ENV_KEYS = [
  "DTE_ENVIRONMENT",
  "DTE_MH_AUTH_URL_TEST",
  "DTE_MH_AUTH_URL_PROD",
  "DTE_MH_RECEPTION_URL_TEST",
  "DTE_MH_RECEPTION_URL_PROD",
  "DTE_MH_QUERY_URL_TEST",
  "DTE_MH_QUERY_URL_PROD",
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

describe("resolveDteMhUrls — queryDteUrl", () => {
  it("TEST -> URL oficial de consulta TEST", () => {
    const urls = resolveDteMhUrls("TEST");
    expect(urls.queryDteUrl).toBe("https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/");
  });

  it("PRODUCTION -> URL oficial de consulta PROD", () => {
    const urls = resolveDteMhUrls("PRODUCTION");
    expect(urls.queryDteUrl).toBe("https://api.dtes.mh.gob.sv/fesv/recepcion/consultadte/");
  });

  it("override DTE_MH_QUERY_URL_TEST se respeta para TEST", () => {
    process.env["DTE_MH_QUERY_URL_TEST"] = "https://override-test.example/consultadte/";
    const urls = resolveDteMhUrls("TEST");
    expect(urls.queryDteUrl).toBe("https://override-test.example/consultadte/");
  });

  it("override DTE_MH_QUERY_URL_PROD se respeta para PRODUCTION", () => {
    process.env["DTE_MH_QUERY_URL_PROD"] = "https://override-prod.example/consultadte/";
    const urls = resolveDteMhUrls("PRODUCTION");
    expect(urls.queryDteUrl).toBe("https://override-prod.example/consultadte/");
  });

  it("override TEST no contamina PRODUCTION", () => {
    process.env["DTE_MH_QUERY_URL_TEST"] = "https://override-test.example/consultadte/";
    const urls = resolveDteMhUrls("PRODUCTION");
    expect(urls.queryDteUrl).toBe("https://api.dtes.mh.gob.sv/fesv/recepcion/consultadte/");
  });

  it("override PROD no contamina TEST", () => {
    process.env["DTE_MH_QUERY_URL_PROD"] = "https://override-prod.example/consultadte/";
    const urls = resolveDteMhUrls("TEST");
    expect(urls.queryDteUrl).toBe("https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/");
  });

  it("DTE_ENVIRONMENT global no influye — el environment explícito manda siempre", () => {
    process.env["DTE_ENVIRONMENT"] = "PRODUCTION";
    const urls = resolveDteMhUrls("TEST");
    expect(urls.queryDteUrl).toBe("https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/");
  });

  it("no rompe authUrl/receptionUrl existentes (aditivo)", () => {
    const urls = resolveDteMhUrls("TEST");
    expect(urls.authUrl).toBe("https://apitest.dtes.mh.gob.sv/seguridad/auth");
    expect(urls.receptionUrl).toBe("https://apitest.dtes.mh.gob.sv/fesv/recepciondte");
  });
});
