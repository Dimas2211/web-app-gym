// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-auth.adapter.test.ts
//
// FASE IV-B.4 — MhAuthAdapter runtime-aware: el `credentialClient`
// inyectado en el constructor debe propagarse a resolveMhAuthCredentials
// en cada authenticate(). Sin credentialClient, se comporta exactamente
// como antes (client=undefined -> resolveMhAuthCredentials cae a su
// propio fallback legacy, ya cubierto por su propio test file).
//
// fetch mockeado — nunca red real. Token/Authorization nunca se
// imprimen fuera de los asserts explícitos de este archivo.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { resolveMhAuthCredentialsSpy } = vi.hoisted(() => ({
  resolveMhAuthCredentialsSpy: vi.fn(),
}));

vi.mock("../services/dte-credential.service", () => ({
  resolveMhAuthCredentials: resolveMhAuthCredentialsSpy,
}));

import { MhAuthAdapter } from "./dte-auth.adapter";
import type { DteCredentialQueryClient } from "../services/dte-credential.service";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
  resolveMhAuthCredentialsSpy.mockReset();
});

describe("MhAuthAdapter — runtime-aware credentialClient (FASE IV-B.4)", () => {
  it("1. propaga el credentialClient inyectado en el constructor a resolveMhAuthCredentials", async () => {
    resolveMhAuthCredentialsSpy.mockResolvedValue({ ok: true, user: "u", password: "p" });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { status: "OK", body: { token: "tok-abc" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const runtimeClient = { dteCredential: { findFirst: vi.fn() } } as unknown as DteCredentialQueryClient;
    const adapter = new MhAuthAdapter({ credentialClient: runtimeClient });

    const result = await adapter.authenticate({ environment: "TEST", issuerConfigId: "issuer-rt-1" });

    expect(result.ok).toBe(true);
    expect(resolveMhAuthCredentialsSpy).toHaveBeenCalledTimes(1);
    const callArg = resolveMhAuthCredentialsSpy.mock.calls[0]?.[0];
    expect(callArg.issuerConfigId).toBe("issuer-rt-1");
    expect(callArg.environment).toBe("TEST");
    expect(callArg.client).toBe(runtimeClient);
  });

  it("2. sin credentialClient, resolveMhAuthCredentials recibe client=undefined (comportamiento legacy)", async () => {
    resolveMhAuthCredentialsSpy.mockResolvedValue({ ok: true, user: "u", password: "p" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { status: "OK", body: { token: "tok-legacy" } })),
    );

    const adapter = new MhAuthAdapter();
    await adapter.authenticate({ environment: "TEST", issuerConfigId: "issuer-legacy-1" });

    const callArg = resolveMhAuthCredentialsSpy.mock.calls[0]?.[0];
    expect(callArg.client).toBeUndefined();
  });

  it("3. cache de token sigue aislado por issuerConfigId+environment, independiente del credentialClient", async () => {
    resolveMhAuthCredentialsSpy.mockResolvedValue({ ok: true, user: "u", password: "p" });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { status: "OK", body: { token: "tok-cache-test" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const clientA = { dteCredential: { findFirst: vi.fn() } } as unknown as DteCredentialQueryClient;
    const adapterA = new MhAuthAdapter({ credentialClient: clientA });

    const uniqueIssuer = `issuer-cache-${Date.now()}-${Math.random()}`;
    const first = await adapterA.getCachedToken("TEST", uniqueIssuer);
    expect(first.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Segunda instancia de MhAuthAdapter, mismo issuerConfigId+environment
    // -> debe reusar el cache (module-level), sin llamar fetch de nuevo,
    // incluso con un credentialClient distinto (o ausente).
    const adapterB = new MhAuthAdapter();
    const second = await adapterB.getCachedToken("TEST", uniqueIssuer);
    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // sin nueva llamada HTTP
  });
});
