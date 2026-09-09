// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-credential.service.resolve-mh-auth-credentials.test.ts
//
// FASE IV-B.4 — riesgo arquitectónico corregido: resolveMhAuthCredentials
// ahora acepta un `client` opcional (DteCredentialQueryClient) para leer
// DteCredential desde una runtime DB explícita en vez del prisma
// singleton global (Control Plane). Sin `client`, cae al comportamiento
// legacy exacto (prisma global) — callers existentes no cambian.
//
// decryptDteCredentialPayload se mockea directamente — no depende de
// PLATFORM_ENCRYPTION_KEY real ni de AES-256-GCM en este test unitario.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

const { globalFindFirstSpy, decryptSpy } = vi.hoisted(() => ({
  globalFindFirstSpy: vi.fn(),
  decryptSpy: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    dteCredential: { findFirst: globalFindFirstSpy },
  },
}));

vi.mock("../lib/dte-credential-encryption", () => ({
  decryptDteCredentialPayload: decryptSpy,
  encryptDteCredentialPayload: vi.fn(),
}));

import { resolveMhAuthCredentials, type DteCredentialQueryClient } from "./dte-credential.service";

function fakeRuntimeClient(findFirstImpl: (...args: unknown[]) => unknown): DteCredentialQueryClient {
  return {
    dteCredential: { findFirst: vi.fn(findFirstImpl) },
  } as unknown as DteCredentialQueryClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("resolveMhAuthCredentials — runtime-aware (FASE IV-B.4)", () => {
  it("1. con `client` explícito, lee DteCredential del runtime client — nunca del prisma global", async () => {
    const runtimeFindFirst = vi.fn().mockResolvedValue({ encrypted_payload: "runtime-payload" });
    const runtimeClient = fakeRuntimeClient(runtimeFindFirst);
    decryptSpy.mockReturnValue({ apiUser: "runtime-user", apiPassword: "runtime-pass" });

    const result = await resolveMhAuthCredentials({
      issuerConfigId: "issuer-runtime-1",
      environment: "TEST",
      client: runtimeClient,
    });

    expect(result).toEqual({ ok: true, user: "runtime-user", password: "runtime-pass" });
    expect(runtimeFindFirst).toHaveBeenCalledTimes(1);
    expect(globalFindFirstSpy).not.toHaveBeenCalled();
  });

  it("2. sin `client`, cae al prisma global (comportamiento legacy sin cambios)", async () => {
    globalFindFirstSpy.mockResolvedValue({ encrypted_payload: "legacy-payload" });
    decryptSpy.mockReturnValue({ apiUser: "legacy-user", apiPassword: "legacy-pass" });

    const result = await resolveMhAuthCredentials({
      issuerConfigId: "issuer-legacy-1",
      environment: "TEST",
    });

    expect(result).toEqual({ ok: true, user: "legacy-user", password: "legacy-pass" });
    expect(globalFindFirstSpy).toHaveBeenCalledTimes(1);
  });

  it("3. PRODUCTION nunca cae al fallback .env — con o sin `client`", async () => {
    vi.stubEnv("DTE_MH_USER", "env-user");
    vi.stubEnv("DTE_MH_PASSWORD", "env-pass");

    const runtimeClient = fakeRuntimeClient(async () => null);
    const result = await resolveMhAuthCredentials({
      issuerConfigId: "issuer-prod-1",
      environment: "PRODUCTION",
      client: runtimeClient,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/PRODUCTION/);
    }
  });

  it("4. TEST sin DteCredential utilizable cae al fallback .env legacy (con o sin `client`)", async () => {
    vi.stubEnv("DTE_MH_USER", "env-user");
    vi.stubEnv("DTE_MH_PASSWORD", "env-pass");

    const runtimeClient = fakeRuntimeClient(async () => null);
    const result = await resolveMhAuthCredentials({
      issuerConfigId: "issuer-test-nocred",
      environment: "TEST",
      client: runtimeClient,
    });

    expect(result).toEqual({ ok: true, user: "env-user", password: "env-pass" });
  });

  it("5. TEST sin DteCredential y sin fallback .env -> bloqueado explícitamente", async () => {
    const runtimeClient = fakeRuntimeClient(async () => null);
    const result = await resolveMhAuthCredentials({
      issuerConfigId: "issuer-test-nothing",
      environment: "TEST",
      client: runtimeClient,
    });

    expect(result.ok).toBe(false);
  });
});
