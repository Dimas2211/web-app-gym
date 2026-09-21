// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-transmission.environment-integration.test.ts
//
// FASE VI-E6A — cierra el gap de cobertura reportado en VI-E5B: no
// basta con testear resolveDteMhUrls aislado (dte-mh.config.test.ts).
// Este test certifica el CHAIN completo — MhAuthAdapter (real) +
// MhDteTransmissionAdapter (real) — demostrando que dteDoc.environment
// selecciona correctamente:
//   - la URL de auth MH (apitest.* vs api.*)
//   - la URL de recepción MH (apitest.* vs api.*)
//   - el código de ambiente en el payload (00 = TEST, 01 = PRODUCTION)
//
// Único mock: resolveMhAuthCredentials (boundary de credenciales/DB) y
// global fetch (boundary de red) — nunca una llamada real a MH.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { resolveMhAuthCredentialsMock } = vi.hoisted(() => ({
  resolveMhAuthCredentialsMock: vi.fn(),
}));

vi.mock("../services/dte-credential.service", () => ({
  resolveMhAuthCredentials: resolveMhAuthCredentialsMock,
}));

import { MhAuthAdapter } from "./dte-auth.adapter";
import { MhDteTransmissionAdapter } from "./dte-transmission.adapter";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resolveMhAuthCredentialsMock.mockReset();
  resolveMhAuthCredentialsMock.mockResolvedValue({ ok: true, user: "user-1", password: "pwd-1" });

  fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/seguridad/auth")) {
      return jsonResponse(200, { status: "OK", body: { token: "tok-abc" } });
    }
    if (url.includes("/fesv/recepciondte")) {
      return jsonResponse(200, {
        estado: "PROCESADO",
        codigoGeneracion: "GEN-1",
        selloRecibido: "SELLO-1",
        fhProcesamiento: "2026-01-01T00:00:00.000Z",
        codigoMsg: "001",
        descripcionMsg: "RECIBIDO",
        observaciones: [],
      });
    }
    throw new Error(`unexpected fetch url in test: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function baseInput(overrides: Partial<Parameters<MhDteTransmissionAdapter["transmit"]>[0]> = {}) {
  return {
    environment: "TEST" as const,
    issuerConfigId: "issuer-1",
    dteTypeCode: "01" as const,
    version: 1,
    signedJws: "signed-jws-value",
    codigoGeneracion: "GEN-1",
    ...overrides,
  };
}

describe("MhDteTransmissionAdapter + MhAuthAdapter — integración de ambiente (VI-E6A)", () => {
  it("dteDoc.environment=TEST -> auth URL TEST, reception URL TEST, payload ambiente=00 (TEST)", async () => {
    const authAdapter = new MhAuthAdapter();
    const adapter = new MhDteTransmissionAdapter(authAdapter);

    const result = await adapter.transmit(baseInput({ environment: "TEST", issuerConfigId: "issuer-env-test-1" }));

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [authUrl] = fetchMock.mock.calls[0];
    const [receptionUrl, receptionInit] = fetchMock.mock.calls[1];
    expect(authUrl).toBe("https://apitest.dtes.mh.gob.sv/seguridad/auth");
    expect(receptionUrl).toBe("https://apitest.dtes.mh.gob.sv/fesv/recepciondte");

    const body = JSON.parse((receptionInit as { body: string }).body);
    expect(body.ambiente).toBe("00");
  });

  it("dteDoc.environment=PRODUCTION -> auth URL PROD, reception URL PROD, payload ambiente=01 (PRODUCTION)", async () => {
    const authAdapter = new MhAuthAdapter();
    const adapter = new MhDteTransmissionAdapter(authAdapter);

    const result = await adapter.transmit(baseInput({ environment: "PRODUCTION", issuerConfigId: "issuer-env-prod-1" }));

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [authUrl] = fetchMock.mock.calls[0];
    const [receptionUrl, receptionInit] = fetchMock.mock.calls[1];
    expect(authUrl).toBe("https://api.dtes.mh.gob.sv/seguridad/auth");
    expect(receptionUrl).toBe("https://api.dtes.mh.gob.sv/fesv/recepciondte");

    const body = JSON.parse((receptionInit as { body: string }).body);
    expect(body.ambiente).toBe("01");
  });

  it("credential client se propaga: resolveMhAuthCredentials recibe el mismo client pasado a MhAuthAdapter (same-runtime credential)", async () => {
    const runtimeDbMarker = { __marker: "RUNTIME_CLIENT_DB" };
    const authAdapter = new MhAuthAdapter({ credentialClient: runtimeDbMarker as never });
    const adapter = new MhDteTransmissionAdapter(authAdapter);

    await adapter.transmit(baseInput({ environment: "PRODUCTION", issuerConfigId: "issuer-env-credclient-1" }));

    expect(resolveMhAuthCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "PRODUCTION", client: runtimeDbMarker }),
    );
  });
});
