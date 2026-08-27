// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-signer.adapter.test.ts
//
// VPS-SIGNER-APIKEY — el firmador detrás de Apache/cPanel exige el
// header X-DTE-Signer-Key. Estos tests verifican solo la inyección
// del header a partir de signerConfig.apiKey, con fetch mockeado.
// No hace llamadas reales al VPS ni firma documentos reales.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MhHttpDteSignerAdapter } from "./dte-signer.adapter";
import type { DteSignerConfig } from "../config/dte-signer.config";
import type { DteSignerInput } from "../types/dte-signer.types";

const baseConfig: DteSignerConfig = {
  signerUrl: "https://firmador-test.getzolvi.com/firmardocumento/",
  healthUrl: "https://firmador-test.getzolvi.com/firmardocumento/status",
  timeoutMs: 10_000,
};

const input: DteSignerInput = {
  nit:         "05280807241037",
  passwordPri: "secret",
  dteJson:     { fake: true },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok:     true,
    status: 200,
    json:   async () => ({ status: "OK", body: "jws-token" }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MhHttpDteSignerAdapter", () => {
  it("sign() con apiKey presente envía header X-DTE-Signer-Key", async () => {
    const adapter = new MhHttpDteSignerAdapter();
    await adapter.sign(input, { ...baseConfig, apiKey: "abc123" });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["X-DTE-Signer-Key"]).toBe("abc123");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sign() sin apiKey no envía el header", async () => {
    const adapter = new MhHttpDteSignerAdapter();
    await adapter.sign(input, baseConfig);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["X-DTE-Signer-Key"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("checkHealth() con apiKey presente envía header X-DTE-Signer-Key", async () => {
    const adapter = new MhHttpDteSignerAdapter();
    await adapter.checkHealth({ ...baseConfig, apiKey: "abc123" });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string> | undefined;
    expect(headers?.["X-DTE-Signer-Key"]).toBe("abc123");
  });

  it("checkHealth() sin apiKey no envía headers", async () => {
    const adapter = new MhHttpDteSignerAdapter();
    await adapter.checkHealth(baseConfig);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.headers).toBeUndefined();
  });
});
