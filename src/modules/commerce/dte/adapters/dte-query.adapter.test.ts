// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-query.adapter.test.ts
//
// FASE IV-B.1 — MhDteQueryAdapter: HTTP puro, nunca toca DB. El
// MhAuthAdapter se inyecta como fake (no se mockea fetch de /seguridad/auth
// por separado) — solo se mockea fetch para /fesv/recepcion/consultadte/.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MhDteQueryAdapter } from "./dte-query.adapter";
import type { DteQueryInput } from "../types/dte-query.types";

function fakeAuthAdapter(overrides: Partial<{ getCachedToken: unknown; clearTokenCache: unknown }> = {}) {
  return {
    getCachedToken: vi.fn().mockResolvedValue({
      ok: true,
      token: "tok",
      tokenType: "Bearer",
      authorizationHeader: "Bearer tok",
      expiresAt: new Date(Date.now() + 60_000),
    }),
    clearTokenCache: vi.fn(),
    authenticate: vi.fn(),
    ...overrides,
  } as never;
}

const baseInput: DteQueryInput = {
  environment: "TEST",
  issuerConfigId: "issuer-1",
  nitEmisor: "06140000000000",
  tdte: "01",
  codigoGeneracion: "ABCDEF12-1234-1234-1234-1234567890AB",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

describe("MhDteQueryAdapter — URLs y request", () => {
  it("1. environment=TEST usa la URL de consulta TEST", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { estado: "PROCESADO", codigoGeneracion: baseInput.codigoGeneracion, ambiente: "00", selloRecibido: "SELLO123", codigoMsg: "001", descripcionMsg: "RECIBIDO", observaciones: [] }));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    await adapter.query(baseInput);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://apitest.dtes.mh.gob.sv/fesv/recepcion/consultadte/");
  });

  it("2. environment=PRODUCTION usa la URL de consulta PROD", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { estado: "PROCESADO", codigoGeneracion: baseInput.codigoGeneracion, ambiente: "01", selloRecibido: "SELLO123" }));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    await adapter.query({ ...baseInput, environment: "PRODUCTION" });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.dtes.mh.gob.sv/fesv/recepcion/consultadte/");
  });

  it("3. POST body exacto: nitEmisor/tdte/codigoGeneracion", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { estado: "PROCESADO", codigoGeneracion: baseInput.codigoGeneracion, ambiente: "00", selloRecibido: "SELLO123" }));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    await adapter.query(baseInput);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      nitEmisor: baseInput.nitEmisor,
      tdte: baseInput.tdte,
      codigoGeneracion: baseInput.codigoGeneracion,
    });
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("4. Authorization nunca aparece en el resultado normalizado devuelto al caller", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { estado: "PROCESADO", codigoGeneracion: baseInput.codigoGeneracion, ambiente: "00", selloRecibido: "SELLO123" }));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(JSON.stringify(result)).not.toContain("Bearer");
    expect(JSON.stringify(result)).not.toContain("tok");
  });
});

describe("MhDteQueryAdapter — clasificación PROCESADO", () => {
  it("5b. FASE IV-B.3 — HTTP 202 + PROCESADO consistente (hallazgo empírico MH TEST 09/09/2026) -> QUERY_PROCESSED", async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, {
      version: 2, ambiente: "00", versionApp: 2, estado: "PROCESADO",
      codigoGeneracion: baseInput.codigoGeneracion, selloRecibido: "2026795F691CBB2547F285D54AC1E41FE69DWLQH",
      fhProcesamiento: "01/09/2026 01:52:08", clasificaMsg: "10", codigoMsg: "001", descripcionMsg: "RECIBIDO", observaciones: [],
    }));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(result.kind).toBe("QUERY_PROCESSED");
    if (result.kind === "QUERY_PROCESSED") expect(result.httpStatus).toBe(202);
  });

  it("5c. estado=PROCESADO con HTTP no-2xx (contradictorio) -> QUERY_INCONSISTENT, nunca QUERY_PROCESSED", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, {
      estado: "PROCESADO", codigoGeneracion: baseInput.codigoGeneracion, ambiente: "00", selloRecibido: "SELLO123",
    }));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(result.kind).toBe("QUERY_INCONSISTENT");
  });

  it("5. PROCESADO consistente (codigoGeneracion + ambiente + selloRecibido) -> QUERY_PROCESSED", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      estado: "PROCESADO", codigoGeneracion: baseInput.codigoGeneracion, ambiente: "00",
      selloRecibido: "SELLO123", codigoMsg: "001", descripcionMsg: "RECIBIDO", observaciones: [],
    }));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(result.kind).toBe("QUERY_PROCESSED");
    if (result.kind === "QUERY_PROCESSED") {
      expect(result.selloRecibido).toBe("SELLO123");
      expect(result.codigoGeneracion).toBe(baseInput.codigoGeneracion);
    }
  });

  it("6. PROCESADO con selloRecibido null -> QUERY_INCONSISTENT (nunca asumir aceptación)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      estado: "PROCESADO", codigoGeneracion: baseInput.codigoGeneracion, ambiente: "00", selloRecibido: null,
    }));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(result.kind).toBe("QUERY_INCONSISTENT");
  });

  it("7. codigoGeneracion mismatch -> QUERY_INCONSISTENT", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      estado: "PROCESADO", codigoGeneracion: "OTRO-CODIGO", ambiente: "00", selloRecibido: "SELLO123",
    }));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(result.kind).toBe("QUERY_INCONSISTENT");
  });

  it("8. ambiente mismatch (TEST solicitado, PROD devuelto) -> QUERY_INCONSISTENT", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      estado: "PROCESADO", codigoGeneracion: baseInput.codigoGeneracion, ambiente: "01", selloRecibido: "SELLO123",
    }));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(result.kind).toBe("QUERY_INCONSISTENT");
  });

  it("9. HTTP 400 + RECHAZADO -> QUERY_REJECTED_OR_ERROR (no conclusivo, nunca CONSUMED)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, {
      estado: "RECHAZADO", selloRecibido: null, codigoMsg: "ERROR_CODIGO", descripcionMsg: "ERROR_DESCRIPCION",
    }));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(result.kind).toBe("QUERY_REJECTED_OR_ERROR");
  });
});

describe("MhDteQueryAdapter — errores técnicos", () => {
  it("10. timeout (AbortError) -> QUERY_TECHNICAL_ERROR", async () => {
    fetchMock.mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(result.kind).toBe("QUERY_TECHNICAL_ERROR");
    if (result.kind === "QUERY_TECHNICAL_ERROR") expect(result.errorCode).toBe("MH_QUERY_TIMEOUT");
  });

  it("11. error de red -> QUERY_TECHNICAL_ERROR", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(result.kind).toBe("QUERY_TECHNICAL_ERROR");
    if (result.kind === "QUERY_TECHNICAL_ERROR") expect(result.errorCode).toBe("MH_QUERY_UNAVAILABLE");
  });

  it("12. JSON inválido -> QUERY_TECHNICAL_ERROR", async () => {
    fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => { throw new Error("bad json"); } } as never);
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(result.kind).toBe("QUERY_TECHNICAL_ERROR");
    if (result.kind === "QUERY_TECHNICAL_ERROR") expect(result.errorCode).toBe("MH_QUERY_INVALID_RESPONSE");
  });

  it("13. 401 -> clearTokenCache + reintenta una vez y tiene éxito", async () => {
    const auth = fakeAuthAdapter();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { estado: "PROCESADO", codigoGeneracion: baseInput.codigoGeneracion, ambiente: "00", selloRecibido: "SELLO123" }));
    const adapter = new MhDteQueryAdapter(auth);
    const result = await adapter.query(baseInput);
    expect((auth as { clearTokenCache: ReturnType<typeof vi.fn> }).clearTokenCache).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.kind).toBe("QUERY_PROCESSED");
  });

  it("14. 401 dos veces -> QUERY_TECHNICAL_ERROR, no reintenta una tercera vez", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.kind).toBe("QUERY_TECHNICAL_ERROR");
    if (result.kind === "QUERY_TECHNICAL_ERROR") expect(result.errorCode).toBe("MH_QUERY_AUTH_FAILED");
  });

  it("15. 5xx -> QUERY_TECHNICAL_ERROR", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, {}));
    const adapter = new MhDteQueryAdapter(fakeAuthAdapter());
    const result = await adapter.query(baseInput);
    expect(result.kind).toBe("QUERY_TECHNICAL_ERROR");
    if (result.kind === "QUERY_TECHNICAL_ERROR") expect(result.errorCode).toBe("MH_QUERY_HTTP_ERROR");
  });
});
